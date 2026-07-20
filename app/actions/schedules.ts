"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { verifySession } from "@/lib/session"

async function requireScheduleAccess() {
  const session = await verifySession()
  if (
    session.role !== "DIRECTOR" &&
    session.role !== "ADMINISTRATOR" &&
    session.role !== "ENGINEER"
  ) {
    return null
  }
  return session
}

function combineDateAndTime(date: string, time: string) {
  return new Date(`${date}T${time}:00`)
}

const WORK_TYPE_VALUES = [
  "INSTALLATION",
  "REPAIR",
  "MAINTENANCE",
  "CLEANING",
  "INSPECTION",
  "SURVEY",
  "TROUBLESHOOT",
] as const

const STATUS_VALUES = [
  "PENDING",
  "COMPLETED",
  "NEED_TO_RETURN",
  "RESCHEDULED",
  "CANCELLED",
] as const

const ScheduleSchema = z
  .object({
    clientId: z.string().min(1, "Select a client."),
    branchId: z.string().trim().optional(),
    date: z.string().min(1, "Select a date."),
    startTime: z.string().min(1, "Set a start time."),
    endTime: z.string().min(1, "Set an end time."),
    contactPerson: z.string().trim().optional(),
    contactNumber: z.string().trim().optional(),
    workTypes: z
      .array(z.enum(WORK_TYPE_VALUES))
      .min(1, "Select at least one work type."),
  })
  .refine((data) => data.endTime > data.startTime, {
    message: "End time must be after the start time.",
    path: ["endTime"],
  })

export type ScheduleState =
  | {
      errors?: {
        clientId?: string[]
        branchId?: string[]
        date?: string[]
        startTime?: string[]
        endTime?: string[]
        contactPerson?: string[]
        contactNumber?: string[]
        workTypes?: string[]
      }
      message?: string
      success?: boolean
    }
  | undefined

export async function createSchedule(
  _state: ScheduleState,
  formData: FormData
): Promise<ScheduleState> {
  const session = await requireScheduleAccess()
  if (!session) {
    return { message: "You don't have permission to create schedules." }
  }

  const validatedFields = ScheduleSchema.safeParse({
    clientId: formData.get("clientId"),
    branchId: formData.get("branchId") || undefined,
    date: formData.get("date"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
    contactPerson: formData.get("contactPerson"),
    contactNumber: formData.get("contactNumber"),
    workTypes: formData.getAll("workTypes"),
  })

  if (!validatedFields.success) {
    return { errors: validatedFields.error.flatten().fieldErrors }
  }

  const {
    clientId,
    branchId,
    date,
    startTime,
    endTime,
    contactPerson,
    contactNumber,
    workTypes,
  } = validatedFields.data

  const employeeIds = formData
    .getAll("employeeIds")
    .map(String)
    .filter(Boolean)

  await prisma.schedule.create({
    data: {
      clientId,
      branchId: branchId || null,
      date: new Date(`${date}T00:00:00`),
      startTime: combineDateAndTime(date, startTime),
      endTime: combineDateAndTime(date, endTime),
      contactPerson: contactPerson || null,
      contactNumber: contactNumber || null,
      workTypes,
      createdById: session.accountId,
      assignments:
        employeeIds.length > 0
          ? { create: employeeIds.map((employeeId) => ({ employeeId })) }
          : undefined,
    },
  })

  revalidatePath("/admin/schedules")

  return { success: true }
}

const UpdateScheduleSchema = z
  .object({
    scheduleId: z.string().min(1),
    clientId: z.string().min(1, "Select a client."),
    branchId: z.string().trim().optional(),
    date: z.string().min(1, "Select a date."),
    startTime: z.string().min(1, "Set a start time."),
    endTime: z.string().min(1, "Set an end time."),
    contactPerson: z.string().trim().optional(),
    contactNumber: z.string().trim().optional(),
    workTypes: z
      .array(z.enum(WORK_TYPE_VALUES))
      .min(1, "Select at least one work type."),
    status: z.enum(STATUS_VALUES, { error: "Select a status." }),
  })
  .refine((data) => data.endTime > data.startTime, {
    message: "End time must be after the start time.",
    path: ["endTime"],
  })

export type UpdateScheduleState =
  | {
      errors?: {
        clientId?: string[]
        branchId?: string[]
        date?: string[]
        startTime?: string[]
        endTime?: string[]
        contactPerson?: string[]
        contactNumber?: string[]
        workTypes?: string[]
        status?: string[]
      }
      message?: string
      success?: boolean
    }
  | undefined

export async function updateSchedule(
  _state: UpdateScheduleState,
  formData: FormData
): Promise<UpdateScheduleState> {
  const session = await requireScheduleAccess()
  if (!session) {
    return { message: "You don't have permission to edit schedules." }
  }

  const validatedFields = UpdateScheduleSchema.safeParse({
    scheduleId: formData.get("scheduleId"),
    clientId: formData.get("clientId"),
    branchId: formData.get("branchId") || undefined,
    date: formData.get("date"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
    contactPerson: formData.get("contactPerson"),
    contactNumber: formData.get("contactNumber"),
    workTypes: formData.getAll("workTypes"),
    status: formData.get("status"),
  })

  if (!validatedFields.success) {
    return { errors: validatedFields.error.flatten().fieldErrors }
  }

  const {
    scheduleId,
    clientId,
    branchId,
    date,
    startTime,
    endTime,
    contactPerson,
    contactNumber,
    workTypes,
    status,
  } = validatedFields.data

  const employeeIds = formData
    .getAll("employeeIds")
    .map(String)
    .filter(Boolean)

  await prisma.$transaction(async (tx) => {
    await tx.schedule.update({
      where: { id: scheduleId },
      data: {
        clientId,
        branchId: branchId || null,
        date: new Date(`${date}T00:00:00`),
        startTime: combineDateAndTime(date, startTime),
        endTime: combineDateAndTime(date, endTime),
        contactPerson: contactPerson || null,
        contactNumber: contactNumber || null,
        workTypes,
        status,
      },
    })

    await tx.scheduleAssignment.deleteMany({ where: { scheduleId } })

    if (employeeIds.length > 0) {
      await tx.scheduleAssignment.createMany({
        data: employeeIds.map((employeeId) => ({ scheduleId, employeeId })),
        skipDuplicates: true,
      })
    }
  })

  revalidatePath("/admin/schedules")
  revalidatePath("/employee/schedule")

  return { success: true }
}

export async function deleteSchedule(scheduleId: string) {
  const session = await requireScheduleAccess()
  if (!session) {
    throw new Error("You don't have permission to delete schedules.")
  }

  await prisma.schedule.delete({ where: { id: scheduleId } })

  revalidatePath("/admin/schedules")
  revalidatePath("/employee/schedule")
}
