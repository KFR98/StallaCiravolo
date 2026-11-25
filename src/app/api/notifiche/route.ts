import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { getNotifications } from "@/lib/notifications";

/** Elenco aggiornato delle notifiche per la campanella (si chiede ogni volta che la si apre). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Non autenticato" }, { status: 401 });
  const s = await getSettings();
  if (!s.notifyBell || !can(user.role, "notifications.view")) return Response.json({ error: "Non autorizzato" }, { status: 403 });
  const { items, badges, total } = await getNotifications(user);
  return Response.json({ items, badges, total }, { headers: { "Cache-Control": "no-store" } });
}
