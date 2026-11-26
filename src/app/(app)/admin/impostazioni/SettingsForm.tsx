"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { NAV_CHOICES } from "@/lib/nav-keys";
import { ActionForm } from "@/components/ActionForm";
import { STABLE_SORTS } from "../../stalla/sorts";
import { saveSettings } from "../actions";
import { DISCORD_STYLES } from "@/components/DiscordLink";
import type { Settings } from "@/lib/settings";

const EVERY = [
  [6, "Ogni 6 ore"],
  [12, "Ogni 12 ore"],
  [24, "Una volta al giorno"],
  [48, "Ogni 2 giorni"],
  [168, "Una volta a settimana"],
] as const;

const slug = (t: string) => "imp-" + t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const SECTIONS = ["Generale", "Età dei cavalli", "Stalla", "Telefono: barra in basso", "Menu: numerini delle cose da fare", "Strillone", "Catture", "Prezzi e sconti", "Gravidanza e puledri", "Cavalli rari e leggendari", "Vendita: ferri", "Stipendi (percentuali globali)", "Cassa", "Clienti", "Etichette delle vendite", "Stalliere della settimana (punti)", "Sicurezza e accesso", "Backup automatico"];

export function SettingsForm({ s, inStable, shopItems, roles }: { s: Settings; inStable: number; shopItems: { id: number; name: string }[]; roles: { key: string; name: string }[] }) {
  const [auto, setAuto] = useState(s.backupAuto);
  const [q, setQ] = useState("");
  const [hidden, setHidden] = useState<string[]>([]);
  const formRef = useRef<HTMLDivElement>(null);
  // ricerca: nasconde le sezioni che non contengono le parole cercate (titoli, spiegazioni, nomi dei campi)
  useEffect(() => {
    const root = formRef.current;
    if (!root) return;
    const words = q.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/\s+/).filter(Boolean);
    const out: string[] = [];
    root.querySelectorAll<HTMLElement>("section[data-imp]").forEach((sec) => {
      const text = (sec.textContent ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const show = words.every((w) => text.includes(w));
      sec.hidden = !show;
      if (!show) out.push(sec.id);
    });
    setHidden(out);
  }, [q]);
  const everyOptions = EVERY.some(([h]) => h === s.backupEveryHours) ? EVERY : [...EVERY, [s.backupEveryHours, `Ogni ${s.backupEveryHours} ore`] as const];
  return (
    <ActionForm
      action={saveSettings}
      confirm={(fd) =>
        Number(fd.get("daysPerYear")) !== s.daysPerYear
          ? `Stai cambiando l'avanzamento dell'età da ${s.daysPerYear} a ${fd.get("daysPerYear")} giorni per anno.\nL'età già maturata dai ${inStable} cavalli in stalla viene conservata. Confermi?`
          : null
      }
      className="grid grid-cols-1 gap-6 lg:grid-cols-[210px_minmax(0,1fr)]"
    >
      <nav aria-label="Sezioni delle impostazioni" className="min-w-0 lg:sticky lg:top-6 lg:self-start">
        <div className="relative mb-3">
          <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" aria-hidden="true" />
          <input className="input !pl-9" placeholder="Trova impostazione…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }} aria-label="Trova impostazione" />
        </div>
        <ul className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:gap-0.5 lg:overflow-visible">
          {SECTIONS.map((t) => (
            <li key={t} className={hidden.includes(slug(t)) ? "hidden" : ""}>
              <a href={`#${slug(t)}`} className="block rounded-md px-2.5 py-1.5 text-[13.5px] whitespace-nowrap text-fg-2 hover:bg-surface-2 hover:text-fg lg:whitespace-normal">{t}</a>
            </li>
          ))}
        </ul>
        {q && hidden.length === SECTIONS.length && <p className="mt-2 text-[13px] text-fg-3">Nessuna impostazione trovata.</p>}
      </nav>
      <div ref={formRef} className="min-w-0 space-y-7">
      <Section title="Generale">
        <label className="block sm:col-span-2"><span className="field-label">Nome della stalla</span><input name="stableName" defaultValue={s.stableName} className="input" required /></label>
        <label className="block sm:col-span-2">
          <span className="field-label">Link d&apos;invito al server Discord</span>
          <input name="discordUrl" defaultValue={s.discordUrl} className="input" inputMode="url" placeholder="https://discord.gg/…" maxLength={200} />
          <span className="mt-1 block text-[13px] text-fg-3">Il logo Discord compare nel menu e nella pagina di accesso. Lascia vuoto per nasconderlo.</span>
        </label>
        <label className="block">
          <span className="field-label">Colore del pulsante Discord</span>
          <select name="discordStyle" defaultValue={s.discordStyle} className="input">
            {DISCORD_STYLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <span className="mt-1 block text-[13px] text-fg-3">Con il tema chiaro, nella pagina di accesso l&apos;avorio diventa nero per leggersi meglio.</span>
        </label>
      </Section>

      <Section title="Età dei cavalli" hint="L'età avanza da sola dalla data di inserimento. Se cambi il ritmo, l'età già maturata non si azzera.">
        <Num name="daysPerYear" label="Giorni reali per 1 anno" value={s.daysPerYear} step="any" min="0.01" />
        <Num name="defaultCaptureAge" label="Età proposta alla cattura" value={s.defaultCaptureAge} step="any" min="0" />
        <Num name="minSaleAge" label="Età minima per vendere" value={s.minSaleAge} step="any" min="0" />
      </Section>

      <Section title="Stalla" hint="Come si presenta l'elenco dei cavalli all'apertura. Ognuno può cambiare ordine e filtri, e il suo browser se li ricorda.">
        <label className="block">
          <span className="field-label">Ordinamento predefinito</span>
          <select name="stableDefaultSort" defaultValue={s.stableDefaultSort} className="input">
            {STABLE_SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
      </Section>

      <Section title="Telefono: barra in basso" hint="Le 4 voci sempre visibili in basso sul telefono. Chi non ha accesso a una voce vede al suo posto la successiva del menu.">
        {[0, 1, 2, 3].map((i) => (
          <label key={i} className="block">
            <span className="field-label">Posizione {i + 1}</span>
            <select name={`mobileNav_${i}`} defaultValue={s.mobileNav[i] ?? NAV_CHOICES[i][0]} className="input">
              {NAV_CHOICES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
        ))}
      </Section>

      <Section title="Notifiche: numerini, campanella e pallini" hint="Le notifiche sono le cose da fare: compaiono come numerino accanto alla voce del menu, nell'elenco della campanella (con il link alla schermata esatta) e come pallino rosso accanto alla cosa precisa. Ognuno vede solo quelle delle sezioni a cui ha accesso; spariscono da sole quando la cosa è sistemata. Chi vede la campanella si decide anche in Ruoli.">
        {([
          ["navBadge_stalla", "Stalla: parti da fare e puledri senza dati", s.navBadges.stalla],
          ["navBadge_bottega", "Bottega: rimborsi e proposte da gestire", s.navBadges.bottega],
          ["navBadge_bacheca", "Bacheca: prenotazioni assegnate ancora aperte", s.navBadges.bacheca],
          ["navBadge_personale", "Personale: stipendi arretrati", s.navBadges.personale],
          ["navBadge_admin", "Amministrazione: Alarm e Critico del registro", s.navBadges.admin],
          ["notifyBell", "Mostra la campanella con l'elenco delle notifiche", s.notifyBell],
          ["notifyDots", "Mostra il pallino rosso accanto alla cosa precisa sulle pagine", s.notifyDots],
          ["notifyAuditOwn", "Registro: avvisa anche delle proprie operazioni Alarm/Critico", s.notifyAuditOwn],
        ] as const).map(([n, l, v]) => (
          <label key={n} className="flex min-h-10 items-center gap-3 rounded-lg border border-border px-3">
            <input type="checkbox" name={n} defaultChecked={v} />
            <span className="text-[14px]">{l}</span>
          </label>
        ))}
        <Num name="notifyListMax" label="Voci al massimo per sezione nella campanella" value={s.notifyListMax} step="1" min="1" max="100" />
        <Num name="notifyAuditHours" label="Ore in cui restano le notifiche Alarm/Critico" value={s.notifyAuditHours} step="1" min="1" max="720" />
        <Num name="notifyRefreshSeconds" label="Aggiornamento automatico (secondi, 0 = spento)" value={s.notifyRefreshSeconds} step="1" min="0" max="3600" />
      </Section>

      <Section title="Confronto cavalli" hint="In Catalogo e prezzi → Confronto cavalli si mettono i cavalli uno accanto all'altro.">
        <Num name="compareMax" label="Cavalli confrontabili insieme" value={s.compareMax} step="1" min="2" max="8" />
      </Section>

      <Section title="Strillone" hint="L'annuncio personale che ognuno salva nell'Ufficio e copia in gioco quando la stalla è aperta.">
        <Num name="shoutMaxLength" label="Lunghezza massima (caratteri)" value={s.shoutMaxLength} step="1" min="20" />
      </Section>

      <Section title="Catture" hint="Data e ora della cattura sono di base il momento della registrazione, ma si possono retrodatare (es. cavallo registrato in ritardo). Qui scegli fino a quanti giorni indietro.">
        <Num name="captureBackdateDays" label="Dipendenti: fino a (giorni fa)" value={s.captureBackdateDays} step="1" min="0" />
        <Num name="captureBackdateDaysAdmin" label="Chi corregge i dati: fino a (giorni fa)" value={s.captureBackdateDaysAdmin} step="1" min="0" />
      </Section>

      <Section title="Prezzi e sconti" hint="Oltre la seconda fascia il prezzo è libero. Direttore e admin non hanno limite di sconto.">
        <Num name="bracketAMax" label='Fascia "5-10": fino a (anni)' value={s.bracketAMax} step="1" min="0" />
        <Num name="bracketBMax" label='Fascia "11-16": fino a (anni)' value={s.bracketBMax} step="1" min="0" />
        <Num name="maxDiscountPercent" label="Sconto massimo dipendenti %" value={s.maxDiscountPercent} step="any" min="0" max="100" />
      </Section>

      <Section title="Gravidanza e puledri" hint="Dopo questi giorni l'etichetta INCINTA diventa FAI PARTORIRE (anche con decimali, es. 2,5). Ogni parto crea un puledro in stalla.">
        <Num name="pregnancyDays" label="Giorni prima di “Fai partorire”" value={s.pregnancyDays} step="any" min="0.1" />
        <Num name="maxFoals" label="Parti massimi per cavalla" value={s.maxFoals} step="1" min="0" />
        <Num name="foalMaxAge" label="Puledro fino a (anni, escluso)" value={s.foalMaxAge} step="any" min="0" />
        <Num name="foalBirthMaxDays" label="Nascita del puledro impostabile fino a (giorni fa)" value={s.foalBirthMaxDays} step="1" min="1" />
      </Section>

      <Section title="Cavalli rari e leggendari" hint="Si vendono a prezzo libero: questi sono i valori proposti nel modulo di vendita, che il venditore può cambiare.">
        <Num name="rareBasePrice" label="Prezzo base di riferimento $" value={s.rareBasePrice} step="any" min="0" />
        <Num name="rareTrainingPrice" label="Addestramento $" value={s.rareTrainingPrice} step="any" min="0" />
        <Color name="rareColor" label="Colore dei rari" value={s.rareColor} />
        <Color name="legendaryColor" label="Colore dei leggendari" value={s.legendaryColor} />
      </Section>

      <Section title="Vendita: ferri" hint="Gli oggetti della bottega proposti come scorciatoia “4 ferri normali” e “4 ferri migliorati” nella cassa, quando si vende un cavallo. “Automatico” li riconosce dal nome.">
        {([["shoeClassicItemId", "4 ferri normali", s.shoeClassicItemId], ["shoeImprovedItemId", "4 ferri migliorati", s.shoeImprovedItemId]] as const).map(([n, l, v]) => (
          <label key={n} className="block">
            <span className="field-label">{l}</span>
            <select name={n} defaultValue={v} className="input">
              <option value={0}>Automatico (dal nome)</option>
              {shopItems.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </label>
        ))}
      </Section>

      <Section title="Stipendi (percentuali globali)" hint="Ogni tipo di vendita ha la sua percentuale. Quelle personali si impostano dalla scheda stipendi del dipendente. Le settimane già pagate non cambiano.">
        <Num name="pctStable" label="Vendite in stalla %" value={s.pctStable} step="any" min="0" max="100" />
        <Num name="pctGov" label="Vendite al blip %" value={s.pctGov} step="any" min="0" max="100" />
        <Num name="pctItems" label="Vendite oggetti %" value={s.pctItems} step="any" min="0" max="100" />
        <label className="block">
          <span className="field-label">Addestramenti venduti in bottega</span>
          <select name="trainingPayrollCategory" defaultValue={s.trainingPayrollCategory} className="input">
            <option value="stable">Contano come vendite in stalla</option>
            <option value="items">Contano come vendite oggetti</option>
          </select>
        </label>
      </Section>

      <Section title="Cassa" hint="Cosa entra ed esce da solo dalla cassa. Prelievi, versamenti e allineamenti si fanno dalla pagina Cassa.">
        {([["cashCountGov", "Le vendite al blip entrano in cassa", s.cashCountGov], ["cashCountPayroll", "Gli stipendi pagati escono dalla cassa", s.cashCountPayroll], ["cashCountReimbursements", "I rimborsi pagati escono dalla cassa", s.cashCountReimbursements]] as const).map(([n, l, v]) => (
          <label key={n} className="flex min-h-10 items-center gap-3 rounded-lg border border-border px-3">
            <input type="checkbox" name={n} defaultChecked={v} />
            <span className="text-[14px]">{l}</span>
          </label>
        ))}
      </Section>

      <Section title="Clienti" hint="La rubrica clienti si trova in Bacheca → Rubrica clienti.">
        <label className="flex min-h-10 items-center gap-3 rounded-lg border border-border px-3 sm:col-span-2">
          <input type="checkbox" name="customersAutoCreate" defaultChecked={s.customersAutoCreate} />
          <span className="text-[14px]">Aggiungi da solo alla rubrica chi compra o prenota (se non c&apos;è già)</span>
        </label>
      </Section>

      <Section title="Etichette delle vendite" hint="Il colore di ogni etichetta nella pagina Vendite, in bottega e nelle fatture.">
        <Color name="saleColor_cavallo" label="Cavallo" value={s.saleLabelColors.cavallo} />
        <Color name="saleColor_addestramento" label="Addestramento" value={s.saleLabelColors.addestramento} />
        <Color name="saleColor_vetrina" label="Vetrina (oggetti)" value={s.saleLabelColors.vetrina} />
        <Color name="saleColor_blip" label="Blip (Governo)" value={s.saleLabelColors.blip} />
      </Section>

      <Section title="Stalliere della settimana (punti)" hint="Come si calcola la classifica: punti per ogni cattura e vendita, più punti per ogni $100 incassati (cavalli e oggetti).">
        <Num name="scoreCapture" label="Per cattura" value={s.scoreCapture} step="any" min="0" />
        <Num name="scoreStableSale" label="Per vendita in stalla" value={s.scoreStableSale} step="any" min="0" />
        <Num name="scoreGovSale" label="Per vendita al blip" value={s.scoreGovSale} step="any" min="0" />
        <Num name="scoreItemSale" label="Per vendita di oggetti" value={s.scoreItemSale} step="any" min="0" />
        <Num name="scorePer100" label="Ogni $100 incassati" value={s.scorePer100} step="any" min="0" />
      </Section>

      <Section title="Sicurezza e accesso" hint="Blocco dei tentativi di accesso sbagliati (per chi prova a indovinare le password) e durata della sessione prima di dover rientrare.">
        <Num name="loginMaxAttempts" label="Tentativi sbagliati (stesso IP e utente)" value={s.loginMaxAttempts} step="1" min="1" />
        <Num name="loginLockMinutes" label="…poi blocco per (minuti)" value={s.loginLockMinutes} step="1" min="1" />
        <Num name="loginMaxAttemptsUser" label="Tentativi sbagliati (stesso utente, qualsiasi IP)" value={s.loginMaxAttemptsUser} step="1" min="1" />
        <Num name="loginUserLockMinutes" label="…poi blocco per (minuti)" value={s.loginUserLockMinutes} step="1" min="1" />
        <Num name="sessionDays" label="Durata della sessione (giorni)" value={s.sessionDays} step="any" min="0.1" />
        <Num name="maxImageMB" label="Dimensione massima delle foto (MB)" value={s.maxImageMB} step="any" min="0.5" max="50" />
        <fieldset className="rounded-lg border border-border p-3 sm:col-span-3">
          <legend className="px-1 text-[13px] font-semibold text-fg-2">Doppia verifica obbligatoria (codice a 6 cifre dall&apos;app) per</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {roles.map((r) => (
              <label key={r.key} className="flex items-center gap-2 text-[14px]">
                <input type="checkbox" name="twoFactorRoles" value={r.key} defaultChecked={s.twoFactorRoles.includes(r.key)} /> {r.name}
              </label>
            ))}
          </div>
          <p className="mt-2 text-[12.5px] text-fg-3">Chi non l&apos;ha ancora attivata la attiva al prossimo accesso (viene fatto uscire subito). Tutti possono attivarla comunque dal proprio profilo. Emergenza: file <code>data/2fa-off</code>.</p>
        </fieldset>
        <label className="flex min-h-10 items-start gap-3 rounded-lg border border-border px-3 py-2.5 sm:col-span-2">
          <input type="checkbox" name="auditIpAll" defaultChecked={s.auditIpAll} className="mt-1" />
          <span>
            <span className="block font-semibold">Registra l&apos;IP per ogni operazione</span>
            <span className="block text-[13px] text-fg-3">Gli accessi (riusciti e falliti) registrano sempre IP e browser. Con questa opzione l&apos;IP viene salvato anche per vendite, modifiche, eliminazioni… così puoi confrontare il registro con i log del server.</span>
          </span>
        </label>
      </Section>

      <Section title="Backup automatico" hint="Il gestionale salva da solo una copia completa del database. I backup più vecchi del periodo scelto vengono eliminati (resta sempre almeno l'ultimo).">
        <label className="flex min-h-10 items-center gap-3 self-end rounded-lg border border-border px-3">
          <input type="checkbox" name="backupAuto" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          <span className="font-semibold">{auto ? "Attivo" : "Disattivato"}</span>
        </label>
        <label className="block">
          <span className="field-label">Frequenza</span>
          <select name="backupEveryHours" defaultValue={s.backupEveryHours} className="input" disabled={!auto}>
            {everyOptions.map(([h, l]) => <option key={h} value={h}>{l}</option>)}
          </select>
          {!auto && <input type="hidden" name="backupEveryHours" value={s.backupEveryHours} />}
        </label>
        <Num name="backupDays" label="Conserva i backup per (giorni)" value={s.backupDays} step="1" min="1" />
      </Section>

      <div className="sticky bottom-0 -mx-4 border-t border-border bg-surface px-4 py-3 sm:-mx-5 sm:px-5">
        <div className="sticky bottom-20 z-10 flex justify-end lg:bottom-4">
          <button className="btn btn-primary shadow-lg">Salva impostazioni</button>
        </div>
      </div>
      </div>
    </ActionForm>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section id={slug(title)} data-imp className="scroll-mt-20 border-b border-border pb-6 last-of-type:border-0">
      <div className="mb-1 flex items-start justify-between gap-3">
        <h3 className="h-display text-[18px]">{title}</h3>
        {/* salva tutte le impostazioni (anche quelle delle altre sezioni): comodo per non scorrere fino in fondo */}
        <button className="btn btn-ghost btn-sm shrink-0" title="Salva le impostazioni">Salva</button>
      </div>
      {hint && <p className="mb-3 max-w-3xl text-[13.5px] text-fg-3">{hint}</p>}
      <div className="grid gap-4 sm:grid-cols-3">{children}</div>
    </section>
  );
}

function Num({ name, label, value, step, min, max }: { name: string; label: string; value: number; step: string; min?: string; max?: string }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <input name={name} type="number" inputMode="decimal" defaultValue={value} step={step} min={min} max={max} className="input" required />
    </label>
  );
}

function Color({ name, label, value }: { name: string; label: string; value: string }) {
  const [v, setV] = useState(value);
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <span className="flex items-center gap-2">
        <input type="color" value={v} onChange={(e) => setV(e.target.value)} className="h-10 w-14 cursor-pointer rounded-lg border border-border-strong bg-surface p-1" aria-label={label} />
        <input name={name} value={v} onChange={(e) => setV(e.target.value)} pattern="#[0-9a-fA-F]{6}" className="input font-mono" required />
      </span>
    </label>
  );
}
