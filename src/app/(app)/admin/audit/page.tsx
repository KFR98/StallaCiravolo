import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dateTime } from "@/lib/format";
import { AdminTabs } from "../AdminTabs";
import { PageHeader, Card, TableWrap, Empty } from "@/components/ui";

export const metadata = { title: "Registro attività" };

const PAGE = 100;

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ utente?: string; entita?: string; q?: string; pagina?: string }> }) {
  const me = await requireUser("audit.view");
  const sp = await searchParams;
  const where: Prisma.AuditLogWhereInput = {};
  if (sp.utente) where.userId = Number(sp.utente);
  if (sp.entita) where.entity = sp.entita;
  if (sp.q) where.summary = { contains: sp.q };
  const page = Math.max(1, Number(sp.pagina) || 1);
  const [rows, count, users, entities] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: PAGE, skip: (page - 1) * PAGE }),
    prisma.auditLog.count({ where }),
    prisma.user.findMany({ orderBy: { displayName: "asc" }, select: { id: true, displayName: true } }),
    prisma.auditLog.findMany({ distinct: ["entity"], select: { entity: true } }),
  ]);
  const qs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "pagina") as [string, string][]);
  return (
    <>
      <PageHeader title="Amministrazione" subtitle="Ogni operazione importante: chi, cosa, quando. Il registro non può essere modificato." />
      <AdminTabs role={me.role} active="audit" />
      <Card className="mb-5">
        <form className="grid gap-3 sm:grid-cols-[1fr_1fr_2fr_auto]">
          <select name="utente" defaultValue={sp.utente ?? ""} className="input"><option value="">Tutti gli utenti</option>{users.map((u) => <option key={u.id} value={u.id}>{u.displayName}</option>)}</select>
          <select name="entita" defaultValue={sp.entita ?? ""} className="input"><option value="">Tutte le sezioni</option>{entities.map((e) => <option key={e.entity} value={e.entity}>{e.entity}</option>)}</select>
          <input name="q" defaultValue={sp.q} className="input" placeholder="Cerca nel testo…" />
          <button className="btn btn-primary">Filtra</button>
        </form>
      </Card>
      <Card>
        {rows.length === 0 ? <Empty>Nessuna voce.</Empty> : (
          <TableWrap>
            <table className="tbl">
              <thead><tr><th>Data</th><th>Utente</th><th>Azione</th><th>Sezione</th><th>Descrizione</th><th>Dettagli</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap text-[14px]">{dateTime(r.createdAt)}</td>
                    <td>{r.username ?? "—"}</td>
                    <td className="text-[13px]"><span className="badge badge-neutral">{r.action}</span></td>
                    <td>{r.entity}{r.entityId ? ` #${r.entityId}` : ""}</td>
                    <td className="min-w-[260px]">{r.summary}</td>
                    <td>
                      {r.details && (
                        <details>
                          <summary className="cursor-pointer text-[13px] underline decoration-dotted">mostra</summary>
                          <pre className="mt-1 max-w-[420px] overflow-x-auto whitespace-pre-wrap text-[12px]">{JSON.stringify(JSON.parse(r.details), null, 1)}</pre>
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
        {count > PAGE && (
          <div className="mt-4 flex justify-between">
            <span className="text-fg-3">Pagina {page} di {Math.ceil(count / PAGE)}</span>
            <div className="flex gap-2">
              {page > 1 && <Link className="btn btn-secondary btn-sm" href={`/admin/audit?${qs}&pagina=${page - 1}`}>←</Link>}
              {page * PAGE < count && <Link className="btn btn-secondary btn-sm" href={`/admin/audit?${qs}&pagina=${page + 1}`}>→</Link>}
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
