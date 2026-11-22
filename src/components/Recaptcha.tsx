"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

/** API minima di Google reCAPTCHA che usiamo. */
type Grecaptcha = {
  ready(cb: () => void): void;
  render(el: HTMLElement, opts: { sitekey: string; theme?: "light" | "dark"; callback?: () => void; "expired-callback"?: () => void }): number;
  getResponse(id?: number): string;
  reset(id?: number): void;
  execute(siteKey: string, opts: { action: string }): Promise<string>;
};
declare global {
  interface Window { grecaptcha?: Grecaptcha }
}

export type CaptchaConfig = { version: "v2" | "v3"; siteKey: string };
export type RecaptchaHandle = {
  /** token da mandare al server, oppure null (v2: casella non spuntata) */
  token(): Promise<string | null>;
  reset(): void;
};

// Lo script si carica una volta sola per pagina (v2 e v3 usano indirizzi diversi)
let loading: { src: string; p: Promise<Grecaptcha> } | null = null;
function loadScript(src: string, nonce?: string): Promise<Grecaptcha> {
  if (loading?.src === src) return loading.p;
  if (loading) return Promise.reject(new Error("Hai cambiato tipo di reCAPTCHA: ricarica la pagina per provarlo."));
  const p = new Promise<Grecaptcha>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    if (nonce) s.nonce = nonce;
    s.onload = () => (window.grecaptcha ? window.grecaptcha.ready(() => resolve(window.grecaptcha!)) : reject(new Error("reCAPTCHA non disponibile")));
    s.onerror = () => reject(new Error("Impossibile caricare reCAPTCHA di Google. Controlla la connessione."));
    document.head.appendChild(s);
  });
  loading = { src, p };
  return p;
}

/**
 * Widget reCAPTCHA. v2: la casella "Non sono un robot"; v3: invisibile (il badge di Google compare in basso).
 */
export const Recaptcha = forwardRef<RecaptchaHandle, { config: CaptchaConfig; nonce?: string; action?: string; onChange?: (done: boolean) => void }>(
  function Recaptcha({ config, nonce, action = "login", onChange }, ref) {
    const box = useRef<HTMLDivElement>(null);
    const widget = useRef<number | null>(null);
    const api = useRef<Grecaptcha | null>(null);
    const [error, setError] = useState<string | null>(null);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    useEffect(() => {
      let alive = true;
      const src = config.version === "v3"
        ? `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(config.siteKey)}&hl=it`
        : "https://www.google.com/recaptcha/api.js?render=explicit&hl=it";
      loadScript(src, nonce)
        .then((g) => {
          if (!alive) return;
          api.current = g;
          setError(null);
          if (config.version === "v2" && box.current && widget.current === null) {
            box.current.innerHTML = "";
            const el = document.createElement("div");
            box.current.appendChild(el);
            widget.current = g.render(el, {
              sitekey: config.siteKey,
              theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
              callback: () => onChangeRef.current?.(true),
              "expired-callback": () => onChangeRef.current?.(false),
            });
          }
        })
        .catch((e: Error) => alive && setError(e.message));
      return () => {
        alive = false;
        widget.current = null;
      };
    }, [config.version, config.siteKey, nonce]);

    useImperativeHandle(ref, () => ({
      async token() {
        const g = api.current;
        if (!g) return null;
        if (config.version === "v3") {
          try {
            return await g.execute(config.siteKey, { action });
          } catch {
            return null;
          }
        }
        return widget.current === null ? null : g.getResponse(widget.current) || null;
      },
      reset() {
        if (config.version === "v2" && api.current && widget.current !== null) api.current.reset(widget.current);
        onChangeRef.current?.(false);
      },
    }), [config.version, config.siteKey, action]);

    return (
      <div>
        {config.version === "v2" && <div ref={box} className="rc-box flex min-h-[78px] justify-center" />}
        {error && <p className="mt-1 text-[13px] text-accent-text" role="alert">{error}</p>}
        {config.version === "v3" && !error && (
          <p className="text-center text-[12px] text-fg-3">Protetto da reCAPTCHA di Google.</p>
        )}
      </div>
    );
  },
);
