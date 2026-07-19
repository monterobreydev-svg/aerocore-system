import { getCurrentEmployee } from "@/lib/dal"
import { ProfileSettingsForm } from "@/components/dashboard/profile-settings-form"

export default async function Page() {
  const employee = await getCurrentEmployee()

  return <ProfileSettingsForm section="employee" employee={employee} />
}
