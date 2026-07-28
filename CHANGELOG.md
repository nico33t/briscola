# Changelog

Tutte le modifiche rilevanti a **Briscola**. Formato [Keep a Changelog](https://keepachangelog.com/it/1.1.0/),
versionamento [SemVer](https://semver.org/lang/it/). Le versioni seguono `package.json`.
**Più recenti in alto. Questo file si appende, non si riscrive** (vedi [`AGENTS.md`](./AGENTS.md) §0-bis).

---

## [Unreleased]

> **Stato corrente:** F1 chiusa. Il gioco sa già giocare — non ha ancora una faccia.
> Prossimo passo: **F2 — la pipeline degli asset**: ritagliare le 40 carte piacentine
> dall'immagine public domain di Wikimedia e disegnare il retro.

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
