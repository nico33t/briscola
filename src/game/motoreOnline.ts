import { scegliCarta } from "@/ai/euristica.ts";
import type { InfoSet } from "@/core/infoset.ts";
import { infoSetPer } from "@/core/infoset.ts";
import { applica, nuovaPartita } from "@/core/machine.ts";
import { creaRng } from "@/core/rng.ts";
import type { Carta, Evento, GameState, Giocata, Seat, Squadra } from "@/core/types.ts";
import type { ContatoreScarti } from "@/transport/protocollo.ts";
import { creaContatoreScarti, parseMessaggio, serializza } from "@/transport/protocollo.ts";
import type { StatoConnessione, Transport } from "@/transport/types.ts";
import { SEAT_CLIENT_REMOTO } from "@/transport/types.ts";

/**
 * Il motore del tavolo online: **TypeScript puro, zero React**.
 *
 * Stesso principio già in uso per `ui/privacyHotSeat.ts` ("logica di stato pura e
 * testata, lo stato UI vero e proprio vive nel componente"): qui la logica
 * dell'host e del client — chi manda cosa, quando si aspetta la conferma, quando
 * scatta il battito cardiaco — vive in due fabbriche (`creaMotoreHost`,
 * `creaMotoreClient`) che si possono creare e pilotare in un test **senza
 * montare un componente**, usando `transport/locale.ts` al posto della rete.
 * `game/usePartitaOnline.ts` le avvolge in due hook React sottili: creano il
 * motore, si iscrivono, e rimappano lo snapshot nella forma `Partita` che
 * `ui/Tavolo.tsx` già conosce.
 *
 * Le regole di gioco restano dov'erano: solo `core/machine.ts` applica una mossa.
 * L'host è l'unico che lo chiama (AGENTS.md §3.4); il client manda intenzioni e
 * aspetta.
 */

const SEAT_HOST: Seat = 0;

/** La presa resta ferma perché si veda chi ha vinto, poi vola — stessa coreografia di `usePartita.ts`. */
export const PAUSA_PRESA_MS = 850;
export const VOLO_PRESA_MS = 480;
/** Pausa prima della mossa dell'IA quando l'host decide di continuare da solo. */
export const PAUSA_AI_MS = 800;

/** Ogni quanto si manda un PING. */
export const INTERVALLO_PING_MS = 3000;
/** Sopra questo tempo senza ricevere nulla dal peer, si considera disconnesso —
 * anche se WebRTC non se n'è ancora accorto (l'ICE può metterci diversi secondi). */
export const TIMEOUT_CONTATTO_MS = 9000;

export interface PresaMostrata {
  readonly banco: readonly Giocata[];
  readonly vincitore: Seat;
  readonly punti: number;
}

/** Un contenitore di ascoltatori, riusato identico da entrambi i motori. */
function creaNotificatore(): { sottoscrivi(cb: () => void): () => void; notifica(): void } {
  const ascoltatori = new Set<() => void>();
  return {
    sottoscrivi(cb) {
      ascoltatori.add(cb);
      return () => ascoltatori.delete(cb);
    },
    notifica() {
      for (const cb of [...ascoltatori]) cb();
    },
  };
}

/** Battito cardiaco applicativo, condiviso da host e client: manda PING a intervalli
 * regolari e richiama `onTimeout` se non arriva nulla dal peer per troppo tempo. */
function avviaBattitoCardiaco(
  transport: Transport,
  onTimeout: () => void,
): { registraContatto(): void; ferma(): void } {
  let ultimoContatto = Date.now();
  const invio = setInterval(() => {
    const testo = serializza({ v: 1, type: "PING", ts: Date.now() });
    if (testo) transport.invia(testo);
  }, INTERVALLO_PING_MS);
  const controllo = setInterval(() => {
    if (Date.now() - ultimoContatto > TIMEOUT_CONTATTO_MS) onTimeout();
  }, INTERVALLO_PING_MS);
  return {
    registraContatto() {
      ultimoContatto = Date.now();
    },
    ferma() {
      clearInterval(invio);
      clearInterval(controllo);
    },
  };
}

