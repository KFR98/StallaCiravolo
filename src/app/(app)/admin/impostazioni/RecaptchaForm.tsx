"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, ShieldOff, TriangleAlert } from "lucide-react";
import { ActionForm } from "@/components/ActionForm";
import { Recaptcha, type RecaptchaHandle } from "@/components/Recaptcha";
import { saveRecaptcha } from "./recaptcha-actions";

const KEY_RE = /^[A-Za-z0-9_-]{20,100}$/;

export function RecaptchaForm({ enabled, version, siteKey, minScore, secretSet, emergency, nonce }: {
  enabled: boolean; version: "v2" | "v3"; siteKey: string; minScore: number; secretSet: boolean; emergency: boolean; nonce?: string;
}) {
  const [on, setOn] = useState(enabled);
  const [ver, setVer] = useState(version);
  const [key, setKey] = useState(siteKey);
  const [secretTyped, setSecretTyped] = useState(false);
  const [testKey, setTestKey] = useState<{ version: "v2" | "v3"; siteKey: string } | null>(null);
  const rc = useRef<RecaptchaHandle>(null);

  // La prova serve quando lo si accende o si cambiano chiavi/tipo mentre è acceso
  const needsTest = on && (!enabled || key !== siteKey || ver !== version || secretTyped);
  const testReady = testKey?.siteKey === key && testKey.version === ver;

  return (
    <ActionForm
      action={saveRecaptcha}
      className="space-y-4"
      prepare={async (fd) => {
        if (!needsTest) return true;
        if (!testReady) {
          toast.error("Prima fai la prova: premi “Prova le chiavi”.");
          return false;
        }
        const t = await rc.current?.token();
        if (!t) {
          toast.error(ver === "v2" ? "Spunta la casella “Non sono un robot” della prova." : "La prova non ha restituito un risultato: ricarica la pagina e riprova.");
          return false;
        }
        fd.set("captcha", t);
        return true;
      }}
      onError={() => rc.current?.reset()}
      onSuccess={() => setSecretTyped(false)}
    >
      <div className={enabled ? "flex items-start gap-3 rounded-lg border border-[#16a34a]/40 bg-[#16a34a]/10 p-3" : "flex items-start gap-3 rounded-lg border border-border bg-surface-2 p-3"}>
        {enabled ? <ShieldCheck className="mt-0.5 shrink-0 text-[#16a34a]" size={20} /> : <ShieldOff className="mt-0.5 shrink-0 text-fg-3" size={20} />}
        <div className="text-[14px]">
          <b>{enabled ? "Attivo" : "Spento"}</b>: {enabled ? "per entrare bisogna superare la verifica di Google." : "si entra solo con nome utente e password."}
          <span className="block text-[13px] text-fg-3">Chiave segreta: {secretSet ? "impostata (per sicurezza non viene mai mostrata)" : "non ancora inserita"}.</span>
        </div>
      </div>
      {emergency && (
        <p className="flex items-start gap-2 rounded-lg border border-[#d97706]/50 bg-[#d97706]/10 p-3 text-[14px]">
          <TriangleAlert size={18} className="mt-0.5 shrink-0 text-[#d97706]" />
          Interruttore di emergenza acceso (file <code>data/recaptcha-off</code> o RECAPTCHA_OFF=true): il captcha NON viene chiesto finché non lo togli.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="field-label">Tipo di chiavi</span>
          <select name="version" value={ver} onChange={(e) => setVer(e.target.value as "v2" | "v3")} className="input">
            <option value="v2">v2 · casella “Non sono un robot”</option>
            <option value="v3">v3 · invisibile, con punteggio</option>
          </select>
          <span className="mt-1 block text-[13px] text-fg-3">Deve essere lo stesso tipo scelto quando hai creato le chiavi su Google.</span>
        </label>
        {ver === "v3" ? (
          <label className="block">
            <span className="field-label">Punteggio minimo (da 0 a 1)</span>
            <input type="number" name="minScore" defaultValue={minScore} min={0} max={1} step={0.1} className="input" />
            <span className="mt-1 block text-[13px] text-fg-3">0.5 consigliato. Più alto = più severo (rischi di bloccare persone vere).</span>
          </label>
        ) : <input type="hidden" name="minScore" value={minScore} />}
        <label className="block">
          <span className="field-label">Chiave pubblica (del sito)</span>
          <input name="siteKey" value={key} onChange={(e) => setKey(e.target.value.trim())} className="input font-mono text-[14px]" autoComplete="off" spellCheck={false} placeholder="6L…" />
        </label>
        <label className="block">
          <span className="field-label">Chiave segreta</span>
          <input name="secret" type="password" onChange={(e) => setSecretTyped(!!e.target.value.trim())} className="input font-mono text-[14px]" autoComplete="new-password" spellCheck={false}
            placeholder={secretSet ? "•••••••• lascia vuoto per non cambiarla" : "6L…"} />
        </label>
      </div>

      <label className="flex min-h-10 items-center gap-3 rounded-lg border border-border px-3">
        <input type="checkbox" name="enabled" checked={on} onChange={(e) => setOn(e.target.checked)} />
        <span className="font-semibold">Chiedi il reCAPTCHA nella pagina di accesso</span>
      </label>

      {needsTest && (
        <div className="space-y-3 rounded-lg border border-border p-3">
          <p className="text-[14px]">
            <b>Prova obbligatoria.</b> Prima di attivarlo controllo che le chiavi funzionino davvero, così non rischi di restare chiuso fuori.
          </p>
          {testReady ? (
            <Recaptcha ref={rc} config={testKey} nonce={nonce} action="admin_test" />
          ) : (
            <button type="button" className="btn btn-secondary" disabled={!KEY_RE.test(key)} onClick={() => setTestKey({ version: ver, siteKey: key })}>
              Prova le chiavi
            </button>
          )}
        </div>
      )}

      <p className="text-[13px] text-fg-3">
        Se un giorno non riesci più a entrare per colpa del captcha: dal File Manager di Pterodactyl crea un file vuoto chiamato <code>recaptcha-off</code> nella cartella <code>data</code>.
        Il captcha si spegne subito; cancella il file quando hai sistemato.
      </p>
      <button className="btn btn-primary">Salva reCAPTCHA</button>
    </ActionForm>
  );
}
