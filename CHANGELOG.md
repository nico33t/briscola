# Changelog

Tutte le modifiche rilevanti a **Briscola**. Formato [Keep a Changelog](https://keepachangelog.com/it/1.1.0/),
versionamento [SemVer](https://semver.org/lang/it/). Le versioni seguono `package.json`.
**Più recenti in alto. Questo file si appende, non si riscrive** (vedi [`AGENTS.md`](./AGENTS.md) §0-bis).

---

## [Unreleased]

> **Stato corrente:** ci si gioca, ed è **online**.
> Prossimo passo: **F4 — il livello Esperto con ISMCTS** in Web Worker, e la variante 2v2.

### 🚀 Online
Pubblicato su Cloudflare Pages: **https://briscola.pages.dev**

Progetto Pages `briscola`, **separato** dal sito personale `nicolatomassini` — quello ha in
produzione `nicolatomassini.com`, `www` e `card` ed è collegato a Git, dove un deploy da CLI
convive male. Il router è a hash, quindi non serve nessun `_redirects`.

Verificato in produzione: `index.js` servito come `application/javascript`, `index.css` come
`text/css`, le carte come `image/webp` — nessun asset servito come `text/html`, che è il modo
classico in cui una SPA su Pages si rompe. Partita giocata sul sito pubblicato, zero errori in
console.

⏳ Il dominio `briscola.nicolatomassini.com` resta da collegare a mano dal dashboard: `wrangler`
4.85 non espone i domini personalizzati da CLI, e il token locale ha `zone (read)` ma non
`zone (write)`.

### Rimosso
- **La CI GitHub Actions.** Non è mai girata: l'account è bloccato per una questione di
  fatturazione, e non ha senso pagare per far girare una CI su un gioco di carte. La repo resta
  gratis e semplice — solo codice. Cancellate anche le run rosse rimaste in cronologia.

  **Il cancello adesso è locale e va passato a mano:** `npm run check` (lint + typecheck + test +
  build) **prima di ogni push**. Non è un consiglio, è l'unico controllo che esiste. Chi vuole
  automatizzarlo può installarsi un hook `pre-push` in locale, a costo zero — vedi `AGENTS.md` §1.0.
- `.wrangler/` aggiunto a `.gitignore`: è cache locale creata dal deploy, non deve stare in repo.

---

## [0.5.0] — 2026-07-28 — F3: adesso ci si gioca

Il tavolo esiste e la partita funziona dall'inizio alla fine.

### Aggiunto
- **`#/gioca`** — scelta fra *contro il computer* e *in due sullo stesso device*, difficoltà, e poi
  il tavolo.
- **Il tavolo** — la propria mano cliccabile, i dorsi dell'avversario, il banco, il mazzo con la
  briscola di traverso e il conteggio delle carte, i punteggi che salgono a ogni presa.
- **Avversario euristico**, due livelli. Apre con le lisce invece di regalare carichi, prende
  quando conviene e scarta quando non conviene, non spreca una briscola per un giro da zero punti.
  Vede **solo** l'information set: la firma della funzione rende impossibile passargli le carte
  altrui per sbaglio.
- **Dialog di fine partita** con i punteggi e la rivincita.
- **Tastiera**: 1, 2, 3 giocano la carta corrispondente.

### Animazioni
Tutte in CSS, nessuna libreria, e tutte spente da `prefers-reduced-motion`.

- **La presa in due tempi.** Il `core` risolve il giro nell'istante in cui cade l'ultima carta —
  giusto per le regole, ma a schermo le carte sparirebbero prima che si capisca chi ha vinto. Ora
  restano ferme 850 ms con un anello d'ottone attorno alla vincente, poi **volano verso chi le ha
  vinte**. È il gesto che al tavolo dice "queste sono mie"; senza, il punteggio sembra cambiare da
  solo.
- **Le carte entrano dal lato di chi le cala**: le mie dal basso, le sue dall'alto.
- **Distribuzione sfalsata**: ogni carta nuova entra da sé, con 70 ms di ritardo sulla precedente.
  Vale per la mano iniziale e per ogni pescata, senza codice dedicato.
- **Respiro sulla mano di turno**: un alone appena percettibile, per dire "tocca a te" senza
  scriverlo una seconda volta.

### Come gioca l'AI — numeri veri
Torneo su **1000 partite** contro un giocatore casuale, alternando i posti così che il vantaggio di
aprire non falsi il conto: **695 vittorie (69,5%)**, 289 sconfitte, 16 pari, **69,7 punti medi su
120**. Il test in CI usa una soglia più prudente (66% su 300 partite) per non diventare fragile.

### Verificato nel browser
Partita intera giocata da capo a fondo: 20 giocate, finita 49–71, somma **120 esatti**, dialogo
corretto. Rivincita riparte con un seme nuovo (briscola diversa). In hot-seat i turni si alternano
fra Giocatore 1 e Giocatore 2 e le mani si scambiano. **Zero errori e zero warning in console.**

---

## [0.4.0] — 2026-07-28 — Le carte hanno un indirizzo

### Aggiunto
- **Router basato sull'hash**, scritto a mano in una cinquantina di righe (`ui/router.tsx`):
  `useRotta`, `Link`, `vaiA`, più `normalizzaHash` che è testata a parte.
- **`#/carte`** — le 40 carte piacentine sempre consultabili. Raggruppate per seme, con i punti di
  ciascuna e un interruttore per passare dall'ordine tradizionale (asso → re) all'**ordine di forza
  in presa**, che non è lo stesso: il due di briscola non vale niente ma prende l'asso di qualunque
  altro seme. In fondo il retro e la nota sulla provenienza degli asset.
- **Home** con il menu delle modalità. Le voci non ancora pronte restano visibili ma disabilitate,
  marcate "in arrivo": nascondere ciò che non c'è rende difficile capire dove sta andando il gioco.
- **Pagina "non trovata"** con ritorno al menu.

### Note
- **Perché non react-router.** Le rotte sono una manciata e piatte, senza annidamenti né
  caricamento dati. E l'hash **non richiede regole di rewrite** sull'hosting statico: `/carte`
  ricaricato a mano darebbe 404 senza configurare il server, `#/carte` no. L'app conosce solo tre
  funzioni, quindi cambiare idea costa un file.
- **`#/carte` è permanente**, non una schermata di prova. Serve a chi impara e serve a noi per
  vedere a colpo d'occhio se il ritaglio degli asset è rimasto sano dopo un rigenero.
- Aggiunto un override di Biome che permette `console` dentro `scripts/`: uno script di build deve
  poter stampare l'avanzamento. Meglio una regola esplicita che sei righe silenziate a mano.

### Verificato nel browser
41 immagini (40 carte + retro) **tutte caricate**, nessuna rotta, tutte con testo alternativo.
Zero errori e zero warning in console. Home, `#/carte` e rotta inesistente rispondono tutte.

---

## [0.3.0] — 2026-07-28 — F2: le carte, ritagliate dai corridoi bianchi

Le 40 carte piacentine esistono come file. Il mazzo si vede a schermo.

### Aggiunto
- **`scripts/build-cards.ts`** (`npm run cards:build`) — scarica la sorgente public domain da
  Wikimedia, la tiene in cache, rileva le carte, ritaglia, normalizza a 320×528 ed esporta WebP
  q82. Scrive `manifest.json` con fonte, autore e licenza.
- **40 carte WebP** in `src/assets/cards/`, ~1,3 MB in tutto. Versionate: lo script gira di rado e
  costruire il progetto non deve dipendere da lui.
- **Retro della carta** — SVG originale: reticolo a rombi verde, cornice e rosone in ottone.
  Nessun problema di licenza, e pesa 1,9 KB (Vite lo inlinea come data URI).
- **`ui/Carta.tsx`** — mostra una carta. Senza carta assegnata, o coperta, mostra il retro: un
  componente che non ha il diritto di conoscere la carta non può rivelarla per sbaglio. Ogni carta
  ha il nome parlato per gli screen reader ("Asso di coppe").
- `sharp` come **devDependency** (serve solo allo script).

### La parte interessante: come si ritagliano carte storte

La sorgente è la fotografia di un mazzo disposto sul tavolo — carte **leggermente ruotate** e a
**spaziatura non uniforme**. Una griglia fissa le taglia.

Il primo tentativo è stato una **soglia di densità d'inchiostro**: sembra l'idea ovvia, ed è
sbagliata. Le carte con pochi semi (il due, il quattro) sono quasi tutte bianche e **scendono sotto
qualsiasi soglia sensata, sparendo**; quelle con un corridoio bianco verticale al centro **si
spezzano in due**. Sulle quattro righe uscivano 11, 10, 9 e 9 colonne invece di 10.

Quello che funziona è guardare il vuoto invece del pieno: **i corridoi bianchi fra una carta e
l'altra**. Un corridoio è vuoto su tutta l'altezza della banda, mentre dentro una carta c'è sempre
almeno il bordo superiore e inferiore a fare inchiostro. Con una tolleranza di 2 pixel escono
**10 colonne esatte su tutte e quattro le righe**.

### Modificato
- La schermata provvisoria ora mostra il mazzo intero con punti e retro, per il controllo a vista.
  Sarà sostituita dal tavolo vero in F3.

### Note
- ⚠️ La CI **non ha ancora mai girato**: l'account GitHub è bloccato per un problema di
  fatturazione (`The job was not started because your account is locked due to a billing issue`).
  Il workflow è corretto; il gate gira in locale ed è verde.

---

## [0.2.0] — 2026-07-28 — F1: il motore, scritto partendo dai test

Le regole della Briscola, in TypeScript puro. Nessuna interfaccia ancora: il gioco sa contare le
prese, non sa mostrarle. **76 test verdi.**

### Aggiunto
- **`core/types.ts`** — il vocabolario: semi, ranghi, carte, posti, squadre, stato, azioni, eventi.
  Lo stato è interamente `readonly`.
- **`core/rng.ts`** — generatore mulberry32 seedato. Serve perché `core/` deve restare
  deterministico: senza, niente replay ripetibili e niente simulazioni dell'AI.
- **`core/deck.ts`** — le 40 carte, i punti (asso 11, tre 10, re 4, cavallo 3, fante 2) e l'ordine
  di forza, che **non coincide con i punti**: il due di briscola prende l'asso di un altro seme.
  Mescolata Fisher-Yates che non tocca il mazzo passato.
- **`core/rules.ts`** — chi vince il giro, quanto vale un mucchio, chi sta con chi. Le regole
  esistono **solo qui**.
- **`core/machine.ts`** — il reducer puro. Distribuisce, valida, risolve la presa, fa pescare
  (vincitore per primo), chiude la partita. Punteggio 1v1 e 2v2 a coppie.
- **`core/infoset.ts`** — la proiezione dello stato per un singolo giocatore, più `carteNonViste`,
  la base della determinizzazione ISMCTS che arriverà in F4.

### Note di progettazione

**I punti non stanno nello stato.** Si ricavano dalle prese con `puntiSeat`. Tenerli anche come
contatore avrebbe creato una seconda fonte di verità, che prima o poi diverge da quella vera.

**Le mosse illegali non lanciano eccezioni.** `applica` restituisce `{ ok: false, motivo }`. Le
azioni arriveranno anche dal DataChannel WebRTC, e un peer ostile non deve poter far esplodere
l'host mandando una carta che non ha.

**L'infoset è un vincolo, non una comodità.** L'AI riceverà solo quello. È testato in negativo: si
serializza l'infoset e si verifica che **non contenga** nessuna carta avversaria — nel 2v2 nemmeno
quelle del compagno.

### Test
- Property test su **300 partite simulate** (150 in 1v1, 150 in 2v2): i punti fanno sempre **120
  esatti** e nessuna carta si perde o si duplica.
- Casi espliciti sulle prese: briscola bassa che batte l'asso di un altro seme, briscola più alta fra
  più briscole, briscola giocata per ultima, carta fuori seme che non prende mai per quanto valga.
- Determinismo: stesso seme, stessa partita.

---

## [0.1.0] — 2026-07-28 — F0: l'impalcatura, e una sorpresa di TypeScript 7

Prima versione con del codice dentro. Nessun gioco ancora: c'è il progetto che sta in piedi, si
costruisce, si testa e si controlla da solo.

### Aggiunto
- Scaffolding **Vite 8.1.5 + React 19.2.8 + TypeScript 7.0.2 + Tailwind 4.3.3 + Vitest 4.1.10**.
- **shadcn/ui** cablato e verificato sul serio: `button`, `dialog`, `card` e `badge` generati dalla
  CLI e passati dal gate.
- **Tema "osteria moderna"**: variabili shadcn in oklch più una palette dedicata al tavolo
  (`--felt`, `--felt-deep`, `--wood`, `--brass`, `--on-felt`), tema chiaro e scuro, feltro come
  gradiente radiale che scurisce verso i bordi.
- **Accessibilità dalla prima riga**: `prefers-reduced-motion` spegne le animazioni.
- Configurazione TypeScript severa: `strict`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noImplicitReturns`, `noImplicitOverride`, `noUnusedLocals`,
  `noUnusedParameters`.
- Gate unico **`npm run check`** = lint + typecheck + test + build.
- **CI GitHub Actions** su push e pull request.

### Modificato
- **Linter: Biome al posto di ESLint.** Non è una preferenza, è un vincolo — vedi qui sotto.

### Note tecniche

**TypeScript 7 ha rimosso la Compiler API JavaScript.** Verificato sul pacchetto installato:
`require("typescript")` risolve a `lib/version.cjs` ed espone *solo* la stringa di versione;
`createProgram` e `createSourceFile` sono `undefined`. L'API vera è ora `typescript/unstable/*` e
parla in JSON-RPC col binario Go.

Conseguenza: `typescript-eslint` (peer `typescript ">=4.8.4 <6.1.0"`) non può funzionare, e senza di
lui ESLint non sa nemmeno leggere un `.tsx`. Si è scelto **Biome 2.5.6**, binario Rust con parser
TypeScript proprio e nessuna dipendenza dal pacchetto `typescript`, che fa anche da formattatore.
Il prezzo, dichiarato: niente regole *type-aware*; le compensa la configurazione severa di `tsc`.

⚠️ **Mai installare con `--omit=optional`**: `tsc` è distribuito come binario nativo per piattaforma
attraverso le dipendenze opzionali.

### Aggiunto
- `ASSETS.md` — registro di origine e licenza di ogni asset.
- `LICENSE` — MIT, © 2026 Nicola Tomassini.
- `README.md`, `.gitignore`.
- Documentazione interna **non versionata** (`AGENTS.md` con le regole di lavoro, `implements.md`
  con la specifica completa): resta in locale per scelta, non fa parte del repo pubblico.

### Deciso (sessione di brainstorming del 28/07/2026)
- **BLE tra browser: impossibile, scartato.** Web Bluetooth espone solo il ruolo *central*: un
  browser non può fare advertising come peripheral, quindi due browser non si vedono mai. Niente
  Safari né Firefox, per giunta.
- **Sostituito con WebRTC + signaling via QR**: peer-to-peer diretto, zero backend, zero costi,
  funziona su hotspot senza internet.
- **Lockstep deterministico scartato**: col seed condiviso ogni peer potrebbe ricostruire le carte
  in mano all'avversario. In un gioco a informazione nascosta è un buco insanabile.
- **Host autoritativo**: l'host esegue il reducer, i client mandano intenzioni e ricevono solo ciò
  che possono sapere.
- **Varianti: 1v1 e 2v2 a coppie.** Briscola in 5 (chiamata) rimandata: serve la fase d'asta e
  un'AI molto più complessa.
- **AI: ISMCTS** (Information Set Monte Carlo Tree Search) in Web Worker, oltre ai livelli euristici.
- **Asset: immagine public domain di Wikimedia Commons** ([Carte piacentine al completo](https://commons.wikimedia.org/wiki/File:Carte_piacentine_al_completo.jpg),
  autore Florixc, PD worldwide), ritagliata in 40 WebP. Scartati i mazzi commerciali (protetti) e
  gli SVG singoli di Wikimedia (solo 15 carte su 40).
- **Look "osteria moderna"**: feltro verde profondo con chrome shadcn pulito. Le carte piacentine
  sono già coloratissime e chiedono uno sfondo sobrio.
- **Fase 1 include** PWA installabile e offline, statistiche locali, replay. **Esclude** account,
  ELO e classifiche online: richiederebbero backend, auth e moderazione.
- **Vite confermato, Expo scartato per ora.** shadcn/ui non esiste su React Native (è Radix +
  Tailwind, tutto DOM) e i Web Worker che servono all'ISMCTS non ci sono nativamente. La copertura
  per il futuro è architetturale: `core/` e `ai/` sono TypeScript puro senza DOM né React, quindi
  una futura app Expo li riusa identici riscrivendo solo la UI — e in quel caso il BLE vero
  tornerebbe possibile.
- **Licenza MIT** © 2026 Nicola Tomassini: la più permissiva che mantiene l'attribuzione. Conseguenza
  operativa: niente dipendenze copyleft (GPL/AGPL/LGPL).
- **TypeScript 7** (pin `7.0.2`). È il port nativo in Go del compilatore: `tsc` è un binario per
  piattaforma, distribuito via dipendenze opzionali. Quindi mai installare con `--omit=optional`, e
  i tool che usano la Compiler API (typescript-eslint e simili) vanno verificati contro la 7 in F0.
- **Documentazione interna fuori dal repo pubblico**: su GitHub restano `README.md`, `CHANGELOG.md`,
  `ASSETS.md` e `LICENSE`.
- **Versionamento con criterio**: sotto la 1.0.0 il minore assorbe anche i breaking change; PATCH per
  fix e rifiniture, MINOR per funzionalità nuove e fasi completate, 1.0.0 quando il gioco è
  utilizzabile da terzi. Ogni bump porta insieme `package.json` + entry di changelog + stato delle
  funzionalità.
