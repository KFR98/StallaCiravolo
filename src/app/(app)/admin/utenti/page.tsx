import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { dateTime } from "@/lib/format";
import { PageHeader, Card } from "@/components/ui";
import { NewUserButton, EditUserButton } from "./UserForms";
import { AdminTabs } from "../AdminTabs";

export const metadata = { title: "Utenti" };

export default async function UsersPage() {
  const me = await requireUser("users.manage");
  const users = await prisma.user.findMany({ orderBy: [{ active: "desc" }, { role: "asc" }, { displayName: "asc" }] });
  return (
    <>
      <PageHeader title="Amministrazione" subtitle="Gli account dei dipendenti vengono creati solo dall'amministratore." actions={<NewUserButton />} />
      <AdminTabs role={me.role} active="utenti" />
      <Card pad={false}>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th className="!pl-5">Nome in gioco</th><th>Utente</th><th>Ruolo</th><th>Stato</th><th>Ultimo accesso</th><th className="!pr-5" /></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={u.active ? "" : "opacity-60"}>
                  <td className="!pl-5 font-semibold">{u.displayName}{u.id === me.id && <span className="ml-1 text-[13px] font-normal text-fg-3">(tu)</span>}</td>
                  <td className="text-fg-2">@{u.username}</td>
                  <td><span className="badge badge-neutral">{ROLE_LABELS[u.role]}</span></td>
                  <td>{u.active ? <span className="badge badge-ok">Attivo</span> : <span className="badge badge-accent">Disattivato</span>}</td>
                  <td className="whitespace-nowrap text-fg-2">{dateTime(u.lastLoginAt)}</td>
                  <td className="!pr-5 text-right whitespace-nowrap">
                    <Link href={`/dipendenti/${u.id}`} className="btn btn-ghost btn-sm">Attività</Link>
                    <EditUserButton isMe={u.id === me.id} user={{ id: u.id, username: u.username, displayName: u.displayName, role: u.role, active: u.active, notes: u.notes }} />
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
