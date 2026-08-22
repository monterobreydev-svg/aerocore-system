import { addDays, dateKey } from "@/lib/schedule"

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

/** The morning a new schedule opens on when nobody has picked an hour. */
const DEFAULT_START_HOUR = 8
const DEFAULT_LENGTH_HOURS = 4

/**
 * After this, there is no useful slot left in the day.
 *
 * A form opened at eleven at night should not offer half an hour before
 * midnight; what it is almost certainly for is tomorrow morning.
 */
const LAST_USEFUL_START_HOUR = 18

/** Rounds up to the next half hour — nobody schedules a crew for 14:07. */
const SLOT_MINUTES = 30

function at(hour: number, minute = 0) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

/**
 * Where a new schedule starts when the day is known but the hour is not.
 *
 * Eight in the morning, unless that has already been and gone — in which case
 * the next half hour, or tomorrow morning if the working day is over. The
 * point is that the form never opens on a time it is about to complain about:
 * the start of a shift that has already begun is worth a word of caution, but
 * it is a poor thing to *default* to.
 *
 * Only today is adjusted. A future day's eight o'clock is still ahead, and a
 * past day never reaches here — openCreate() floors the date at today first.
 */
export function defaultSlot(date: string, now: Date = new Date()): ScheduleSlot {
  const plain = {
    date,
    startTime: at(DEFAULT_START_HOUR),
    endTime: at(DEFAULT_START_HOUR + DEFAULT_LENGTH_HOURS),
  }

  if (date !== dateKey(now)) return plain
  if (now.getHours() < DEFAULT_START_HOUR) return plain

  // Next half hour: 14:07 becomes 14:30, 14:30 stays put.
  const rounded = new Date(now)
  rounded.setSeconds(0, 0)
  const overshoot = rounded.getMinutes() % SLOT_MINUTES
  if (overshoot !== 0) {
    rounded.setMinutes(rounded.getMinutes() + (SLOT_MINUTES - overshoot))
  }

  // Rounding up can cross midnight — 23:46 becomes 00:00 *tomorrow*, whose
  // hour reads as 0 and would sail past the check below into a start time
  // seventeen hours in the past. Landing on another day is itself the signal
  // that this one is finished.
  if (
    dateKey(rounded) !== date ||
    rounded.getHours() >= LAST_USEFUL_START_HOUR
  ) {
    const tomorrow = dateKey(addDays(now, 1))
    return {
      date: tomorrow,
      startTime: at(DEFAULT_START_HOUR),
      endTime: at(DEFAULT_START_HOUR + DEFAULT_LENGTH_HOURS),
    }
  }

  const startHour = rounded.getHours()
  const startMinute = rounded.getMinutes()
  return {
    date,
    startTime: at(startHour, startMinute),
    endTime: at(startHour + DEFAULT_LENGTH_HOURS, startMinute),
  }
}
