/**
 * Abbinamento automatico tra file immagine (nomi in stile wiki, es. "Black Arabian.webp")
 * e manti del catalogo. Usato dallo script `npm run images:import`.
 */

/** Parola chiave inglese (come usata dalla wiki) per ciascuna razza del listino. */
const BREED_KEYWORDS: [RegExp, string[]][] = [
  [/AMERICAN PAINT/i, ["americanpaint"]],
  [/AMERICAN STANDARD/i, ["americanstandardbred", "standardbred"]],
  [/ANDALUSIAN/i, ["andalusian"]],
  [/APPALOOSA/i, ["appaloosa"]],
  [/ARABIAN/i, ["arabian"]],
  [/ARDENNES/i, ["ardennes"]],
  [/BELGIAN/i, ["belgiandraft", "belgian"]],
  [/BRETON/i, ["breton"]],
  [/CRIOLLO/i, ["criollo"]],
  [/DUTCH WARMBLOOD/i, ["dutchwarmblood", "warmblood"]],
  [/GYPSY ?COB/i, ["gypsycob"]],
  [/HUNGARIAN/i, ["hungarianhalfbred", "hungarian"]],
  [/KENTUCKY/i, ["kentuckysaddler", "kentuckysaddle"]],
  [/KLADRUBER/i, ["kladruber"]],
  [/MISSOURI/i, ["missourifoxtrotter", "foxtrotter"]],
  [/MORGAN/i, ["morgan"]],
  [/MUSTANG/i, ["mustang"]],
  [/NOKOTA/i, ["nokota"]],
  [/NORFOLK/i, ["norfolkroadster"]],
  [/SHIRE/i, ["shire"]],
  [/SUFFOLK/i, ["suffolkpunch"]],
  [/TENNESS?EE? WALKER/i, ["tennesseewalker"]],
  [/THOROUGHBRED/i, ["thoroughbred"]],
  [/TURKOMAN/i, ["turkoman"]],
  [/LUSITANO/i, ["lusitano"]],
  [/WARLANDER/i, ["warlander"]],
  [/GRONINGEN/i, ["groningen"]],
  [/FOSTER/i, ["foster"]],
  [/MULI/i, ["mule"]],
  [/ASINI/i, ["donkey"]],
];

export function compact(s: string) {
  return s
    .toLowerCase()
    .replace(/\.(png|jpe?g|webp|gif)/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/\bnew\b/g, "")
    .replace(/\bstory mode\b/g, "")
    .replace(/gray/g, "grey")
    .replace(/[^a-z0-9]/g, "");
}

export function breedKeywords(breedName: string): string[] {
  for (const [re, kws] of BREED_KEYWORDS) if (re.test(breedName)) return kws;
  return [compact(breedName.replace(/\(.*?\)/g, ""))];
}

export type MatchCandidate = { file: string; score: number };

/**
 * Restituisce il file migliore per un manto, oppure null.
 * Punteggio: 0 = nome identico ("<manto><razza>"), poi lunghezza dei caratteri in eccesso.
 */
export function bestImageFor(breedName: string, coatName: string, files: string[]): string | null {
  const kws = breedKeywords(breedName);
  const coatC = compact(coatName);
  if (!coatC) return null;
  let best: MatchCandidate | null = null;
  for (const f of files) {
    const fc = compact(f);
    for (const kw of kws) {
      let score: number | null = null;
      if (fc === coatC + kw || fc === kw + coatC) score = 0;
      else if (fc.includes(kw)) {
        const rest = fc.replace(kw, "");
        if (rest === coatC) score = 0;
        else if (rest.startsWith(coatC) || rest.endsWith(coatC)) score = rest.length - coatC.length;
      }
      if (score != null && (!best || score < best.score || (score === best.score && f.length < best.file.length))) {
        best = { file: f, score };
      }
    }
  }
  // Scarta abbinamenti troppo "larghi" (es. manto "Gold" su "Gold Dapple")
  if (best && best.score > 0 && best.score >= 6) return null;
  return best?.file ?? null;
}
