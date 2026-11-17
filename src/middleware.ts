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

/** Filtro rapido: senza cookie di sessione si va al login. La verifica vera avviene sul server a ogni richiesta. */
export function middleware(req: NextRequest) {
  const toHttps = httpsRedirect(req);
  if (toHttps) return toHttps;

  const has = req.cookies.has("stalla_session");
  const { pathname } = req.nextUrl;
  let res: NextResponse;
  if (!has && !pathname.startsWith("/login")) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    res = NextResponse.redirect(url);
  } else {
    res = NextResponse.next();
  }
  if (req.headers.get("x-forwarded-proto")?.split(",")[0].trim().toLowerCase() === "https") {
    res.headers.set("Strict-Transport-Security", "max-age=31536000");
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/|map/|brand/|favicon.ico|icon.png|apple-icon.png|robots.txt).*)"],
};
