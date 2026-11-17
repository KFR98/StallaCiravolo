import { readFile } from "node:fs/promises";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { previewPath } from "@/lib/map-tiles";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "settings.manage")) return new Response("Non autorizzato", { status: 403 });
  const p = previewPath();
  if (!p) return new Response("Non trovato", { status: 404 });
  return new Response(new Uint8Array(await readFile(p)), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-cache" } });
}
