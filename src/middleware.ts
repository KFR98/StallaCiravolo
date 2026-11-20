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
function cspHeader(nonce: string) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
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

/** Filtro rapido: senza cookie di sessione si va al login. La verifica vera avviene sul server a ogni richiesta. */
export function middleware(req: NextRequest) {
  const toHttps = httpsRedirect(req);
  if (toHttps) return toHttps;

  const nonce = crypto.randomUUID().replace(/-/g, "");
  const csp = cspHeader(nonce);
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
