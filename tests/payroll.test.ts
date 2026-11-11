import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWeek, computeSalary } from "../src/lib/payroll";
import { pregnancyState } from "../src/lib/horses";

const pct = { stable: 30, gov: 20, items: 10 };
const totals = { stable: 1000, gov: 100, items: 50, count: 5 };
const w0 = new Date("2026-11-02T00:00:00Z");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const entry = (e: Record<string, unknown>) => ({ id: 1, userId: 1, weekStart: w0, status: "DA_PAGARE", stableTotal: null, govTotal: null, itemsTotal: null, pctStable: null, pctGov: null, pctItems: null, computedAmount: null, amountOverride: null, paidAmount: 0, paidAt: null, paidById: null, notes: null, createdAt: w0, updatedAt: w0, paidBy: null, ...e }) as any;

test("stipendio con percentuali separate per stalla, blip e oggetti", () => {
  assert.equal(computeSalary(totals, pct), 300 + 20 + 5);
});

test("settimana non pagata: tutto da pagare", () => {
  const w = buildWeek("k", w0, false, totals, pct, undefined);
  assert.equal(w.due, 325);
  assert.equal(w.residual, 325);
  assert.equal(w.status, "DA_PAGARE");
});

test("pagamento parziale lascia un residuo", () => {
  const w = buildWeek("k", w0, false, totals, pct, entry({ paidAmount: 200, computedAmount: 325, stableTotal: 1000, govTotal: 100, itemsTotal: 50, pctStable: 30, pctGov: 20, pctItems: 10 }));
  assert.equal(w.status, "PARZIALE");
  assert.equal(w.residual, 125);
  assert.equal(w.extra, 0);
});

test("pagamento in eccesso registrato come extra (incentivo)", () => {
  const w = buildWeek("k", w0, false, totals, pct, entry({ paidAmount: 400, computedAmount: 325, stableTotal: 1000, govTotal: 100, itemsTotal: 50, pctStable: 30, pctGov: 20, pctItems: 10 }));
  assert.equal(w.status, "PAGATO");
  assert.equal(w.residual, 0);
  assert.equal(w.extra, 75);
});

test("dopo il primo pagamento i totali restano fotografati", () => {
  // nuove vendite dopo il pagamento non cambiano il dovuto della settimana
  const w = buildWeek("k", w0, false, { ...totals, stable: 5000 }, pct, entry({ paidAmount: 325, computedAmount: 325, stableTotal: 1000, govTotal: 100, itemsTotal: 50, pctStable: 30, pctGov: 20, pctItems: 10 }));
  assert.equal(w.due, 325);
  assert.equal(w.status, "PAGATO");
});

test("dovuto modificato a mano", () => {
  const w = buildWeek("k", w0, false, totals, pct, entry({ amountOverride: 500 }));
  assert.equal(w.due, 500);
  assert.equal(w.overridden, true);
});

test("gravidanza: incinta prima della data, poi fai partorire", () => {
  const now = new Date("2026-11-10T12:00:00Z");
  assert.equal(pregnancyState({ pregnantSince: null, pregnancyDueAt: null }, now), null);
  assert.equal(pregnancyState({ pregnantSince: new Date("2026-11-09T00:00:00Z"), pregnancyDueAt: new Date("2026-11-12T00:00:00Z") }, now), "INCINTA");
  assert.equal(pregnancyState({ pregnantSince: new Date("2026-11-06T00:00:00Z"), pregnancyDueAt: new Date("2026-11-09T00:00:00Z") }, now), "PARTO");
});
