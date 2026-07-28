import { idCarta, mazzoCompleto } from "./deck.ts";
import { puntiSquadra } from "./machine.ts";
import type { Carta, Fase, GameState, Giocata, Seat, Seme, Squadra, Variante } from "./types.ts";

/**
 * La proiezione dello stato dal punto di vista di **un solo giocatore**.
 *
 * 🔴 Invariante di progetto (AGENTS.md §3.3): l'AI e i client remoti ricevono
 * **soltanto** un `InfoSet`, mai un `GameState`. Passare lo stato completo
 * all'AI non produce nessun errore — produce un avversario che indovina troppo,
 * ed è il bug più silenzioso che questo progetto possa avere.
 *
 * Cosa si può legittimamente sapere, seduti al tavolo:
 * - le proprie carte;
 * - la briscola, che è scoperta;
 * - tutte le carte già passate sul tavolo;
 * - quante carte restano nel mazzo e quante ne ha in mano ciascuno;
 * - i punti, che si contano a vista.
 *
 * Cosa non si sa: le carte in mano agli altri e l'ordine del mazzo.
 */
export interface InfoSet {
  readonly variante: Variante;
  /** Il posto dal quale si sta guardando. */
  readonly io: Seat;
  readonly briscola: Seme;
  /** La carta scoperta che ha definito la briscola: la vedono tutti. */
  readonly cartaBriscola: Carta;
  /** Vero finché quella carta è ancora in fondo al mazzo, ultima a essere pescata. */
  readonly briscolaInFondoAlMazzo: boolean;
  /** La propria mano. */
  readonly mano: readonly Carta[];
  /** Le carte sul banco nel giro in corso. */
  readonly banco: readonly Giocata[];
  /** Tutte le carte già passate sul tavolo: prese di chiunque, più il banco. */
  readonly viste: readonly Carta[];
  /** Quante carte restano da pescare — non quali. */
  readonly carteInMazzo: number;
  /** Quante carte ha in mano ciascun posto. */
  readonly cartePerSeat: readonly number[];
  readonly diMano: Seat;
  readonly turno: Seat;
  readonly puntiSquadra: readonly [number, number];
  readonly fase: Fase;
}

/** Proietta lo stato dal punto di vista di `seat`. */
export function infoSetPer(stato: GameState, seat: Seat): InfoSet {
  const viste: Carta[] = [...stato.prese.flat(), ...stato.banco.map((g) => g.carta)];

  return {
    variante: stato.variante,
    io: seat,
    briscola: stato.briscola,
    cartaBriscola: stato.cartaBriscola,
    briscolaInFondoAlMazzo: stato.mazzo.length > 0,
    mano: [...(stato.mani[seat] ?? [])],
    banco: [...stato.banco],
    viste,
    carteInMazzo: stato.mazzo.length,
    cartePerSeat: stato.mani.map((m) => m.length),
    diMano: stato.diMano,
    turno: stato.turno,
    puntiSquadra: [puntiSquadra(stato, 0 as Squadra), puntiSquadra(stato, 1 as Squadra)],
    fase: stato.fase,
  };
}

/**
 * Le carte di cui **non si conosce la posizione**: stanno in mano a qualcun
 * altro oppure nel mazzo.
 *
 * È il punto di partenza della determinizzazione dell'ISMCTS (F4): si mescolano
 * queste e si distribuiscono rispettando `cartePerSeat`.
 *
 * La carta di briscola scoperta è **esclusa** finché è in fondo al mazzo: la sua
 * posizione è nota con certezza, sarà l'ultima pescata. Chi determinizza deve
 * rimetterla lì, non trattarla come ignota.
 */
export function carteNonViste(info: InfoSet): Carta[] {
  const note = new Set<string>();
  for (const carta of info.mano) note.add(idCarta(carta));
  for (const carta of info.viste) note.add(idCarta(carta));
  if (info.briscolaInFondoAlMazzo) note.add(idCarta(info.cartaBriscola));

  return mazzoCompleto().filter((carta) => !note.has(idCarta(carta)));
}
