import { mazzoCompleto, mescola, stessaCarta } from "./deck.ts";
import { creaRng } from "./rng.ts";
import { puntiDelle, squadraDi, vincitorePresa } from "./rules.ts";
import type {
  Azione,
  Carta,
  Evento,
  GameState,
  Risultato,
  Seat,
  Squadra,
  Variante,
} from "./types.ts";

/**
 * La macchina a stati della partita: `(stato, azione) => nuovo stato`.
 *
 * È una funzione pura. Lo stesso reducer gira nella UI, dentro il Web Worker
 * dell'AI e sull'host P2P: se si sporca di I/O o di casualità non seedata, i tre
 * divergono. Vedi AGENTS.md §3.1.
 *
 * Non sa nulla di chi sia umano, AI o remoto: sa solo di chi è il turno.
 */

export interface OpzioniPartita {
  readonly variante: Variante;
  readonly seed: number;
}

const CARTE_IN_MANO = 3;

export function numeroGiocatori(variante: Variante): 2 | 4 {
  return variante === "1v1" ? 2 : 4;
}

function prossimoSeat(seat: Seat, giocatori: number): Seat {
  return ((seat + 1) % giocatori) as Seat;
}

/**
 * Distribuisce e apre la partita.
 *
 * Tre carte a testa, poi si scopre la carta successiva: definisce la briscola e
 * finisce **in fondo al mazzo**, quindi sarà l'ultima a essere pescata.
 */
export function nuovaPartita({ variante, seed }: OpzioniPartita): GameState {
  const giocatori = numeroGiocatori(variante);
  const mescolato = mescola(mazzoCompleto(), creaRng(seed));

  const mani: Carta[][] = [];
  let indice = 0;
  for (let seat = 0; seat < giocatori; seat++) {
    mani.push(mescolato.slice(indice, indice + CARTE_IN_MANO));
    indice += CARTE_IN_MANO;
  }

  const cartaBriscola = mescolato[indice];
  if (!cartaBriscola) {
    throw new Error("nuovaPartita: mazzo esaurito prima di scoprire la briscola");
  }
  indice += 1;

  return {
    variante,
    briscola: cartaBriscola.seme,
    cartaBriscola,
    mazzo: [...mescolato.slice(indice), cartaBriscola],
    mani,
    banco: [],
    diMano: 0,
    turno: 0,
    prese: Array.from({ length: giocatori }, () => []),
    fase: "gioco",
  };
}

/**
 * Applica una mossa.
 *
 * Non lancia eccezioni sulle mosse illegali: le azioni arrivano anche dalla rete
 * e un peer ostile non deve poter far esplodere l'host. Restituisce invece un
 * risultato con il motivo del rifiuto. Vedi AGENTS.md §4.
 */
export function applica(stato: GameState, azione: Azione): Risultato {
  if (stato.fase === "fine") {
    return { ok: false, motivo: "la partita è già finita" };
  }

  const giocatori = numeroGiocatori(stato.variante);

  if (!Number.isInteger(azione.seat) || azione.seat < 0 || azione.seat >= giocatori) {
    return { ok: false, motivo: `seat ${azione.seat} non esiste in una partita ${stato.variante}` };
  }
  if (azione.seat !== stato.turno) {
    return { ok: false, motivo: `non è il turno di ${azione.seat}, tocca a ${stato.turno}` };
  }

  const mano = stato.mani[azione.seat];
  if (!mano) {
    return { ok: false, motivo: `nessuna mano per il seat ${azione.seat}` };
  }

  const posizione = mano.findIndex((c) => stessaCarta(c, azione.carta));
  const carta = mano[posizione];
  if (posizione < 0 || !carta) {
    return { ok: false, motivo: "quella carta non è nella mano del giocatore" };
  }

  const mani = stato.mani.map((m, seat) =>
    seat === azione.seat ? [...m.slice(0, posizione), ...m.slice(posizione + 1)] : [...m],
  );
  const banco = [...stato.banco, { seat: azione.seat, carta }];
  const eventi: Evento[] = [{ tipo: "CARTA_GIOCATA", seat: azione.seat, carta }];

  // Il giro non è ancora chiuso: passa la mano al prossimo.
  if (banco.length < giocatori) {
    return {
      ok: true,
      stato: { ...stato, mani, banco, turno: prossimoSeat(azione.seat, giocatori) },
      eventi,
    };
  }

  return chiudiGiro(stato, mani, banco, eventi, giocatori);
}

/** Assegna la presa, fa pescare e decide se la partita è finita. */
function chiudiGiro(
  stato: GameState,
  mani: Carta[][],
  banco: readonly { seat: Seat; carta: Carta }[],
  eventi: Evento[],
  giocatori: number,
): Risultato {
  const vincitore = vincitorePresa(banco, stato.briscola);
  const carteDelGiro = banco.map((g) => g.carta);

  const prese = stato.prese.map((p, seat) =>
    seat === vincitore ? [...p, ...carteDelGiro] : [...p],
  );
  eventi.push({
    tipo: "PRESA",
    vincitore,
    carte: carteDelGiro,
    punti: puntiDelle(carteDelGiro),
  });

  // Pescata: prima chi ha vinto, poi gli altri in ordine di turno.
  const mazzo = [...stato.mazzo];
  for (let k = 0; k < giocatori && mazzo.length > 0; k++) {
    const seat = ((vincitore + k) % giocatori) as Seat;
    const pescata = mazzo.shift();
    if (!pescata) break;
    mani[seat]?.push(pescata);
    eventi.push({ tipo: "PESCATA", seat, carta: pescata });
  }

  const finita = mazzo.length === 0 && mani.every((m) => m.length === 0);

  const nuovoStato: GameState = {
    ...stato,
    mani,
    mazzo,
    prese,
    banco: [],
    diMano: vincitore,
    turno: vincitore,
    fase: finita ? "fine" : "gioco",
  };

  if (finita) {
    eventi.push({
      tipo: "FINE",
      punti: [puntiSquadra(nuovoStato, 0), puntiSquadra(nuovoStato, 1)],
    });
  }

  return { ok: true, stato: nuovoStato, eventi };
}

/** Punti incassati da un posto. Derivati dalle prese: non esiste un contatore. */
export function puntiSeat(stato: GameState, seat: Seat): number {
  return puntiDelle(stato.prese[seat] ?? []);
}

/** Punti di una squadra. Nell'1v1 coincide con i punti del singolo. */
export function puntiSquadra(stato: GameState, squadra: Squadra): number {
  const giocatori = numeroGiocatori(stato.variante);
  let totale = 0;
  for (let seat = 0; seat < giocatori; seat++) {
    if (squadraDi(seat as Seat) === squadra) {
      totale += puntiSeat(stato, seat as Seat);
    }
  }
  return totale;
}

/** Chi ha vinto. Sopra 60 si vince, 60 pari è pareggio. */
export function esito(stato: GameState): {
  readonly vincitore: Squadra | null;
  readonly punti: readonly [number, number];
} {
  const a = puntiSquadra(stato, 0);
  const b = puntiSquadra(stato, 1);
  const vincitore: Squadra | null = a > 60 ? 0 : b > 60 ? 1 : null;
  return { vincitore, punti: [a, b] };
}
