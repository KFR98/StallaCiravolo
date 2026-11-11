# Analisi del file `Stalla_Ciravolo_v5.xlsx`

## Fogli
| Foglio | Contenuto | Uso |
|---|---|---|
| LISTINO | 32 razze, 148 manti, prezzi e 5 statistiche | **Fonte del catalogo** |
| PRENOTAZIONI CAVALLI | prenotazioni + calcolatore età (4 giorni = 1 anno) | Sostituito dalla sezione *Note e prenotazioni* |
| PREZZI | oggetti in vendita, materie prime, fornitori | Importato nella sezione *Bottega* |
| CRAFT | 12 immagini di ricette | Non importato |
| 3, 4, 7…15 | fogli settimanali LORDO / NETTO (= 30%) | Sostituiti dalla sezione *Stipendi* |

Le righe in fondo al LISTINO con indirizzi email dei giocatori **non** vengono importate
(la lettura si ferma alla prima riga vuota dopo la tabella).

## Colonne del LISTINO
`RAZZA, MANTO, 5-10 ANNI, 11-15 ANNI, ADDEST., LISTINO GOV, TOT 5-10 ANNI, TOT 11-16 ANNI, GOVERNO,
VELOC., STAMINA, VITA, ACCEL., DESTR.`

Formule del file (LISTINO GOV = G):
- 5-10 ANNI = arrotonda per eccesso a 5 di G × 50%
- 11-15 ANNI = arrotonda a 5 di G × 40%
- ADDEST. = arrotonda a 5 di G × 10%
- TOT = prezzo base + addestramento
- GOVERNO = G × 3%

## Razze
32 razze, 148 manti. Razze personalizzate/mod (non presenti in RDR2): **FOSTER (3), GRONINGEN (2),
LUSITANO (3), WARLANDER (2), NELL II (1), MANGY (1)**. I loro dati sono importati così come sono.

## Anomalie e decisioni
| Riga | Problema | Decisione |
|---|---|---|
| 94 | MUSTANG – Endless Summer: "5-10 ANNI" vuoto, TOT 5-10 = `#VALUE!` | Ricalcolato con la formula: 465 / 560 (confermato) |
| 53-57, 144-145 | FOSTER, GRONINGEN, WARLANDER: GOVERNO = 65 (formula: 66), valori scritti a mano | Mantenuto 65 come nel file |
| 74-78, 80-87 | Spazi finali in "KLADRUBER ", "MISSOURI FOX TROTTER " | Rimossi (unificata la razza) |
| vari | Nomi razza: NORFOLK ROADSTE, TENNESSE WALKER, SUFFOLKPUNCH, GYPSYCOB | Corretti (il nome originale resta salvato) |
| vari | Manti: EagleFlies, Blancket, Bayroan, IronGreyRoan, StrawberryRoan, White Blangdon, Splashed Piebland, FlaxenChestnut, SpeckledGrey, Ligth Grey, Reverse Daplle Black | Corretti (il nome originale resta salvato) |
| 2 | Intestazioni "11-15 ANNI" e "TOT 11-16 ANNI" | Fasce configurabili (default 5-10 / 11-16 / oltre = libero) |

Statistiche: scala del file da 1 a 5 con mezzi punti. Il massimo di ogni barra è il valore
più alto presente nel catalogo per quella statistica (es. VELOC. max 5, STAMINA max 3,5).
Nessun valore mancante è stato inventato: i campi vuoti restano vuoti e modificabili.

## Foglio PREZZI → Bottega
- **Oggetti in vendita** (colonne E-F): 29 righe, gruppi "Cavalli" e "Carri" come indicati nel file (colonna D).
  Nota: nel file il gruppo "Carri" comprende anche selle, bisacce, coperte ecc.; il gruppo è modificabile.
- **Materie prime** (colonne B-C): 21 righe, gruppo "Stalla".
- **Fornitori** (colonne H-K): 13 righe. L'asterisco nel nome è stato convertito nel contrassegno ★.
  La prima riga (Manzanita, missiva CP419) non ha un nome di referente.
- Prezzi del tipo `3 (1,15)`: il primo numero è il prezzo; il valore tra parentesi è conservato come nota
  (il suo significato non è indicato nel file). `5 Fenix` / `1 Fenix` sono conservati come nota, senza prezzo numerico.
