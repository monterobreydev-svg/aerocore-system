"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db/prisma"
import { verifySession } from "@/lib/auth"
import { ACRONYM_MAX_LENGTH } from "@/lib/documents"
import { CUSTOMER_CODE_MAX_LENGTH } from "@/lib/client"

async function requireClientAccess() {
  const session = await verifySession()
  if (session.role !== "DIRECTOR" && session.role !== "ADMINISTRATOR") {
    return null
  }
  return session
}

const optionalEmail = z
  .string()
  .trim()
  .optional()
  .refine((value) => !value || z.string().email().safeParse(value).success, {
    message: "Enter a valid email address.",
  })

const optionalTaxStatus = z
  .enum(["VAT", "NON_VAT", "VAT_EXEMPT", "ZERO_RATED"])
  .optional()
  .or(z.literal("").transform(() => undefined))

/**
 * The short form, normalised the way it will be read back.
 *
 * Upper-cased and stripped to letters, digits and hyphens because this ends up
 * in a filename — "A.C.S." would come back out of `fileSegment` as "A-C-S"
 * anyway, so it is settled here where the office can see what it got. Blank
 * clears the field and puts the client back on the derived acronym.
 */
const optionalAcronym = z
  .string()
  .trim()
  .max(ACRONYM_MAX_LENGTH * 2, "That's a name, not an acronym.")
  .transform((value) =>
    value
      .toUpperCase()
      .replace(/[^A-Z0-9-]+/g, "")
      .slice(0, ACRONYM_MAX_LENGTH)
  )
  .optional()

/**
 * The customer's own code, normalised so that two spellings of one code cannot
 * both be stored.
 *
 * Upper-cased and stripped to letters, digits and hyphens, which is what makes
 * the uniqueness check mean anything: without it "ac-100" and "AC-100" are two
 * different rows in the database and one code to everybody reading it.
 */
const optionalCustomerCode = z
  .string()
  .trim()
  .max(CUSTOMER_CODE_MAX_LENGTH, "That's too long for a code.")
  .transform((value) => value.toUpperCase().replace(/[^A-Z0-9-]+/g, ""))
  .optional()

const ClientSchema = z.object({
  name: z.string().trim().min(1, "Registered name is required."),
  acronym: optionalAcronym,
  customerCode: optionalCustomerCode,
  tin: z.string().trim().optional(),
  taxStatus: optionalTaxStatus,
  address: z.string().trim().min(1, "Address is required."),
  phoneNo: z.string().trim().optional(),
  email: optionalEmail,
})

export type ClientState =
  | {
      errors?: {
        name?: string[]
        acronym?: string[]
        customerCode?: string[]
        tin?: string[]
        taxStatus?: string[]
        address?: string[]
        phoneNo?: string[]
        email?: string[]
        contactName?: string[]
        contactEmail?: string[]
      }
      message?: string
      success?: boolean
    }
  | undefined

// The create form can seed the client's main contact person in the same
// step — most clients are handed over with a name attached, and making
// someone open the record again just to add it is busywork. All four
// fields are optional; the block is only written when a name is given.
const CreateClientSchema = ClientSchema.extend({
  contactName: z.string().trim().optional(),
  contactPosition: z.string().trim().optional(),
  contactPhoneNo: z.string().trim().optional(),
  contactEmail: optionalEmail,
})

