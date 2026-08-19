import { getCurrentEmployee } from "@/lib/db/dal"

export default async function Page() {
  const { firstName } = await getCurrentEmployee()

  return <div>Welcome, {firstName}!</div>
}
