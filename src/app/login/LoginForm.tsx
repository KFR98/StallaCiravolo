"use client";

import { ActionForm } from "@/components/ActionForm";
import { loginAction } from "./actions";

export function LoginForm() {
  return (
    <ActionForm action={loginAction} className="space-y-4">
      <label className="block">
        <span className="field-label">Nome utente</span>
        <input name="username" className="input" autoComplete="username" autoFocus required />
      </label>
      <label className="block">
        <span className="field-label">Password</span>
        <input name="password" type="password" className="input" autoComplete="current-password" required />
      </label>
      <button className="btn btn-primary w-full">Entra</button>
    </ActionForm>
  );
}
