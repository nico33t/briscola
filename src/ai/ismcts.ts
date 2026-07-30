import { idCarta, mescola, stessaCarta } from "../core/deck.ts";
import type { InfoSet } from "../core/infoset.ts";
import { carteNonViste } from "../core/infoset.ts";
import { applica, numeroGiocatori, puntiSquadra } from "../core/machine.ts";
import type { Rng } from "../core/rng.ts";
import { squadraDi } from "../core/rules.ts";
import type { Carta, GameState, IdCarta, Seat } from "../core/types.ts";
import { mossaEuristica } from "./euristica.ts";

/**
 * ISMCTS — Information Set Monte Carlo Tree Search per il livello "Esperto".
 *
 * 🔴 TypeScript puro (AGENTS.md §3.1): zero DOM, zero `window`, zero React,
 * zero API del Web Worker, zero I/O. La casualità entra **solo** dal `Rng`
 * passato dal chiamante. È il modulo pensato per girare identico in Node
 * (test Vitest), dentro il Web Worker e — un giorno — in un porting Expo/React
 * Native: qualunque riferimento a `self`/`postMessage`/DOM qui dentro
 * brucerebbe quella portabilità. Quella roba sta in `worker.ts`, che è solo
 * colla.
 *
 * 🔴 Invariante di correttezza (AGENTS.md §3.3 / implements.md §6.5): riceve
 * **solo** l'`InfoSet` del proprio seat. Non ha modo di vedere le mani
 * altrui: la determinizzazione ne inventa una distribuzione plausibile,
 * diversa a ogni iterazione, e la ricerca media il risultato su tante mani
 * possibili invece che su una sola (quella vera, che non conosce).
 *
 * Algoritmo (Cowling, Powley & Whitehouse — Information Set MCTS, single
 * tree): a ogni iterazione si campiona un mondo concreto coerente con
 * l'`InfoSet`, e sul mondo campionato si esegue un passo classico di
 * MCTS — selezione UCB1, espansione, rollout con la policy euristica,
 * backpropagation. L'albero è indicizzato dalla **sequenza di carte
 * giocate**, non dallo stato completo: è l'unica cosa che tutte le
 * determinizzazioni condividono, perché ogni carta giocata è per
 * definizione osservabile da chiunque sia al tavolo.
 */

export interface OpzioniISMCTS {
  /** Numero di iterazioni (determinizzazione + simulazione) da eseguire. */
  readonly iterazioni: number;
  /** Costante di esplorazione UCB1. Default √2, il valore da manuale (implements.md §6.3). */
  readonly c?: number;
}

/**
 * Iterazioni di default per il livello Esperto in partita reale.
 *
 * implements.md §6.3 parla di un budget **a tempo** (~700 ms): qui il budget
 * è a iterazioni per restare deterministico e testabile (stesso seed, stesso
 * risultato, sempre — vedi il test di determinismo). Il numero è tarato
 * empiricamente (misurato con `Date.now()` fuori da questo modulo, non qui
 * dentro — niente `Date.now` nel motore di ricerca) perché un dispositivo
 * comune resti nell'intorno dei 700 ms: ~0.045-0.07 ms/iterazione su un
 * portatile recente, quindi ~15 000 iterazioni.
 */
export const ITERAZIONI_DEFAULT = 15_000;

const COSTANTE_UCB1_DEFAULT = Math.SQRT2;
/** Difesa: una partita di Briscola non arriva mai a così tante mosse residue. */
const PROFONDITA_MASSIMA_ROLLOUT = 80;

interface Nodo {
  /** Il seat che ha scelto la mossa per arrivare a questo nodo: a lui appartiene `valore`. */
  readonly seatMossa: Seat;
  visite: number;
  valore: number;
  readonly figli: Map<IdCarta, Nodo>;
}

function creaNodo(seatMossa: Seat): Nodo {
  return { seatMossa, visite: 0, valore: 0, figli: new Map() };
}

/**
 * Determinizza l'information set: distribuisce a caso le carte non viste fra
 * le mani avversarie e il mazzo, rispettando i due soli vincoli noti
 * (implements.md §6.2) — i conteggi per seat e la briscola scoperta che resta
 * in fondo al mazzo finché non è stata pescata.
 *
 * Le prese ripartono vuote apposta: da qui in avanti serve solo il punteggio
 * **guadagnato da questo momento**, non la composizione esatta delle prese
 * già fatte (di cui l'InfoSet non conosce comunque le singole carte, solo il
 * totale in `puntiSquadra`). Il chiamante somma quel totale al risultato
 * della simulazione — sommare una costante nota non cambia in nulla quale
 * mossa convenga di più adesso.
 */
