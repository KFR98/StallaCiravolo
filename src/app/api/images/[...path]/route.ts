import { readFile } from "node:fs/promises";
import path from "node:path";
import { getCurrentUser } from "@/lib/auth";
import { safeUploadPath, MIME } from "@/lib/uploads";

export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  if (!(await getCurrentUser())) return new Response("Non autenticato", { status: 401 });
  const { path: parts } = await params;
  try {
    const rel = parts.map(decodeURIComponent).join("/");
    const full = safeUploadPath(rel);
    const type = MIME[path.extname(full).toLowerCase()];
    if (!type) return new Response("Non trovato", { status: 404 });
    const buf = await readFile(full);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": type,
        "Cache-Control": "private, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Non trovato", { status: 404 });
  }
}
