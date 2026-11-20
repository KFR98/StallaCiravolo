"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { ChevronDown, ChevronUp, Crown, Lock, Plus, Search, Shield, Trash2, Users, X } from "lucide-react";
import { ActionForm } from "@/components/ActionForm";
import { Modal } from "@/components/Modal";
import { saveRole, deleteRole, moveRole } from "./actions";

type Access = { mode: "all" | "only" | "except"; breedIds: number[]; rare: boolean; legendary: boolean };
export type RoleData = { key: string; name: string; color: string; system: boolean; members: number; permissions: string[]; access: Access };
export type PermGroup = { name: string; perms: { key: string; label: string; hint?: string }[] };

const COLORS = ["#c8161d", "#ea7a0c", "#d6b25e", "#1f7a3d", "#0f766e", "#1d5f8f", "#3730a3", "#6b21a8", "#be185d", "#78716c"];
const NEW_KEY = "__nuovo__";

export function RolesEditor({ roles, groups, breeds, initial }: { roles: RoleData[]; groups: PermGroup[]; breeds: { id: number; name: string }[]; initial?: string }) {
  const router = useRouter();
  const [sel, setSel] = useState<string>(initial && roles.some((r) => r.key === initial) ? initial : roles[0]?.key ?? NEW_KEY);
  const [copyFrom, setCopyFrom] = useState<string | null>(null);
  const role = roles.find((r) => r.key === sel);
  const template = sel === NEW_KEY ? roles.find((r) => r.key === copyFrom) : role;

  // stato del modulo (ricaricato quando cambia il ruolo scelto)
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[5]);
  const [perms, setPerms] = useState<Set<string>>(new Set());
  const [access, setAccess] = useState<Access>({ mode: "all", breedIds: [], rare: true, legendary: true });
  const [del, setDel] = useState(false);
  useEffect(() => {
    setName(sel === NEW_KEY ? (template ? `${template.name} (copia)` : "") : role?.name ?? "");
    setColor(template?.color ?? COLORS[5]);
    setPerms(new Set(template?.permissions ?? ["map.view"]));
    setAccess(template?.access ?? { mode: "all", breedIds: [], rare: true, legendary: true });
    // si ricarica anche quando arrivano i dati aggiornati dal server (es. subito dopo aver creato il ruolo)
  }, [sel, copyFrom, JSON.stringify(template ?? null)]); // eslint-disable-line react-hooks/exhaustive-deps

  const isOwner = sel === "ADMIN";
  const togglePerm = (k: string) => setPerms((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const toggleGroup = (g: PermGroup, on: boolean) => setPerms((p) => { const n = new Set(p); for (const x of g.perms) if (on) n.add(x.key); else n.delete(x.key); return n; });

  return (
    <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
      {/* Elenco ruoli */}
      <aside className="card h-fit overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="eyebrow">Ruoli · {roles.length}</h3>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => { setCopyFrom(null); setSel(NEW_KEY); }}><Plus size={15} /> Nuovo</button>
        </div>
        <ul className="py-1">
          {roles.map((r, i) => (
            <li key={r.key} className={clsx("group flex items-center border-l-[3px]", sel === r.key ? "border-accent bg-accent-soft" : "border-transparent hover:bg-surface-3")}>
              <button type="button" onClick={() => setSel(r.key)} className="flex min-h-12 min-w-0 flex-1 items-center gap-2.5 py-2 pl-3 text-left">
                <span className="inline-block size-3.5 shrink-0 rounded-full ring-2 ring-white/60" style={{ background: r.color }} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 truncate font-semibold">{r.name}{r.key === "ADMIN" && <Crown size={14} className="text-[#d6b25e]" aria-label="Proprietario" />}</span>
                  <span className="text-[12.5px] text-fg-3">{r.members} {r.members === 1 ? "utente" : "utenti"} · {r.key === "ADMIN" ? "tutti i permessi" : `${r.permissions.length} permessi`}</span>
                </span>
              </button>
              <span className="flex flex-col pr-1 opacity-60 group-hover:opacity-100">
                <button type="button" disabled={i === 0} className="btn btn-ghost btn-icon btn-sm !min-h-6 disabled:opacity-20" onClick={async () => { await moveRole(r.key, -1); router.refresh(); }} aria-label={`Sposta su ${r.name}`}><ChevronUp size={15} /></button>
                <button type="button" disabled={i === roles.length - 1} className="btn btn-ghost btn-icon btn-sm !min-h-6 disabled:opacity-20" onClick={async () => { await moveRole(r.key, 1); router.refresh(); }} aria-label={`Sposta giù ${r.name}`}><ChevronDown size={15} /></button>
              </span>
            </li>
          ))}
          {sel === NEW_KEY && (
            <li className="flex min-h-12 items-center gap-2.5 border-l-[3px] border-accent bg-accent-soft py-2 pl-3 font-semibold">
              <span className="inline-block size-3.5 rounded-full ring-2 ring-white/60" style={{ background: color }} /> {name || "Nuovo ruolo"}
            </li>
          )}
        </ul>
        <p className="border-t border-border px-4 py-3 text-[12.5px] text-fg-3">
          Come su Discord: l&apos;Amministratore è il proprietario e ha sempre tutto. Gli altri ruoli fanno solo quello che spunti qui.
        </p>
      </aside>

      {/* Editor */}
      <ActionForm
        action={saveRole}
        onSuccess={(r) => { const k = (r?.data as { key?: string } | undefined)?.key; if (k) setSel(k); router.refresh(); }}
        className="space-y-5"
      >
        <input type="hidden" name="key" value={sel === NEW_KEY ? "" : sel} />
        <section className="card card-pad space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="h-display flex items-center gap-2 text-[24px]"><Shield size={22} style={{ color }} /> {sel === NEW_KEY ? "Nuovo ruolo" : role?.name}</h2>
            {sel === NEW_KEY && (
              <label className="flex items-center gap-2 text-[14px]">
                Parti da
                <select className="input !min-h-9 !w-auto" value={copyFrom ?? ""} onChange={(e) => setCopyFrom(e.target.value || null)}>
                  <option value="">Nessun permesso</option>
                  {roles.filter((r) => r.key !== "ADMIN").map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
                </select>
              </label>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <label className="block"><span className="field-label">Nome del ruolo</span><input name="name" value={name} onChange={(e) => setName(e.target.value)} className="input" required maxLength={40} placeholder="Es. Visualizzatore, Apprendista…" /></label>
            <div>
              <span className="field-label">Colore</span>
              <input type="hidden" name="color" value={color} />
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Colore del ruolo">
                {COLORS.map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={c} onClick={() => setColor(c)}
                    className={clsx("size-8 rounded-full border-2 transition-transform", color === c ? "scale-110 border-fg" : "border-transparent")} style={{ background: c }} />
                ))}
              </div>
            </div>
          </div>
          {role && sel !== NEW_KEY && <p className="flex items-center gap-1.5 text-[13.5px] text-fg-3"><Users size={15} /> {role.members} utenti attivi con questo ruolo{role.system ? " · ruolo di base" : ""}</p>}
        </section>

        {isOwner ? (
          <section className="card card-pad flex gap-3 text-[14.5px] text-fg-2">
            <Lock size={20} className="mt-0.5 shrink-0 text-[#d6b25e]" />
            <p>L&apos;Amministratore è il proprietario: ha <b>tutti i permessi</b> e vede <b>tutte le razze</b>, sempre. Qui puoi cambiare solo nome e colore. Per sicurezza deve esserci sempre almeno un amministratore attivo.</p>
          </section>
        ) : (
          <>
            <section className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-border px-5 py-3">
                <h3 className="h-display text-[18px]">Permessi</h3>
                <span className="text-[13.5px] text-fg-3">{perms.size} attivi</span>
              </div>
              <div className="divide-y divide-border">
                {groups.map((g) => {
                  const on = g.perms.filter((p) => perms.has(p.key)).length;
                  return (
                    <fieldset key={g.name} className="px-5 py-3">
                      <legend className="sr-only">{g.name}</legend>
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="eyebrow">{g.name} · {on}/{g.perms.length}</span>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => toggleGroup(g, on < g.perms.length)}>{on < g.perms.length ? "Attiva tutti" : "Togli tutti"}</button>
                      </div>
                      <div className="grid gap-x-6 sm:grid-cols-2">
                        {g.perms.map((p) => (
                          <label key={p.key} className="flex cursor-pointer items-start gap-3 rounded-md py-1.5">
                            <input type="checkbox" name="perm" value={p.key} checked={perms.has(p.key)} onChange={() => togglePerm(p.key)} className="peer sr-only" />
                            <span aria-hidden="true" className={clsx("mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-accent", perms.has(p.key) ? "bg-[#1f7a3d]" : "bg-surface-3 ring-1 ring-border-strong")}>
                              <span className={clsx("size-4 rounded-full bg-white shadow transition-transform", perms.has(p.key) && "translate-x-4")} />
                            </span>
                            <span className="text-[14.5px] leading-snug">
                              {p.label}
                              {p.hint && <span className="block text-[12.5px] text-fg-3">{p.hint}</span>}
                            </span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  );
                })}
              </div>
            </section>

            <BreedAccessEditor access={access} setAccess={setAccess} breeds={breeds} />
          </>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-primary">{sel === NEW_KEY ? "Crea ruolo" : "Salva ruolo"}</button>
          {sel === NEW_KEY && <button type="button" className="btn btn-ghost" onClick={() => setSel(roles[0]?.key ?? NEW_KEY)}>Annulla</button>}
          {role && !isOwner && sel !== NEW_KEY && (
            <button type="button" className="btn btn-ghost ml-auto text-accent-text" onClick={() => setDel(true)}><Trash2 size={16} /> Elimina ruolo</button>
          )}
        </div>
      </ActionForm>

      {role && (
        <Modal open={del} onClose={() => setDel(false)} title={`Eliminare “${role.name}”?`}>
          <ActionForm action={deleteRole} onSuccess={() => { setDel(false); setSel(roles[0]?.key ?? NEW_KEY); router.refresh(); }} className="space-y-3">
            <input type="hidden" name="key" value={role.key} />
            {role.members > 0 ? (
              <label className="block">
                <span className="field-label">{role.members} utenti hanno questo ruolo: a quale ruolo li sposto?</span>
                <select name="moveTo" className="input" required defaultValue="">
                  <option value="" disabled>Scegli…</option>
                  {roles.filter((r) => r.key !== role.key && r.key !== "ADMIN").map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
                </select>
              </label>
            ) : <p className="text-fg-2">Nessun utente ha questo ruolo.</p>}
            <button className="btn btn-danger w-full">Elimina ruolo</button>
          </ActionForm>
        </Modal>
      )}
    </div>
  );
}

function BreedAccessEditor({ access, setAccess, breeds }: { access: Access; setAccess: (a: Access) => void; breeds: { id: number; name: string }[] }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => breeds.filter((b) => !q || b.name.toLowerCase().includes(q.toLowerCase())), [breeds, q]);
  const selected = new Set(access.breedIds);
  const toggle = (id: number) => setAccess({ ...access, breedIds: selected.has(id) ? access.breedIds.filter((x) => x !== id) : [...access.breedIds, id] });
  const visibleCount = access.mode === "all" ? breeds.length : access.mode === "only" ? selected.size : breeds.length - selected.size;
  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h3 className="h-display text-[18px]">Razze visibili</h3>
        <span className="text-[13.5px] text-fg-3">{visibleCount} di {breeds.length}</span>
      </div>
      <div className="space-y-4 p-5">
        <p className="text-[14px] text-fg-2">Vale per mappa, catalogo, listino e confronto. Stalla e vendite restano complete per chi può vederle.</p>
        <input type="hidden" name="mode" value={access.mode} />
        {access.mode !== "all" && access.breedIds.map((id) => <input key={id} type="hidden" name="breed" value={id} />)}
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-surface-3 p-1" role="radiogroup" aria-label="Razze visibili">
          {([["all", "Tutte le razze"], ["only", "Solo queste"], ["except", "Tutte tranne"]] as const).map(([m, l]) => (
            <button key={m} type="button" role="radio" aria-checked={access.mode === m} onClick={() => setAccess({ ...access, mode: m })}
              className={clsx("min-h-10 rounded-md text-[14px] font-semibold transition-colors", access.mode === m ? "bg-surface text-fg shadow-sm" : "text-fg-3 hover:text-fg")}>{l}</button>
          ))}
        </div>
        {access.mode !== "all" && (
          <div>
            <label className="input mb-2 flex items-center gap-2 !py-1.5">
              <Search size={16} className="text-fg-3" aria-hidden="true" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca razza…" className="min-w-0 flex-1 bg-transparent outline-none focus-visible:!outline-none" aria-label="Cerca razza" />
              {q && <button type="button" onClick={() => setQ("")} aria-label="Svuota"><X size={15} /></button>}
            </label>
            <div className="flex max-h-[260px] flex-wrap gap-1.5 overflow-y-auto">
              {shown.map((b) => (
                <button key={b.id} type="button" className="chip" aria-pressed={selected.has(b.id)} onClick={() => toggle(b.id)}>{b.name}</button>
              ))}
            </div>
            <p className="mt-2 text-[13px] text-fg-3">{access.mode === "only" ? "Le razze evidenziate sono le sole visibili." : "Le razze evidenziate vengono nascoste."}</p>
          </div>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          {([["rare", "Vede i cavalli rari"], ["legendary", "Vede i cavalli leggendari"]] as const).map(([k, l]) => (
            <label key={k} className={clsx("flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2.5", access[k] ? "border-accent bg-accent-soft" : "border-border")}>
              <span className="font-semibold">{l}</span>
              <input type="checkbox" name={k} checked={access[k]} onChange={(e) => setAccess({ ...access, [k]: e.target.checked })} className="size-4" />
            </label>
          ))}
        </div>
      </div>
    </section>
  );
}
