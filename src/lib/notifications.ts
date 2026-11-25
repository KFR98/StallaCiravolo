import "server-only";
import { prisma } from "./db";
import { can } from "./permissions";
import { getSettings } from "./settings";
import { actionLabel, actionsAt, levelOf } from "./audit-levels";
import { payrollOverview } from "./payroll";
import { TZ } from "./format";

/**
 * Notifiche: le cose che aspettano qualcuno, una per una, con il link alla schermata esatta.
 * Da qui escono sia i numerini del menu sia l'elenco della campanella.
 * Ognuno vede solo le notifiche delle sezioni per cui ha il permesso; le sezioni si accendono/spengono in Impostazioni.
 * Sono "di stato": spariscono da sole quando la cosa viene sistemata (parto fatto, rimborso gestito…).
 */
export type Notice = {
  /** identificativo stabile, uguale all'ancora (#…) sulla pagina di arrivo */
  id: string;
  /** voce del menu a cui appartiene (per il numerino) */
  section: "stalla" | "bottega" | "bacheca" | "soldi" | "admin";
  /** etichetta del gruppo nella campanella */
  group: string;
  title: string;
  detail: string;
  href: string;
  level: "warn" | "alarm";
};
export type NavBadges = Partial<Record<string, { n: number; title: string }>>;
export type Notifications = { items: Notice[]; badges: NavBadges; total: number };

// gli arretrati degli stipendi sono un calcolo pesante: si tengono per un minuto
const g = globalThis as unknown as { __payNotice?: { at: number; list: { userId: number; name: string; due: number }[] } };

/** Ancore usate sulle pagine (stesso nome nella campanella e nel pallino accanto alla cosa). */
export const anchor = {
  horse: (id: number) => `cavallo-${id}`,
  reimbursement: (id: number) => `rimborso-${id}`,
  note: (id: number) => `proposta-${id}`,
  reservation: (id: number) => `prenotazione-${id}`,
  payroll: (userId: number) => `stipendio-${userId}`,
  audit: (id: number) => `voce-${id}`,
};

