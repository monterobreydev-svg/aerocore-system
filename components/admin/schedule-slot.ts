// Lives apart from the create dialog on purpose: the calendar needs this type
// and helper on first paint, and importing them from the dialog would pull the
// dialog's whole chunk — combobox, employee picker, work-type picker — into
// the initial download, defeating the lazy import.

// What clicking an empty calendar slot hands over: the day, and for the time
// grids the hour that was clicked.
export type ScheduleSlot = {
  date: string
  startTime: string
  endTime: string
}

export function defaultSlot(date: string): ScheduleSlot {
  return { date, startTime: "08:00", endTime: "12:00" }
}
