export const DEFAULT_BOARD_TZ = "UTC";

export function boardTimeZone(tz = process.env.BOARD_TZ): string {
  if (tz === undefined || tz.trim() === "") {
    return DEFAULT_BOARD_TZ;
  }
  return tz;
}

/** Calendar date `YYYY-MM-DD` in `BOARD_TZ` (default UTC). */
export function dayKey(now: Date = new Date(), tz: string = boardTimeZone()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    throw new Error(`could not format day key for tz ${JSON.stringify(tz)}`);
  }
  return `${year}-${month}-${day}`;
}
