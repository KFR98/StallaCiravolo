import "server-only";
import { prisma } from "./db";
import { createSession } from "./auth";
import { audit } from "./audit";
import { getSettings } from "./settings";

/*
 * ATTENZIONE: questo file NON è un file di azioni ("use server"), di proposito.
 * finishLogin apre una sessione per un utente: deve poterla chiamare solo il codice del server
 * dopo aver controllato password (e codice), mai il browser.
 */

/** Ultimo passo dell'accesso (anche dopo la doppia verifica): sessione, ultimo accesso, registro con IP. */
export async function finishLogin(user: { id: number; username: string }, ip: string, browser: { browser: string | null }) {
  const ls = await getSettings();
  await createSession(user.id);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  // Primo accesso da un IP mai usato da questo utente (ma non il suo primissimo accesso): da tenere d'occhio
  let newIp = false;
  if (ls.auditNewIpLogin && ip !== "?") {
    const seen = await prisma.auditLog.findFirst({ where: { userId: user.id, action: { in: ["LOGIN", "LOGIN_NUOVO_IP"] }, ip }, select: { id: true } });
    const any = seen ? null : await prisma.auditLog.findFirst({ where: { userId: user.id, action: { in: ["LOGIN", "LOGIN_NUOVO_IP"] } }, select: { id: true } });
    newIp = !seen && !!any;
  }
  await audit(
    { id: user.id, username: user.username }, newIp ? "LOGIN_NUOVO_IP" : "LOGIN", "Utente", user.id,
    newIp ? `Accesso di ${user.username} da un IP che non aveva mai usato` : `Accesso di ${user.username}`,
    browser, undefined, ip,
  );
}
