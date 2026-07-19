import { getCurrentEmployee } from "@/lib/dal"

export default async function Page() {
  const { firstName } = await getCurrentEmployee()

  return <div>Welcome, {firstName}!</div>
}
