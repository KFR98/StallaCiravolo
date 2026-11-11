"use client";

import { ActionForm } from "@/components/ActionForm";
import { updateMyAccount } from "./actions";

export function AccountForm({ username, displayName, isAdmin }: { username: string; displayName: string; isAdmin: boolean }) {
  return (
    <ActionForm action={updateMyAccount} className="space-y-3">
      <label className="block"><span className="field-label">Nome in gioco</span><input name="displayName" defaultValue={displayName} className="input" required /></label>
      <label className="block">
        <span className="field-label">Nome utente per l&apos;accesso</span>
        <input name="username" defaultValue={username} className="input" readOnly={!isAdmin} pattern="[a-zA-Z0-9._\-]+" minLength={3} />
        {!isAdmin && <span className="mt-1 block text-[12.5px] text-fg-3">Per cambiarlo chiedi all&apos;amministratore.</span>}
      </label>
      <div className="border-t border-border pt-3">
        <span className="field-label">Cambia password (facoltativo)</span>
        <div className="grid gap-2 sm:grid-cols-2">
          <input name="currentPassword" type="password" className="input" placeholder="Password attuale" autoComplete="current-password" />
          <input name="newPassword" type="password" className="input" placeholder="Nuova password (min. 8)" autoComplete="new-password" minLength={8} />
        </div>
      </div>
      <button className="btn btn-primary">Salva</button>
    </ActionForm>
  );
}
