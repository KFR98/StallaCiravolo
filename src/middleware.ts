import { NextResponse, type NextRequest } from "next/server";

/**
 * Se APP_URL è un indirizzo https (scheda Startup di Pterodactyl → "Indirizzo pubblico"),
 * ogni pagina aperta in http (es. http://IP:porta o http://dominio) viene rimandata a quell'indirizzo.
 * In https si aggiunge HSTS: il browser userà sempre https per questo dominio.
 */
function httpsRedirect(req: NextRequest) {
  const app = process.env.APP_URL?.trim();
  if (!app || !app.startsWith("https://")) return null;
  let target: URL;
  try {
    target = new URL(app);
  } catch {
    return null;
  }
  const xfp = req.headers.get("x-forwarded-proto")?.split(",")[0].trim().toLowerCase();
  // Il proxy (nginx) DEVE inoltrare X-Forwarded-Proto, come nel file deploy/nginx/stalla.conf
  if (xfp === "https") return null;
  const url = new URL(req.nextUrl.pathname + req.nextUrl.search, target);
  return NextResponse.redirect(url, 308);
}

/**
 * Content-Security-Policy con "nonce": a ogni richiesta si genera un codice casuale.
 * Gli script del gestionale lo portano (Next.js lo applica da solo, e lo passiamo anche al nostro
 * script del tema); uno script iniettato da un attaccante non ha il nonce e il browser lo blocca.
 * Niente più 'unsafe-inline' sugli script.
 */
/** Solo dove serve il reCAPTCHA di Google (accesso e prova nelle impostazioni) si aprono i suoi indirizzi. */
const RECAPTCHA_PAGES = ["/login", "/admin/impostazioni"];

function cspHeader(nonce: string, recaptcha: boolean) {
  const g = recaptcha ? " https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/" : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'${g}`,
    `frame-src 'self'${recaptcha ? " https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/" : ""}`,
    // gli stili in linea (style={...}, Tailwind) sono tanti e a basso rischio: restano consentiti
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

/**
 * Le Server Actions del gestionale hanno un identificativo esadecimale di 42 caratteri.
 * I bot che scansionano internet in cerca di siti Next.js vulnerabili mandano valori finti
 * (es. "Next-Action: x"): li rifiutiamo qui, prima che arrivino a Next, così non sporcano i log.
 */
const ACTION_ID = /^[0-9a-f]{40,64}$/;

/**
 * Stessa regola di Next per le Server Actions: l'host dell'Origin deve essere quello del sito
 * (X-Forwarded-Host dal proxy, altrimenti Host) oppure uno di ALLOWED_ORIGINS.
 * Senza Origin decide Next (i browser lo mandano sempre con le azioni).
 */
const ALLOWED = (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  let host: string;
  try {
    host = new URL(origin).host.toLowerCase();
  } catch {
    return false;
  }
  const site = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(",")[0].trim().toLowerCase();
  return host === site || ALLOWED.includes(host);
}

/** Filtro rapido: senza cookie di sessione si va al login. La verifica vera avviene sul server a ogni richiesta. */
export function middleware(req: NextRequest) {
  if (!req.nextUrl.pathname.startsWith("/api/") && !["GET", "HEAD", "POST"].includes(req.method)) {
    return new NextResponse(null, { status: 405, headers: { Allow: "GET, HEAD, POST" } });
  }
  const action = req.headers.get("next-action");
  if (action !== null && !ACTION_ID.test(action)) return new NextResponse(null, { status: 400 });
  // Azione chiamata da un altro sito (tentativo CSRF): Next la blocca comunque, qui la fermiamo prima
  // con un 403 pulito, così nei log non compare l'errore "Invalid Server Actions request".
  if (action !== null && !sameOrigin(req)) return new NextResponse(null, { status: 403 });

  const toHttps = httpsRedirect(req);
  if (toHttps) return toHttps;

  const nonce = crypto.randomUUID().replace(/-/g, "");
  const csp = cspHeader(nonce, RECAPTCHA_PAGES.some((p) => req.nextUrl.pathname === p || req.nextUrl.pathname.startsWith(p + "/")));
  // Next.js legge il nonce dall'header CSP sulla richiesta e lo mette sui suoi script
  const reqHeaders = new Headers(req.headers);
  reqHeaders.set("x-nonce", nonce);
  reqHeaders.set("content-security-policy", csp);

  const { pathname } = req.nextUrl;
  const has = req.cookies.has("stalla_session");
  let res: NextResponse;
  if (!has && !pathname.startsWith("/login")) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    res = NextResponse.redirect(url);
  } else {
    res = NextResponse.next({ request: { headers: reqHeaders } });
  }
  res.headers.set("content-security-policy", csp);
  if (req.headers.get("x-forwarded-proto")?.split(",")[0].trim().toLowerCase() === "https") {
    res.headers.set("Strict-Transport-Security", "max-age=31536000");
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/|map/|brand/|api/admin/mappa/upload|favicon.ico|icon.png|apple-icon.png|robots.txt).*)"],
};
