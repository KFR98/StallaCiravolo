/**
 * Avanzamento età.
 * età = ageBase + (adesso − ageCheckpointAt) / giorniPerAnno
 * Calcolata sempre al volo: non serve che qualcuno apra il gestionale.
 * Quando l'admin cambia giorniPerAnno, per ogni cavallo in stalla si "congela"
 * l'età maturata in ageBase e si sposta il checkpoint ad adesso (vedi actions impostazioni).
 */
export function currentAge(
  ageBase: number | { toString(): string },
  checkpoint: Date,
  daysPerYear: number,
  now: Date = new Date(),
): number {
  const base = Number(ageBase);
  const elapsedDays = Math.max(0, (now.getTime() - checkpoint.getTime()) / 86400_000);
  const dpy = daysPerYear > 0 ? daysPerYear : 4;
  return base + elapsedDays / dpy;
}

/** Età leggibile: "7 anni" oppure "7 anni e 2 mesi". */
export function formatAge(age: number): string {
  const years = Math.floor(age + 1e-9);
  const months = Math.floor((age - years) * 12 + 1e-9);
  const y = years === 1 ? "1 anno" : `${years} anni`;
  if (months <= 0) return y;
  return `${y} e ${months} ${months === 1 ? "mese" : "mesi"}`;
}

/** Giorni reali mancanti per raggiungere un'età. */
export function daysUntilAge(age: number, target: number, daysPerYear: number) {
  return Math.max(0, (target - age) * daysPerYear);
}
