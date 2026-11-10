import { fromZonedTime, toZonedTime, formatInTimeZone } from "date-fns-tz";
import { addDays, startOfDay } from "date-fns";

/** Lunedì 00:00 (nel fuso della stalla) della settimana che contiene `d`, come istante UTC. */
export function weekStartOf(d: Date, tz: string): Date {
  const local = toZonedTime(d, tz);
  const dow = (local.getDay() + 6) % 7; // 0 = lunedì
  const monday = startOfDay(addDays(local, -dow));
  return fromZonedTime(monday, tz);
}

export function addWeeks(weekStart: Date, n: number, tz: string): Date {
  const local = toZonedTime(weekStart, tz);
  return fromZonedTime(startOfDay(addDays(local, 7 * n)), tz);
}

export function dayStartOf(d: Date, tz: string): Date {
  return fromZonedTime(startOfDay(toZonedTime(d, tz)), tz);
}

export function weekLabel(weekStart: Date, tz: string) {
  const end = addWeeks(weekStart, 1, tz);
  const last = new Date(end.getTime() - 1);
  return `${formatInTimeZone(weekStart, tz, "dd/MM")} – ${formatInTimeZone(last, tz, "dd/MM/yyyy")}`;
}

/** Elenco delle settimane da `from` a `to` incluse. */
export function weeksBetween(from: Date, to: Date, tz: string): Date[] {
  const out: Date[] = [];
  let w = weekStartOf(from, tz);
  const last = weekStartOf(to, tz);
  let guard = 0;
  while (w.getTime() <= last.getTime() && guard++ < 1000) {
    out.push(w);
    w = addWeeks(w, 1, tz);
  }
  return out;
}

export function isoWeekKey(weekStart: Date, tz: string) {
  return formatInTimeZone(weekStart, tz, "yyyy-MM-dd");
}

export function parseWeekKey(key: string, tz: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  return weekStartOf(fromZonedTime(key + "T12:00:00", tz), tz);
}
