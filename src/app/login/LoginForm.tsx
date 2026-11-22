"use client";

import { useRef } from "react";
import { toast } from "sonner";
import { ActionForm } from "@/components/ActionForm";
import { Recaptcha, type CaptchaConfig, type RecaptchaHandle } from "@/components/Recaptcha";
import { loginAction } from "./actions";

export function LoginForm({ captcha, nonce }: { captcha: CaptchaConfig | null; nonce?: string }) {
  const rc = useRef<RecaptchaHandle>(null);
  return (
    <ActionForm
      action={loginAction}
      className="space-y-4"
      prepare={async (fd) => {
        if (!captcha) return true;
        const t = await rc.current?.token();
        if (!t) {
          toast.error(captcha.version === "v2" ? "Spunta la casella “Non sono un robot”." : "Verifica anti-robot non riuscita: ricarica la pagina e riprova.");
          return false;
        }
        fd.set("captcha", t);
        return true;
      }}
      // ogni token vale una volta sola: dopo un errore si rifà la verifica
      onError={() => rc.current?.reset()}
    >
      <label className="block">
        <span className="field-label">Nome utente</span>
        <input name="username" className="input" autoComplete="username" autoFocus required />
      </label>
      <label className="block">
        <span className="field-label">Password</span>
        <input name="password" type="password" className="input" autoComplete="current-password" required />
      </label>
      {captcha && <Recaptcha ref={rc} config={captcha} nonce={nonce} action="login" />}
      <button className="btn btn-primary w-full">Entra</button>
    </ActionForm>
  );
}
