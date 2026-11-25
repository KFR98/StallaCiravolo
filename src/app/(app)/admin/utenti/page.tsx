import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { allRoles, roleWithin } from "@/lib/permissions";
import { RoleBadge } from "@/components/RoleBadge";
import { prisma } from "@/lib/db";
import { dateTime } from "@/lib/format";
import { PageHeader, Card } from "@/components/ui";
import { NewUserButton, EditUserButton } from "./UserForms";
import { AdminTabs } from "../AdminTabs";

export const metadata = { title: "Utenti" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ eliminati?: string }> }) {
  const me = await requireUser("users.manage");
  const showDeleted = (await searchParams).eliminati === "1";
  const all = await prisma.user.findMany({ orderBy: [{ active: "desc" }, { role: "asc" }, { displayName: "asc" }] });
  const users = all.filter((u) => showDeleted || !u.deletedAt);
  const deletedCount = all.filter((u) => u.deletedAt).length;
  const colleagues = all.filter((u) => u.active && !u.deletedAt).map((u) => ({ id: u.id, name: u.displayName }));
  // il ruolo Amministratore lo può assegnare solo un amministratore
  const roles = allRoles().filter((r) => roleWithin(me.role, r.key)).map((r) => ({ key: r.key, name: r.name }));
  return (
    <>
      <PageHeader title="Amministrazione" subtitle="Gli account dei dipendenti vengono creati solo dall'amministratore." actions={<NewUserButton roles={roles} />} />
      <AdminTabs role={me.role} active="utenti" />
      {deletedCount > 0 && (
        <div className="mb-3 flex justify-end">
          <Link href={showDeleted ? "/admin/utenti" : "/admin/utenti?eliminati=1"} className="chip" aria-pressed={showDeleted}>Mostra utenti eliminati ({deletedCount})</Link>
        </div>
      )}
      <Card pad={false}>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th className="!pl-5">Nome in gioco</th><th>Utente</th><th>Ruolo</th><th>Stato</th><th>Ultimo accesso</th><th className="!pr-5" /></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={u.active ? "" : "opacity-60"}>
                  <td className="!pl-5 font-semibold">{u.displayName}{u.id === me.id && <span className="ml-1 text-[13px] font-normal text-fg-3">(tu)</span>}</td>
                  <td className="text-fg-2">@{u.username}</td>
                  <td><RoleBadge role={u.role} /></td>
                  <td>{u.deletedAt ? <span className="badge badge-neutral">Eliminato · storico conservato</span> : u.active ? <span className="badge badge-ok">Attivo</span> : <span className="badge badge-accent">Disattivato</span>}</td>
                  <td className="whitespace-nowrap text-fg-2">{dateTime(u.lastLoginAt)}</td>
                  <td className="!pr-5 text-right whitespace-nowrap">
                    <Link href={`/dipendenti/${u.id}`} className="btn btn-ghost btn-sm">Attività</Link>
                    {!u.deletedAt && <EditUserButton isMe={u.id === me.id} roles={roles} colleagues={colleagues} user={{ id: u.id, username: u.username, displayName: u.displayName, role: u.role, active: u.active, notes: u.notes }} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

