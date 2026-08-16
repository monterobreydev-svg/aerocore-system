"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { verifySession } from "@/lib/auth"
import { ACRONYM_MAX_LENGTH } from "@/lib/documents"

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

const ClientSchema = z.object({
  name: z.string().trim().min(1, "Registered name is required."),
  acronym: optionalAcronym,
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

  await prisma.client.create({
    data: {
      name,
      // Null rather than "", so "nobody set one" is one state and not two —
      // `clientShortName` falls back on null and would keep an empty string.
      acronym: acronym || null,
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
    tin: formData.get("tin"),
    taxStatus: formData.get("taxStatus"),
    address: formData.get("address"),
    phoneNo: formData.get("phoneNo"),
    email: formData.get("email"),
  })

  if (!validatedFields.success) {
    return { errors: validatedFields.error.flatten().fieldErrors }
  }

  const { clientId, name, acronym, tin, taxStatus, address, phoneNo, email } =
    validatedFields.data

  await prisma.client.update({
    where: { id: clientId },
    data: {
      name,
      // Cleared back to null puts the client on the derived acronym again.
      acronym: acronym || null,
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
