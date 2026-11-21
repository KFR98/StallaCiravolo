# Gestionale Stalla Ciravolo — regole per chi modifica il codice

## Regola principale: tutto configurabile dal pannello admin
Il proprietario vuole **massima elasticità senza toccare il codice**. Per ogni funzione nuova o modificata:

- **Nessun numero, prezzo, limite, durata, colore o soglia scritto fisso nel codice.** Ogni valore che qualcuno
  potrebbe voler cambiare va in `DEFAULT_SETTINGS` (`src/lib/settings.ts`), con un commento in italiano,
  e diventa un campo in **Amministrazione → Impostazioni** (`src/app/(app)/admin/impostazioni/SettingsForm.tsx`)
  con la sua validazione in `saveSettings` (`src/app/(app)/admin/actions.ts`).
- **Ogni nuova azione o pagina ha il suo permesso** in `src/lib/permissions.ts` (gruppo, etichetta chiara, `defaults`),
  così compare nel pannello **Ruoli**. Se un permesso nuovo va dato ai ruoli già esistenti, aggiungi la chiave a
  `ADDED_LATER` in `src/lib/roles-seed.ts`: viene assegnato una sola volta ai ruoli di base indicati nei `defaults`.
- **Le scelte "di default" devono essere sovrascrivibili**: proponi un valore, ma lascia sempre la possibilità di
  cambiarlo (in Impostazioni, nel modulo, o con un permesso per farlo).
- Le correzioni ai dati (date, conteggi, età…) devono avere un modo per essere sistemate dal pannello, con traccia
  nel registro attività (`audit`).

## Altre convenzioni
- Interfaccia e messaggi in **italiano**, semplici, per utenti non tecnici.
- I controlli di permesso si fanno **sempre lato server** (`assertPermission` / `requireUser`), non solo nascondendo i pulsanti.
- I prezzi e i totali si calcolano sul server dal database, mai fidandosi dei valori inviati dal browser.
- Database: Prisma + SQLite. Per cambiare lo schema aggiungi una migrazione in `prisma/migrations/` (SQL a mano se serve).
- Dopo ogni modifica: `npx tsc --noEmit`, `npm run lint`, `npm test`, e prova nel browser se tocca l'interfaccia.
