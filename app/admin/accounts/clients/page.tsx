import { prisma } from "@/lib/db/prisma"
import { requireManager } from "@/lib/auth"
import { ClientList, type ClientRecord } from "@/components/admin/client-list"

// Enough history to fill the detail tab without pulling a client's entire
// job archive into the list payload. `_count` still reports the true total.
const SERVICE_HISTORY_LIMIT = 50

export default async function ClientsPage() {
  await requireManager()

  const clientRecords = await prisma.client.findMany({
    include: {
      branches: { orderBy: { name: "asc" } },
      contacts: { orderBy: [{ isPrimary: "desc" }, { name: "asc" }] },
      schedules: {
        orderBy: { date: "desc" },
        take: SERVICE_HISTORY_LIMIT,
        include: {
          branch: { select: { name: true } },
          createdBy: {
            include: {
              employee: { select: { firstName: true, lastName: true } },
            },
          },
          assignments: {
            include: {
              employee: { select: { firstName: true, lastName: true } },
            },
          },
        },
      },
      _count: { select: { schedules: true } },
    },
    orderBy: { name: "asc" },
  })

  const clients: ClientRecord[] = clientRecords.map((client) => ({
    id: client.id,
    name: client.name,
    acronym: client.acronym,
    tin: client.tin,
    taxStatus: client.taxStatus,
    address: client.address,
    phoneNo: client.phoneNo,
    email: client.email,
    createdAt: client.createdAt.toISOString(),
    totalJobs: client._count.schedules,
    branches: client.branches.map((branch) => ({
      id: branch.id,
      name: branch.name,
      address: branch.address,
    })),
    contacts: client.contacts.map((contact) => ({
      id: contact.id,
      name: contact.name,
      position: contact.position,
      phoneNo: contact.phoneNo,
      email: contact.email,
      isPrimary: contact.isPrimary,
    })),
    jobs: client.schedules.map((schedule) => ({
      id: schedule.id,
      date: schedule.date.toISOString(),
      startTime: schedule.startTime.toISOString(),
      endTime: schedule.endTime.toISOString(),
      status: schedule.status,
      workTypes: schedule.workTypes,
      branchName: schedule.branch?.name ?? null,
      contactPerson: schedule.contactPerson,
      employees: schedule.assignments.map(
        (assignment) =>
          `${assignment.employee.firstName} ${assignment.employee.lastName}`
      ),
      createdByName: schedule.createdBy
        ? `${schedule.createdBy.employee.firstName} ${schedule.createdBy.employee.lastName}`
        : null,
    })),
  }))

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Clients</h2>
        <p className="text-sm text-muted-foreground">
          Companies AeroCoole services, their locations and job history.
        </p>
      </div>

      <ClientList clients={clients} />
    </div>
  )
}
