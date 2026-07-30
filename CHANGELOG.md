# Changelog

Tutte le modifiche rilevanti a **Briscola**. Formato [Keep a Changelog](https://keepachangelog.com/it/1.1.0/),
versionamento [SemVer](https://semver.org/lang/it/). Le versioni seguono `package.json`.
**Più recenti in alto. Questo file si appende, non si riscrive** (vedi [`AGENTS.md`](./AGENTS.md) §0-bis).

---

## [Unreleased]

> **Stato corrente:** ci si gioca, è **online**, si installa come app, contro il computer c'è
> anche un livello che pensa sul serio, si può abbandonare una partita in corso, e in due (o in
> quattro) sullo stesso device si passa il telefono senza sbirciare le carte degli altri. La
> variante 2v2 è giocabile in locale, sia contro l'AI sia in hot-seat.
> Prossimo passo: il multiplayer P2P (F6), poi il 2v2 via P2P (F7 rimanente).

---

## [0.9.0] — 2026-07-30 — Variante 2v2 giocabile in locale (F7, parte locale)

### Aggiunto
- **Setup 2v2** (`ui/screens/Gioca.tsx`): nuova scelta "Variante" (1 contro 1 / in coppia 2 contro
  2) sopra la scelta "Con chi", che ora si adatta al testo secondo la variante. Per il 2v2 due
  modalità, entrambe riuso della stessa `Modalita` binaria già esistente (`"ai" | "locale"`), senza
  aggiungere un terzo valore:
  - **Contro il computer**: umano al seat 0, AI ovunque altro — compreso il compagno al seat 2. Un
    solo livello di difficoltà selezionabile, valido per tutti e tre gli avversari IA (dichiarato a
    schermo: "Vale per tutti e tre gli avversari IA, compreso il tuo compagno").
  - **In quattro**: hot-seat, quattro umani sullo stesso device, si passa il telefono a ogni turno.
  - **Fuori scope, deliberatamente**: una via di mezzo (due umani + due AI) non esiste. Il binomio
    `Modalita` la escluderebbe comunque senza un terzo stato, e non era richiesta — vedi "Perché"
    più sotto.
- **Tavolo 2v2** (`ui/Tavolo.tsx`): quattro posizioni — basso (tu), destra, alto (compagno),
  sinistra — nel giro orario che rispecchia come ci si siede davvero attorno a un tavolo da coppie
  (0+2 contro 1+3, `squadraDi` del core). Banco fino a 4 carte per presa. Punteggio di squadra
  live in alto ("Voi X · Loro Y", solo nel 2v2) più il punteggio per singolo posto accanto a ogni
  mano, come nell'1v1. Nomi automatici: "Tu", "Compagno", "Avversario 1"/"Avversario 2" in modalità
  AI; "Giocatore 1..4" in hot-seat (generalizzazione della funzione già esistente per l'1v1).
- **Animazioni laterali** (`index.css`): `gioca-da-sinistra`/`gioca-da-destra` (ingresso della
  carta calata da un posto laterale, stessa idea ad arco+overshoot di `gioca-dal-basso`/
  `gioca-dallalto` ma sull'asse orizzontale) e `vola-a-sinistra`/`vola-a-destra` (la presa vinta
  vola verso un avversario laterale, stesso "strappo" prima del volo delle due esistenti verticali).
  La direzione si sceglie in base alla posizione del vincitore rispetto a chi guarda
  (`posizioneDi` in `Tavolo.tsx`), non più cablata a "sopra/sotto": l'1v1 continua a usare solo
  `gioca-dal-basso`/`gioca-dallalto` perché con due posti l'offset è sempre 0 o "alto".
- **`game/usePartita.ts` generalizzato da 2 a 4 posti**: l'unico posto umano in modalità "ai" resta
  il seat 0 in entrambe le varianti; tutti gli altri (1 nell'1v1, 1-2-3 nel 2v2) sono AI e giocano
  in sequenza — un solo Web Worker basta anche nel 2v2, perché un solo posto AI gioca alla volta.
  **Ogni AI riceve solo il proprio `infoSetPer(stato, quel seat)`** (AGENTS.md §3.3): il
  compagno-AI non vede la mano dell'umano più di quanto la veda un avversario — invariante
  verificato dal test dedicato in `game/integrazione2v2.test.ts`. Aggiunto `puntiSquadra` al
  `Partita` restituito dall'hook (riusa `esito(stato).punti`, nessun calcolo duplicato).
- **Persistenza 2v2** (`game/persistenza.ts`): `ConfigPartita` ha un nuovo campo `variante`.
  Migrazione difensiva, non un bump di chiave: un salvataggio senza `config.variante` (quelli
  scritti prima di questa versione) resta valido e defaulta alla `variante` già letta dallo
  `stato` — che per un salvataggio pre-2v2 è sempre stata `"1v1"`. Nuova validazione: il numero di
  mani/prese nello stato deve combaciare con `numeroGiocatori(variante)` (un 2v2 con due sole mani
  è uno stato che il core non produce mai da solo, quindi è manomesso o corrotto).

### Corretto
- **`validaSalvataggio` accettava solo `livello: "facile" | "medio"`**, escludendo `"esperto"` per
  una svista risalente a prima che il livello Esperto esistesse (F4, 0.7.0): un salvataggio con
  l'AI Esperta veniva scartato in silenzio al primo refresh, sia nell'1v1 sia nel 2v2. Bug
  pre-esistente, non introdotto da questa fase — corretto qui perché toccava direttamente la
  persistenza del 2v2 con Esperto, che questa fase doveva garantire.

### Test
- `src/game/integrazione2v2.test.ts` (nuovo, 7 test): partita 2v2 completa **giocata da quattro AI
  euristiche** attraverso lo stesso percorso di `usePartita` (reducer puro + `scegliCarta`, mai
  `usePartita` stesso — è un hook React, si guida il reducer direttamente come fa già
  `machine.test.ts`), su decine di seed diversi. Verifica: la partita finisce sempre, mani e mazzo
  si svuotano, **120 punti esatti di squadra** su 60 partite, 40 carte tutte distinte finiscono
  nelle prese, `esito()` dichiara la squadra giusta o il pareggio 60-60, i punti di squadra restano
  la somma dei compagni. Test dedicato che rigioca una partita registrando **a ogni turno** se
  l'infoset di quel seat conteneva una carta di un altro seat: mai, su tutta la partita — la
  verifica strutturale dell'invariante AGENTS.md §3.3 applicata a una partita 2v2 intera, non solo
  a chiamate isolate.
- `src/ui/privacyHotSeat.test.ts` (+5 test): rotazione completa 0→1→2→3→0 a quattro posti, il
  compagno (seat 2, "di fronte" nel giro) va in attesa come chiunque altro, nessuna reazione mentre
  la presa vola anche a metà di un giro a 4, idempotenza per ciascuno dei tre seat non confermati,
  pulizia dell'attesa se il turno torna indietro saltando posti. **Il modulo non è stato toccato**:
  questi test dimostrano che la logica esistente (mai scritta pensando solo a due posti) gira
  identica a quattro — nessuna riga nuova in `privacyHotSeat.ts`.
- `src/game/persistenza.test.ts` (+8 test): accetta una partita 2v2 salvata, accetta il livello
  Esperto (prova della correzione sopra), migrazione di un salvataggio senza `config.variante`,
  rifiuta una `variante` inventata (in config o in stato), rifiuta un `config.variante` che non
  combacia con `stato.variante`, rifiuta un 2v2 con solo due mani.
- Suite completa: **146 test verdi** (128 preesistenti + 18 nuovi).

### Perché — decisioni prese
- **Nessuna modalità "due umani + due AI"**: il compito la lasciava fuori esplicitamente se avesse
  complicato troppo. Con `Modalita` binaria, "contro il computer" è sempre "un solo umano, il
  resto AI" e "locale" è sempre "tutti umani" — estendere a una combinazione intermedia avrebbe
  richiesto un terzo stato e una UI per scegliere chi controlla ogni seat, un salto di complessità
  non giustificato da questa fase (che è "locale, F7 parte 1" — il P2P vero, dove servirà comunque
  distinguere "questo peer controlla quale seat", arriva in una fase successiva).
- **`privacyHotSeat.ts` non toccato**: verificato leggendolo che nessuna funzione enumera "l'altro
  giocatore" a mano — `Seat` era già `0|1|2|3` e la logica confronta sempre `turnoAttuale` con
  `seatConfermato`, mai con un valore cablato. Estendere un modulo che già funziona sarebbe stato
  lavoro sprecato e rischio di regressione; i test nuovi lo dimostrano invece di "fidarsi a vista".
- **Un solo Web Worker anche nel 2v2**: i tre posti AI (o uno, nell'1v1) giocano sempre in
  sequenza — mai in contemporanea, perché `core/machine.ts` è a turni singoli — quindi il client
  esistente (`ai/client.ts`) si riusa senza modifiche: basta passare `stato.turno` invece del
  vecchio `SEAT_AI` fisso.
- **`squadreDi`/`nomeSquadra` invece di trattare 1v1 e 2v2 come due casi**: la schermata di fine
  partita (`FinePartita` in `Tavolo.tsx`) raggruppa i posti per squadra con `squadraDi` del core;
  nell'1v1 ogni squadra ha un solo posto e la stessa funzione produce lo stesso risultato di prima
  — zero rami `if (variante === "2v2")` sparsi nel componente.
- **Nessun buco trovato nel core**: `core/machine.ts`, `core/rules.ts` e `core/infoset.ts`
  supportavano già il 2v2 per intero da F1 (`numeroGiocatori`, `squadraDi`, `puntiSquadra`,
  distribuzione a 4 mani/28 carte residue) — confermato da `machine.test.ts` e `infoset.test.ts`
  preesistenti. Nessuna riga toccata in nessuno dei tre file, come richiesto.
- **Verificato in browser reale** (Chrome via chrome-devtools MCP, `npm run dev`): 2v2 contro il
  computer giocato per 3 prese complete (mazzo 28→24→20→16, punteggi di squadra aggiornati
  correttamente — "Loro 27" = 11+16), cambio di variante e modalità nel setup (le etichette
  cambiano dinamicamente), partita 2v2 salvata e ripresa identica dopo un reload della pagina
  (incluso `config.variante` nel salvataggio), hot-seat a quattro giocatori con overlay privacy
  verificato sia visivamente sia nella rotazione della prospettiva (compagno/avversari
  ricalcolati correttamente da qualunque seat), 1v1 rigiocato per verificare l'assenza di
  regressioni. **Zero errori in console** in tutte le sessioni, a parte gli avvisi preesistenti di
  sviluppo (Vite HMR, suggerimento React DevTools, un meta tag PWA deprecato non toccato da questa
  fase).

---

## [0.8.0] — 2026-07-30 — Abbandona partita, schermo privacy hot-seat, animazioni rifatte

### Aggiunto
- **Abbandona partita**: voce discreta "Abbandona" nell'angolo in alto a sinistra del tavolo (al
  posto del vecchio link "← Menu", che usciva senza chiedere conferma e senza ripulire il
  salvataggio). Apre un `Dialog` shadcn di conferma ("Vuoi abbandonare la partita?"); alla
  conferma richiama lo stesso `onEsci` già usato da "Cambia partita" a fine partita — pulisce
  `briscola.partita.v1` (`dimenticaPartita()`) e torna al setup. Funziona identica in entrambe le
  modalità (vs AI e in due): non serve nessuna logica specifica per modalità.
- **Schermo privacy hot-seat** (`src/ui/SchermoPrivacy.tsx` + `src/ui/privacyHotSeat.ts`): **solo**
  in modalità "in due", mai contro l'AI. A ogni cambio di turno tra i due giocatori, un overlay
  nero a schermo intero copre le carte con "Tocca a te, Giocatore N" finché non si sblocca con un
  doppio tocco/doppio click sull'overlay, o da tastiera con due Invio/Spazio ravvicinati (finestra
  600ms). `role="dialog"` + `aria-modal="true"`, focus portato subito sull'overlay, e il contenuto
  sottostante marcato `inert` mentre è attivo — irraggiungibile sia da tastiera che da screen
  reader, non solo coperto visivamente.
- **Animazioni riviste** (`src/index.css`, tutte transform/opacity, zero librerie nuove):
  - **Carte giocate**: da traslazione dritta a un arco con leggero overshoot e rotazione
    specchiata fra "dal basso" (propria mano) e "dall'alto" (avversario/hot-seat) — l'overshoot
    vive nel keyframe stesso (60% oltre il 100%), non nella timing function, per un effetto "a
    molla" puramente dichiarativo.
  - **Presa vinta**: le carte volano verso il vincitore con un piccolo "strappo" (scala su +
    controrotazione) prima del volo, e uno scaglionamento di 60ms fra le carte del giro invece di
    volare tutte insieme.
  - **Distribuzione e pescata**: nuova animazione `pescata-in-mano`, la carta arriva dalla
    posizione del mazzo (in alto a destra) ruotata come appena sfilata da un dealer — sia
    all'apertura della mano sia a ogni pescata durante il giro, che riusano lo stesso ingresso per
    costruzione (ogni carta nuova nell'array della mano monta da sé).
  - **Micro-interazioni**: hover con lift maggiore + ombra (`drop-shadow`) sulle carte in mano,
    press più marcato e immediato — pensato anche per il touch, dove l'affordance "giocabile" resta
    comunque leggibile dal contrasto pieno/attenuato fra carte giocabili e non.
  - Tutte spente da `prefers-reduced-motion` tramite la regola universale già in `index.css`
    (nessuna eccezione per classe: il blocco `*, *::before, *::after { animation-duration: 0.01ms
    !important; ... }` copre anche le nuove classi per costruzione).

### Test
- `src/ui/privacyHotSeat.test.ts` (12 test): stato iniziale, nessuna reazione a turno invariato,
  attesa che scatta al cambio turno, **nessuna reazione mentre la presa è in corso** (ferma o in
  volo), scatto solo dopo che la presa ha finito di volare, nessuna attesa se il vincitore della
  presa è già chi tiene il telefono, idempotenza, pulizia dell'attesa se il turno torna indietro
  prima della conferma, sblocco in entrambe le direzioni (G1→G2 e G2→G1).
- Suite completa: **128 test verdi** (116 preesistenti + 12 nuovi).

### Perché — decisioni prese
- **Overlay disaccoppiato da `stato.turno`**: il `core` fa passare il turno al vincitore della
  presa nello stesso istante in cui la chiude, ma visivamente la presa resta ferma e poi vola per
  ~1.3s (vedi `PAUSA_PRESA_MS`/`VOLO_PRESA_MS` in `usePartita.ts`, invariati). L'overlay privacy
  aspetta che quella coreografia sia finita (`presa === null`) prima di attivarsi, altrimenti
  nasconderebbe l'esito della mano a metà. Verificato in browser misurando i millisecondi reali
  tra il click e la comparsa dell'overlay: la scritta "Presa di …" resta visibile ~1.3s con overlay
  assente, poi l'overlay compare — combacia esattamente con le due costanti.
  Verificato anche il caso limite: se lo stesso giocatore che teneva il telefono vince la propria
  presa (resta lui di mano), l'overlay **non** scatta — non c'è nessun telefono da passare.
- **`seatVisibile` invece di `seatUmano` in tutto il rendering del Tavolo**: finché l'overlay è a
  schermo, la mano mostrata resta congelata sul giocatore già confermato (`privacy.seatConfermato`)
  anche se il `core` ha già cambiato `stato.turno` — altrimenti la mano del prossimo giocatore
  comparirebbe un istante prima che l'overlay la coprisse.
- **Riuso di `onEsci` per "Abbandona"** invece di una nuova funzione: è lo stesso percorso già
  testato per "Cambia partita" a fine partita (pulizia + ritorno al setup), niente logica duplicata.
- **Niente `animate-in`/`slide-in-from-*` di tailwindcss-animate per le carte sul banco**: quelle
  utility vivono nel layer CSS `utilities` (priorità più alta di `@layer base`, dove stanno le
  nostre classi), quindi in teoria potrebbero vincere sulle proprietà di `.vola-giu`/`.vola-su` se
  restassero applicate insieme. Le nuove classi d'ingresso (`gioca-dal-basso`/`gioca-dallalto`)
  vivono anche loro in `@layer base`, stesso layer di `.vola-giu`/`.vola-su`: l'override fra le due
  resta prevedibile (vince l'ultima dichiarata nel foglio), verificato in browser con
  `getAnimations()` sull'elemento durante il volo — risulta in esecuzione solo
  `vola-verso-il-basso`/`vola-verso-l-alto`, mai `enter`.

---

## [0.7.0] — 2026-07-30 — F4: il livello Esperto pensa davvero (ISMCTS in Web Worker)

### Aggiunto
- **Livello AI "Esperto"**: Information Set Monte Carlo Tree Search (`ai/ismcts.ts`). A ogni
  iterazione determinizza l'`InfoSet` (mescola le carte non viste e le distribuisce fra le mani
  avversarie e il mazzo, rispettando i conteggi noti e lasciando la briscola scoperta in fondo al
  mazzo), simula con il **reducer di `core/`** — mai una riga di regole duplicata — e accumula le
  statistiche su un albero UCB1 (`c = √2`) indicizzato dalla sequenza di carte giocate, non dallo
  stato completo. Il rollout usa la stessa euristica del livello Medio invece che mosse a caso:
  in Briscola un rollout casuale è troppo rumoroso per essere utile.
- **`ai/ismcts.ts` è TypeScript puro**, come `core/`: zero DOM, zero `window`, zero API del Worker,
  zero React. Gira identico dentro Vitest (Node), nel Web Worker e — se un giorno servirà il
  porting Expo/React Native (vedi implements.md §3.8) — lì pure, senza toccare una riga.
- **`ai/worker.ts`**: entry del Web Worker, "solo colla" — riceve `{info, seed}` via
  `postMessage`, chiama `ismcts.ts`, risponde con la carta. È l'unico file che parla l'API del
  Worker: il tsconfig ha sia `"DOM"` che `"WebWorker"` nei `lib` (le due dichiarano `self` con tipi
  incompatibili), risolto con un `declare const self: DedicatedWorkerGlobalScope` locale a quel
  modulo soltanto.
- **`ai/client.ts`**: wrapper main-thread (`creaClientAI().chiediMossa(info, seed)`), l'unico punto
  in cui la UI parla col worker. Gestisce anche un worker che va in errore: le richieste in sospeso
  vengono rifiutate invece di restare appese per sempre.
- **`game/usePartita.ts`**: il livello Esperto passa dal worker in modo **asincrono** (Facile e
  Medio restano sincroni, come prima). Il worker si crea solo quando serve e si smonta al cambio
  di livello o all'uscita dal tavolo. Se il worker fallisce, si ripiega sull'euristica Medio invece
  di incastrare la partita.
- **Setup partita**: l'opzione "Esperto" nella schermata `#/gioca`, con nota che la ricerca gira
  in un Web Worker e non blocca l'interfaccia.
- **Torneo di validazione** (`ai/ismcts.test.ts`, 15 test): Esperto vs Medio su 200 partite e
  Esperto vs Random su 100, con meno iterazioni che in produzione per stare sotto il minuto.
  Risultati reali: **65,5% di vittorie contro il Medio** (soglia richiesta >55%) e **74,0% contro
  il caso**. Più test dedicati: la determinizzazione non assegna mai una carta già vista, le mani
  determinizzate hanno le taglie giuste, l'ISMCTS ritorna sempre una carta legale, stesso seed →
  stessa carta.

### Perché — decisioni prese durante F4
- **Budget a iterazioni, non a tempo.** implements.md §6.3 parlava di un budget a tempo (~700 ms);
  qui la funzione di ricerca resta pura e deterministica (niente `Date.now` dentro `ismcts.ts`,
  serve per il test "stesso seed → stessa carta"), e il tempo si ottiene tarando il numero di
  iterazioni: `ITERAZIONI_DEFAULT = 15 000`, misurato a ~0,045-0,07 ms/iterazione, per restare
  nell'intorno dei 700 ms su un device comune.
- **Espansione guidata dall'euristica, non a caso.** Prima versione: quando un nodo non è ancora
  espanso del tutto rispetto al mondo determinizzato, si sceglieva la mossa non provata a caso fra
  quelle disponibili. Col ramo hidden-information che esplode (ogni determinizzazione può rivelare
  una mano avversaria diversa), il budget si spargeva su rami implausibili e il vantaggio della
  ricerca non cresceva più iterazioni. Preferire la mossa che l'euristica giocherebbe in quel
  mondo (quando è ancora da espandere) concentra la ricerca dove conta: prima della correzione il
  torneo contro il Medio oscillava 54-59% indipendentemente dal budget; dopo, 62-69% e crescente
  con più iterazioni — segno che l'algoritmo ora scala come dovrebbe.
- **Le prese ripartono vuote nella determinizzazione.** Il mondo simulato non ricostruisce le
  carte esatte già prese (l'`InfoSet` non le conosce comunque, solo il totale punti): si somma la
  costante nota (`info.puntiSquadra`) fuori dalla ricerca, e il punteggio si normalizza in [0, 1]
  sui punti ancora in palio. Più semplice e altrettanto corretto di una ricostruzione via
  subset-sum delle prese storiche.
- **"Stracciare il random" quantificato a >65%, non >80%.** Contro un avversario puramente
  casuale il vantaggio della ricerca si appiattisce presto (la policy di rollout modella un
  avversario ragionevole, non uno che gioca a caso): il Medio stesso vince "solo" il 69,5% contro
  il caso (dato già in implements.md). 74% per l'Esperto è comunque un margine netto sul pareggio
  a 60 punti, ed è il numero vero misurato, non un obiettivo scelto a tavolino.

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

## [0.6.0] — 2026-07-28 — Diventa un'app, e non perde più la partita

### Aggiunto
- **La partita non si perde più.** Ogni mossa finisce in `localStorage`: ricaricare la pagina per
  sbaglio ti riporta esattamente dov'eri — stesse carte, stessi punti, stesso turno. A partita
  finita il salvataggio si cancella da sé, così al ritorno si riparte dal menu invece di riaprire
  un tavolo già chiuso.
- **Installabile come app.** `manifest.webmanifest` + service worker scritto a mano: si aggiunge
  alla schermata home, si apre a tutto schermo e **funziona senza rete**. Due scorciatoie nel
  manifest: *Nuova partita* e *Le 40 carte*.
- **Icona dell'app: le tre carte del menu**, a ventaglio sul feltro. Non è un disegno a parte — è
  generata dalle carte vere (`npm run icons:build`), così chi la vede sulla home riconosce subito
  cos'è. Quattro tagli: 192, 512, una `maskable` con il ventaglio dentro la zona sicura (Android
  ritaglia i bordi come vuole) e l'`apple-touch-icon`.

### Modificato
- **Il verde arriva fino ai bordi.** `html` e `body` hanno lo sfondo del feltro, e `theme-color`
  tinge la barra del browser. Non è un vezzo: su iOS il rimbalzo dello scroll scopre lo sfondo del
  documento e in standalone quello sfondo riempie la barra di stato — se resta bianco, l'app sembra
  rotta proprio dove dovrebbe sembrare un'app.
- **Il campo da gioco non scorre più.** Il tavolo occupa esattamente una viewport (`h-dvh`) e
  mentre si gioca la pagina è bloccata, con rispetto per le safe area di iPhone. Le altre schermate
  continuano a scorrere: il blocco si toglie all'uscita dal tavolo.
- Il tema è ora sempre scuro: il dialogo di fine partita non è più una scheda bianca sopra un
  tavolo verde.

### Sicurezza
Quello che si rilegge da `localStorage` è trattato come **input non fidato**, esattamente come sarà
un messaggio dal DataChannel: può essere di una versione vecchia, troncato, o modificato a mano da
chi vuole darsi tre assi. Si valida tutto — semi, ranghi, posti, forma del banco — e il controllo
che chiude la porta è l'ultimo: **40 carte, tutte diverse**. Un salvataggio con un asso in più viene
buttato e si riparte dal menu. **11 test** su questo, incluso il caso del doppione che tiene il
totale a 40.

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