export async function getNotifications(user: { id: number; role: string }, opts: { all?: boolean; only?: Notice["section"] } = {}): Promise<Notifications> {
  const s = await getSettings();
  const on = s.navBadges;
  // nella campanella se ne mostrano al massimo N per sezione; per i pallini sulle pagine servono tutte
  const max = opts.all ? undefined : s.notifyListMax;
  const now = new Date();
  const items: Notice[] = [];
  const badges: NavBadges = {};
  const jobs: Promise<void>[] = [];
  const want = (k: Notice["section"]) => !opts.only || opts.only === k;

  if (want("stalla") && on.stalla && can(user.role, "horses.view")) {
    const all = can(user.role, "horses.manageAll");
    const where = { status: "IN_STALLA" as const, ...(all ? {} : { ownerId: user.id }), OR: [{ pregnancyDueAt: { lte: now } }, { needsData: true }] };
    jobs.push(Promise.all([
      prisma.horse.count({ where }),
      prisma.horse.findMany({ where, take: max, orderBy: { capturedAt: "desc" }, select: { id: true, plate: true, needsData: true, pregnancyDueAt: true, breed: { select: { name: true } }, coat: { select: { name: true } }, owner: { select: { displayName: true } } } }),
    ]).then(([n, list]) => {
      if (!n) return;
      badges.stalla = { n, title: `${n} da sistemare: parti da fare o puledri senza dati` };
      for (const h of list) {
        const name = `${h.breed.name} – ${h.coat.name}${h.plate ? ` (${h.plate})` : ""}`;
        const birth = h.pregnancyDueAt && h.pregnancyDueAt <= now;
        items.push({
          id: anchor.horse(h.id), section: "stalla", group: "Stalla", level: "warn",
          title: birth ? `Parto da fare: ${name}` : `Dati da completare: ${name}`,
          detail: birth ? `La gravidanza è arrivata a termine · in carico a ${h.owner.displayName}` : `Puledro senza targa o sesso · in carico a ${h.owner.displayName}`,
          href: `/stalla/${h.id}#${birth ? "gravidanza" : "dati-puledro"}`,
        });
      }
    }));
  }

  if (want("bottega") && on.bottega && can(user.role, "shop.manage")) {
    const rw = { status: { in: ["RICHIESTO" as const, "APPROVATO" as const] } };
    const nw = { status: "APERTA" as const };
    jobs.push(Promise.all([
      prisma.reimbursement.count({ where: rw }),
      prisma.shopNote.count({ where: nw }),
      prisma.reimbursement.findMany({ where: rw, take: max, orderBy: { createdAt: "asc" }, select: { id: true, description: true, amount: true, status: true, user: { select: { displayName: true } } } }),
      prisma.shopNote.findMany({ where: nw, take: max, orderBy: { createdAt: "asc" }, select: { id: true, text: true, createdBy: { select: { displayName: true } } } }),
    ]).then(([a, b, reimb, notes]) => {
      if (!(a + b)) return;
      badges.bottega = { n: a + b, title: `${a} rimborsi e ${b} proposte da gestire` };
      for (const r of reimb) items.push({
        id: anchor.reimbursement(r.id), section: "bottega", group: "Bottega", level: "warn",
        title: `Rimborso ${r.status === "APPROVATO" ? "approvato da pagare" : "da valutare"}: $${Number(r.amount)}`,
        detail: `${r.user.displayName} · ${r.description}`.slice(0, 140),
        href: `/bottega?tab=richieste#${anchor.reimbursement(r.id)}`,
      });
      for (const x of notes) items.push({
        id: anchor.note(x.id), section: "bottega", group: "Bottega", level: "warn",
        title: "Proposta da gestire", detail: `${x.createdBy.displayName} · ${x.text}`.slice(0, 140),
        href: `/bottega?tab=richieste#${anchor.note(x.id)}`,
      });
    }));
  }

  if (want("bacheca") && on.bacheca && can(user.role, "reservations.edit")) {
    const where = { assignedToId: user.id, status: { in: ["DA_CATTURARE" as const, "PRENOTATO" as const] } };
    jobs.push(Promise.all([
      prisma.reservation.count({ where }),
      prisma.reservation.findMany({ where, take: max, orderBy: [{ deliveryDate: "asc" }, { updatedAt: "desc" }], select: { id: true, title: true, customerName: true, status: true, deliveryDate: true, breed: { select: { name: true } }, coat: { select: { name: true } } } }),
    ]).then(([n, list]) => {
      if (!n) return;
      badges.bacheca = { n, title: `${n} prenotazioni assegnate a te ancora aperte` };
      for (const r of list) {
        const what = [r.breed?.name, r.coat?.name].filter(Boolean).join(" – ") || r.title || "Prenotazione";
        items.push({
          id: anchor.reservation(r.id), section: "bacheca", group: "Bacheca", level: "warn",
          title: `${r.status === "DA_CATTURARE" ? "Da catturare" : "Da consegnare"}: ${what}`,
          detail: [r.customerName && `per ${r.customerName}`, r.deliveryDate && `consegna ${r.deliveryDate.toLocaleDateString("it-IT", { timeZone: TZ })}`, "assegnata a te"].filter(Boolean).join(" · "),
          href: `/prenotazioni#${anchor.reservation(r.id)}`,
        });
      }
    }));
  }

  if (want("soldi") && on.personale && can(user.role, "payroll.manage")) {
    jobs.push((async () => {
      let list: { userId: number; name: string; due: number }[];
      if (g.__payNotice && Date.now() - g.__payNotice.at < 60_000) list = g.__payNotice.list;
      else {
        list = (await payrollOverview()).filter((u) => u.due > 0.004).map((u) => ({ userId: u.userId, name: u.name, due: u.due }));
        g.__payNotice = { at: Date.now(), list };
      }
      if (!list.length) return;
      badges.soldi = { n: list.length, title: `${list.length} dipendenti con stipendi arretrati` };
      for (const u of list.slice(0, max ?? list.length)) items.push({
        id: anchor.payroll(u.userId), section: "soldi", group: "Stipendi", level: "warn",
        title: `Stipendio arretrato: ${u.name}`, detail: `Gli spettano $${Math.round(u.due * 100) / 100} di settimane concluse`,
        href: `/stipendi#${anchor.payroll(u.userId)}`,
      });
    })());
  }

  if (want("admin") && on.admin && can(user.role, "audit.view")) {
    jobs.push((async () => {
      const known = (await prisma.auditLog.findMany({ distinct: ["action"], select: { action: true } })).map((r) => r.action);
      const serious = [...actionsAt("alarm", s.auditLevelOverrides, known), ...actionsAt("critical", s.auditLevelOverrides, known)];
      const where = { action: { in: serious }, createdAt: { gte: new Date(Date.now() - s.notifyAuditHours * 3600_000) } };
      const [n, list] = await Promise.all([
        prisma.auditLog.count({ where }),
        prisma.auditLog.findMany({ where, take: max, orderBy: { createdAt: "desc" }, select: { id: true, action: true, summary: true, username: true, createdAt: true, user: { select: { displayName: true } } } }),
      ]);
      if (!n) return;
      // filtro del registro che di sicuro contiene la voce (1, 7 o 30 giorni)
      const period = s.notifyAuditHours <= 24 ? 1 : s.notifyAuditHours <= 168 ? 7 : 30;
      badges.admin = { n, title: `${n} voci Alarm o Critico nel registro nelle ultime ${s.notifyAuditHours} ore` };
      for (const r of list) {
        const lv = levelOf(r.action, s.auditLevelOverrides);
        items.push({
          id: anchor.audit(r.id), section: "admin", group: "Registro attività", level: "alarm",
          title: `${lv === "critical" ? "Critico" : "Alarm"}: ${actionLabel(r.action)}`,
          detail: `${r.user?.displayName ?? r.username ?? "sconosciuto"} · ${r.summary}`.slice(0, 140),
          href: `/admin/audit?livello=${lv}&periodo=${period}#${anchor.audit(r.id)}`,
        });
      }
    })());
  }

  await Promise.all(jobs);
  const order = ["admin", "stalla", "bottega", "bacheca", "soldi"];
  items.sort((a, b) => order.indexOf(a.section) - order.indexOf(b.section));
  const total = Object.values(badges).reduce((t, b) => t + (b?.n ?? 0), 0);
  return { items, badges, total };
}

/** Insieme degli id con una notifica attiva (per i pallini sulle pagine). */
export async function noticeIds(user: { id: number; role: string }, section: Notice["section"]): Promise<Set<string>> {
  const s = await getSettings();
  if (!s.notifyDots) return new Set();
  return new Set((await getNotifications(user, { all: true, only: section })).items.map((i) => i.id));
}
