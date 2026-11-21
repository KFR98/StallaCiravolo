/** Ordinamenti dell'elenco della stalla (usati dalla pagina e dalle Impostazioni). */
export const STABLE_SORTS = [
  ["recenti", "Cattura più recente"],
  ["meno_recenti", "Cattura meno recente"],
  ["giovani", "Età: dal più giovane"],
  ["anziani", "Età: dal più vecchio"],
  ["razza", "Razza e manto (A-Z)"],
  ["prezzo_alto", "Prezzo: dal più alto"],
  ["prezzo_basso", "Prezzo: dal più basso"],
  ["targa", "Targa (A-Z)"],
] as const;
export type StableSort = (typeof STABLE_SORTS)[number][0];
