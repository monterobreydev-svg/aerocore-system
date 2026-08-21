import { requireDirector } from "@/lib/auth"

export default async function AdminProjectsPage() {
  await requireDirector()

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">Projects</h2>
        <p className="text-sm text-muted-foreground">
          The company&apos;s projects — what is running, for whom, and where it
          stands.
        </p>
      </div>

      <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        Nothing here yet.
      </div>
    </div>
  )
}
