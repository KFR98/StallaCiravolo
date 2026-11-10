import { test } from "node:test";
import assert from "node:assert/strict";
import { currentAge, formatAge, daysUntilAge } from "../src/lib/age";
import { priceBracket, listPriceFor, applyDiscount } from "../src/lib/pricing";
import { weekStartOf, addWeeks, isoWeekKey, parseWeekKey } from "../src/lib/weeks";
import { bestImageFor } from "../src/lib/image-match";

const S = { minSaleAge: 5, bracketAMax: 10, bracketBMax: 16 };
const DAY = 86400_000;

test("età: avanza di 1 anno ogni N giorni dalla data di inserimento", () => {
  const start = new Date("2026-01-01T00:00:00Z");
  assert.equal(currentAge(1.25, start, 4, new Date(start.getTime() + 4 * DAY)), 2.25);
  assert.equal(currentAge(3, start, 7, new Date(start.getTime() + 14 * DAY)), 5);
  assert.equal(currentAge(3, start, 4, start), 3);
  // data futura non fa diminuire l'età
  assert.equal(currentAge(3, start, 4, new Date(start.getTime() - DAY)), 3);
});

test("età: cambio ritmo conserva l'età maturata", () => {
  const start = new Date("2026-01-01T00:00:00Z");
  const change = new Date(start.getTime() + 8 * DAY); // con 4 gg/anno: +2 anni
  const frozen = currentAge(1, start, 4, change);
  assert.equal(frozen, 3);
  // dopo il cambio a 8 gg/anno, altri 8 giorni = +1 anno
  assert.equal(currentAge(frozen, change, 8, new Date(change.getTime() + 8 * DAY)), 4);
});

test("età: testo e giorni mancanti", () => {
  assert.equal(formatAge(7), "7 anni");
  assert.equal(formatAge(1), "1 anno");
  assert.equal(formatAge(7.5), "7 anni e 6 mesi");
  assert.equal(daysUntilAge(3, 5, 4), 8);
  assert.equal(daysUntilAge(6, 5, 4), 0);
});

test("fasce di prezzo per età", () => {
  assert.equal(priceBracket(4.99, S), "TROPPO_GIOVANE");
  assert.equal(priceBracket(5, S), "A");
  assert.equal(priceBracket(10.9, S), "A");
  assert.equal(priceBracket(11, S), "B");
  assert.equal(priceBracket(16.99, S), "B");
  assert.equal(priceBracket(17, S), "LIBERO");
  const p = { salePriceA: 1500, salePriceB: 1250, governmentPrice: 75 };
  assert.equal(listPriceFor("A", p), 1500);
  assert.equal(listPriceFor("B", p), 1250);
  assert.equal(listPriceFor("LIBERO", p), null);
});

test("sconti", () => {
  assert.equal(applyDiscount(1500, "PERCENTUALE", 10), 1350);
  assert.equal(applyDiscount(1500, "IMPORTO", 100), 1400);
  assert.equal(applyDiscount(100, "IMPORTO", 500), 0);
  assert.equal(applyDiscount(100, null, null), 100);
  assert.equal(applyDiscount(19.44, "PERCENTUALE", 50), 9.72);
});

test("settimane: da lunedì a domenica nel fuso Europe/Rome", () => {
  const tz = "Europe/Rome";
  // martedì 10/11/2026 → lunedì 09/11/2026
  assert.equal(isoWeekKey(weekStartOf(new Date("2026-11-10T12:00:00Z"), tz), tz), "2026-11-09");
  // domenica sera tardi resta nella stessa settimana
  assert.equal(isoWeekKey(weekStartOf(new Date("2026-11-15T22:30:00Z"), tz), tz), "2026-11-09");
  // lunedì 00:30 ora italiana = domenica 23:30 UTC → nuova settimana
  assert.equal(isoWeekKey(weekStartOf(new Date("2026-11-15T23:30:00Z"), tz), tz), "2026-11-16");
  // cambio ora legale (fine marzo)
  const w = weekStartOf(new Date("2026-03-25T12:00:00Z"), tz);
  assert.equal(isoWeekKey(addWeeks(w, 1, tz), tz), "2026-03-30");
  assert.equal(isoWeekKey(parseWeekKey("2026-11-12", tz)!, tz), "2026-11-09");
});

test("abbinamento immagini wiki → manti", () => {
  const files = ["Black Arabian.webp", "Gold_Turkoman.PNG.webp", "Gold_Dapple_Turkoman.PNG.webp", "Gray Overo American Paint.webp", "Warped Brindle Arabian New.webp"];
  assert.equal(bestImageFor("ARABIAN (Arabo)", "Black", files), "Black Arabian.webp");
  assert.equal(bestImageFor("TURKOMAN", "Gold", files), "Gold_Turkoman.PNG.webp");
  assert.equal(bestImageFor("AMERICAN PAINT HORSE", "Grey Overo", files), "Gray Overo American Paint.webp");
  assert.equal(bestImageFor("ARABIAN (Arabo)", "Warped Brindle", files), "Warped Brindle Arabian New.webp");
  assert.equal(bestImageFor("MORGAN", "Bay", files), null);
});
