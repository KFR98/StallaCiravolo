"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { Modal } from "@/components/Modal";
import { createUser, updateUser, resetPassword, deleteUserCompletely, userDataSummary } from "../actions";
import { ROLE_LABELS, ROLES } from "@/lib/permissions";

const genPw = () => {
  const c = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const a = new Uint32Array(12);
  crypto.getRandomValues(a);
  return Array.from(a, (n) => c[n % c.length]).join("");
};

function PasswordField() {
  const [v, setV] = useState("");
  return (
    <div className="flex gap-2">
      <input name="password" className="input font-mono" value={v} onChange={(e) => setV(e.target.value)} required minLength={8} autoComplete="new-password" />
      <button type="button" className="btn btn-secondary" onClick={() => setV(genPw())}>Genera</button>
    </div>
  );
}

export function NewUserButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>+ Nuovo account</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Nuovo account">
        <ActionForm action={createUser} onSuccess={() => setOpen(false)} className="space-y-3">
          <label className="block"><span className="field-label">Nome in gioco</span><input name="displayName" className="input" required /></label>
          <label className="block"><span className="field-label">Nome utente (per l&apos;accesso)</span><input name="username" className="input" required pattern="[a-zA-Z0-9._\-]+" minLength={3} /></label>
          <label className="block"><span className="field-label">Ruolo</span>
            <select name="role" className="input" defaultValue="DIPENDENTE">{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select>
          </label>
          <label className="block"><span className="field-label">Password iniziale (min. 8 caratteri)</span><PasswordField /></label>
          <button className="btn btn-primary w-full">Crea account</button>
        </ActionForm>
      </Modal>
    </>
  );
}

type Summary = Awaited<ReturnType<typeof userDataSummary>>;

export function EditUserButton({ user, isMe }: { user: { id: number; username: string; displayName: string; role: string; active: boolean; notes: string | null }; isMe: boolean }) {
  const [open, setOpen] = useState<null | "edit" | "delete">(null);
  const [role, setRole] = useState(user.role);
  const [summary, setSummary] = useState<Summary | null>(null);
  const openDelete = async () => {
    setOpen("delete");
    setSummary(null);
    setSummary(await userDataSummary(user.id));
  };
  return (
    <>
      <button className="btn btn-secondary btn-sm" onClick={() => setOpen("edit")}>Modifica</button>
      <Modal open={open === "edit"} onClose={() => setOpen(null)} title={`@${user.username}`}>
        <ActionForm action={updateUser} onSuccess={() => setOpen(null)} className="space-y-3">
          <input type="hidden" name="id" value={user.id} />
          <label className="block"><span className="field-label">Nome in gioco</span><input name="displayName" defaultValue={user.displayName} className="input" required /></label>
          <label className="block"><span className="field-label">Nome utente per l&apos;accesso</span><input name="username" defaultValue={user.username} className="input" required pattern="[a-zA-Z0-9._\-]+" minLength={3} /></label>
          <label className="block"><span className="field-label">Ruolo</span>
            <select name="role" className="input" defaultValue={user.role} onChange={(e) => setRole(e.target.value)}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select>
          </label>
          {role === "ADMIN" ? (
            <>
              <input type="hidden" name="active" value="on" />
              <p className="text-[13px] text-fg-3">Gli amministratori restano sempre attivi, così c&apos;è sempre qualcuno che può entrare.</p>
            </>
          ) : (
            <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" name="active" defaultChecked={user.active} />Account attivo (se lo disattivi viene disconnesso subito)</label>
          )}
          <label className="block"><span className="field-label">Note</span><textarea name="notes" defaultValue={user.notes ?? ""} className="input" /></label>
          <button className="btn btn-primary w-full">Salva</button>
        </ActionForm>
        <ActionForm action={resetPassword} confirm="Reimpostare la password? L'utente verrà disconnesso." onSuccess={() => setOpen(null)} className="mt-5 space-y-2 border-t border-border pt-4">
          <input type="hidden" name="id" value={user.id} />
          <span className="field-label">Nuova password</span>
          <PasswordField />
          <button className="btn btn-secondary btn-sm">Reimposta password</button>
        </ActionForm>
        {!isMe && (
          <div className="mt-5 border-t border-border pt-4">
            <button className="btn btn-ghost btn-sm !text-accent-text" onClick={openDelete}>Elimina utente e tutti i suoi dati…</button>
          </div>
        )}
      </Modal>
      <Modal open={open === "delete"} onClose={() => setOpen(null)} title={`Elimina ${user.displayName}`}>
        <div className="space-y-3">
          <p className="rounded-lg bg-accent-soft p-3 text-[14px] text-accent-text">Operazione definitiva: vengono eliminati l&apos;account e <b>tutto</b> ciò che lo riguarda. Fai prima un backup se potrebbe servire.</p>
          {summary ? (
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-[14px]">
              <li>Cavalli catturati/in carico: <b>{summary.horses}</b></li>
              <li>Vendite cavalli: <b>{summary.sales}</b></li>
              <li>Vendite di altri sui suoi cavalli: <b>{summary.salesOnHorses}</b></li>
              <li>Vendite oggetti: <b>{summary.itemSales}</b></li>
              <li>Spawn: <b>{summary.spawns}</b></li>
              <li>Note in bacheca: <b>{summary.reservations}</b></li>
              <li>Settimane stipendio: <b>{summary.payroll}</b></li>
              <li>Rimborsi e proposte: <b>{summary.reimb + summary.notes}</b></li>
              <li>Voci nel registro: <b>{summary.logs}</b></li>
            </ul>
          ) : <p className="text-fg-3">Conteggio dei dati…</p>}
          <ActionForm action={deleteUserCompletely} onSuccess={() => setOpen(null)} className="space-y-3">
            <input type="hidden" name="id" value={user.id} />
            <label className="block"><span className="field-label">Per confermare scrivi <b className="font-mono">{user.username}</b></span><input name="conferma" className="input" required autoComplete="off" /></label>
            <button className="btn btn-primary w-full">Elimina definitivamente</button>
          </ActionForm>
        </div>
      </Modal>
    </>
  );
}
