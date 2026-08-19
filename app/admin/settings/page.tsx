import { getAccountSettings } from "@/lib/db/dal"
import { requireManager } from "@/lib/auth"
import { AccountSettings } from "@/components/dashboard/account-settings"
import { settingsTabFrom } from "@/lib/settings-tabs"

export default async function Page({ searchParams }: PageProps<"/admin/settings">) {
  await requireManager()

  const [account, params] = await Promise.all([
    getAccountSettings(),
    searchParams,
  ])

  return (
    <AccountSettings
        vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null}
      account={account}
      section="admin"
      defaultTab={settingsTabFrom(params.tab)}
    />
  )
}
