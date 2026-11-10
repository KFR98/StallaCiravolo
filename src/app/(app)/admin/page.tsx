import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { PageHeader, Panel } from "@/components/ui";
import { dateTime } from "@/lib/format";

export const metadata = { title: "Amministrazione" };

export default async function AdminHome() {
  const user = await requireUser("audit.view");
  const [users, coats, noImg, log] = await Promise.all([
    prisma.user.count({ where: { active: true } }),
    prisma.coat.count({ where: { archived: false } }),
    prisma.coat.count({ where: { archived: false, imagePath: null } }),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 12 }),
  ]);
  const cards = [
    { href: "/admin/utenti", t: "Utenti e ruoli", d: `${users} account attivi. Crea, modifica, disattiva, reimposta password.`, perm: "users.manage" as const },
    { href: "/admin/catalogo", t: "Catalogo", d: `${coats} manti, ${noImg} senza immagine. Razze, manti, immagini, statistiche, prezzi.`, perm: "catalog.manage" as const },
    { href: "/admin/impostazioni", t: "Impostazioni globali", d: "Avanzamento età, fasce di prezzo, stipendi, sconti.", perm: "settings.manage" as const },
    { href: "/admin/import", t: "Importa listino Excel", d: "Carica il file Excel, controlla le anomalie e importa.", perm: "data.import" as const },
    { href: "/admin/backup", t: "Backup ed esportazioni", d: "Copia di sicurezza completa, ripristino, esportazione Excel/CSV.", perm: "data.backup" as const },
    { href: "/admin/audit", t: "Registro attività", d: "Chi ha fatto cosa e quando.", perm: "audit.view" as const },
  ].filter((c) => can(user.role, c.perm));
  return (
    <>
      <PageHeader title="Amministrazione" subtitle="Pannello riservato." />
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((c) => (
          <Link key={c.href} href={c.href} className="panel panel-pad rise block transition hover:-translate-y-0.5">
            <h2 className="title-fell text-[20px] text-leather">{c.t}</h2>
            <p className="mt-1 text-ink-soft">{c.d}</p>
          </Link>
        ))}
      </div>
      <Panel title="Ultime attività" actions={<Link href="/admin/audit" className="btn btn-ghost btn-sm">Tutto il registro</Link>}>
        <ul className="space-y-1.5 text-[15px]">
          {log.map((l) => (
            <li key={l.id} className="border-b border-dashed border-[#bfa476] pb-1"><span className="text-ink-soft">{dateTime(l.createdAt)} · {l.username}</span> — {l.summary}</li>
          ))}
        </ul>
      </Panel>
    </>
  );
}
