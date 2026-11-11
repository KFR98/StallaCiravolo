import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { money, dateTime } from "@/lib/format";
import { PageHeader, Card, Tabs, Empty } from "@/components/ui";
import { ShopSell, ItemTable, SupplierTable, HandleButton, type ShopItemRow } from "./ShopClient";
import { NoteForm, ReimbursementForm } from "./RequestForms";

export const metadata = { title: "Bottega" };

const NOTE_TYPE = { NUOVO_FORNITORE: "Nuovo fornitore", MODIFICA_PROPOSTA: "Modifica proposta", NOTA: "Nota" } as const;
const NOTE_STATUS = { APERTA: ["Aperta", "badge-warn"], ACCOLTA: ["Accolta", "badge-ok"], RESPINTA: ["Respinta", "badge-neutral"] } as const;
const REIMB_STATUS = { RICHIESTO: ["Richiesto", "badge-warn"], APPROVATO: ["Approvato", "badge-info"], PAGATO: ["Pagato", "badge-ok"], RESPINTO: ["Respinto", "badge-neutral"] } as const;

export default async function ShopPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser("shop.view");
  const sp = await searchParams;
  const manage = can(user.role, "shop.manage");
  const tab = ["vendi", "listino", "materie", "fornitori", "richieste"].includes(sp.tab ?? "") ? sp.tab! : "vendi";
  const [items, openReq] = await Promise.all([
    prisma.shopItem.findMany({ where: { archived: false }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    manage ? prisma.reimbursement.count({ where: { status: { in: ["RICHIESTO", "APPROVATO"] } } }).then(async (n) => n + (await prisma.shopNote.count({ where: { status: "APERTA" } }))) : Promise.resolve(undefined),
  ]);
  const rows: ShopItemRow[] = items.map((i) => ({ id: i.id, kind: i.kind, name: i.name, group: i.group, price: i.price == null ? null : Number(i.price), priceNote: i.priceNote, notes: i.notes }));

  let body: React.ReactNode = null;
  if (tab === "vendi") {
    const recent = await prisma.itemSale.findMany({ where: manage ? {} : { sellerId: user.id }, orderBy: { soldAt: "desc" }, take: 8, include: { lines: true } });
    body = (
      <>
        {can(user.role, "shop.sell") && <ShopSell items={rows.filter((r) => r.kind === "VENDITA")} />}
        <Card title="Ultime vendite di oggetti" className="mt-5">
          {recent.length === 0 ? <Empty>Nessuna vendita di oggetti.</Empty> : (
            <ul className="divide-y divide-border">
              {recent.map((s) => (
                <li key={s.id} className={`flex flex-wrap items-center justify-between gap-2 py-2.5 ${s.voided ? "opacity-50 line-through" : ""}`}>
                  <div className="min-w-0">
                    <div className="truncate font-medium">{s.lines.map((l) => `${l.quantity}× ${l.itemName}`).join(", ")}</div>
                    <div className="text-[13px] text-fg-3">{dateTime(s.soldAt)} · {s.sellerName}{s.buyerName ? ` · a ${s.buyerName}` : ""}</div>
                  </div>
                  <b className="tabular-nums">{money(s.total)}</b>
                </li>
              ))}
            </ul>
          )}
        </Card>
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
      <Tabs active={tab} items={[
        { key: "vendi", href: "/bottega", label: "Vendi oggetti" },
        { key: "listino", href: "/bottega?tab=listino", label: "Prezzi oggetti" },
        { key: "materie", href: "/bottega?tab=materie", label: "Materie prime" },
        { key: "fornitori", href: "/bottega?tab=fornitori", label: "Fornitori" },
        { key: "richieste", href: "/bottega?tab=richieste", label: "Rimborsi e proposte", count: openReq || undefined },
      ]} />
      {body}
    </>
  );
}
