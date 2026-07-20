"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { verifySession } from "@/lib/session"

async function requireClientAccess() {
  const session = await verifySession()
  if (session.role !== "DIRECTOR" && session.role !== "ADMINISTRATOR") {
    return null
  }
  return session
}

const ClientSchema = z.object({
  name: z.string().trim().min(1, "Client name is required."),
  tin: z.string().trim().optional(),
  address: z.string().trim().min(1, "Address is required."),
})

export type ClientState =
  | {
      errors?: {
        name?: string[]
        tin?: string[]
        address?: string[]
      }
      message?: string
      success?: boolean
    }
  | undefined

export async function createClient(
  _state: ClientState,
  formData: FormData
): Promise<ClientState> {
  const session = await requireClientAccess()
  if (!session) {
    return { message: "You don't have permission to manage clients." }
  }

  const validatedFields = ClientSchema.safeParse({
    name: formData.get("name"),
    tin: formData.get("tin"),
    address: formData.get("address"),
  })

  if (!validatedFields.success) {
    return { errors: validatedFields.error.flatten().fieldErrors }
  }

  const { name, tin, address } = validatedFields.data

  await prisma.client.create({
    data: { name, tin: tin || null, address },
  })

  revalidatePath("/admin/accounts/clients")

  return { success: true }
}

const UpdateClientSchema = ClientSchema.extend({
  clientId: z.string().min(1),
})

export async function updateClient(
  _state: ClientState,
  formData: FormData
): Promise<ClientState> {
  const session = await requireClientAccess()
  if (!session) {
    return { message: "You don't have permission to manage clients." }
  }

  const validatedFields = UpdateClientSchema.safeParse({
    clientId: formData.get("clientId"),
    name: formData.get("name"),
    tin: formData.get("tin"),
    address: formData.get("address"),
  })

  if (!validatedFields.success) {
    return { errors: validatedFields.error.flatten().fieldErrors }
  }

  const { clientId, name, tin, address } = validatedFields.data

  await prisma.client.update({
    where: { id: clientId },
    data: { name, tin: tin || null, address },
  })

  revalidatePath("/admin/accounts/clients")

  return { success: true }
}

const BranchSchema = z.object({
  name: z.string().trim().min(1, "Branch name is required."),
  address: z.string().trim().min(1, "Address is required."),
})

export type BranchState =
  | {
      errors?: {
        name?: string[]
        address?: string[]
      }
      message?: string
      success?: boolean
    }
  | undefined

const CreateBranchSchema = BranchSchema.extend({
  clientId: z.string().min(1),
})

export async function createBranch(
  _state: BranchState,
  formData: FormData
): Promise<BranchState> {
  const session = await requireClientAccess()
  if (!session) {
    return { message: "You don't have permission to manage clients." }
  }

  const validatedFields = CreateBranchSchema.safeParse({
    clientId: formData.get("clientId"),
    name: formData.get("name"),
    address: formData.get("address"),
  })

  if (!validatedFields.success) {
    return { errors: validatedFields.error.flatten().fieldErrors }
  }

  const { clientId, name, address } = validatedFields.data

  await prisma.branch.create({
    data: { clientId, name, address },
  })

  revalidatePath("/admin/accounts/clients")

  return { success: true }
}

const UpdateBranchSchema = BranchSchema.extend({
  branchId: z.string().min(1),
})

export async function updateBranch(
  _state: BranchState,
  formData: FormData
): Promise<BranchState> {
  const session = await requireClientAccess()
  if (!session) {
    return { message: "You don't have permission to manage clients." }
  }

  const validatedFields = UpdateBranchSchema.safeParse({
    branchId: formData.get("branchId"),
    name: formData.get("name"),
    address: formData.get("address"),
  })

  if (!validatedFields.success) {
    return { errors: validatedFields.error.flatten().fieldErrors }
  }

  const { branchId, name, address } = validatedFields.data

  await prisma.branch.update({
    where: { id: branchId },
    data: { name, address },
  })

  revalidatePath("/admin/accounts/clients")

  return { success: true }
}
