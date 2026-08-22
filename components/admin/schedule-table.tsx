"use client"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Avatar, AvatarFallback, AvatarGroup } from "@/components/ui/avatar"
import {
  WORK_TYPE_CHIP,
  WORK_TYPE_LABELS,
  SCHEDULE_STATUS_CHIP,
  SCHEDULE_STATUS_LABELS,
  formatScheduleDate,
  formatTimeRange,
} from "@/lib/schedule"
import { cn } from "@/lib/utils"
import { formatDate } from "@/lib/format-date"
import type { ScheduleRecord } from "@/components/admin/schedule-types"

function employeeInitials(name: string) {
  const parts = name.trim().split(/\s+/)
  return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase()
}

function AssignedStack({
  assignments,
}: {
  assignments: ScheduleRecord["assignments"]
}) {
  if (assignments.length === 0) {
    return <span className="text-sm text-muted-foreground">Unassigned</span>
  }

  return (
    <AvatarGroup>
      {assignments.slice(0, 4).map((assignment) => (
        <Avatar key={assignment.id} size="sm" title={assignment.employeeName}>
          <AvatarFallback className="bg-sky-600/10 text-sky-700 dark:text-sky-400">
            {employeeInitials(assignment.employeeName)}
          </AvatarFallback>
        </Avatar>
      ))}
      {assignments.length > 4 && (
        <Avatar size="sm">
          <AvatarFallback className="bg-muted text-muted-foreground">
            +{assignments.length - 4}
          </AvatarFallback>
        </Avatar>
      )}
    </AvatarGroup>
  )
}

function StatusChip({ status }: { status: ScheduleRecord["status"] }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        SCHEDULE_STATUS_CHIP[status]
      )}
    >
      {SCHEDULE_STATUS_LABELS[status]}
    </span>
  )
}

function WorkTypeChips({ workTypes }: { workTypes: ScheduleRecord["workTypes"] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {workTypes.map((workType) => (
        <span
          key={workType}
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
            WORK_TYPE_CHIP[workType]
          )}
        >
          {WORK_TYPE_LABELS[workType]}
        </span>
      ))}
    </div>
  )
}

export function ScheduleTable({
  schedules,
  onSelect,
}: {
  schedules: ScheduleRecord[]
  onSelect: (schedule: ScheduleRecord) => void
}) {
  return (
    <>
      {/* Table for medium screens and up */}
      <div className="hidden overflow-hidden rounded-xl border shadow-sm md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead>Date &amp; time</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Work type</TableHead>
              <TableHead>Assigned</TableHead>
              <TableHead>Created by</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {schedules.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-32 text-center text-muted-foreground"
                >
                  No schedules yet.
                </TableCell>
              </TableRow>
            )}
            {schedules.map((schedule) => (
              <TableRow
                key={schedule.id}
                className="cursor-pointer"
                onClick={() => onSelect(schedule)}
              >
                <TableCell className="font-medium">
                  <div>{formatScheduleDate(schedule.date)}</div>
                  <div className="text-xs font-normal text-muted-foreground">
                    {formatTimeRange(schedule.startTime, schedule.endTime)}
                  </div>
                </TableCell>
                <TableCell>
                  <div>{schedule.client.name}</div>
                  {/* Where the crew goes, then which job it is — the two
                      questions asked of this column, in that order. */}
                  {(schedule.branch || schedule.salesOrderNo) && (
                    <div className="text-xs text-muted-foreground">
                      {schedule.branch?.name}
                      {schedule.branch && schedule.salesOrderNo && " · "}
                      {schedule.salesOrderNo && (
                        <span className="font-mono">
                          SO {schedule.salesOrderNo}
                        </span>
                      )}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <WorkTypeChips workTypes={schedule.workTypes} />
                </TableCell>
                <TableCell>
                  <AssignedStack assignments={schedule.assignments} />
                </TableCell>
                <TableCell>
                  <div className="text-sm">
                    {schedule.createdByName ?? "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(schedule.createdAt)}
                  </div>
                </TableCell>
                <TableCell>
                  <StatusChip status={schedule.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Stacked cards below md, instead of a horizontally-scrolling table */}
      <div className="flex flex-col gap-2 md:hidden">
        {schedules.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No schedules yet.
          </p>
        )}
        {schedules.map((schedule) => (
          <button
            key={schedule.id}
            type="button"
            onClick={() => onSelect(schedule)}
            className="rounded-lg border p-3 text-left shadow-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">
                {formatScheduleDate(schedule.date)} ·{" "}
                {formatTimeRange(schedule.startTime, schedule.endTime)}
              </p>
              <StatusChip status={schedule.status} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {schedule.client.name}
              {schedule.branch ? ` · ${schedule.branch.name}` : ""}
              {schedule.salesOrderNo ? ` · SO ${schedule.salesOrderNo}` : ""}
            </p>
            <div className="mt-2 flex items-center justify-between">
              <WorkTypeChips workTypes={schedule.workTypes} />
              <AssignedStack assignments={schedule.assignments} />
            </div>
          </button>
        ))}
      </div>
    </>
  )
}
