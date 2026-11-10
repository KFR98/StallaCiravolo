import { NextResponse, type NextRequest } from "next/server";

/** Filtro rapido: senza cookie di sessione si va al login. La verifica vera avviene sul server a ogni richiesta. */
export function middleware(req: NextRequest) {
  const has = req.cookies.has("stalla_session");
  const { pathname } = req.nextUrl;
  if (!has && !pathname.startsWith("/login")) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/|map/|favicon.ico|robots.txt).*)"],
};
