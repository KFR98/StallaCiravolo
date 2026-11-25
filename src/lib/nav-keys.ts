/** Voci del menu che si possono mettere nella barra in basso del telefono (Impostazioni). */
export const NAV_CHOICES = [
  ["ufficio", "Ufficio"],
  ["stalla", "Stalla"],
  ["bottega", "Bottega"],
  ["soldi", "Soldi"],
  ["mappa", "Mappa spawn"],
  ["catalogo", "Catalogo e prezzi"],
  ["bacheca", "Bacheca e clienti"],
  ["personale", "Personale"],
  ["admin", "Amministrazione"],
] as const;
export const NAV_CHOICE_KEYS = NAV_CHOICES.map(([k]) => k) as string[];
