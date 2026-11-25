import { prisma } from "./db";
import { can } from "./permissions";
import { getSettings } from "./settings";
import { actionsAt } from "./audit-levels";
import { payrollOverview } from "./payroll";

/**
 * Numerini accanto alle voci del menu: le cose che aspettano qualcuno.
 * Ognuno vede solo i conteggi delle sezioni per cui ha il permesso; si accendono/spengono in Impostazioni.
 * Le chiavi sono quelle delle voci del menu (gli stipendi arretrati stanno nella sezione Soldi).
 */
export type NavBadges = Partial<Record<string, { n: number; title: string }>>;

// gli arretrati degli stipendi sono un calcolo pesante: si tengono per un minuto
const g = globalThis as unknown as { __payBadge?: { at: number; n: number } };

export async function navBadges(user: { id: number; role: string }): Promise<NavBadges> {
  const s = await getSettings();
  const on = s.navBadges;
  const out: NavBadges = {};
  const now = new Date();
  const jobs: Promise<void>[] = [];

  if (on.stalla && can(user.role, "horses.view")) {
    const all = can(user.role, "horses.manageAll");
    jobs.push(
      prisma.horse.count({
        where: { status: "IN_STALLA", ...(all ? {} : { ownerId: user.id }), OR: [{ pregnancyDueAt: { lte: now } }, { needsData: true }] },
      }).then((n) => { if (n) out.stalla = { n, title: `${n} da sistemare: parti da fare o puledri senza dati` }; }),
    );
  }
  if (on.bottega && can(user.role, "shop.manage")) {
    jobs.push(
      Promise.all([
        prisma.reimbursement.count({ where: { status: { in: ["RICHIESTO", "APPROVATO"] } } }),
        prisma.shopNote.count({ where: { status: "APERTA" } }),
      ]).then(([a, b]) => { if (a + b) out.bottega = { n: a + b, title: `${a} rimborsi e ${b} proposte da gestire` }; }),
    );
  }
  if (on.bacheca && can(user.role, "reservations.edit")) {
    jobs.push(
      prisma.reservation.count({ where: { assignedToId: user.id, status: { in: ["DA_CATTURARE", "PRENOTATO"] } } })
        .then((n) => { if (n) out.bacheca = { n, title: `${n} prenotazioni assegnate a te ancora aperte` }; }),
    );
  }
  if (on.personale && can(user.role, "payroll.manage")) {
    jobs.push((async () => {
      let n: number;
      if (g.__payBadge && Date.now() - g.__payBadge.at < 60_000) n = g.__payBadge.n;
      else {
        n = (await payrollOverview()).filter((u) => u.due > 0.004).length;
        g.__payBadge = { at: Date.now(), n };
      }
      if (n) out.soldi = { n, title: `${n} dipendenti con stipendi arretrati` };
    })());
  }
  if (on.admin && can(user.role, "audit.view")) {
    const known = (await prisma.auditLog.findMany({ distinct: ["action"], select: { action: true } })).map((r) => r.action);
    const serious = [...actionsAt("alarm", s.auditLevelOverrides, known), ...actionsAt("critical", s.auditLevelOverrides, known)];
    jobs.push(
      prisma.auditLog.count({ where: { action: { in: serious }, createdAt: { gte: new Date(Date.now() - 86400_000) } } })
        .then((n) => { if (n) out.admin = { n, title: `${n} voci Alarm o Critico nel registro nelle ultime 24 ore` }; }),
    );
  }
  await Promise.all(jobs);
  return out;
}
