import { readFile } from "node:fs/promises";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { backupPath } from "@/lib/backup";
import { audit } from "@/lib/audit";

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "data.backup")) return new Response("Non autorizzato", { status: 403 });
  const { file } = await params;
  try {
    const buf = await readFile(backupPath(file));
    await audit(user, "DOWNLOAD_BACKUP", "Backup", null, `Scaricato ${file}`);
    return new Response(new Uint8Array(buf), {
      headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${file}"` },
    });
  } catch {
    return new Response("Non trovato", { status: 404 });
  }
}
