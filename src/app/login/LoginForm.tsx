"use client";

import { ActionForm } from "@/components/ActionForm";
import { loginAction } from "./actions";

export function LoginForm() {
  return (
    <ActionForm action={loginAction} className="space-y-4 text-left">
      <label className="block">
        <span className="label mb-1 block">Nome utente</span>
        <input name="username" className="input" autoComplete="username" autoFocus required />
      </label>
      <label className="block">
        <span className="label mb-1 block">Password</span>
        <input name="password" type="password" className="input" autoComplete="current-password" required />
      </label>
      <button className="btn btn-primary w-full py-2.5 text-[16px]">Entra nella stalla</button>
    </ActionForm>
  );
}
