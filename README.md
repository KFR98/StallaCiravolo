# Stalla Ciravolo – Gestionale

Gestionale web per la stalla del server RedM: catalogo cavalli, confronto e listino,
catture, vendite (stalla e blip del Governo), passaggi tra stallieri, gravidanze,
avanzamento età, mappa degli spawn con percorsi, bacheca, bottega (oggetti, materie prime,
fornitori, rimborsi), statistiche dei dipendenti, stipendi settimanali, amministrazione e
registro attività. Tema scuro e chiaro in stile Red Dead Redemption 2.

- **Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Prisma 6 · SQLite
- **Autenticazione:** sessioni salvate nel database (cookie httpOnly), password con Argon2id
- **Permessi:** verificati sul server a ogni pagina, azione e API (`src/lib/permissions.ts`)

> **Database integrato:** il database è un file SQLite (`data/stalla.db`) dentro la cartella del
> server. Il gestionale è autonomo: non serve installare né configurare MySQL sulla macchina e
> non tocca il database del pannello. SQLite è in modalità WAL (letture e scritture contemporanee)
> e ogni operazione economica è in una transazione. Se un giorno servirà un database esterno basta
> cambiare `provider` in `prisma/schema.prisma` e rigenerare le migrazioni.

---

## Indice
1. [Funzioni e ruoli](#1-funzioni-e-ruoli)
2. [Installazione su Pterodactyl (consigliata)](#2-installazione-su-pterodactyl)
3. [Dominio dedicato (FQDN) e HTTPS](#3-dominio-dedicato-fqdn-e-https)
4. [Installazione su un server normale / in locale](#4-installazione-su-un-server-normale--in-locale)
5. [Database: migrazioni, backup e ripristino](#5-database-migrazioni-backup-e-ripristino)
6. [Listino Excel e foto dei cavalli](#6-listino-excel-e-foto-dei-cavalli)
7. [Regole di calcolo](#7-regole-di-calcolo)
8. [Struttura del progetto](#8-struttura-del-progetto)
9. [Sicurezza](#9-sicurezza)
10. [Test](#10-test)

---

## 1. Funzioni e ruoli

| Funzione | Admin | Direttore | Gestore | Dipendente |
|---|:-:|:-:|:-:|:-:|
| Ufficio (dashboard) | completa | completa | completa | risultati personali |
| Catalogo, confronto cavalli, listino | ✔ | ✔ | ✔ | ✔ |
| Registrare catture (deposito / vendita al blip) | ✔ | ✔ | ✔ | ✔ |
| Vendere, passare ad altri, gestire la gravidanza dei **propri** cavalli | ✔ | ✔ | ✔ | ✔ |
| Le stesse operazioni sui cavalli **di altri** stallieri | ✔ | ✔ | – | – |
| Cambiare il prezzo di listino, sconto senza limite | ✔ | ✔ | – | – |
| Registro vendite | tutte | tutte | tutte | solo le proprie |
| Modificare dati operativi del cavallo / uscita dalla stalla | ✔ | ✔ | ✔ | – |
| Correggere età, razza, manto, catturatore | ✔ | – | – | – |
| Correggere / annullare vendite | ✔ | – | – | – |
| Mappa: vedere, aggiungere cavalli, possibili cavalli e note, tracciare percorsi | ✔ | ✔ | ✔ | ✔ (modifica i propri) |
| Mappa: tasto "Modifica" per spostare i segnaposto, eliminare | ✔ | ✔ | ✔ | – |
| Bottega: vendere oggetti, chiedere rimborsi, proporre fornitori | ✔ | ✔ | ✔ | ✔ |
| Bottega: modificare prezzi, materie prime, fornitori; gestire rimborsi e proposte | ✔ | ✔ | ✔ | – |
| Bacheca (note e prenotazioni) | ✔ | ✔ | ✔ | ✔ |
| Eliminare note della bacheca e proposte della bottega | ✔ | ✔ | ✔ | – |
| Profilo personale con storico e totali | ✔ | ✔ | ✔ | ✔ |
| Personale: statistiche | ✔ | ✔ | elenco | – |
| Stipendi (paga, storico) | ✔ | ✔ | – | – |
| Registro attività | ✔ | ✔ | – | – |
| Utenti (anche eliminazione completa), catalogo, impostazioni, import, backup | ✔ | – | – | – |

---

## 2. Installazione su Pterodactyl

Il gestionale gira come un normale "server" del pannello, con un **egg** dedicato
(`deploy/pterodactyl/egg-stalla-ciravolo.json`).

### 2.1 Importa l'egg (una volta sola)
1. Pannello admin → **Nests** → *Create New* (es. "Web") oppure usa un nest esistente.
2. Nel nest → **Import Egg** → carica `deploy/pterodactyl/egg-stalla-ciravolo.json`.

### 2.2 Crea il server
1. Admin → **Servers → Create New**: scegli il nest e l'egg *Stalla Ciravolo*.
2. Risorse consigliate: **RAM 1536 MB** (la prima compilazione ne usa ~1 GB, poi ne bastano ~300 MB),
   disco 3 GB, 1 allocazione (porta), immagine *Node.js 22*. **Databases: 0** (non serve).
3. Nelle variabili:
   - `Repository Git`: `https://github.com/KFR98/StallaCiravolo`
   - se il repository è **privato**: `Utente GitHub` + `Token GitHub` (token di sola lettura)
   - `Database (avanzato, opzionale)`: **lascialo vuoto**
   - `Password admin iniziale`: scegline una (oppure lasciala vuota: verrà generata e scritta in console).
4. Crea il server: lo script di installazione scarica il codice.

### 2.3 Database
Non c'è nulla da fare: al primo avvio viene creato il file `data/stalla.db` dentro il server.
Non usa MySQL e non tocca nulla della macchina o del pannello.

### 2.4 Primo avvio
Premi **Start**. Al primo avvio vengono eseguiti in automatico:
1. `npm ci` e compilazione (alcuni minuti);
2. creazione del database `data/stalla.db` e delle tabelle (migrazioni Prisma);
3. caricamento del catalogo dal listino (32 razze, 148 manti) e delle impostazioni predefinite;
4. creazione dell'account admin;
5. importazione delle foto presenti nella cartella `Cavalli/`.

Quando in console compare `Gestionale in ascolto` il sito è attivo sulla porta dell'allocazione.

### 2.5 Aggiornamenti
Con `Aggiornamento automatico = 1`, a ogni **Restart** il server esegue `git pull`
e ricompila solo se il codice è cambiato. Le migrazioni del database vengono applicate da sole.
I dati (`data/stalla.db`, `data/uploads`, `data/backups`) non vengono toccati.

### 2.6 Comandi da console
| Comando | Effetto |
|---|---|
| `backup` | crea subito un backup del database in `data/backups` |
| `immagini` | importa le nuove foto aggiunte in `Cavalli/` |
| `stop` | arresta il gestionale |

Puoi anche creare una **Schedule** nel pannello (es. ogni notte) con azione *Send command* → `backup`.

---

## 3. Dominio dedicato (FQDN) e HTTPS

Il gestionale ascolta sulla porta dell'allocazione (es. `IP_NODO:25570`). Per raggiungerlo su
`https://stalla.tuodominio.it`, diverso dal dominio del pannello, metti un **reverse proxy** davanti.

### Opzione A – Nginx sulla macchina del nodo (consigliata)
1. DNS: record **A** `stalla.tuodominio.it` → IP del nodo.
2. Copia `deploy/nginx/stalla.conf` in `/etc/nginx/sites-available/stalla.conf`, sostituisci
   dominio, `IP_NODO` e `PORTA`, poi:
   ```bash
   sudo ln -s /etc/nginx/sites-available/stalla.conf /etc/nginx/sites-enabled/
   ```
   ```bash
   sudo certbot certonly --nginx -d stalla.tuodominio.it
   ```
   ```bash
   sudo nginx -t && sudo systemctl reload nginx
   ```
   Se il pannello Pterodactyl usa già nginx sulla stessa macchina va benissimo: è solo un altro `server {}`.
3. Nel server Pterodactyl imposta `Indirizzo pubblico = https://stalla.tuodominio.it` poi riavvia (i cookie diventano sicuri in automatico quando il sito è aperto in HTTPS).
4. Facoltativo: con il firewall consenti la porta dell'allocazione solo da `127.0.0.1`/IP del proxy,
   così il sito è raggiungibile solo tramite il dominio in HTTPS.

### Opzione B – Cloudflare Tunnel
Crea un tunnel che punta a `http://IP_NODO:PORTA` con hostname `stalla.tuodominio.it`.
Niente porte da aprire; imposta comunque `APP_URL`.

> Se dietro al proxy i moduli rispondono "Errore imprevisto" o non salvano, imposta la
> variabile `Domini consentiti` = `stalla.tuodominio.it` (controllo anti-CSRF dei moduli).

---

## 4. Installazione su un server normale / in locale

Requisiti: Node.js ≥ 20.12. Nessun database esterno.

```bash
git clone https://github.com/KFR98/StallaCiravolo.git
```
```bash
cd StallaCiravolo && cp .env.example .env
```
Modifica `.env` se serve (tutti i valori hanno un default), poi:
```bash
npm ci
```
```bash
npm run build
```
```bash
npm start
```
`npm start` esegue migrazioni, inizializzazione e avvio (porta `PORT`, default 3000).

Sviluppo: imposta in `.env` `DATABASE_URL="file:/percorso/assoluto/data/stalla.db"`, poi
`npx prisma migrate deploy && npm run db:seed && npm run dev`.

---

## 5. Database: migrazioni, backup e ripristino

- **Migrazioni**: in `prisma/migrations`, applicate a ogni avvio (`prisma migrate deploy`).
  Per modificare lo schema in sviluppo: `npm run db:migrate:dev -- --name descrizione`.
- **Backup automatico**: gestito dal gestionale stesso, si configura in *Amministrazione → Impostazioni →
  Backup automatico* (attivo/disattivo, frequenza da 6 ore a una settimana, giorni di conservazione,
  default 14). Le modifiche valgono subito, senza riavviare. `BACKUP_AUTO=false` lo spegne comunque.
- **Backup manuale**: Admin → *Backup* → "Crea backup ora" (scaricabile), comando console `backup`,
  oppure `npm run backup`.
- **Ripristino**: Admin → *Backup* → carica il file JSON e scrivi `RIPRISTINA`. Prima del ripristino
  viene salvata automaticamente una copia dello stato attuale; il ripristino è in un'unica transazione
  (se fallisce non cambia nulla).
- **Backup del pannello**: i *Backups* di Pterodactyl salvano tutti i file del server, quindi anche
  `data/stalla.db`, `data/uploads` (immagini) e `data/backups`. Il file del database copiato mentre il
  gestionale è acceso può essere a metà di una scrittura: per un ripristino sicuro usa i backup JSON
  di `data/backups` (sempre coerenti) oppure fai il backup del pannello a server spento.
- **Copia manuale del database**: a server spento basta copiare `data/stalla.db` (e, se presenti,
  `data/stalla.db-wal` / `data/stalla.db-shm`).
- **Account admin perso**: `npm run admin:create -- nomeutente nuovapassword` (dalla console SFTP/shell).

---

## 6. Listino Excel e foto dei cavalli

### Import iniziale
Il catalogo iniziale è in `prisma/seed-data/listino.json`, generato dal file
`Stalla_Ciravolo_v5.xlsx` con:
```bash
npm run listino:estrai -- percorso/Stalla_Ciravolo_v5.xlsx
```
Il comando stampa il riepilogo (razze, manti, statistiche) e tutte le anomalie trovate.
Il riepilogo completo dell'analisi è in [`docs/ANALISI-EXCEL.md`](docs/ANALISI-EXCEL.md).

### Import successivi dal pannello
Admin → *Importa listino Excel*: carica il file, controlla anteprima e anomalie, poi scegli
"solo nuovi" oppure "aggiorna anche prezzi e statistiche". Nulla viene eliminato; ogni cambio di
prezzo finisce nello storico prezzi del manto.

### Bottega (foglio PREZZI)
Il foglio PREZZI dell'Excel è importato nella sezione **Bottega**: 29 oggetti in vendita, 21 materie
prime e 13 fornitori (file `prisma/seed-data/bottega.json`). I valori tra parentesi del file (es. `3 (1,15)`)
e i prezzi non numerici (es. `5 Fenix`) sono conservati come nota del prezzo.

### Foto
Le foto dei manti vengono dalla wiki di Red Dead (`reddead.fandom.com`), convertite in WEBP a 640 px.
Al momento 123 manti su 148 hanno la foto. Mancano le razze mod (Foster, Groningen, Lusitano, Warlander,
Nell II, Mangy), i manti con nome di personaggio (Bill, John, Micah, Lenny, Karen, Kieran, Sadie, War Vets),
gli "Endless Summer" e due manti non presenti sulla wiki (Criollo Bay Roan Overo, Mustang Black Overo):
l'admin può caricarle dalla scheda del manto.

- Carica le foto nella cartella **`Cavalli/`** del repository con il nome in stile wiki
  `"<Manto> <Razza inglese>.webp"` (es. `Black Arabian.webp`, `Gold_Turkoman.PNG.webp`).
- All'avvio (o con il comando `immagini`) vengono abbinate in automatico ai manti senza immagine.
- Se un nome non viene riconosciuto, aggiungi l'abbinamento in `Cavalli/abbinamenti.json`:
  ```json
  { "Few Spotted Appaloosa.webp": "APPALOOSA|Few Spots" }
  ```
- Dal pannello (Admin → Catalogo → Modifica manto) l'admin può sempre caricare, sostituire o rimuovere
  qualsiasi immagine; le foto rimosse a mano non vengono reimportate.

---

## 7. Regole di calcolo

**Prezzi** (tutti modificabili dall'admin, per ogni manto):
| Colonna Excel | Uso |
|---|---|
| `TOT 5-10 ANNI` | prezzo di vendita in stalla, cavallo da 5 a 10 anni |
| `TOT 11-16 ANNI` | prezzo di vendita in stalla, cavallo da 11 a 16 anni |
| oltre 16 anni | prezzo libero, inserito dallo stalliere |
| `GOVERNO` | prezzo pagato al blip del Governo (vendita immediata, il cavallo non entra in stalla) |
| `LISTINO GOV` | prezzo di acquisto al blip, solo informativo |
| `5-10 ANNI`, `11-15 ANNI`, `ADDEST.` | dettaglio dei costi base, informativo |

Sotto l'**età minima** (5 anni) il cavallo non è vendibile. Lo sconto (percentuale o importo) mostra
il "prezzo scontato finale"; i dipendenti hanno un limite di sconto configurabile.
Tutte le fasce sono modificabili in *Impostazioni*.

**Età**: `età = età maturata + (adesso − data di riferimento) / giorni per anno` (default 4 giorni = 1 anno).
È calcolata al volo, quindi avanza anche se nessuno apre il gestionale. Se l'admin cambia i giorni per anno,
l'età maturata da ogni cavallo viene prima "congelata" e da quel momento avanza con il nuovo ritmo.

**Vendite**: ogni vendita salva una fotografia di razza, manto, sesso, targa, età, fascia, prezzo di listino,
sconto e prezzo finale. Le vendite non si cancellano: l'admin può correggerle o annullarle (restano nello storico).
Una vendita dalla stalla blocca il cavallo in modo atomico: se due dipendenti vendono lo stesso cavallo
nello stesso istante, passa solo la prima vendita.

**Stipendi**: per ogni settimana (lunedì–domenica, fuso `TZ_STALLA`)
`stipendio = % stalla × vendite in stalla + % blip × vendite al blip + % oggetti × vendite di oggetti`.
Le tre percentuali sono globali (default 30% / 30% / 0%) e possono essere personalizzate per ogni dipendente.
Il pulsante **Paga** accanto al dipendente distribuisce l'importo sulle settimane arretrate dalla più vecchia:
si può pagare di meno (resta un residuo, stato *Parziale*) o di più (la differenza è registrata come extra).
Lo storico mostra per ogni pagamento quanto spettava e quanto è stato pagato. Una settimana risulta pagata
**solo** dopo la registrazione; al primo pagamento i totali della settimana vengono "fotografati".

**Proprietà dei cavalli**: ogni cavallo in stalla è *in carico* a uno stalliere (chi lo ha catturato).
Solo lui (o admin/direttore) può venderlo; può passarlo gratuitamente a un altro stalliere dalla scheda
del cavallo. Il passaggio resta nello storico del cavallo.

**Stalliere della settimana**: classifica settimanale (Ufficio e Personale) con punti =
1 per cattura + 3 per vendita in stalla + 1 per vendita al blip + 1 per vendita di oggetti + 1 ogni $100 incassati.

**Mappa**: tre tipi di punto: *cavallo* (ferro di cavallo colorato per razza), *possibile cavallo* ("?")
e *nota* libera (segnaposto del colore scelto). Pulsante schermo intero; i segnaposto si spostano solo
con il tasto *Modifica* (admin, direttore, gestore).

**Gravidanza**: dalla scheda di una cavalla in stalla si segna "incinta" dopo l'accoppiamento.
Compare l'etichetta arancione **INCINTA**; dopo 3 giorni (modificabile in *Impostazioni*) diventa
**FAI PARTORIRE**. La data del parto è modificabile in ogni momento; vendere una cavalla incinta è
possibile ma il gestionale chiede conferma con un avviso.

---

## 8. Struttura del progetto

```
prisma/schema.prisma          schema del database (tabelle e relazioni)
prisma/migrations/            migrazioni SQL
prisma/seed-data/listino.json catalogo estratto dal file Excel
scripts/start.mjs             avvio in produzione (migrazioni, seed, server, backup, console)
scripts/seed.ts               inizializzazione idempotente
scripts/extract-listino.ts    analisi Excel → JSON
scripts/import-images.ts      abbinamento foto Cavalli/ → manti
scripts/backup.ts             backup da riga di comando
src/lib/                      logica: auth, permessi, età, prezzi, stipendi, import Excel, backup
src/app/(app)/                pagine del gestionale (una cartella per sezione)
src/app/api/                  immagini, esportazioni, download backup
deploy/pterodactyl/           egg per Pterodactyl
deploy/nginx/                 configurazione reverse proxy
Cavalli/                      foto dei cavalli da importare
public/map/rdr2-map.jpg       immagine della mappa degli spawn
```

Tabelle principali: `User`, `Session`, `Breed`, `Coat`, `StatDefinition`, `CoatStat`,
`PriceHistory`, `Horse` (catture e inventario, proprietario, gravidanza), `HorseTransfer`, `Sale`,
`Spawn`, `Reservation`, `ShopItem`, `Supplier`, `ShopNote`, `Reimbursement`, `ItemSale`,
`ItemSaleLine`, `PayrollEntry`, `Payment`, `Setting`, `AuditLog`.

## 9. Sicurezza

- Tutte le query passano da Prisma con parametri: il testo digitato (ricerche, filtri, URL) non viene mai
  inserito nel codice SQL, quindi la SQL injection non è possibile. Le uniche istruzioni SQL scritte a mano
  (ripristino backup) usano solo nomi di tabella fissi.
- Gli ID nelle URL (es. `/stalla/12`) sono "parlanti" ma non danno accesso a nulla: ogni pagina, azione e API
  controlla sul server sessione e permessi del ruolo. Un dipendente che apre `/stipendi` o `/admin` viene
  rimandato all'ufficio; esportazioni e backup rispondono 401/403.
- Password con Argon2id, cookie di sessione `httpOnly`/`SameSite`, sessioni invalidate quando un account
  viene disattivato, blocco dopo 5 tentativi di accesso errati in 5 minuti.
- Protezione CSRF dei moduli (Next.js), header di sicurezza e Content-Security-Policy che blocca script e
  risorse esterne; il testo inserito dagli utenti (anche sulla mappa) viene sempre mostrato come testo.
- Upload solo di immagini verificate dalla firma del file, nomi casuali, niente path traversal.
- Consiglio: pubblica il sito solo in HTTPS (reverse proxy) e tieni aggiornato il codice con i riavvii.

## 10. Test

```bash
npm test
```
Test della logica di età, fasce di prezzo, sconti, settimane (incluso il cambio d'ora), abbinamento foto,
calcolo stipendi (pagamenti parziali, extra, percentuali separate) e gravidanza.