export function determinizza(info: InfoSet, rng: Rng): GameState {
  const giocatori = numeroGiocatori(info.variante);
  const pool = mescola(carteNonViste(info), rng);
  let cursore = 0;

  const mani: Carta[][] = [];
  for (let seat = 0; seat < giocatori; seat++) {
    if (seat === info.io) {
      mani.push([...info.mano]);
      continue;
    }
    const quante = info.cartePerSeat[seat] ?? 0;
    mani.push(pool.slice(cursore, cursore + quante));
    cursore += quante;
  }

  const cartePescabiliCasuali = info.briscolaInFondoAlMazzo
    ? Math.max(0, info.carteInMazzo - 1)
    : info.carteInMazzo;
  const mazzoCasuale = pool.slice(cursore, cursore + cartePescabiliCasuali);
  const mazzo = info.briscolaInFondoAlMazzo ? [...mazzoCasuale, info.cartaBriscola] : mazzoCasuale;

  return {
    variante: info.variante,
    briscola: info.briscola,
    cartaBriscola: info.cartaBriscola,
    mazzo,
    mani,
    banco: [...info.banco],
    diMano: info.diMano,
    turno: info.turno,
    prese: Array.from({ length: giocatori }, () => []),
    fase: info.fase,
  };
}

function cartaCasuale(mano: readonly Carta[], rng: Rng): Carta {
  const carta = mano[Math.floor(rng() * mano.length)];
  if (!carta) throw new Error("ismcts: mano vuota dove non dovrebbe esserlo");
  return carta;
}

/** Gioca fino alla fine con la policy euristica: un rollout a caso, in Briscola, è troppo rumoroso. */
function rollout(stato: GameState, rng: Rng): GameState {
  let corrente = stato;
  let passi = 0;
  while (corrente.fase !== "fine") {
    if (passi++ > PROFONDITA_MASSIMA_ROLLOUT) {
      throw new Error("ismcts: rollout oltre il limite di sicurezza, possibile bug nel reducer");
    }
    const mano = corrente.mani[corrente.turno] ?? [];
    const info: InfoSet = infoSetDiSimulazione(corrente, corrente.turno);
    const carta = mossaEuristica(info) ?? cartaCasuale(mano, rng);
    const risultato = applica(corrente, { tipo: "GIOCA", seat: corrente.turno, carta });
    if (!risultato.ok) {
      throw new Error(`ismcts: mossa di rollout rifiutata dal core (${risultato.motivo})`);
    }
    corrente = risultato.stato;
  }
  return corrente;
}

/**
 * L'infoset di un seat **dentro un mondo già determinizzato**: qui non c'è
 * nessuna violazione dell'invariante §3.3, perché il mondo intero è
 * un'invenzione della ricerca, non lo stato reale. Serve solo a riusare
 * `mossaEuristica` come policy di rollout senza duplicare la sua logica.
 */
function infoSetDiSimulazione(stato: GameState, seat: Seat): InfoSet {
  const viste: Carta[] = [...stato.prese.flat(), ...stato.banco.map((g) => g.carta)];
  return {
    variante: stato.variante,
    io: seat,
    briscola: stato.briscola,
    cartaBriscola: stato.cartaBriscola,
    briscolaInFondoAlMazzo: stato.mazzo.length > 0,
    mano: stato.mani[seat] ?? [],
    banco: stato.banco,
    viste,
    carteInMazzo: stato.mazzo.length,
    cartePerSeat: stato.mani.map((m) => m.length),
    diMano: stato.diMano,
    turno: stato.turno,
    puntiSquadra: [puntiSquadra(stato, 0), puntiSquadra(stato, 1)],
    fase: stato.fase,
  };
}

/** Seleziona il figlio migliore secondo UCB1, fra le mosse legali in questo mondo. */
function selezionaUCB1(nodo: Nodo, mosseLegali: readonly Carta[], c: number, rng: Rng): Carta {
  let migliore: Carta | undefined;
  let miglioreValore = Number.NEGATIVE_INFINITY;

  for (const carta of mosseLegali) {
    const figlio = nodo.figli.get(idCarta(carta));
    if (!figlio || figlio.visite === 0) continue;
    const sfruttamento = figlio.valore / figlio.visite;
    const esplorazione = c * Math.sqrt(Math.log(Math.max(1, nodo.visite)) / figlio.visite);
    const punteggio = sfruttamento + esplorazione;
    if (punteggio > miglioreValore) {
      miglioreValore = punteggio;
      migliore = carta;
    }
  }

  return migliore ?? cartaCasuale(mosseLegali, rng);
}

