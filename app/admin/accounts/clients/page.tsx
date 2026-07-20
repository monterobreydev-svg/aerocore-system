import { Building2, Landmark } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { CreateClientDialog } from "@/components/admin/create-client-dialog"
import { ClientTable, type ClientRecord } from "@/components/admin/client-table"
import { Card, CardContent } from "@/components/ui/card"

export default async function ClientsPage() {
  const clientRecords = await prisma.client.findMany({
    include: { branches: { orderBy: { name: "asc" } } },
    orderBy: { name: "asc" },
  })

  const clients: ClientRecord[] = clientRecords.map((client) => ({
    id: client.id,
    name: client.name,
    tin: client.tin,
    address: client.address,
    branches: client.branches.map((branch) => ({
      id: branch.id,
      name: branch.name,
      address: branch.address,
    })),
  }))

  const totalBranches = clients.reduce(
    (sum, client) => sum + client.branches.length,
    0
  )

  const stats = [
    { label: "Total clients", value: clients.length, icon: Building2 },
    { label: "Total branches", value: totalBranches, icon: Landmark },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Clients</h2>
          <p className="text-sm text-muted-foreground">
            Companies AeroCoole services, and their branches.
          </p>
        </div>
        <CreateClientDialog />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:max-w-md">
        {stats.map((stat) => (
          <Card key={stat.label} className="shadow-sm">
            <CardContent className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-semibold">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
              <div className="flex size-9 items-center justify-center rounded-lg bg-sky-600/10">
                <stat.icon className="size-4.5 text-sky-600 dark:text-sky-400" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <ClientTable clients={clients} />
    </div>
  )
}
