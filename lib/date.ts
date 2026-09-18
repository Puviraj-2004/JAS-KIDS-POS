export const SRI_LANKA_TIME_ZONE = "Asia/Colombo";

const dateParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: SRI_LANKA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function todaySriLanka() {
  return dateParts.format(new Date());
}

export function dateInputFromTimestamp(value: string | Date) {
  return dateParts.format(typeof value === "string" ? new Date(value) : value);
}

export function parseDateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

export function formatDateOnly(value: string | Date) {
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

export function formatSriLankaDateTime(value: string | Date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: SRI_LANKA_TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(typeof value === "string" ? new Date(value) : value);
}

export function formatSriLankaDate(value: string | Date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: SRI_LANKA_TIME_ZONE,
    dateStyle: "medium",
  }).format(typeof value === "string" ? new Date(value) : value);
}

export function sriLankaDateBoundary(value: string, endOfDay: boolean) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return new Date(Number.NaN);
  const utcValue = Date.UTC(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
  return new Date(utcValue - (5 * 60 + 30) * 60 * 1000);
}
