import { formatInTimeZone } from "date-fns-tz";

export const TZ = process.env.TZ_STALLA || process.env.NEXT_PUBLIC_TZ || "Europe/Rome";

export function money(v: number | string | null | undefined | { toString(): string }, currency = "$") {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return currency + n.toLocaleString("it-IT", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
}

export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function dateTime(d: Date | string | null | undefined, tz = TZ) {
  if (!d) return "—";
  return formatInTimeZone(new Date(d), tz, "dd/MM/yyyy HH:mm");
}

export function dateOnly(d: Date | string | null | undefined, tz = TZ) {
  if (!d) return "—";
  return formatInTimeZone(new Date(d), tz, "dd/MM/yyyy");
}

export function ageText(age: number) {
  return age.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
