"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { ActionForm } from "@/components/ActionForm";
import { verifyCode, cancelTwoFactor, finishEnroll } from "./actions";

export function VerifyForm({ name, enroll, codes }: { name: string; enroll: { qr: string; secret: string } | null; codes: string[] | null }) {
  const router = useRouter();
  const [recovery, setRecovery] = useState(false);

  if (codes) {
    return (
      <RecoveryCodes codes={codes} onDone={async () => {
        const r = await finishEnroll();
        if (r.ok) toast.success(r.message ?? "Benvenuto.");
        else toast.error(r.error ?? "Errore");
        router.push(r.redirect ?? "/");
      }} />
    );
  }

  return (
    <div className="space-y-4">
      {enroll ? (
        <>
          <p className="text-[14.5px] text-fg-2">
            Ciao {name}: per il tuo ruolo serve la <b>doppia verifica</b>. Installa sul telefono un&apos;app come <b>Google Authenticator</b>,
            <b> Microsoft Authenticator</b> o <b>Authy</b>, poi inquadra questo codice.
          </p>
          {/* SVG generato dal server (libreria qrcode): contiene solo forme, nessuno script */}
          <div className="mx-auto w-[200px] rounded-lg bg-white p-2" dangerouslySetInnerHTML={{ __html: enroll.qr }} aria-label="QR code da inquadrare con l'app" role="img" />
          <details className="text-[13px] text-fg-3">
            <summary className="cursor-pointer">Non riesci a inquadrarlo? Scrivi questo codice nell&apos;app</summary>
            <code className="mt-1 block rounded bg-surface-2 p-2 font-mono text-[13px] break-all text-fg select-all">{enroll.secret.replace(/(.{4})/g, "$1 ").trim()}</code>
          </details>
        </>
      ) : (
        <p className="text-[14.5px] text-fg-2">Ciao {name}: apri l&apos;app sul telefono e scrivi il codice a 6 cifre della stalla.</p>
      )}
      <ActionForm
        action={verifyCode}
        className="space-y-3" refresh={false}
        onError={(r) => { if (r.redirect) router.push(r.redirect); }}
      >
        <label className="block">
          <span className="field-label">{recovery ? "Codice di recupero (es. ABCD-EFGH)" : enroll ? "Codice mostrato dall'app" : "Codice a 6 cifre"}</span>
          <input
            name="code" className="input text-center font-mono text-[24px] tracking-[0.3em]" required autoFocus autoComplete="one-time-code"
            inputMode={recovery ? "text" : "numeric"} maxLength={recovery ? 12 : 7} pattern={recovery ? undefined : "[0-9 ]{6,7}"} placeholder={recovery ? "XXXX-XXXX" : "123456"}
          />
        </label>
        <button className="btn btn-primary w-full">{enroll ? "Attiva ed entra" : "Entra"}</button>
      </ActionForm>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
        {!enroll && (
          <button type="button" className="text-fg-3 underline decoration-dotted hover:text-fg" onClick={() => setRecovery((x) => !x)}>
            {recovery ? "Usa il codice dell'app" : "Ho perso il telefono: usa un codice di recupero"}
          </button>
        )}
        <form action={async () => { await cancelTwoFactor(); router.push("/login"); }} className="ml-auto">
          <button className="text-fg-3 hover:text-fg">Annulla</button>
        </form>
      </div>
    </div>
  );
}

/** Codici di recupero: si vedono una volta sola. */
export function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(codes.join("\n")); toast.success("Codici copiati."); } catch { toast.error("Copia non riuscita: scrivili a mano."); }
  };
  return (
    <div className="space-y-4">
      <p className="flex items-start gap-2 text-[14.5px]"><ShieldCheck className="mt-0.5 shrink-0 text-ok" size={20} /> Doppia verifica attiva.</p>
      <p className="text-[14px] text-fg-2">
        Questi sono i tuoi <b>codici di recupero</b>: servono se perdi il telefono. Ognuno vale una volta sola.
        <b> Salvali ora</b> (ad esempio in un messaggio a te stesso): non verranno più mostrati.
      </p>
      <ul className="grid grid-cols-2 gap-2 rounded-lg bg-surface-2 p-3 font-mono text-[15px]">
        {codes.map((c) => <li key={c} className="text-center select-all">{c}</li>)}
      </ul>
      <button type="button" className="btn btn-secondary w-full" onClick={copy}><Copy size={16} /> Copia i codici</button>
      <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> Li ho salvati</label>
      <button type="button" className="btn btn-primary w-full" disabled={!saved} onClick={onDone}>Continua</button>
    </div>
  );
}
