/** Colori disponibili per le note sulla mappa. */
export const NOTE_COLORS = ["#c8161d", "#ea7a0c", "#d6b25e", "#1f7a3d", "#1d5f8f", "#6b21a8", "#be185d", "#57534e"];
/** Nome predefinito di ogni colore. Admin, direttore e gestore possono dare a ogni colore il nome di una categoria. */
export const NOTE_COLOR_DEFAULT_NAMES = ["Rosso", "Arancione", "Ocra", "Verde", "Blu", "Viola", "Rosa", "Grigio"];
export const noteColorName = (names: Record<string, string>, color: string) =>
  names[color]?.trim() || NOTE_COLOR_DEFAULT_NAMES[NOTE_COLORS.indexOf(color)] || "Note";
