"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { Modal } from "@/components/Modal";
import { createUser, updateUser, resetPassword, deleteUserCompletely, archiveUser, userDataSummary, resetTwoFactor } from "../actions";
import { ActionButton } from "@/components/ActionForm";

export type RoleOption = { key: string; name: string };

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

export function NewUserButton({ roles }: { roles: RoleOption[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>+ Nuovo account</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Nuovo account">
        <ActionForm action={createUser} onSuccess={() => setOpen(false)} className="space-y-3">
          <label className="block"><span className="field-label">Nome in gioco</span><input name="displayName" className="input" required /></label>
          <label className="block"><span className="field-label">Nome utente (per l&apos;accesso)</span><input name="username" className="input" required pattern="[a-zA-Z0-9._\-]+" minLength={3} /></label>
          <label className="block"><span className="field-label">Ruolo</span>
            <select name="role" className="input" defaultValue={roles.some((r) => r.key === "DIPENDENTE") ? "DIPENDENTE" : roles[0]?.key}>{roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}</select>
          </label>
          <label className="block"><span className="field-label">Password iniziale (min. 8 caratteri)</span><PasswordField /></label>
          <button className="btn btn-primary w-full">Crea account</button>
        </ActionForm>
      </Modal>
    </>
  );
}

type Summary = Awaited<ReturnType<typeof userDataSummary>>;

export function EditUserButton({ user, isMe, roles, colleagues }: { user: { id: number; username: string; displayName: string; role: string; active: boolean; notes: string | null; twoFactor?: boolean }; isMe: boolean; roles: RoleOption[]; colleagues: { id: number; name: string }[] }) {
  const [open, setOpen] = useState<null | "edit" | "delete">(null);
  const [mode, setMode] = useState<"storico" | "tutto">("storico");
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
            <select name="role" className="input" defaultValue={user.role} onChange={(e) => setRole(e.target.value)}>
              {!roles.some((r) => r.key === user.role) && <option value={user.role}>{user.role}</option>}
              {roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
            </select>
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
        {user.twoFactor && !isMe && (
          <div className="mt-5 border-t border-border pt-4">
            <p className="mb-2 text-[13.5px] text-fg-2">Doppia verifica attiva. Se ha perso il telefono e i codici di recupero:</p>
            <ActionButton action={resetTwoFactor} fields={{ id: user.id }} label="Azzera doppia verifica" className="btn btn-secondary btn-sm" confirm={`Azzerare la doppia verifica di ${user.displayName}? Verrà fatto uscire e al prossimo accesso la riattiverà.`} />
          </div>
        )}
        {!isMe && (
          <div className="mt-5 border-t border-border pt-4">
            <button className="btn btn-ghost btn-sm !text-accent-text" onClick={openDelete}>Elimina utente…</button>
          </div>
        )}
      </Modal>
      <Modal open={open === "delete"} onClose={() => setOpen(null)} title={`Elimina ${user.displayName}`}>
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Come eliminare">
            {([
              ["storico", "Mantieni lo storico", "Consigliato. L'account viene chiuso per sempre, ma vendite, cavalli, stipendi e registro restano con il suo nome."],
              ["tutto", "Elimina tutto", "Cancella l'account e TUTTO ciò che lo riguarda, registro compreso. Non si può annullare."],
            ] as const).map(([k, t, d]) => (
              <button key={k} type="button" role="radio" aria-checked={mode === k} onClick={() => setMode(k)}
                className={`rounded-lg border p-3 text-left transition-colors ${mode === k ? (k === "tutto" ? "border-accent bg-accent-soft" : "border-fg bg-surface-2") : "border-border hover:bg-surface-2"}`}>
                <span className="block font-semibold">{t}</span>
                <span className="mt-1 block text-[13px] text-fg-2">{d}</span>
              </button>
            ))}
          </div>
          {summary ? (
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-[14px]">
              <li>Cavalli catturati/in carico: <b>{summary.horses}</b></li>
              <li>Ancora in stalla: <b>{summary.stableHorses}</b></li>
              <li>Vendite cavalli: <b>{summary.sales}</b></li>
              <li>Vendite di altri sui suoi cavalli: <b>{summary.salesOnHorses}</b></li>
              <li>Fatture bottega: <b>{summary.itemSales}</b></li>
              <li>Spawn: <b>{summary.spawns}</b></li>
              <li>Note in bacheca: <b>{summary.reservations}</b></li>
              <li>Settimane stipendio: <b>{summary.payroll}</b></li>
              <li>Rimborsi e proposte: <b>{summary.reimb + summary.notes}</b></li>
              <li>Voci nel registro: <b>{summary.logs}</b></li>
            </ul>
          ) : <p className="text-fg-3">Conteggio dei dati…</p>}
          {mode === "storico" ? (
            <ActionForm action={archiveUser} onSuccess={() => setOpen(null)} className="space-y-3">
              <input type="hidden" name="id" value={user.id} />
              {summary && summary.stableHorses > 0 && (
                <label className="block">
                  <span className="field-label">{summary.stableHorses === 1 ? "Il suo cavallo in stalla passa a" : `I suoi ${summary.stableHorses} cavalli in stalla passano a`}</span>
                  <select name="moveTo" className="input" required defaultValue="">
                    <option value="" disabled>Scegli il collega…</option>
                    {colleagues.filter((c) => c.id !== user.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
              )}
              <label className="block"><span className="field-label">Per confermare scrivi <b className="font-mono">{user.username}</b></span><input name="conferma" className="input" required autoComplete="off" /></label>
              <button className="btn btn-primary w-full">Elimina e mantieni lo storico</button>
            </ActionForm>
          ) : (
            <ActionForm action={deleteUserCompletely} onSuccess={() => setOpen(null)} className="space-y-3">
              <p className="rounded-lg bg-accent-soft p-3 text-[14px] text-accent-text">Operazione definitiva: vengono eliminati l&apos;account e <b>tutto</b> ciò che lo riguarda. Fai prima un backup se potrebbe servire.</p>
              <input type="hidden" name="id" value={user.id} />
              <label className="block"><span className="field-label">Per confermare scrivi <b className="font-mono">{user.username}</b></span><input name="conferma" className="input" required autoComplete="off" /></label>
              <button className="btn btn-danger w-full">Elimina definitivamente tutto</button>
            </ActionForm>
          )}
        </div>
      </Modal>
    </>
  );
}
