import { getAccountSettings } from "@/lib/dal"
import { AccountSettings } from "@/components/dashboard/account-settings"
import { settingsTabFrom } from "@/lib/settings-tabs"

export default async function Page({ searchParams }: PageProps<"/admin/settings">) {
  const [account, params] = await Promise.all([
    getAccountSettings(),
    searchParams,
  ])

  return (
    <AccountSettings
      account={account}
      section="admin"
      defaultTab={settingsTabFrom(params.tab)}
    />
  )
}
