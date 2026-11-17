import { readFile } from "node:fs/promises";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { tilePath } from "@/lib/map-tiles";

export async function GET(_req: Request, { params }: { params: Promise<{ v: string; z: string; y: string; x: string }> }) {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "map.view")) return new Response("Non autorizzato", { status: 401 });
  const { v, z, y, x } = await params;
  const p = tilePath(v, z, y, x);
  if (!p) return new Response("Non trovato", { status: 404 });
  try {
    const buf = await readFile(p);
    // ogni versione ha un nome diverso: il browser può tenere i tasselli in cache a lungo
    return new Response(new Uint8Array(buf), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=2592000, immutable" } });
  } catch {
    return new Response("Non trovato", { status: 404 });
  }
}
