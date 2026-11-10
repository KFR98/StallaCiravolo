import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { dateTime } from "@/lib/format";
import { PageHeader, Panel, TableWrap } from "@/components/ui";
import { NewUserButton, EditUserButton } from "./UserForms";

export const metadata = { title: "Utenti" };

export default async function UsersPage() {
  const me = await requireUser("users.manage");
  const users = await prisma.user.findMany({
    orderBy: [{ active: "desc" }, { role: "asc" }, { displayName: "asc" }],
    include: { _count: { select: { sessions: true } } },
  });
  return (
    <>
      <PageHeader title="Utenti e ruoli" subtitle="Gli account dei dipendenti vengono creati solo dall'amministratore." actions={<NewUserButton />} />
      <Panel>
        <TableWrap>
          <table className="ledger">
            <thead><tr><th>Nome in gioco</th><th>Utente</th><th>Ruolo</th><th>Stato</th><th>Ultimo accesso</th><th>Sessioni</th><th /></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={u.active ? "" : "opacity-60"}>
                  <td className="font-semibold">{u.displayName}{u.id === me.id && <span className="ml-1 text-[13px] italic text-ink-soft">(tu)</span>}</td>
                  <td>@{u.username}</td>
                  <td><span className="badge badge-gold">{ROLE_LABELS[u.role]}</span></td>
                  <td>{u.active ? <span className="badge badge-green">Attivo</span> : <span className="badge badge-red">Disattivato</span>}</td>
                  <td className="whitespace-nowrap">{dateTime(u.lastLoginAt)}</td>
                  <td className="num">{u._count.sessions}</td>
                  <td className="whitespace-nowrap text-right">
                    <Link href={`/dipendenti/${u.id}`} className="btn btn-ghost btn-sm mr-1">Attività</Link>
                    <EditUserButton user={{ id: u.id, username: u.username, displayName: u.displayName, role: u.role, active: u.active, notes: u.notes }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Panel>
    </>
  );
}