export async function createClient(
  _state: ClientState,
  formData: FormData
): Promise<ClientState> {
  const session = await requireClientAccess()
  if (!session) {
    return { message: "You don't have permission to manage clients." }
  }

  const validatedFields = CreateClientSchema.safeParse({
    name: formData.get("name"),
    acronym: formData.get("acronym"),
    customerCode: formData.get("customerCode"),
    tin: formData.get("tin"),
    taxStatus: formData.get("taxStatus"),
    address: formData.get("address"),
    phoneNo: formData.get("phoneNo"),
    email: formData.get("email"),
    contactName: formData.get("contactName"),
    contactPosition: formData.get("contactPosition"),
    contactPhoneNo: formData.get("contactPhoneNo"),
    contactEmail: formData.get("contactEmail"),
  })

  if (!validatedFields.success) {
    return { errors: validatedFields.error.flatten().fieldErrors }
  }

  const {
    name,
    acronym,
    customerCode,
    tin,
    taxStatus,
    address,
    phoneNo,
    email,
    contactName,
    contactPosition,
    contactPhoneNo,
    contactEmail,
  } = validatedFields.data


  // A unique column would reject this anyway, but as a database error with no
  // field attached — the form would just fail with nothing marked. Asking first
  // puts the message on the input that caused it.
  if (customerCode) {
    const clash = await prisma.client.findUnique({
      where: { customerCode },
      select: { name: true },
    })
    if (clash) {
      return {
        errors: {
          customerCode: [`That code is already used by ${clash.name}.`],
        },
      }
    }
  }
  await prisma.client.create({
    data: {
      name,
      // Null rather than "", so "nobody set one" is one state and not two —
      // `clientShortName` falls back on null and would keep an empty string.
      acronym: acronym || null,
      customerCode: customerCode || null,
      tin: tin || null,
      taxStatus: taxStatus || null,
      address,
      phoneNo: phoneNo || null,
      email: email || null,
      ...(contactName
        ? {
            contacts: {
              create: {
                name: contactName,
                position: contactPosition || null,
                phoneNo: contactPhoneNo || null,
                email: contactEmail || null,
                // First contact on a brand-new client — nothing to demote.
                isPrimary: true,
              },
            },
          }
        : {}),
    },
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
    acronym: formData.get("acronym"),
    customerCode: formData.get("customerCode"),
    tin: formData.get("tin"),
    taxStatus: formData.get("taxStatus"),
    address: formData.get("address"),
    phoneNo: formData.get("phoneNo"),
    email: formData.get("email"),
  })

  if (!validatedFields.success) {
    return { errors: validatedFields.error.flatten().fieldErrors }
  }

  const {
    clientId,
    name,
    acronym,
    customerCode,
    tin,
    taxStatus,
    address,
    phoneNo,
    email,
  } = validatedFields.data


  // A unique column would reject this anyway, but as a database error with no
  // field attached — the form would just fail with nothing marked. Asking first
  // puts the message on the input that caused it.
  if (customerCode) {
    const clash = await prisma.client.findUnique({
      where: { customerCode },
      select: { name: true, id: true },
    })
    if (clash && clash.id !== clientId) {
      return {
        errors: {
          customerCode: [`That code is already used by ${clash.name}.`],
        },
      }
    }
  }
  await prisma.client.update({
    where: { id: clientId },
    data: {
      name,
      // Cleared back to null puts the client on the derived acronym again.
      acronym: acronym || null,
      customerCode: customerCode || null,
      tin: tin || null,
      taxStatus: taxStatus || null,
      address,
      phoneNo: phoneNo || null,
      email: email || null,
    },
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

const ContactSchema = z.object({
  name: z.string().trim().min(1, "Contact name is required."),
  position: z.string().trim().optional(),
  phoneNo: z.string().trim().optional(),
  email: optionalEmail,
  isPrimary: z.enum(["true", "false"]).optional(),
})

export type ContactState =
  | {
      errors?: {
        name?: string[]
        position?: string[]
        phoneNo?: string[]
        email?: string[]
      }
      message?: string
      success?: boolean
    }
  | undefined

const CreateContactSchema = ContactSchema.extend({
  clientId: z.string().min(1),
})

// Only one contact per client can be the primary — promoting a new one
// demotes the rest in the same transaction so the list can't end up with two.
async function clearOtherPrimaries(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  clientId: string,
  keepId?: string
) {
  await tx.clientContact.updateMany({
    where: { clientId, isPrimary: true, ...(keepId ? { NOT: { id: keepId } } : {}) },
    data: { isPrimary: false },
  })
}

export async function createClientContact(
  _state: ContactState,
  formData: FormData
): Promise<ContactState> {
  const session = await requireClientAccess()
  if (!session) {
    return { message: "You don't have permission to manage clients." }
  }

  const validatedFields = CreateContactSchema.safeParse({
    clientId: formData.get("clientId"),
    name: formData.get("name"),
    position: formData.get("position"),
    phoneNo: formData.get("phoneNo"),
    email: formData.get("email"),
    isPrimary: formData.get("isPrimary") ?? "false",
  })

  if (!validatedFields.success) {
    return { errors: validatedFields.error.flatten().fieldErrors }
  }

  const { clientId, name, position, phoneNo, email, isPrimary } =
    validatedFields.data
  const primary = isPrimary === "true"

  await prisma.$transaction(async (tx) => {
    if (primary) await clearOtherPrimaries(tx, clientId)
    await tx.clientContact.create({
      data: {
        clientId,
        name,
        position: position || null,
        phoneNo: phoneNo || null,
        email: email || null,
        isPrimary: primary,
      },
    })
  })

  revalidatePath("/admin/accounts/clients")

  return { success: true }
}

const UpdateContactSchema = ContactSchema.extend({
  contactId: z.string().min(1),
})

export async function updateClientContact(
  _state: ContactState,
  formData: FormData
): Promise<ContactState> {
  const session = await requireClientAccess()
  if (!session) {
    return { message: "You don't have permission to manage clients." }
  }

  const validatedFields = UpdateContactSchema.safeParse({
    contactId: formData.get("contactId"),
    name: formData.get("name"),
    position: formData.get("position"),
    phoneNo: formData.get("phoneNo"),
    email: formData.get("email"),
    isPrimary: formData.get("isPrimary") ?? "false",
  })

  if (!validatedFields.success) {
    return { errors: validatedFields.error.flatten().fieldErrors }
  }

  const { contactId, name, position, phoneNo, email, isPrimary } =
    validatedFields.data
  const primary = isPrimary === "true"

  const existing = await prisma.clientContact.findUnique({
    where: { id: contactId },
  })
  if (!existing) return { message: "Contact not found." }

  await prisma.$transaction(async (tx) => {
    if (primary) await clearOtherPrimaries(tx, existing.clientId, contactId)
    await tx.clientContact.update({
      where: { id: contactId },
      data: {
        name,
        position: position || null,
        phoneNo: phoneNo || null,
        email: email || null,
        isPrimary: primary,
      },
    })
  })

  revalidatePath("/admin/accounts/clients")

  return { success: true }
}

export async function deleteClientContact(
  _state: ContactState,
  formData: FormData
): Promise<ContactState> {
  const session = await requireClientAccess()
  if (!session) {
    return { message: "You don't have permission to manage clients." }
  }

  const contactId = formData.get("contactId")
  if (typeof contactId !== "string" || contactId === "") {
    return { message: "Contact not found." }
  }

  await prisma.clientContact.delete({ where: { id: contactId } })

  revalidatePath("/admin/accounts/clients")

  return { success: true }
}

// ---------------------------------------------------------------------------
// Removing a client
// ---------------------------------------------------------------------------
//
// Only ever a customer entered by mistake — a duplicate, a typo, somebody who
// was never billed. A client the company has actually worked for is a customer
// with a history, and history is not something a delete button gets to take.
//
// So this refuses rather than cascades. The schema already draws the line: a
// client's branches and contacts are `onDelete: Cascade` because they describe
// the client and mean nothing without it, while schedules, projects,
// liquidations, reports and expenses carry no rule at all — which makes
// Postgres refuse the delete outright.
//
// Leaning on that alone would surface as an unreadable foreign-key error, so
// the same question is asked here first and answered in words: what is still
// attached, and how much of it. The office can then decide whether it really
// wants that customer gone, rather than being told "23503".

export type DeleteClientState =
  | { message?: string; blockers?: string[]; success?: boolean }
  | undefined

/** Plural only when it needs to be — "1 schedule", "4 schedules". */
function countLabel(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`
}

export async function deleteClient(
  _state: DeleteClientState,
  formData: FormData
): Promise<DeleteClientState> {
  const session = await requireClientAccess()
  if (!session) {
    return { message: "You don't have permission to manage clients." }
  }

  const clientId = formData.get("clientId")
  if (typeof clientId !== "string" || clientId === "") {
    return { message: "Client not found." }
  }

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      name: true,
      // Counts, not rows: the answer is a number in a sentence, and reading
      // every schedule a ten-year customer ever had to find out whether there
      // is at least one is the payload AGENTS.md rules out.
      _count: {
        select: {
          schedules: true,
          projects: true,
          reimbursementItems: true,
          attendanceReports: true,
          companyExpenses: true,
          branches: true,
          contacts: true,
        },
      },
    },
  })

  if (!client) return { message: "Client not found." }

  // Everything that makes this customer part of the record. Named in the order
  // the office would think of them, and only the ones that actually stand.
  const blockers = [
    [client._count.schedules, "schedule"],
    [client._count.projects, "project"],
    [client._count.reimbursementItems, "liquidated receipt"],
    [client._count.attendanceReports, "service report"],
    [client._count.companyExpenses, "recorded expense"],
  ]
    .filter(([count]) => (count as number) > 0)
    .map(([count, noun]) => countLabel(count as number, noun as string))

  if (blockers.length > 0) {
    return {
      blockers,
      message: `${client.name} can't be deleted — the company's records still refer to it.`,
    }
  }

  // Branches and contacts go with it, by the cascade the schema declares. They
  // are this client's own address book and describe nothing else.
  await prisma.client.delete({ where: { id: clientId } })

  revalidatePath("/admin/accounts/clients")
  revalidatePath("/admin/schedules")

  return { success: true }
}
