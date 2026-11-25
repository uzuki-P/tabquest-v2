export const JAKARTA = "Asia/Jakarta"

/** Asia/Jakarta is fixed UTC+7 with no DST. */
const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]
const MONTH_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

interface CalendarParts {
  year: number
  month: number
  day: number
}

function parseDateParts(value: string): CalendarParts | null {
  const match = DATE_KEY_PATTERN.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const probe = new Date(Date.UTC(year, month - 1, day))
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null
  }
  return { year, month, day }
}

function formatUtcDateKey(date: Date): string {
  const year = String(date.getUTCFullYear()).padStart(4, "0")
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  const day = String(date.getUTCDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/** Current instant as a UTC ISO-8601 string, used for all event timestamps. */
export function nowUtcIso(): string {
  return new Date().toISOString()
}

/** Today's calendar date in Asia/Jakarta as YYYY-MM-DD. */
export function todayJakarta(): string {
  return jakartaDateFor(new Date())
}

/**
 * Calendar date in Asia/Jakarta for a given instant (ISO string or Date).
 * Jakarta is UTC+7 with no DST, so days flip at 17:00 UTC the previous day;
 * date search keys are always derived through this conversion.
 */
export function jakartaDateFor(instant: string | Date): string {
  const epochMs =
    typeof instant === "string" ? Date.parse(instant) : instant.getTime()
  if (Number.isNaN(epochMs)) throw new Error(`Not a valid instant: ${instant}`)
  return formatUtcDateKey(new Date(epochMs + JAKARTA_OFFSET_MS))
}

/** Validates YYYY-MM-DD strings as real calendar dates. */
export function isValidDateString(value: string): boolean {
  return parseDateParts(value) !== null
}

/**
 * ISO day of week for a YYYY-MM-DD key: 1 = Monday .. 7 = Sunday.
 * Returns null for invalid date strings.
 */
export function isoDayOfWeek(dateKey: string): number | null {
  const parts = parseDateParts(dateKey)
  if (!parts) return null
  const jsDay = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day)
  ).getUTCDay()
  return jsDay === 0 ? 7 : jsDay
}

/** Renders a YYYY-MM-DD key as "August 2026". */
export function monthLabel(dateKey: string): string {
  const parts = parseDateParts(dateKey)
  if (!parts) return dateKey
  return `${MONTH_LONG[parts.month - 1]} ${parts.year}`
}

/**
 * Renders a YYYY-MM-DD key as "Fri, 28 Aug 2026". Timezone-free by design:
 * the key already names a calendar day. Values that fail validation pass
 * through unchanged so bad data stays visible instead of throwing mid-render.
 */
export function formatDisplayDate(value: string): string {
  const parts = parseDateParts(value)
  if (!parts) return value
  const dow = isoDayOfWeek(value)
  if (dow === null) return value
  const weekday = WEEKDAY_SHORT[dow - 1]
  const month = MONTH_SHORT[parts.month - 1]
  const day = String(parts.day).padStart(2, "0")
  return `${weekday}, ${day} ${month} ${parts.year}`
}

/**
 * Parses a YYYY-MM-DD key into a Date at local noon. Noon keeps the calendar
 * day stable across DST shifts in the browser's timezone.
 */
export function dateKeyToDate(key: string): Date | null {
  const parts = parseDateParts(key)
  if (!parts) return null
  return new Date(parts.year, parts.month - 1, parts.day, 12, 0, 0, 0)
}

/** Formats a Date as a YYYY-MM-DD key from its local calendar fields. */
export function dateToDateKey(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, "0")
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/** Renders a YYYY-MM key as "Mar '26", for compact chart axes. */
export function shortMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-")
  const name = MONTH_SHORT[Number(month) - 1]
  if (!name || !year) return monthKey
  return `${name} '${year.slice(-2)}`
}

/**
 * Inclusive list of YYYY-MM keys spanning two YYYY-MM-DD keys. Used to give
 * every player analytics chart the same month axis. Invalid or inverted
 * ranges yield an empty span.
 */
export function monthSpanKeys(fromKey: string, toKey: string): string[] {
  const start = parseDateParts(fromKey)
  const end = parseDateParts(toKey)
  if (!start || !end) return []
  if (fromKey > toKey) return []
  const keys: string[] = []
  let year = start.year
  let month = start.month
  while (year < end.year || (year === end.year && month <= end.month)) {
    keys.push(`${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`)
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }
  return keys
}
