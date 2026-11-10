"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { Modal } from "@/components/Modal";
import { createUser, updateUser, resetPassword } from "../actions";
import { ROLE_LABELS, ROLES } from "@/lib/permissions";

const genPw = () => {
  const c = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const a = new Uint32Array(12);
  crypto.getRandomValues(a);
  return Array.from(a, (n) => c[n % c.length]).join("");
};

function PasswordField({ name = "password" }: { name?: string }) {
  const [v, setV] = useState("");
  return (
    <div className="flex gap-2">
      <input name={name} className="input font-mono" value={v} onChange={(e) => setV(e.target.value)} required minLength={8} autoComplete="new-password" />
      <button type="button" className="btn btn-ghost btn-sm whitespace-nowrap" onClick={() => setV(genPw())}>Genera</button>
    </div>
  );
}

export function NewUserButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-gold" onClick={() => setOpen(true)}>+ Nuovo account</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Nuovo account">
        <ActionForm action={createUser} onSuccess={() => setOpen(false)} className="space-y-3">
          <label className="block"><span className="label mb-1 block">Nome in gioco</span><input name="displayName" className="input" required /></label>
          <label className="block"><span className="label mb-1 block">Nome utente (per l&apos;accesso)</span><input name="username" className="input" required pattern="[a-zA-Z0-9._-]+" minLength={3} /></label>
          <label className="block"><span className="label mb-1 block">Ruolo</span>
            <select name="role" className="input" defaultValue="DIPENDENTE">{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select>
          </label>
          <label className="block"><span className="label mb-1 block">Password iniziale (min. 8 caratteri)</span><PasswordField /></label>
          <p className="text-[13px] text-ink-soft italic">Comunica la password al dipendente in modo privato.</p>
          <button className="btn btn-primary w-full">Crea account</button>
        </ActionForm>
      </Modal>
    </>
  );
}

export function EditUserButton({ user }: { user: { id: number; username: string; displayName: string; role: string; active: boolean; notes: string | null } }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>Modifica</button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Account @${user.username}`}>
        <ActionForm action={updateUser} onSuccess={() => setOpen(false)} className="space-y-3">
          <input type="hidden" name="id" value={user.id} />
          <label className="block"><span className="label mb-1 block">Nome in gioco</span><input name="displayName" defaultValue={user.displayName} className="input" required /></label>
          <label className="block"><span className="label mb-1 block">Ruolo</span>
            <select name="role" className="input" defaultValue={user.role}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select>
          </label>
          <label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={user.active} className="size-4 accent-[#5a3a22]" />Account attivo (se disattivato, l&apos;utente viene disconnesso subito)</label>
          <label className="block"><span className="label mb-1 block">Note</span><textarea name="notes" defaultValue={user.notes ?? ""} className="input" /></label>
          <button className="btn btn-primary w-full">Salva</button>
        </ActionForm>
        <div className="mt-5 border-t border-dashed border-[#bfa476] pt-4">
          <ActionForm action={resetPassword} confirm="Reimpostare la password? L'utente verrà disconnesso." onSuccess={() => setOpen(false)} className="space-y-2">
            <input type="hidden" name="id" value={user.id} />
            <span className="label block">Reimposta password</span>
            <PasswordField />
            <button className="btn btn-danger btn-sm">Reimposta</button>
          </ActionForm>
        </div>
      </Modal>
    </>
  );
}
