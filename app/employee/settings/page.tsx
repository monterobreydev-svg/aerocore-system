import { getAccountSettings } from "@/lib/db/dal"
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
        vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null}
      account={account}
      section="employee"
      defaultTab={settingsTabFrom(params.tab)}
    />
  )
}
