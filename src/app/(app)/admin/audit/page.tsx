import Link from "next/link";
import type { Prisma } from "@prisma/client";
import clsx from "clsx";
import { Info, TriangleAlert, Siren, ShieldAlert, Globe, User as UserIcon, ChevronDown } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can, getRole } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { TZ } from "@/lib/format";
import { LEVELS, LEVEL_HELP, actionLabel, actionsAt, isLevel, levelOf, type Level } from "@/lib/audit-levels";
import { AdminTabs } from "../AdminTabs";
import { PageHeader, Card, Empty } from "@/components/ui";
import { LevelsEditor } from "./LevelsEditor";

export const metadata = { title: "Registro attività" };

const PAGE = 100;
const ICON: Record<Level, typeof Info> = { info: Info, warn: TriangleAlert, alarm: Siren, critical: ShieldAlert };
const PERIODS = [
  ["", "Sempre"],
  ["1", "Ultime 24 ore"],
  ["7", "Ultimi 7 giorni"],
  ["30", "Ultimi 30 giorni"],
] as const;

type SP = { utente?: string; entita?: string; q?: string; ip?: string; livello?: string; periodo?: string; pagina?: string };

export default async function AuditPage({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requireUser("audit.view");
  const sp = await searchParams;
  // IP e browser sono dati personali: li vede solo chi ha il permesso apposito (controllo lato server)
  const showIp = can(me.role, "audit.ip");
  if (!showIp) delete sp.ip;
  const settings = await getSettings();
  const overrides = settings.auditLevelOverrides;
  const style = settings.auditLevelStyle;
  const known = (await prisma.auditLog.findMany({ distinct: ["action"], select: { action: true } })).map((r) => r.action);

  // Livello: esatto ("alarm") oppure "da … in su" ("alarm+")
  const lvParam = sp.livello ?? "";
  const minLevel = lvParam.endsWith("+") ? lvParam.slice(0, -1) : null;
  const levelsWanted: Level[] = isLevel(lvParam) ? [lvParam] : isLevel(minLevel) ? LEVELS.slice(LEVELS.indexOf(minLevel)) : [];

  const where: Prisma.AuditLogWhereInput = {};
  if (sp.utente) where.userId = Number(sp.utente) || -1;
  if (sp.entita) where.entity = sp.entita;
  if (sp.q) where.summary = { contains: sp.q.slice(0, 100) };
  if (sp.ip) where.ip = { startsWith: sp.ip.trim().slice(0, 64) };
  if (levelsWanted.length) where.action = { in: levelsWanted.flatMap((l) => actionsAt(l, overrides, known)) };
  const days = Number(sp.periodo);
  if ([1, 7, 30].includes(days)) where.createdAt = { gte: new Date(Date.now() - days * 86400_000) };

  const page = Math.max(1, Number(sp.pagina) || 1);
  const since24 = new Date(Date.now() - 86400_000);
  const [rows, count, users, entities, last24] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: PAGE, skip: (page - 1) * PAGE }),
    prisma.auditLog.count({ where }),
    prisma.user.findMany({ orderBy: { displayName: "asc" }, select: { id: true, displayName: true, role: true } }),
    prisma.auditLog.findMany({ distinct: ["entity"], select: { entity: true }, orderBy: { entity: "asc" } }),
    prisma.auditLog.groupBy({ by: ["action"], where: { createdAt: { gte: since24 } }, _count: { _all: true } }),
  ]);
  const roleOf = new Map(users.map((u) => [u.id, u.role]));
  const tally = Object.fromEntries(LEVELS.map((l) => [l, 0])) as Record<Level, number>;
  for (const g of last24) tally[levelOf(g.action, overrides)] += g._count._all;

  const qs = (patch: Partial<SP>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, pagina: undefined, ...patch }).filter(([, v]) => v) as [string, string][]);
    const s = p.toString();
    return `/admin/audit${s ? `?${s}` : ""}`;
  };
  const filtered = Object.entries(sp).some(([k, v]) => v && k !== "pagina");

  // Raggruppa per giorno (fuso orario della stalla)
  const dayKey = (d: Date) => d.toLocaleDateString("it-IT", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
  const today = dayKey(new Date());
  const yesterday = dayKey(new Date(Date.now() - 86400_000));
  const dayTitle = (d: Date) => {
    const k = dayKey(d);
    if (k === today) return "Oggi";
    if (k === yesterday) return "Ieri";
    const s = d.toLocaleDateString("it-IT", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" });
    return s.charAt(0).toUpperCase() + s.slice(1);
  };
  const groups: { title: string; rows: typeof rows }[] = [];
  for (const r of rows) {
    const t = dayTitle(r.createdAt);
    if (groups.at(-1)?.title !== t) groups.push({ title: t, rows: [] });
    groups.at(-1)!.rows.push(r);
  }

  // Colori dei livelli come variabili CSS (scelti in "Livelli di pericolosità")
  const lvVars = Object.fromEntries(LEVELS.map((l) => [`--lv-${l}`, style[l].color])) as React.CSSProperties;

  return (
    <div style={lvVars}>
      <PageHeader title="Amministrazione" subtitle="Ogni operazione importante: chi, cosa, quando. Il registro non può essere modificato." />
      <AdminTabs role={me.role} active="audit" />

      {/* Riepilogo ultime 24 ore: un clic filtra quel livello */}
      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {LEVELS.map((l) => {
          const Icon = ICON[l];
          const active = lvParam === l;
          return (
            <Link
              key={l}
              href={active ? qs({ livello: undefined }) : qs({ livello: l, periodo: "1" })}
              className={clsx("audit-tile", active && "audit-tile-on", tally[l] > 0 && l !== "info" && "audit-tile-hot")}
              style={{ "--lv": `var(--lv-${l})` } as React.CSSProperties}
              title={LEVEL_HELP[l]}
            >
              <span className="flex items-center gap-2">
                <Icon size={17} className="audit-tile-icon" />
                <span className="audit-lv-name">{style[l].name}</span>
              </span>
              <span className="mt-1 block text-[26px] leading-none font-bold tabular-nums">{tally[l]}</span>
              <span className="mt-1 block text-[12.5px] text-fg-3">ultime 24 ore</span>
            </Link>
          );
        })}
      </div>

      <Card className="mb-5">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))]">
          <select name="livello" defaultValue={lvParam} className="input" aria-label="Livello">
            <option value="">Tutti i livelli</option>
            <option value="warn+">Da {style.warn.name} in su</option>
            <option value="alarm+">Da {style.alarm.name} in su</option>
            {LEVELS.map((l) => <option key={l} value={l}>Solo {style[l].name}</option>)}
          </select>
          <select name="periodo" defaultValue={sp.periodo ?? ""} className="input" aria-label="Periodo">
            {PERIODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select name="utente" defaultValue={sp.utente ?? ""} className="input" aria-label="Utente"><option value="">Tutti gli utenti</option>{users.map((u) => <option key={u.id} value={u.id}>{u.displayName}</option>)}</select>
          <select name="entita" defaultValue={sp.entita ?? ""} className="input" aria-label="Sezione"><option value="">Tutte le sezioni</option>{entities.map((e) => <option key={e.entity} value={e.entity}>{e.entity}</option>)}</select>
          <input name="q" defaultValue={sp.q} className="input sm:col-span-2" placeholder="Cerca nel testo…" />
          {showIp ? <input name="ip" defaultValue={sp.ip} className="input" placeholder="IP (anche solo l'inizio)" inputMode="decimal" /> : <span className="hidden lg:block" />}
          <div className="flex gap-2">
            <button className="btn btn-primary flex-1">Filtra</button>
            {filtered && <Link href="/admin/audit" className="btn btn-secondary">Azzera</Link>}
          </div>
        </form>
      </Card>

      <Card pad={false}>
        {rows.length === 0 ? <div className="card-pad"><Empty>Nessuna voce.</Empty></div> : (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5 text-[13.5px] text-fg-3 sm:px-5">
              <span>{count.toLocaleString("it-IT")} {count === 1 ? "voce" : "voci"}{filtered ? " con questi filtri" : ""}</span>
              <span className="flex flex-wrap gap-3">
                {LEVELS.map((l) => (
                  <span key={l} className="inline-flex items-center gap-1.5" title={LEVEL_HELP[l]}>
                    <span className="size-2.5 rounded-full" style={{ background: `var(--lv-${l})` }} />{style[l].name}
                  </span>
                ))}
              </span>
            </div>
            {groups.map((g) => (
              <section key={g.title}>
                <h3 className="sticky top-[calc(env(safe-area-inset-top)+3.9rem)] z-10 border-b border-border bg-surface-2/95 px-4 py-1.5 font-display text-[13px] font-semibold tracking-[0.14em] text-fg-2 uppercase backdrop-blur sm:px-5 lg:top-0">{g.title}</h3>
                <ol>
                  {g.rows.map((r) => {
                    const lv = levelOf(r.action, overrides);
                    const Icon = ICON[lv];
                    const det = details(r.details, showIp);
                    const roleColor = r.userId ? getRole(roleOf.get(r.userId))?.color : null;
                    return (
                      <li key={r.id} className={clsx("audit-row", `audit-row-${lv}`)} style={{ "--lv": `var(--lv-${lv})` } as React.CSSProperties}>
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                          <span className="audit-badge" title={LEVEL_HELP[lv]}><Icon size={13} strokeWidth={2.4} />{style[lv].name}</span>
                          <span className="font-semibold">{actionLabel(r.action)}</span>
                          <span className="text-[13px] text-fg-3">{r.entity}{r.entityId ? ` #${r.entityId}` : ""}</span>
                          <time className="ml-auto text-[13px] text-fg-3 tabular-nums" dateTime={r.createdAt.toISOString()}>
                            {r.createdAt.toLocaleTimeString("it-IT", { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                          </time>
                        </div>
                        <p className="mt-1 text-[14.5px] break-words text-fg">{r.summary}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-fg-3">
                          <Link href={r.userId ? qs({ utente: String(r.userId) }) : "#"} className="inline-flex items-center gap-1.5 hover:text-fg">
                            <UserIcon size={13} style={roleColor ? { color: roleColor } : undefined} />
                            {r.username ?? "—"}
                          </Link>
                          {showIp && r.ip && (
                            <Link href={qs({ ip: r.ip })} className="inline-flex items-center gap-1.5 font-mono hover:text-fg" title="Tutte le operazioni da questo IP">
                              <Globe size={13} />{r.ip}
                            </Link>
                          )}
                          {det && (
                            <details className="group w-full">
                              <summary className="inline-flex cursor-pointer list-none items-center gap-1 font-medium text-fg-2 hover:text-fg">
                                <ChevronDown size={14} className="transition-transform group-open:rotate-180" />Dettagli
                              </summary>
                              <div className="mt-2 rounded-lg border border-border bg-surface-2 p-2.5 text-[13px]">{det}</div>
                            </details>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
          </div>
        )}
        {count > PAGE && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3 sm:px-5">
            <span className="text-fg-3">Pagina {page} di {Math.ceil(count / PAGE)}</span>
            <div className="flex gap-2">
              {page > 1 && <Link className="btn btn-secondary btn-sm" href={`${qs({})}${filtered ? "&" : "?"}pagina=${page - 1}`}>← Più recenti</Link>}
              {page * PAGE < count && <Link className="btn btn-secondary btn-sm" href={`${qs({})}${filtered ? "&" : "?"}pagina=${page + 1}`}>Più vecchie →</Link>}
            </div>
          </div>
        )}
      </Card>

      {can(me.role, "settings.manage") && (
        <LevelsEditor
          style={style}
          overrides={overrides}
          failBurst={settings.auditFailBurst}
          failBurstMinutes={settings.auditFailBurstMinutes}
          newIpLogin={settings.auditNewIpLogin}
        />
      )}
    </div>
  );
}

/* ───────── Dettagli leggibili ───────── */

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const show = (v: unknown): string => (v == null || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));
const nice = (k: string) => (k.charAt(0).toUpperCase() + k.slice(1)).replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ");

/** Trasforma il JSON dei dettagli in righe "campo: prima → dopo" o "campo: valore". */
function details(raw: string | null, showIp: boolean) {
  if (!raw) return null;
  let d: unknown;
  try {
    d = JSON.parse(raw);
  } catch {
    return null;
  }
  // il browser degli accessi è un dato personale: senza il permesso "audit.ip" non si mostra
  if (isObj(d) && !showIp) delete d.browser;
  if (isObj(d) && !Object.keys(d).length) return null;

  type Line = { k: string; from?: string; to: string };
  const lines: Line[] = [];
  if (isObj(d) && isObj(d.prima) && isObj(d.dopo)) {
    const before = d.prima;
    const after = d.dopo;
    for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
      const a = show(before[k]);
      const b = show(after[k]);
      if (a !== b) lines.push({ k, from: a, to: b });
    }
    for (const [k, v] of Object.entries(d)) if (k !== "prima" && k !== "dopo") lines.push({ k, to: show(v) });
  } else if (isObj(d) && Object.values(d).length && Object.values(d).every((v) => isObj(v) && "da" in v && "a" in v)) {
    for (const [k, v] of Object.entries(d as Record<string, { da: unknown; a: unknown }>)) lines.push({ k, from: show(v.da), to: show(v.a) });
  } else if (isObj(d)) {
    for (const [k, v] of Object.entries(d)) lines.push({ k, to: show(v) });
  } else {
    lines.push({ k: "Valore", to: show(d) });
  }
  if (!lines.length) return <span className="text-fg-3">Nessuna differenza.</span>;
  return (
    <dl className="grid grid-cols-[minmax(90px,max-content)_1fr] gap-x-3 gap-y-1">
      {lines.map((l, i) => (
        <div key={i} className="contents">
          <dt className="font-semibold text-fg-2">{nice(l.k)}</dt>
          <dd className="min-w-0 break-words">
            {l.from !== undefined ? (
              <><span className="audit-old">{l.from}</span> <span className="text-fg-3">→</span> <span className="audit-new">{l.to}</span></>
            ) : l.to}
          </dd>
        </div>
      ))}
    </dl>
  );
}