// ---------------------------------------------------------------------------
// Host
// ---------------------------------------------------------------------------

export interface StatoHost {
  readonly stato: GameState;
  readonly presa: PresaMostrata | null;
  readonly spazzata: boolean;
  readonly connessione: StatoConnessione;
  readonly seatRemotoInAI: boolean;
  readonly scartati: number;
}

export interface MotoreHost {
  leggi(): StatoHost;
  sottoscrivi(ascoltatore: () => void): () => void;
  /** Il posto locale dell'host (seat 0) gioca una carta. Ignorata se non è il suo turno. */
  gioca(carta: Carta): void;
  /** Passa il seat remoto all'IA (livello Medio) — pensato per dopo una disconnessione. */
  continuaControAI(): void;
  /** Annuncia l'uscita al peer e chiude il canale. */
  abbandona(): void;
  /** Ferma timer e sottoscrizioni. Da chiamare sempre, anche senza `abbandona()`. */
  distruggi(): void;
}

export function creaMotoreHost(
  transport: Transport,
  opzioni: { readonly seed: number },
): MotoreHost {
  let stato = nuovaPartita({ variante: "1v1", seed: opzioni.seed });
  let presa: PresaMostrata | null = null;
  let spazzata = false;
  let connessione: StatoConnessione = transport.stato;
  let seatRemotoInAI = false;
  let benvenutoInviato = false;
  let distrutto = false;

  const rng = creaRng(opzioni.seed ^ 0x9e3779b9);
  const contatore: ContatoreScarti = creaContatoreScarti();
  const { sottoscrivi, notifica } = creaNotificatore();
  const timers = new Set<ReturnType<typeof setTimeout>>();

  function programma(fn: () => void, ms: number): void {
    const id = setTimeout(() => {
      timers.delete(id);
      if (!distrutto) fn();
    }, ms);
    timers.add(id);
  }

  /**
   * 🔴 Filtro in uscita (implements.md §8.3, AGENTS.md §4): `core/machine.ts`
   * produce un evento `PESCATA` per **ogni** posto che pesca dopo una presa,
   * host compreso — e quell'evento porta la carta esatta. Mandarlo al client
   * così com'è rivelerebbe quale carta l'host ha appena pescato: un buco
   * identico a mandare `GameState.mani[0]` per intero. Si tiene solo la
   * `PESCATA` del client stesso (che la vede comunque già in `infoset.mano`,
   * quindi non è un'informazione nuova) e si scartano tutte le altre. Trovato
   * scrivendo `motoreOnline.test.ts` ("il client non riceve mai una carta
   * della mano dell'host o del mazzo") — non un'ipotesi, un bug vero catturato
   * dal test prima che arrivasse in produzione.
   */
  function eventiPubblici(eventi: readonly Evento[]): Evento[] {
    return eventi.filter((e) => e.tipo !== "PESCATA" || e.seat === SEAT_CLIENT_REMOTO);
  }

  function inviaAggiornamento(statoCorrente: GameState, eventi: readonly Evento[]): void {
    const infoset = infoSetPer(statoCorrente, SEAT_CLIENT_REMOTO);
    const testo = serializza({
      v: 1,
      type: "AGGIORNAMENTO",
      infoset,
      eventi: eventiPubblici(eventi),
    });
    if (testo) transport.invia(testo);
  }

  function pianificaFinePresa(): void {
    programma(() => {
      spazzata = true;
      notifica();
      programma(() => {
        presa = null;
        spazzata = false;
        notifica();
      }, VOLO_PRESA_MS);
    }, PAUSA_PRESA_MS);
  }

  function eseguiMossa(statoCorrente: GameState, seat: Seat, carta: Carta): void {
    const risultato = applica(statoCorrente, { tipo: "GIOCA", seat, carta });
    if (!risultato.ok) {
      if (seat === SEAT_CLIENT_REMOTO) {
        const testo = serializza({ v: 1, type: "RIFIUTO", motivo: risultato.motivo });
        if (testo) transport.invia(testo);
      }
      return;
    }
    const eventoPresa = risultato.eventi.find((e) => e.tipo === "PRESA");
    if (eventoPresa?.tipo === "PRESA") {
      presa = {
        banco: [...statoCorrente.banco, { seat, carta }],
        vincitore: eventoPresa.vincitore,
        punti: eventoPresa.punti,
      };
      pianificaFinePresa();
    }
    inviaAggiornamento(risultato.stato, risultato.eventi);
    stato = risultato.stato;
    notifica();
    considerraMossaAI();
  }

  /** Se l'host gioca da solo per il seat remoto (post-disconnessione), programma la sua mossa. */
  function considerraMossaAI(): void {
    if (!seatRemotoInAI || presa || stato.fase === "fine" || stato.turno !== SEAT_CLIENT_REMOTO)
      return;
    programma(() => {
      const carta = scegliCarta(infoSetPer(stato, SEAT_CLIENT_REMOTO), "medio", rng);
      if (carta) eseguiMossa(stato, SEAT_CLIENT_REMOTO, carta);
    }, PAUSA_AI_MS);
  }

  const battito = avviaBattitoCardiaco(transport, () => {
    if (connessione === "chiuso") return;
    connessione = "disconnesso";
    notifica();
  });

  const cancellaMessaggio = transport.onMessaggio((grezzo) => {
    battito.registraContatto();
    const prima = contatore.totale;
    const messaggio = parseMessaggio(grezzo, contatore);
    const scartoCambiato = contatore.totale !== prima;

    if (!messaggio) {
      if (scartoCambiato) notifica();
      return;
    }

    switch (messaggio.type) {
      case "GIOCA_CARTA":
        eseguiMossa(stato, SEAT_CLIENT_REMOTO, messaggio.carta);
        break;
      case "PING": {
        const pong = serializza({ v: 1, type: "PONG", ts: messaggio.ts });
        if (pong) transport.invia(pong);
        break;
      }
      case "BYE":
        if (connessione !== "chiuso") {
          connessione = "disconnesso";
          notifica();
        }
        break;
      case "PONG":
        break;
      default:
        // BENVENUTO/AGGIORNAMENTO/RIFIUTO sono host → client: validi per forma ma
        // fuori posto qui. Si ignorano, non fanno danno.
        break;
    }
    if (scartoCambiato) notifica();
  });

  /** Il canale è pronto (subito con un transport locale, o dopo l'apertura del DataChannel
   * con WebRTC): manda il primo BENVENUTO+stato, una volta sola. */
  function tentaBenvenuto(): void {
    if (connessione !== "connesso" || benvenutoInviato) return;
    benvenutoInviato = true;
    const benvenuto = serializza({
      v: 1,
      type: "BENVENUTO",
      seat: SEAT_CLIENT_REMOTO,
      variante: "1v1",
    });
    if (benvenuto) transport.invia(benvenuto);
    inviaAggiornamento(stato, []);
  }

  const cancellaStato = transport.onStato((s) => {
    connessione = s;
    notifica();
    tentaBenvenuto();
  });
  tentaBenvenuto();

  return {
    leggi(): StatoHost {
      return {
        stato,
        presa,
        spazzata,
        connessione,
        seatRemotoInAI,
        scartati: contatore.totale,
      };
    },
    sottoscrivi,
    gioca(carta) {
      if (presa || stato.fase === "fine" || stato.turno !== SEAT_HOST) return;
      eseguiMossa(stato, SEAT_HOST, carta);
    },
    continuaControAI() {
      if (seatRemotoInAI) return;
      seatRemotoInAI = true;
      notifica();
      considerraMossaAI();
    },
    abbandona() {
      const bye = serializza({ v: 1, type: "BYE" });
      if (bye) transport.invia(bye);
      transport.chiudi();
    },
    distruggi() {
      distrutto = true;
      battito.ferma();
      cancellaMessaggio();
      cancellaStato();
      for (const id of timers) clearTimeout(id);
      timers.clear();
    },
  };
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export interface StatoClient {
  readonly infoset: InfoSet | null;
  readonly presa: PresaMostrata | null;
  readonly spazzata: boolean;
  readonly connessione: StatoConnessione;
  readonly inAttesaConferma: boolean;
  readonly scartati: number;
}

export interface MotoreClient {
  leggi(): StatoClient;
  sottoscrivi(ascoltatore: () => void): () => void;
  gioca(carta: Carta): void;
  abbandona(): void;
  distruggi(): void;
}

export function creaMotoreClient(transport: Transport): MotoreClient {
  let infoset: InfoSet | null = null;
  let presa: PresaMostrata | null = null;
  let spazzata = false;
  let connessione: StatoConnessione = transport.stato;
  let inAttesaConferma = false;
  let distrutto = false;

  const contatore: ContatoreScarti = creaContatoreScarti();
  const { sottoscrivi, notifica } = creaNotificatore();
  const timers = new Set<ReturnType<typeof setTimeout>>();

  function programma(fn: () => void, ms: number): void {
    const id = setTimeout(() => {
      timers.delete(id);
      if (!distrutto) fn();
    }, ms);
    timers.add(id);
  }

  function pianificaFinePresa(): void {
    programma(() => {
      spazzata = true;
      notifica();
      programma(() => {
        presa = null;
        spazzata = false;
        notifica();
      }, VOLO_PRESA_MS);
    }, PAUSA_PRESA_MS);
  }

  const battito = avviaBattitoCardiaco(transport, () => {
    if (connessione === "chiuso") return;
    connessione = "disconnesso";
    notifica();
  });

  const cancellaMessaggio = transport.onMessaggio((grezzo) => {
    battito.registraContatto();
    const prima = contatore.totale;
    const messaggio = parseMessaggio(grezzo, contatore);
    let cambiato = contatore.totale !== prima;

    switch (messaggio?.type) {
      case "AGGIORNAMENTO": {
        // Difesa in profondità: un host buggato non deve poter mandare l'infoset
        // di un altro posto. Non dovrebbe mai succedere (l'host manda sempre a
        // SEAT_CLIENT_REMOTO), ma se succede si scarta come forma invalida.
        if (messaggio.infoset.io !== SEAT_CLIENT_REMOTO) {
          contatore.totale += 1;
          cambiato = true;
          break;
        }
        inAttesaConferma = false;
        const precedente = infoset;
        const cartaGiocata = messaggio.eventi.find((e) => e.tipo === "CARTA_GIOCATA");
        const eventoPresa = messaggio.eventi.find((e) => e.tipo === "PRESA");
        if (precedente && eventoPresa?.tipo === "PRESA" && cartaGiocata?.tipo === "CARTA_GIOCATA") {
          presa = {
            banco: [...precedente.banco, { seat: cartaGiocata.seat, carta: cartaGiocata.carta }],
            vincitore: eventoPresa.vincitore,
            punti: eventoPresa.punti,
          };
          pianificaFinePresa();
        }
        infoset = messaggio.infoset;
        cambiato = true;
        break;
      }
      case "RIFIUTO":
        inAttesaConferma = false;
        cambiato = true;
        break;
      case "PING": {
        const pong = serializza({ v: 1, type: "PONG", ts: messaggio.ts });
        if (pong) transport.invia(pong);
        break;
      }
      case "BYE":
        if (connessione !== "chiuso") {
          connessione = "disconnesso";
          cambiato = true;
        }
        break;
      case "BENVENUTO":
      case "PONG":
        break;
      default:
        break;
    }
    if (cambiato) notifica();
  });

  const cancellaStato = transport.onStato((s) => {
    connessione = s;
    notifica();
  });

  return {
    leggi(): StatoClient {
      return {
        infoset,
        presa,
        spazzata,
        connessione,
        inAttesaConferma,
        scartati: contatore.totale,
      };
    },
    sottoscrivi,
    gioca(carta) {
      if (
        !infoset ||
        presa ||
        infoset.fase === "fine" ||
        infoset.turno !== infoset.io ||
        inAttesaConferma
      ) {
        return;
      }
      inAttesaConferma = true;
      notifica();
      const testo = serializza({ v: 1, type: "GIOCA_CARTA", carta });
      if (testo) transport.invia(testo);
    },
    abbandona() {
      const bye = serializza({ v: 1, type: "BYE" });
      if (bye) transport.invia(bye);
      transport.chiudi();
    },
    distruggi() {
      distrutto = true;
      battito.ferma();
      cancellaMessaggio();
      cancellaStato();
      for (const id of timers) clearTimeout(id);
      timers.clear();
    },
  };
}

/**
 * Chi ha vinto, rispecchiando il confronto ">60" che l'host ha già fatto con
 * `core/machine.ts`'s `esito()` (fonte di verità). Il client non ha `GameState.prese`
 * per richiamare `esito()` davvero (AGENTS.md §3.3: non li riceve mai), e non si
 * aggiunge un campo "vincitore" a `InfoSet`/`Evento` solo per questo — servirebbe
 * toccare `core/`, fuori scope. Duplicazione minima e dichiarata: un solo confronto,
 * su numeri che l'host ha già deciso; se la soglia cambiasse in `core/machine.ts`
 * andrebbe aggiornata anche qui.
 */
export function vincitoreDaPunti(puntiSquadra: readonly [number, number]): Squadra | null {
  if (puntiSquadra[0] > 60) return 0;
  if (puntiSquadra[1] > 60) return 1;
  return null;
}

const CARTA_SEGNAPOSTO: Carta = { seme: "denari", rango: "due" };

/**
 * Ricostruisce un oggetto della stessa FORMA di `GameState`, solo perché
 * `Tavolo.tsx` si aspetta `partita.stato: GameState` — mai per farne un uso che
 * riveli qualcosa che il client non deve sapere.
 *
 * 🔴 Le mani degli altri posti e il mazzo sono riempiti con `CARTA_SEGNAPOSTO`
 * ripetuta quante volte serve: contano solo per la **lunghezza** degli array.
 * `Tavolo.tsx` non legge mai il contenuto di una mano diversa dalla propria (solo
 * `.map((_, i) => <CartaImg coperta />)`), quindi il segnaposto non trapela mai a
 * schermo. Non riusare questo oggetto per altro che il rendering: il client non ha
 * — e non deve avere — le carte vere dell'host o del mazzo (AGENTS.md §3.3).
 */
export function statoVetrinaDaInfoSet(infoset: InfoSet): GameState {
  const giocatori = infoset.cartePerSeat.length;
  const mani = infoset.cartePerSeat.map((quante, seat) =>
    seat === infoset.io
      ? [...infoset.mano]
      : Array.from({ length: quante }, () => CARTA_SEGNAPOSTO),
  );
  return {
    variante: infoset.variante,
    briscola: infoset.briscola,
    cartaBriscola: infoset.cartaBriscola,
    mazzo: Array.from({ length: infoset.carteInMazzo }, () => CARTA_SEGNAPOSTO),
    mani,
    banco: [...infoset.banco],
    diMano: infoset.diMano,
    turno: infoset.turno,
    prese: Array.from({ length: giocatori }, () => []),
    fase: infoset.fase,
  };
}
