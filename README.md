# Stalla Ciravolo – Gestionale

Gestionale web per la stalla del server RedM: catalogo cavalli, listino, catture,
vendite (stalla e Governo), avanzamento età, mappa degli spawn, note/prenotazioni,
statistiche dei dipendenti, stipendi settimanali, amministrazione e registro attività.

- **Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Prisma 6 · MySQL/MariaDB
- **Autenticazione:** sessioni salvate nel database (cookie httpOnly), password con Argon2id
- **Permessi:** verificati sul server a ogni pagina, azione e API (`src/lib/permissions.ts`)

> Perché MySQL e non PostgreSQL: Pterodactyl crea database **MySQL/MariaDB** direttamente
> dalla scheda *Databases* del server, senza installare altro. Lo schema Prisma è
> portabile: per usare PostgreSQL basta cambiare `provider` in `prisma/schema.prisma`
> e rigenerare le migrazioni.

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
9. [Test](#9-test)

---

## 1. Funzioni e ruoli

| Funzione | Admin | Direttore | Gestore | Dipendente |
|---|:-:|:-:|:-:|:-:|
| Ufficio (dashboard) | completa | completa | completa | risultati personali |
| Catalogo, listino, confronto prezzi | ✔ | ✔ | ✔ | ✔ |
| Registrare catture (deposito / vendita al Governo) | ✔ | ✔ | ✔ | ✔ |
| Vendere cavalli in stalla (con sconto) | ✔ | ✔ | ✔ | ✔ |
| Cambiare il prezzo di listino, sconto senza limite | ✔ | ✔ | – | – |
| Registro vendite | tutte | tutte | tutte | solo le proprie |
| Modificare dati operativi del cavallo / uscita dalla stalla | ✔ | ✔ | ✔ | – |
| Correggere età, razza, manto, catturatore | ✔ | – | – | – |
| Correggere / annullare vendite | ✔ | – | – | – |
| Mappa: vedere e aggiungere spawn | ✔ | ✔ | ✔ | ✔ (modifica i propri) |
| Mappa: modificare/eliminare qualsiasi spawn | ✔ | ✔ | ✔ | – |
| Note e prenotazioni (creare e modificare) | ✔ | ✔ | ✔ | ✔ |
| Eliminare note | ✔ | ✔ | – | – |
| Dipendenti | statistiche | statistiche | elenco | – |
| Stipendi | ✔ | ✔ | – | – |
| Registro attività | ✔ | ✔ | – | – |
| Esportazioni Excel/CSV | ✔ | ✔ | – | – |
| Utenti e ruoli, catalogo, impostazioni, import, backup | ✔ | – | – | – |

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
   disco 3 GB, 1 allocazione (porta), immagine *Node.js 22*.
3. Nelle variabili:
   - `Repository Git`: `https://github.com/KFR98/StallaCiravolo`
   - se il repository è **privato**: `Utente GitHub` + `Token GitHub` (token di sola lettura)
   - lascia vuoto per ora `URL database`, ci torniamo al punto 2.3.
4. Crea il server: lo script di installazione scarica il codice.

### 2.3 Crea il database
1. Nel server → scheda **Databases** → *New Database* (es. nome `stalla`).
2. Clicca sull'occhio per vedere la password e compila la variabile **URL database** (scheda *Startup*):
   ```
   mysql://UTENTE:PASSWORD@HOST:PORTA/NOME_DATABASE
   ```
   Se la password contiene caratteri speciali codificali: `@`→`%40`, `:`→`%3A`, `/`→`%2F`, `#`→`%23`, `?`→`%3F`.
3. Imposta anche `Password admin iniziale` (oppure lasciala vuota: verrà generata e scritta in console).

### 2.4 Primo avvio
Premi **Start**. Al primo avvio vengono eseguiti in automatico:
1. `npm ci` e compilazione (alcuni minuti);
2. creazione delle tabelle (migrazioni Prisma);
3. caricamento del catalogo dal listino (32 razze, 148 manti) e delle impostazioni predefinite;
4. creazione dell'account admin;
5. importazione delle foto presenti nella cartella `Cavalli/`.

Quando in console compare `Gestionale in ascolto` il sito è attivo sulla porta dell'allocazione.

### 2.5 Aggiornamenti
Con `Aggiornamento automatico = 1`, a ogni **Restart** il server esegue `git pull`
e ricompila solo se il codice è cambiato. Le migrazioni del database vengono applicate da sole.
I dati (`data/uploads`, `data/backups`) e il database non vengono toccati.

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
3. Nel server Pterodactyl imposta `Indirizzo pubblico = https://stalla.tuodominio.it` e `Cookie sicuri = true`, poi riavvia.
4. Facoltativo: con il firewall consenti la porta dell'allocazione solo da `127.0.0.1`/IP del proxy,
   così il sito è raggiungibile solo tramite il dominio in HTTPS.

### Opzione B – Cloudflare Tunnel
Crea un tunnel che punta a `http://IP_NODO:PORTA` con hostname `stalla.tuodominio.it`.
Niente porte da aprire; imposta comunque `APP_URL` e `COOKIE_SECURE=true`.

> Se dietro al proxy i moduli rispondono "Errore imprevisto" o non salvano, imposta la
> variabile `Domini consentiti` = `stalla.tuodominio.it` (controllo anti-CSRF dei moduli).

---

## 4. Installazione su un server normale / in locale

Requisiti: Node.js ≥ 20.12, MySQL 8 o MariaDB ≥ 10.6.

```bash
git clone https://github.com/KFR98/StallaCiravolo.git
```
```bash
cd StallaCiravolo && cp .env.example .env
```
Modifica `.env` (almeno `DATABASE_URL`), poi:
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

Sviluppo: `npx prisma migrate deploy && npm run db:seed && npm run dev`.

---

## 5. Database: migrazioni, backup e ripristino

- **Migrazioni**: in `prisma/migrations`, applicate a ogni avvio (`prisma migrate deploy`).
  Per modificare lo schema in sviluppo: `npm run db:migrate:dev -- --name descrizione`.
- **Backup automatico**: un minuto dopo l'avvio e poi ogni 24 ore, file JSON in `data/backups`
  (ne vengono conservati `BACKUP_KEEP`). Disattivabile con `BACKUP_AUTO=false`.
- **Backup manuale**: Admin → *Backup* → "Crea backup ora" (scaricabile), comando console `backup`,
  oppure `npm run backup`.
- **Ripristino**: Admin → *Backup* → carica il file JSON e scrivi `RIPRISTINA`. Prima del ripristino
  viene salvata automaticamente una copia dello stato attuale; il ripristino è in un'unica transazione
  (se fallisce non cambia nulla).
- **Backup nativo MySQL** (alternativa, dal nodo):
  ```bash
  mysqldump -h HOST -u UTENTE -p NOME_DB > stalla.sql
  ```
- **Immagini**: sono file in `data/uploads`. I *Backups* del pannello Pterodactyl salvano tutti i file
  del server (codice, `data/uploads`, `data/backups`), ma **non** il database: per questo esistono i backup JSON.
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

### Foto
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

**Stipendi**: `stipendio settimanale = percentuale × lordo vendite della settimana` (lunedì–domenica,
fuso `TZ_STALLA`). Percentuale globale (default 30%) o personale per dipendente; si può scegliere se contare
vendite in stalla e/o al Governo. Una settimana risulta pagata **solo** dopo la registrazione del pagamento;
le settimane concluse non pagate compaiono come arretrati. Ogni pagamento o annullamento resta nello storico.

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
`PriceHistory`, `Horse` (catture e inventario), `Sale`, `Spawn`, `Reservation`,
`PayrollEntry`, `Payment`, `Setting`, `AuditLog`.

## 9. Test

```bash
npm test
```
Test della logica di età, fasce di prezzo, sconti, settimane (incluso il cambio d'ora) e abbinamento foto.
