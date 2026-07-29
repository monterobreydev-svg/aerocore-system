import { getAccountSettings } from "@/lib/dal"
import { AccountSettings } from "@/components/dashboard/account-settings"
import { settingsTabFrom } from "@/lib/settings-tabs"

export default async function Page({
  searchParams,
}: PageProps<"/employee/settings">) {
  const [account, params] = await Promise.all([
    getAccountSettings(),
    searchParams,
  ])

  return (
    <AccountSettings
      account={account}
      section="employee"
      defaultTab={settingsTabFrom(params.tab)}
    />
  )
}
