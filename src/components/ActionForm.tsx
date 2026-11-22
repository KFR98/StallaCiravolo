"use client";

import { useRef, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/action";

/**
 * Modulo collegato a un'azione server: mostra conferma (opzionale), notifiche
 * di successo/errore, blocca il doppio invio e aggiorna i dati della pagina.
 */
export function ActionForm({
  action,
  children,
  confirm,
  className,
  resetOnSuccess = false,
  onSuccess,
  onError,
  prepare,
  successMessage,
}: {
  action: (fd: FormData) => Promise<ActionResult>;
  children: ReactNode;
  confirm?: string | ((fd: FormData) => string | null);
  className?: string;
  resetOnSuccess?: boolean;
  onSuccess?: (r: ActionResult) => void;
  /** chiamata quando l'azione non riesce (es. per azzerare il captcha) */
  onError?: (r: ActionResult) => void;
  /** passo asincrono prima dell'invio (es. captcha): può aggiungere campi o annullare (false) */
  prepare?: (fd: FormData) => Promise<boolean>;
  successMessage?: string;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={ref}
      className={className}
      aria-busy={pending}
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        const form = e.currentTarget;
        const data = new FormData(form);
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        if (submitter?.name) data.set(submitter.name, submitter.value);
        const msg = typeof confirm === "function" ? confirm(data) : confirm;
        if (msg && !window.confirm(msg)) return;
        start(async () => {
          if (prepare && !(await prepare(data))) return;
          const r = await action(data);
          if (r.ok) {
            toast.success(r.message ?? successMessage ?? "Operazione registrata.");
            if (resetOnSuccess) form.reset();
            onSuccess?.(r);
            if (r.redirect) router.push(r.redirect);
            else router.refresh();
          } else {
            toast.error(r.error ?? "Operazione non riuscita.");
            onError?.(r);
          }
        });
      }}
    >
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
    </form>
  );
}

/** Pulsante singolo collegato a un'azione (con conferma). */
export function ActionButton({
  action,
  label,
  confirm,
  className = "btn btn-ghost btn-sm",
  fields,
}: {
  action: (fd: FormData) => Promise<ActionResult>;
  label: ReactNode;
  confirm?: string;
  className?: string;
  fields?: Record<string, string | number>;
}) {
  return (
    <ActionForm action={action} confirm={confirm} className="inline">
      {fields && Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <button className={className}>{label}</button>
    </ActionForm>
  );
}
