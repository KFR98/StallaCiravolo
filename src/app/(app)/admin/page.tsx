import Link from "next/link";
import { Users, BookOpen, Settings, DatabaseBackup, FileSpreadsheet, ScrollText } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { listBackups } from "@/lib/backup";
import { PageHeader, Card, StatTile } from "@/components/ui";
import { dateTime } from "@/lib/format";
import { AdminTabs } from "./AdminTabs";

export const metadata = { title: "Amministrazione" };

export default async function AdminHome() {
  const user = await requireUser("audit.view");
  const [users, coats, noImg, log, backups] = await Promise.all([
    prisma.user.count({ where: { active: true } }),
    prisma.coat.count({ where: { archived: false } }),
    prisma.coat.count({ where: { archived: false, imagePath: null } }),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 15 }),
    can(user.role, "data.backup") ? listBackups() : Promise.resolve([]),
  ]);
  const actions = [
    { href: "/admin/utenti", t: "Gestisci utenti", d: "Crea account, cambia ruoli, reimposta password, elimina.", icon: Users, perm: "users.manage" as const },
    { href: "/admin/catalogo", t: "Modifica catalogo", d: "Razze, manti, foto, statistiche, prezzi.", icon: BookOpen, perm: "catalog.manage" as const },
    { href: "/admin/impostazioni", t: "Impostazioni", d: "Età, fasce di prezzo, stipendi, gravidanza, backup.", icon: Settings, perm: "settings.manage" as const },
    { href: "/admin/backup", t: "Backup ed esportazioni", d: "Copie di sicurezza, ripristino, Excel/CSV.", icon: DatabaseBackup, perm: "data.backup" as const },
    { href: "/admin/import", t: "Importa listino Excel", d: "Aggiorna il catalogo da file.", icon: FileSpreadsheet, perm: "data.import" as const },
    { href: "/admin/audit", t: "Registro attività", d: "Chi ha fatto cosa e quando.", icon: ScrollText, perm: "audit.view" as const },
  ].filter((a) => can(user.role, a.perm));
  return (
    <>
      <PageHeader title="Amministrazione" subtitle="Tutto ciò che serve per gestire il gestionale, in un unico posto." />
      <AdminTabs role={user.role} active="home" />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Account attivi" value={users} href={can(user.role, "users.manage") ? "/admin/utenti" : undefined} />
        <StatTile label="Manti nel catalogo" value={coats} />
        <StatTile label="Manti senza foto" value={noImg} href={can(user.role, "catalog.manage") ? "/admin/catalogo?filtro=senza-immagine" : undefined} />
        {can(user.role, "data.backup") && <StatTile label="Ultimo backup" value={backups[0] ? dateTime(backups[0].mtime) : "Nessuno"} hint={`${backups.length} disponibili`} href="/admin/backup" />}
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_1.2fr]">
        <div className="grid content-start gap-3 sm:grid-cols-2 xl:grid-cols-1">
          {actions.map((a) => (
            <Link key={a.href} href={a.href} className="card flex items-center gap-4 p-4 transition-colors hover:border-border-strong">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-text"><a.icon size={20} /></span>
              <span><b className="block">{a.t}</b><span className="text-[13.5px] text-fg-3">{a.d}</span></span>
            </Link>
          ))}
        </div>
        <Card title="Ultime attività" actions={<Link href="/admin/audit" className="btn btn-ghost btn-sm">Tutto il registro</Link>}>
          <ul className="divide-y divide-border text-[14px]">
            {log.map((l) => <li key={l.id} className="py-2"><span className="text-fg-3">{dateTime(l.createdAt)} · {l.username}</span><div>{l.summary}</div></li>)}
          </ul>
        </Card>
      </div>
    </>
  );
}
