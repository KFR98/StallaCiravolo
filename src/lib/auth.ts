import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { prisma } from "./db";
import { can, type Permission } from "./permissions";
import { loadRoles } from "./roles";

export const SESSION_COOKIE = "stalla_session";
/** Durata della sessione in giorni: da Impostazioni (sessionDays) */
async function sessionDays() {
  const v = Number((await prisma.setting.findUnique({ where: { key: "sessionDays" } }))?.value ?? 7);
  return Number.isFinite(v) && v > 0 ? Math.min(v, 365) : 7;
}

export type CurrentUser = {
  id: number;
  username: string;
  displayName: string;
  /** Chiave del ruolo (AppRole.key) */
  role: string;
};

const sha256 = (t: string) => createHash("sha256").update(t).digest("hex");

export async function hashPassword(pw: string) {
  return hash(pw, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
}

export async function verifyPassword(hashStr: string, pw: string) {
  try {
    return await verify(hashStr, pw);
  } catch {
    return false;
  }
}

/**
 * IP del client. Si usa X-Real-IP (nginx lo SOVRASCRIVE con l'IP vero) e, in mancanza,
 * l'ULTIMO valore di X-Forwarded-For (quello aggiunto dal proxy): il primo valore lo può
 * scrivere chiunque e servirebbe ad aggirare il limite ai tentativi di accesso.
 */
export async function clientIp() {
  const h = await headers();
  const real = h.get("x-real-ip")?.trim();
  const xff = h.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean);
  return (real || xff?.[xff.length - 1] || "").slice(0, 64) || null;
}

/**
 * Il cookie è "Secure" solo se la richiesta arriva davvero in HTTPS (direttamente o tramite
 * reverse proxy). Così il login funziona sia su http://IP:porta sia su https://dominio.
 * COOKIE_SECURE=false lo disattiva sempre.
 */
function cookieSecure(h: Headers) {
  if (process.env.COOKIE_SECURE === "false") return false;
  const proto = h.get("x-forwarded-proto")?.split(",")[0].trim().toLowerCase();
  if (proto) return proto === "https";
  const origin = h.get("origin") || h.get("referer") || "";
  return origin.startsWith("https://");
}

export async function createSession(userId: number) {
  const token = randomBytes(32).toString("base64url");
  const h = await headers();
  const expiresAt = new Date(Date.now() + (await sessionDays()) * 86400_000);
  await prisma.session.create({
    data: {
      id: sha256(token),
      userId,
      expiresAt,
      ip: await clientIp(),
      userAgent: h.get("user-agent")?.slice(0, 255) ?? null,
    },
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(h),
    path: "/",
    expires: expiresAt,
  });
}

/** Chiude tutte le altre sessioni dell'utente (es. dopo il cambio password), tenendo quella corrente. */
export async function revokeOtherSessions(userId: number) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  await prisma.session.deleteMany({ where: { userId, ...(token ? { NOT: { id: sha256(token) } } : {}) } });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { id: sha256(token) } });
  jar.delete(SESSION_COOKIE);
}

/** Utente corrente (o null). Verifica sessione, scadenza e account attivo a ogni richiesta. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  await loadRoles();
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { id: sha256(token) },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt < new Date() || !session.user.active) {
    await prisma.session.deleteMany({ where: { id: session.id } });
    return null;
  }
  // Rinnovo scorrevole: se mancano meno di 3 giorni, si estende la sessione (durata da Impostazioni)
  if (session.expiresAt.getTime() - Date.now() < 3 * 86400_000) {
    await prisma.session.update({
      where: { id: session.id },
      data: { expiresAt: new Date(Date.now() + (await sessionDays()) * 86400_000) },
    });
  }
  const { id, username, displayName, role } = session.user;
  return { id, username, displayName, role };
}

/** Per pagine server: reindirizza al login se non autenticato, a "/" se senza permesso. */
export async function requireUser(perm?: Permission): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // dalla pagina iniziale si va semplicemente alla propria "home" (es. l'ospite alla mappa), senza avviso
  if (perm && !can(user.role, perm)) redirect(homeFor(user.role) + (perm === "dashboard.view" ? "" : "?negato=1"));
  return user;
}

export class AuthError extends Error {}

/** Per azioni/API: lancia un errore se non autorizzato. */
export async function assertPermission(perm?: Permission): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("Sessione scaduta: effettua di nuovo l'accesso.");
  if (perm && !can(user.role, perm)) throw new AuthError("Non hai i permessi per questa operazione.");
  return user;
}

/** Prima pagina che il ruolo può aprire (es. l'ospite va direttamente alla mappa). */
export function homeFor(role: string): string {
  const pages: [string, Permission][] = [
    ["/", "dashboard.view"], ["/stalla", "horses.view"], ["/mappa", "map.view"], ["/catalogo", "catalog.view"],
    ["/listino", "prices.view"], ["/bottega", "shop.view"], ["/prenotazioni", "reservations.edit"],
  ];
  return pages.find(([, p]) => can(role, p))?.[0] ?? "/profilo";
}
