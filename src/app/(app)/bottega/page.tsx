import { requireUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { can, canSeeBreed } from "@/lib/permissions";
import { getBreedOptions, imageUrl } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";
import { prisma } from "@/lib/db";
import { money, dateTime } from "@/lib/format";
import { PageHeader, Card, Tabs, Empty } from "@/components/ui";
import { ShopSell, ItemTable, SupplierTable, HandleButton, type ShopItemRow, type StableHorse } from "./ShopClient";
import type { HorseRules, SellableHorse } from "./HorseSaleBlock";
import { horsePricing, pregnancyState } from "@/lib/horses";
import { customerSuggestions } from "@/lib/customers";
import { NoteForm, ReimbursementForm } from "./RequestForms";
import { ActionButton } from "@/components/ActionForm";
import { deleteShopNote } from "./actions";
import { SaleTag } from "@/components/SaleTag";

export const metadata = { title: "Bottega" };

const NOTE_TYPE = { NUOVO_FORNITORE: "Nuovo fornitore", MODIFICA_PROPOSTA: "Modifica proposta", NOTA: "Nota" } as const;
const NOTE_STATUS = { APERTA: ["Aperta", "badge-warn"], ACCOLTA: ["Accolta", "badge-ok"], RESPINTA: ["Respinta", "badge-neutral"] } as const;
const REIMB_STATUS = { RICHIESTO: ["Richiesto", "badge-warn"], APPROVATO: ["Approvato", "badge-info"], PAGATO: ["Pagato", "badge-ok"], RESPINTO: ["Respinto", "badge-neutral"] } as const;

export default async function ShopPage({ searchParams }: { searchParams: Promise<{ tab?: string; cavallo?: string; prenotazione?: string }> }) {
  // la bottega è anche la cassa per vendere i cavalli: si apre con "vedere la bottega" oppure con "vendere i propri cavalli"
  const user = await requireUser();
  if (!can(user.role, "shop.view") && !can(user.role, "horses.sell")) redirect("/?negato=1");
  const shopView = can(user.role, "shop.view");
  const sp = await searchParams;
  const manage = can(user.role, "shop.manage");
  const tab = shopView && ["vendi", "listino", "materie", "fornitori", "richieste"].includes(sp.tab ?? "") ? sp.tab! : "vendi";
  const [items, openReq] = await Promise.all([
    prisma.shopItem.findMany({ where: { archived: false }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    manage ? prisma.reimbursement.count({ where: { status: { in: ["RICHIESTO", "APPROVATO"] } } }).then(async (n) => n + (await prisma.shopNote.count({ where: { status: "APERTA" } }))) : Promise.resolve(undefined),
  ]);
  const rows: ShopItemRow[] = items.map((i) => ({ id: i.id, kind: i.kind, name: i.name, group: i.group, subgroup: i.subgroup, price: i.price == null ? null : Number(i.price), priceNote: i.priceNote, notes: i.notes }));

  let body: React.ReactNode = null;
  if (tab === "vendi") {
    const [recent, breedOpts, st] = await Promise.all([
      prisma.itemSale.findMany({ where: manage ? {} : { sellerId: user.id }, orderBy: { soldAt: "desc" }, take: 8, include: { lines: true } }),
      getBreedOptions(),
      getSettings(),
    ]);
    const breeds = breedOpts.filter((b) => canSeeBreed(user.role, b.id)).map((b) => ({ id: b.id, name: b.name, coats: b.coats.map((c) => ({ id: c.id, name: c.name, image: c.image, trainingPrice: c.trainingPrice })) }));
    // cavalli in stalla non ancora addestrati (servono anche il permesso di segnare l'addestramento)
    const stableRaw = can(user.role, "horses.train")
      ? await prisma.horse.findMany({
          where: { status: "IN_STALLA", trained: false },
          include: { breed: true, coat: true, owner: { select: { displayName: true } } },
          orderBy: [{ breed: { name: "asc" } }, { coat: { name: "asc" } }],
        })
      : [];
    const stable: StableHorse[] = stableRaw
      .filter((h) => canSeeBreed(user.role, h.breedId))
      .map((h) => {
        const rarity = h.rarity === "RARO" || h.rarity === "LEGGENDARIO" ? h.rarity : null;
        return {
          id: h.id, breedId: h.breedId, coatId: h.coatId, breed: h.breed.name, coat: h.coat.name, plate: h.plate, image: imageUrl(h.coat.imagePath),
          rarity, owner: h.owner.displayName, price: rarity ? st.rareTrainingPrice : h.coat.trainingPrice == null ? null : Number(h.coat.trainingPrice),
        };
      });

    // Cavalli della stalla vendibili da chi apre la cassa (i propri, o tutti con "gestire anche i cavalli degli altri")
    const canSellHorses = can(user.role, "horses.sell");
    const sellRaw = canSellHorses
      ? await prisma.horse.findMany({
          where: { status: "IN_STALLA", needsData: false, ...(can(user.role, "horses.manageAll") ? {} : { ownerId: user.id }) },
          include: { breed: true, coat: true, owner: { select: { displayName: true } } },
          orderBy: [{ breed: { name: "asc" } }, { coat: { name: "asc" } }],
        })
      : [];
    const num = (v: unknown) => (v == null ? null : Number(v));
    const horses: SellableHorse[] = sellRaw
      .filter((h) => canSeeBreed(user.role, h.breedId))
      .map((h) => {
        const p = horsePricing(h, st);
        return {
          id: h.id, version: h.version, breed: h.breed.name, coat: h.coat.name, plate: h.plate, image: imageUrl(h.coat.imagePath), owner: h.owner.displayName,
          age: p.age, computed: p.bracket === "TROPPO_GIOVANE" ? null : p.bracket, basePriceA: num(h.coat.basePriceA), basePriceB: num(h.coat.basePriceB),
          trainingPrice: num(h.coat.trainingPrice), rarity: h.rarity === "RARO" || h.rarity === "LEGGENDARIO" ? h.rarity : null, trained: h.trained,
          pregnant: pregnancyState(h) != null,
        };
      });
    const horseRules: HorseRules = {
      minSaleAge: st.minSaleAge, bracketAMax: st.bracketAMax, bracketBMax: st.bracketBMax, rareBasePrice: st.rareBasePrice, rareTrainingPrice: st.rareTrainingPrice,
      canOverride: can(user.role, "sales.overridePrice"), canSellUnderage: can(user.role, "horses.sellUnderage"),
    };
    // dalla bacheca: prenotazione da chiudere (il cavallo con la stessa targa viene proposto da solo)
    const resv = Number(sp.prenotazione) && can(user.role, "reservations.edit")
      ? await prisma.reservation.findUnique({ where: { id: Number(sp.prenotazione) }, include: { breed: true, coat: true } })
      : null;
    const reservation = resv && resv.status !== "AFFARE_CHIUSO" && resv.status !== "ANNULLATO"
      ? {
          id: resv.id, customerName: resv.customerName, price: resv.price == null ? null : Number(resv.price), deposit: resv.deposit == null ? null : Number(resv.deposit),
          label: [resv.title, resv.customerName, resv.breed ? `${resv.breed.name}${resv.coat ? " – " + resv.coat.name : ""}` : null, resv.plate].filter(Boolean).join(" · ") || `#${resv.id}`,
        }
      : null;
    const byPlate = resv?.plate ? horses.find((h) => h.plate?.toUpperCase() === resv.plate!.toUpperCase()) : null;
    const initialHorseId = Number(sp.cavallo) || byPlate?.id || null;
    const customers = can(user.role, "customers.view") ? (await customerSuggestions()).map((c) => c.name) : [];
    // scorciatoia ferri: oggetti scelti in Impostazioni, altrimenti riconosciuti dal nome ("Ferri Classici (4)")
    const sellItemsList = rows.filter((r) => r.kind === "VENDITA" && r.price != null);
    const shoe = (setting: number, word: string) =>
      (setting && sellItemsList.find((i) => i.id === setting)?.id) ||
      sellItemsList.find((i) => { const n = i.name.toLowerCase(); return n.includes("ferri") && n.includes(word) && n.includes("4"); })?.id || null;
    const shoeIds = { classici: shoe(st.shoeClassicItemId, "classic"), migliorati: shoe(st.shoeImprovedItemId, "miglior") };
    body = (
      <>
        {(can(user.role, "shop.sell") || canSellHorses) && (
          <ShopSell
            items={rows.filter((r) => r.kind === "VENDITA")}
            breeds={breeds}
            stable={stable}
            horses={horses}
            horseRules={horseRules}
            initialHorseId={initialHorseId}
            shoeIds={shoeIds}
            canShop={can(user.role, "shop.sell")}
            customers={customers}
            reservation={reservation}
            rareTrainingPrice={st.rareTrainingPrice}
            maxDiscount={st.maxDiscountPercent}
            canFlat={can(user.role, "shop.flatPrice")}
            canOverride={can(user.role, "sales.overridePrice")}
          />
        )}
        {shopView && <Card title="Ultime fatture della bottega" className="mt-5">
          {recent.length === 0 ? <Empty>Nessuna vendita in bottega.</Empty> : (
            <ul className="divide-y divide-border">
              {recent.map((s) => (
                <li key={s.id} className={`flex flex-wrap items-center justify-between gap-2 py-2.5 ${s.voided ? "opacity-50 line-through" : ""}`}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {s.lines.some((l) => l.kind === "ADDESTRAMENTO") && <SaleTag kind="addestramento" />}
                      {s.lines.some((l) => l.kind !== "ADDESTRAMENTO") && <SaleTag kind="vetrina" />}
                      <span className="truncate font-medium">{s.lines.map((l) => (l.kind === "ADDESTRAMENTO" ? l.itemName : `${l.quantity}× ${l.itemName}`)).join(", ")}</span>
                    </div>
                    <div className="text-[13px] text-fg-3">{dateTime(s.soldAt)} · {s.sellerName}{s.buyerName ? ` · a ${s.buyerName}` : ""}</div>
                  </div>
                  <span className="text-right">
                    <b className="tabular-nums">{money(s.total)}</b>
                    {s.listTotal != null && Number(s.listTotal) !== Number(s.total) && <span className="block text-[12px] text-fg-3">forfait · listino {money(s.listTotal)}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>}
      </>
    );
  } else if (tab === "listino") {
    body = <ItemTable items={rows.filter((r) => r.kind === "VENDITA")} kind="VENDITA" canManage={manage} />;
  } else if (tab === "materie") {
    body = <ItemTable items={rows.filter((r) => r.kind === "MATERIA_PRIMA")} kind="MATERIA_PRIMA" canManage={manage} />;
  } else if (tab === "fornitori") {
    const sup = await prisma.supplier.findMany({ where: { archived: false }, orderBy: { name: "asc" } });
    body = <SupplierTable suppliers={sup} canManage={manage} />;
  } else {
    const [notes, reimb, sup] = await Promise.all([
      prisma.shopNote.findMany({ where: manage ? {} : { createdById: user.id }, orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 100, include: { createdBy: true, handledBy: true } }),
      prisma.reimbursement.findMany({ where: manage ? {} : { userId: user.id }, orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 100, include: { user: true, supplier: true, handledBy: true } }),
      prisma.supplier.findMany({ where: { archived: false }, orderBy: { name: "asc" }, select: { id: true, name: true, activity: true } }),
    ]);
    body = (
      <div className="grid gap-5 lg:grid-cols-[1fr_1.6fr]">
        <div className="space-y-5">
          <Card title="Chiedi un rimborso"><p className="mb-3 text-[13.5px] text-fg-3">Hai comprato merce per la stalla con i tuoi soldi? Indica fornitore, merce e importo.</p><ReimbursementForm suppliers={sup} /></Card>
          <Card title="Proponi o segnala"><NoteForm /></Card>
        </div>
        <div className="space-y-5">
          <Card title={manage ? "Rimborsi" : "I miei rimborsi"} pad={false}>
            {reimb.length === 0 ? <Empty>Nessuna richiesta.</Empty> : (
              <ul className="divide-y divide-border">
                {reimb.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{r.description}</div>
                      <div className="text-[13px] text-fg-3">{r.user.displayName} · {r.supplier?.name ?? r.supplierName} · {dateTime(r.createdAt)}</div>
                      {r.response && <div className="mt-1 text-[13.5px] text-fg-2">Risposta: {r.response}</div>}
                    </div>
                    <div className="flex items-center gap-2">
                      <b className="tabular-nums">{money(r.amount)}</b>
                      <span className={`badge ${REIMB_STATUS[r.status][1]}`}>{REIMB_STATUS[r.status][0]}</span>
                      {manage && <HandleButton kind="rimborso" id={r.id} current={r.status} response={r.response} statuses={Object.entries(REIMB_STATUS).map(([k, v]) => [k, v[0]])} />}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title={manage ? "Proposte e note" : "Le mie proposte"} pad={false}>
            {notes.length === 0 ? <Empty>Nessuna proposta.</Empty> : (
              <ul className="divide-y divide-border">
                {notes.map((n) => (
                  <li key={n.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-[12.5px] font-semibold text-fg-3 uppercase">{NOTE_TYPE[n.type]}</div>
                      <div className="whitespace-pre-wrap">{n.text}</div>
                      <div className="text-[13px] text-fg-3">{n.createdBy.displayName} · {dateTime(n.createdAt)}</div>
                      {n.response && <div className="mt-1 text-[13.5px] text-fg-2">Risposta di {n.handledBy?.displayName}: {n.response}</div>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`badge ${NOTE_STATUS[n.status][1]}`}>{NOTE_STATUS[n.status][0]}</span>
                      {manage && <HandleButton kind="nota" id={n.id} current={n.status} response={n.response} statuses={Object.entries(NOTE_STATUS).map(([k, v]) => [k, v[0]])} />}
                      {manage && <ActionButton action={deleteShopNote} fields={{ id: n.id }} label="Elimina" className="btn btn-ghost btn-sm" confirm="Eliminare questa proposta?" />}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    );
  }

  return (
    <>
      <PageHeader title="Bottega" subtitle={manage ? "Oggetti in vendita, materie prime e fornitori. Puoi modificare listini e fornitori e gestire le richieste." : "Vendi oggetti della stalla, consulta prezzi e fornitori, chiedi rimborsi."} />
      {shopView && <Tabs active={tab} items={[
        { key: "vendi", href: "/bottega", label: "Nuova vendita" },
        { key: "listino", href: "/bottega?tab=listino", label: "Prezzi oggetti" },
        { key: "materie", href: "/bottega?tab=materie", label: "Materie prime" },
        { key: "fornitori", href: "/bottega?tab=fornitori", label: "Fornitori" },
        { key: "richieste", href: "/bottega?tab=richieste", label: "Rimborsi e proposte", count: openReq || undefined },
      ]} />}
      {body}
    </>
  );
}
