"use client";

import { useState } from "react";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { RecoveryCodes } from "@/app/login/verifica/VerifyForm";
import { startTotp, confirmTotp, newRecovery, disableTotp } from "./two-factor-actions";

/** Doppia verifica dal proprio profilo: attiva, nuovi codici di recupero, disattiva (se il ruolo lo consente). */
export function TwoFactorCard({ enabled, enabledAt, required, recoveryLeft }: { enabled: boolean; enabledAt: string | null; required: boolean; recoveryLeft: number }) {
  const router = useRouter();
  const [setup, setSetup] = useState<{ qr: string; secret: string; sealed: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [mode, setMode] = useState<null | "codes" | "off">(null);
  const onCodes = (r: { data?: unknown }) => { const d = r.data as { recovery?: string[] } | undefined; if (d?.recovery) { setCodes(d.recovery); setSetup(null); setMode(null); } };

  if (codes) return <RecoveryCodes codes={codes} onDone={() => { setCodes(null); router.refresh(); }} />;

  if (!enabled) {
    return (
      <div className="space-y-3">
        <p className="flex items-start gap-2 text-[14px]"><ShieldOff size={18} className="mt-0.5 shrink-0 text-fg-3" /> Non attiva. Con la doppia verifica, oltre alla password serve il codice dell&apos;app sul telefono: anche se qualcuno scopre la password non può entrare.</p>
        {required && <p className="rounded-lg bg-warn-soft p-2.5 text-[13.5px] text-warn">Per il tuo ruolo è obbligatoria: al prossimo accesso ti verrà chiesto di attivarla.</p>}
        {!setup ? (
          <button type="button" className="btn btn-primary" onClick={async () => {
            const r = await startTotp();
            if (r.ok) setSetup(r.data as { qr: string; secret: string; sealed: string }); else toast.error(r.error ?? "Errore");
          }}>Attiva la doppia verifica</button>
        ) : (
          <ActionForm action={confirmTotp} onSuccess={onCodes} className="space-y-3" refresh={false}>
            <p className="text-[14px] text-fg-2">Inquadra il codice con Google Authenticator, Microsoft Authenticator o Authy, poi scrivi il codice che compare.</p>
            <div className="mx-auto w-[180px] rounded-lg bg-white p-2" dangerouslySetInnerHTML={{ __html: setup.qr }} role="img" aria-label="QR code da inquadrare con l'app" />
            <code className="block rounded bg-surface-2 p-2 text-center font-mono text-[12.5px] break-all select-all">{setup.secret.replace(/(.{4})/g, "$1 ").trim()}</code>
            <input type="hidden" name="sealed" value={setup.sealed} />
            <input name="code" className="input text-center font-mono text-[20px] tracking-[0.3em]" inputMode="numeric" pattern="[0-9 ]{6,7}" maxLength={7} placeholder="123456" required autoComplete="one-time-code" />
            <div className="flex gap-2">
              <button className="btn btn-primary flex-1">Conferma</button>
              <button type="button" className="btn btn-ghost" onClick={() => setSetup(null)}>Annulla</button>
            </div>
          </ActionForm>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <p className="flex items-start gap-2 text-[14px]"><ShieldCheck size={18} className="mt-0.5 shrink-0 text-ok" /> Attiva{enabledAt ? ` dal ${new Date(enabledAt).toLocaleDateString("it-IT")}` : ""}. Codici di recupero rimasti: <b>{recoveryLeft}</b>.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMode(mode === "codes" ? null : "codes")}>Nuovi codici di recupero</button>
        {!required && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode(mode === "off" ? null : "off")}>Disattiva</button>}
      </div>
      {mode && (
        <ActionForm action={mode === "codes" ? newRecovery : disableTotp} onSuccess={(r) => { onCodes(r); setMode(null); }} className="space-y-2" refresh={mode !== "codes"}
          confirm={mode === "off" ? "Disattivare la doppia verifica? Per entrare basterà la password." : undefined}>
          <span className="field-label">{mode === "codes" ? "Codice dell'app per confermare (i vecchi codici di recupero non varranno più)" : "Codice dell'app per confermare"}</span>
          <input name="code" className="input text-center font-mono text-[20px] tracking-[0.3em]" inputMode="numeric" pattern="[0-9 ]{6,7}" maxLength={7} placeholder="123456" required autoComplete="one-time-code" />
          <button className={mode === "off" ? "btn btn-danger w-full" : "btn btn-primary w-full"}>{mode === "codes" ? "Crea nuovi codici" : "Disattiva"}</button>
        </ActionForm>
      )}
      {required && <p className="text-[12.5px] text-fg-3">Per il tuo ruolo è obbligatoria. Se perdi il telefono usa un codice di recupero, o chiedi all&apos;amministratore di azzerarla.</p>}
    </div>
  );
}
