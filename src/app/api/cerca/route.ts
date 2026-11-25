import { getCurrentUser } from "@/lib/auth";
import { can, canSeeBreed } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { imageUrl } from "@/lib/catalog";

/**
 * Ricerca globale (Ctrl+K): cavalli, clienti, vendite, catalogo, oggetti, utenti.
 * Ognuno trova solo quello che può già vedere nelle pagine (stessi permessi, controllati qui sul server).
 */
type Hit = { group: string; title: string; sub?: string; href: string; image?: string | null };

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Non autenticato" }, { status: 401 });
  const q = (new URL(req.url).searchParams.get("q") ?? "").normalize("NFKC").trim().slice(0, 60);
  if (q.length < 2) return Response.json({ hits: [] });
  const r = user.role;
  const jobs: Promise<Hit[]>[] = [];

  if (can(r, "horses.view")) {
    jobs.push(
      prisma.horse.findMany({
        where: { OR: [{ plate: { contains: q } }, { breed: { name: { contains: q } } }, { coat: { name: { contains: q } } }] },
        include: { breed: true, coat: true, owner: { select: { displayName: true } } },
        orderBy: [{ status: "asc" }, { capturedAt: "desc" }],
        take: 12,
      }).then((list) => list.filter((h) => canSeeBreed(r, h.breedId)).slice(0, 6).map((h) => ({
        group: "Cavalli", title: `${h.breed.name} – ${h.coat.name}`, image: imageUrl(h.coat.imagePath), href: `/stalla/${h.id}`,
        sub: [h.plate, h.status === "IN_STALLA" ? `in stalla · ${h.owner.displayName}` : h.status.toLowerCase().replace(/_/g, " ")].filter(Boolean).join(" · "),
      }))),
    );
    const own = can(r, "sales.viewAll") ? {} : { sellerId: user.id };
    jobs.push(
      prisma.sale.findMany({
        where: { ...own, OR: [{ buyerName: { contains: q } }, { plate: { contains: q } }] },
        orderBy: { soldAt: "desc" }, take: 5,
      }).then((list) => list.map((s) => ({
        group: "Vendite", title: `${s.breedName} – ${s.coatName}`, href: `/vendite?q=${encodeURIComponent(s.plate ?? s.buyerName ?? q)}`,
        sub: [s.buyerName && `a ${s.buyerName}`, s.plate, `$${Number(s.finalPrice)}`, s.voided ? "annullata" : null].filter(Boolean).join(" · "),
      }))),
    );
  }
  if (can(r, "customers.view")) {
    jobs.push(
      prisma.customer.findMany({ where: { OR: [{ name: { contains: q } }, { missiva: { contains: q } }] }, orderBy: { updatedAt: "desc" }, take: 6 })
        .then((list) => list.map((c) => ({ group: "Clienti", title: c.name, sub: c.missiva ? `missiva ${c.missiva}` : undefined, href: `/clienti/${c.id}` }))),
    );
  }
  if (can(r, "catalog.view")) {
    jobs.push(
      prisma.coat.findMany({
        where: { archived: false, breed: { archived: false }, OR: [{ name: { contains: q } }, { breed: { name: { contains: q } } }] },
        include: { breed: true }, take: 10,
      }).then((list) => list.filter((c) => canSeeBreed(r, c.breedId)).slice(0, 5).map((c) => ({
        group: "Catalogo", title: `${c.breed.name} – ${c.name}`, image: imageUrl(c.imagePath), href: `/catalogo/${c.id}`,
        sub: c.salePriceA != null ? `vendita da $${Number(c.salePriceA)}` : undefined,
      }))),
    );
  }
  if (can(r, "shop.view")) {
    jobs.push(
      prisma.shopItem.findMany({ where: { archived: false, name: { contains: q } }, take: 5 })
        .then((list) => list.map((i) => ({ group: "Bottega", title: i.name, sub: [i.group, i.subgroup, i.price != null ? `$${Number(i.price)}` : null].filter(Boolean).join(" · "), href: "/bottega?tab=listino" }))),
    );
  }
  if (can(r, "employees.list")) {
    jobs.push(
      prisma.user.findMany({ where: { deletedAt: null, OR: [{ displayName: { contains: q } }, { username: { contains: q } }] }, take: 5 })
        .then((list) => list.map((u) => ({ group: "Personale", title: u.displayName, sub: `@${u.username}${u.active ? "" : " · disattivato"}`, href: `/dipendenti/${u.id}` }))),
    );
  }
  const hits = (await Promise.all(jobs)).flat();
  return Response.json({ hits }, { headers: { "Cache-Control": "no-store" } });
}
