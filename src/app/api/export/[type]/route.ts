import { fromZonedTime } from "date-fns-tz";
import { getCurrentUser } from "@/lib/auth";
import { can, canSeeBreed } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { toXlsx, toCsv, type Col } from "@/lib/export";
import { TZ, dateTime } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { horseAge, STATUS_LABEL, sexLabel } from "@/lib/horses";
import { audit } from "@/lib/audit";
import { salesFeed, sortFeed } from "@/lib/sales-feed";
import type { SaleKind } from "@/components/SaleTag";

const n = (v: unknown) => (v == null ? null : Number(v));

export async function GET(req: Request, { params }: { params: Promise<{ type: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Non autenticato", { status: 401 });
  if (!can(user.role, "data.export")) return new Response("Non autorizzato", { status: 403 });
  const { type } = await params;
  const url = new URL(req.url);
  const format = url.searchParams.get("formato") === "csv" ? "csv" : "xlsx";
  let cols: Col[] = [];
  let rows: Record<string, unknown>[] = [];
  let name = type;

  if (type === "listino") {
    const stats = await prisma.statDefinition.findMany({ orderBy: { sortOrder: "asc" } });
    const coats = (await prisma.coat.findMany({ include: { breed: true, stats: true }, orderBy: [{ breed: { sortOrder: "asc" } }, { sortOrder: "asc" }] }))
      .filter((c) => canSeeBreed(user.role, c.breedId));
    cols = [
      { header: "RAZZA", key: "breed", width: 34 }, { header: "MANTO", key: "coat", width: 24 },
      { header: "5-10 ANNI", key: "basePriceA", money: true }, { header: "11-15 ANNI", key: "basePriceB", money: true },
      { header: "ADDEST.", key: "trainingPrice", money: true }, { header: "LISTINO GOV", key: "govListPrice", money: true },
      { header: "TOT 5-10 ANNI", key: "salePriceA", money: true }, { header: "TOT 11-16 ANNI", key: "salePriceB", money: true },
      { header: "GOVERNO", key: "governmentPrice", money: true },
      ...stats.map((s) => ({ header: s.label, key: "s_" + s.id, width: 10 })),
      { header: "ARCHIVIATO", key: "archived", width: 11 },
    ];
    rows = coats.map((c) => ({
      breed: c.breed.name, coat: c.name, basePriceA: n(c.basePriceA), basePriceB: n(c.basePriceB), trainingPrice: n(c.trainingPrice),
      govListPrice: n(c.govListPrice), salePriceA: n(c.salePriceA), salePriceB: n(c.salePriceB), governmentPrice: n(c.governmentPrice),
      ...Object.fromEntries(c.stats.map((s) => ["s_" + s.statId, n(s.value)])), archived: c.archived || c.breed.archived ? "SI" : "",
    }));
  } else if (type === "vendite") {
    // Stesso elenco unico della pagina Vendite: cavalli, addestramenti, vetrina e blip, una riga per fattura
    const sp = url.searchParams;
    const da = sp.get("da"), a = sp.get("a");
    const okDate = (d: string | null): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);
    const soldAt = okDate(da) || okDate(a)
      ? { ...(okDate(da) ? { gte: fromZonedTime(da + "T00:00:00", TZ) } : {}), ...(okDate(a) ? { lte: fromZonedTime(a + "T23:59:59", TZ) } : {}) }
      : undefined;
    const sellerId = can(user.role, "sales.viewAll") ? (Number(sp.get("venditore")) || undefined) : user.id;
    let feed = await salesFeed({ sellerId, soldAt, q: sp.get("q") ?? undefined, includeVoided: sp.get("annullate") === "1", cap: 20000 }, () => null);
    const tipo = sp.get("tipo");
    if (tipo && ["cavallo", "addestramento", "vetrina", "blip"].includes(tipo)) feed = feed.filter((e) => e.tags.includes(tipo as SaleKind));
    feed = sortFeed(feed, sp.get("ordina") ?? "recenti");
    const TAG: Record<SaleKind, string> = { cavallo: "Cavallo", addestramento: "Addestramento", vetrina: "Vetrina", blip: "Blip" };
    cols = [
      { header: "Fattura", key: "id", width: 10 }, { header: "Data", key: "date", width: 18 }, { header: "Etichette", key: "tags", width: 28 },
      { header: "Descrizione", key: "title", width: 44 }, { header: "Targa", key: "plate", width: 12 },
      { header: "Venditore", key: "seller", width: 20 }, { header: "Acquirente", key: "buyer", width: 20 },
      { header: "Listino", key: "list", money: true }, { header: "Incassato", key: "total", money: true },
      { header: "di cui Cavallo", key: "pCavallo", money: true }, { header: "di cui Addestramento", key: "pAdd", money: true },
      { header: "di cui Vetrina", key: "pVetrina", money: true }, { header: "di cui Blip", key: "pBlip", money: true },
      { header: "Righe", key: "lines", width: 60 }, { header: "Note", key: "notes", width: 30 }, { header: "Annullata", key: "voided", width: 10 },
    ];
    rows = feed.map((e) => ({
      id: (e.source === "sale" ? "V" : "B") + e.id, date: dateTime(e.soldAt), tags: e.tags.map((t) => TAG[t]).join(", "), title: e.title, plate: e.plate,
      seller: e.sellerName, buyer: e.buyerName, list: e.listTotal ?? e.total, total: e.total,
      pCavallo: e.parts.cavallo ?? null, pAdd: e.parts.addestramento ?? null, pVetrina: e.parts.vetrina ?? null, pBlip: e.parts.blip ?? null,
      lines: e.lines.map((l) => `${l.qty > 1 ? l.qty + "× " : ""}${l.label} $${l.amount}`).join(" | "), notes: e.notes, voided: e.voided ? "SI" : "",
    }));
  } else if (type === "cavalli") {
    const settings = await getSettings();
    const horses = await prisma.horse.findMany({ include: { breed: true, coat: true, capturedBy: true, owner: true }, orderBy: { capturedAt: "desc" } });
    cols = [
      { header: "ID", key: "id", width: 7 }, { header: "Registrato", key: "date", width: 18 }, { header: "Stato", key: "status", width: 18 },
      { header: "Razza", key: "breed", width: 30 }, { header: "Manto", key: "coat", width: 22 }, { header: "Sesso", key: "sex", width: 10 },
      { header: "Targa", key: "plate", width: 12 }, { header: "Età attuale", key: "age", width: 11 }, { header: "Catturato da", key: "by", width: 20 },
      { header: "Condizione", key: "cond", width: 14 }, { header: "Note", key: "notes", width: 30 },
    ];
    rows = horses.map((h) => ({
      id: h.id, date: dateTime(h.capturedAt), status: STATUS_LABEL[h.status], breed: h.breed.name, coat: h.coat.name, sex: sexLabel(h.sex),
      plate: h.plate, age: h.status === "IN_STALLA" ? Math.round((horseAge(h, settings) ?? 0) * 100) / 100 : null, by: h.capturedBy.displayName, owner: h.owner.displayName, preg: h.pregnancyDueAt ? dateTime(h.pregnancyDueAt) : "",
      cond: h.condition, notes: h.notes,
    }));
  } else if (type === "pagamenti") {
    if (!can(user.role, "payroll.manage")) return new Response("Non autorizzato", { status: 403 });
    const pays = await prisma.payment.findMany({ include: { user: true, recordedBy: true }, orderBy: { createdAt: "desc" } });
    cols = [
      { header: "Data", key: "date", width: 18 }, { header: "Dipendente", key: "user", width: 20 }, { header: "Settimana dal", key: "week", width: 14 },
      { header: "Spettava", key: "due", money: true }, { header: "Pagato", key: "amount", money: true }, { header: "Azione", key: "action", width: 12 }, { header: "Registrato da", key: "by", width: 20 }, { header: "Note", key: "notes", width: 30 },
    ];
    rows = pays.map((p) => ({ date: dateTime(p.createdAt), user: p.user.displayName, week: dateTime(p.weekStart).slice(0, 10), due: n(p.dueAmount), amount: n(p.amount), action: p.action, by: p.recordedBy?.displayName, notes: p.notes }));
  } else {
    return new Response("Tipo non valido", { status: 404 });
  }

  await audit(user, "ESPORTAZIONE", "Dati", null, `Esportazione ${type} (${format}, ${rows.length} righe)`);
  name = `${name}-${new Date().toISOString().slice(0, 10)}`;
  if (format === "csv") {
    return new Response(toCsv(cols, rows), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"` },
    });
  }
  const buf = await toXlsx(type, cols, rows);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}.xlsx"`,
    },
  });
}