/**
 * La carta scelta dal livello Esperto.
 *
 * Funzione pura: stesso `InfoSet`, stesse `opzioni` e stessa sequenza del
 * `Rng` ⇒ sempre la stessa carta (vedi il test di determinismo). Nessun'altra
 * fonte di casualità: niente `Math.random`, niente `Date.now`.
 */
export function scegliCartaISMCTS(
  info: InfoSet,
  opzioni: OpzioniISMCTS,
  rng: Rng,
): Carta | undefined {
  if (info.mano.length === 0) return undefined;
  if (info.mano.length === 1) return info.mano[0];

  const c = opzioni.c ?? COSTANTE_UCB1_DEFAULT;
  const iterazioni = Math.max(1, Math.floor(opzioni.iterazioni));
  // Normalizza il punteggio in [0, 1]: quanti punti restano ancora da
  // assegnare da qui alla fine della partita determinizzata. Sommare la
  // costante di punti già in tasca (nota dall'InfoSet) non cambia la mossa
  // migliore, quindi non serve calcolarla — conta solo qui in avanti.
  const totaleRimanente = Math.max(1, 120 - info.puntiSquadra[0] - info.puntiSquadra[1]);

  const radice = creaNodo(info.io);

  for (let iterazione = 0; iterazione < iterazioni; iterazione++) {
    let stato = determinizza(info, rng);
    let nodo = radice;
    const percorso: Nodo[] = [];

    // --- selezione + espansione (un solo nodo nuovo per iterazione) ---
    while (stato.fase !== "fine") {
      const mosseLegali = stato.mani[stato.turno] ?? [];
      if (mosseLegali.length === 0) break; // difesa: non dovrebbe accadere

      const nonEspanse = mosseLegali.filter((carta) => !nodo.figli.has(idCarta(carta)));

      if (nonEspanse.length > 0) {
        // Con un budget limitato, il ramo hidden-information esplode: quasi
        // ogni determinizzazione rivela una mano diversa per l'avversario, e
        // "espandi un figlio nuovo a caso" sparpaglia le iterazioni su rami
        // implausibili invece di approfondirli. Si preferisce espandere la
        // mossa che l'euristica giocherebbe in questo mondo — assumere un
        // avversario ragionevole concentra la ricerca dove conta. Le
        // alternative restano comunque raggiungibili: appena la preferita ha
        // un figlio, il turno successivo tocca a un'altra non ancora esplorata.
        const preferita = mossaEuristica(infoSetDiSimulazione(stato, stato.turno));
        const scelta =
          preferita && nonEspanse.some((c) => stessaCarta(c, preferita))
            ? preferita
            : nonEspanse[Math.floor(rng() * nonEspanse.length)];
        if (!scelta) break;
        const risultato = applica(stato, { tipo: "GIOCA", seat: stato.turno, carta: scelta });
        if (!risultato.ok) break; // difesa
        const figlio = creaNodo(stato.turno);
        nodo.figli.set(idCarta(scelta), figlio);
        percorso.push(figlio);
        stato = risultato.stato;
        nodo = figlio;
        break; // dopo l'espansione si passa direttamente al rollout
      }

      const scelta = selezionaUCB1(nodo, mosseLegali, c, rng);
      const risultato = applica(stato, { tipo: "GIOCA", seat: stato.turno, carta: scelta });
      if (!risultato.ok) break; // difesa
      const figlio = nodo.figli.get(idCarta(scelta));
      if (!figlio) break; // non dovrebbe accadere: UCB1 sceglie solo fra i già espansi
      percorso.push(figlio);
      stato = risultato.stato;
      nodo = figlio;
    }

    // --- rollout ---
    const finale = stato.fase === "fine" ? stato : rollout(stato, rng);

    // --- backpropagation ---
    const puntiFinali: readonly [number, number] = [
      puntiSquadra(finale, 0),
      puntiSquadra(finale, 1),
    ];
    for (const tappa of percorso) {
      const squadra = squadraDi(tappa.seatMossa);
      tappa.visite += 1;
      tappa.valore += puntiFinali[squadra] / totaleRimanente;
    }
  }

  // Scelta finale: il figlio più visitato ("robust child") — più stabile
  // della sola media quando il budget di iterazioni è limitato.
  let migliore: Carta | undefined;
  let migliorVisite = -1;
  for (const carta of info.mano) {
    const visite = radice.figli.get(idCarta(carta))?.visite ?? 0;
    if (visite > migliorVisite) {
      migliorVisite = visite;
      migliore = carta;
    }
  }

  return migliore ?? mossaEuristica(info) ?? cartaCasuale(info.mano, rng);
}
