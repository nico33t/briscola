/**
 * Vocabolario del gioco. Nessuna logica qui dentro, solo i tipi.
 *
 * Regola del modulo `core/`: TypeScript puro. Niente React, niente DOM,
 * niente I/O, niente Math.random. Vedi AGENTS.md §3.1.
 */

export const SEMI = ["denari", "coppe", "bastoni", "spade"] as const;
export type Seme = (typeof SEMI)[number];

export const RANGHI = [
  "asso",
  "due",
  "tre",
  "quattro",
  "cinque",
  "sei",
  "sette",
  "fante",
  "cavallo",
  "re",
] as const;
export type Rango = (typeof RANGHI)[number];

export interface Carta {
  readonly seme: Seme;
  readonly rango: Rango;
}

/** Identificatore stabile di una carta, comodo come chiave React e nei confronti. */
export type IdCarta = `${Seme}-${Rango}`;

/** Posto al tavolo. Nell'1v1 esistono solo 0 e 1. */
export type Seat = 0 | 1 | 2 | 3;

/** Nel 2v2 i compagni siedono alternati: 0+2 contro 1+3. */
export type Squadra = 0 | 1;

export type Variante = "1v1" | "2v2";

export type Fase = "gioco" | "fine";

export interface Giocata {
  readonly seat: Seat;
  readonly carta: Carta;
}

/**
 * Lo stato completo della partita. È **immutabile**: il reducer non lo modifica
 * mai, ne restituisce uno nuovo.
 *
 * I punti non stanno qui: si ricavano da `prese` con `puntiSeat`. Tenerli anche
 * nello stato creerebbe una seconda fonte di verità che prima o poi diverge.
 */
export interface GameState {
  readonly variante: Variante;
  /** Il seme di briscola. */
  readonly briscola: Seme;
  /** La carta scoperta che ha definito la briscola: sta in fondo al mazzo. */
  readonly cartaBriscola: Carta;
  /** Carte ancora da pescare, in ordine. L'ultima è `cartaBriscola`. */
  readonly mazzo: readonly Carta[];
  /** Le mani, indicizzate per seat. */
  readonly mani: readonly (readonly Carta[])[];
  /** Le carte già giocate nel giro in corso, in ordine di giocata. */
  readonly banco: readonly Giocata[];
  /** Chi ha aperto il giro in corso. */
  readonly diMano: Seat;
  /** Chi deve giocare adesso. */
  readonly turno: Seat;
  /** Le carte vinte, indicizzate per seat. */
  readonly prese: readonly (readonly Carta[])[];
  readonly fase: Fase;
}

export type Azione = {
  readonly tipo: "GIOCA";
  readonly seat: Seat;
  readonly carta: Carta;
};

export type Evento =
  | { readonly tipo: "CARTA_GIOCATA"; readonly seat: Seat; readonly carta: Carta }
  | {
      readonly tipo: "PRESA";
      readonly vincitore: Seat;
      readonly carte: readonly Carta[];
      readonly punti: number;
    }
  | { readonly tipo: "PESCATA"; readonly seat: Seat; readonly carta: Carta }
  | { readonly tipo: "FINE"; readonly punti: readonly [number, number] };

/**
 * L'esito di un'azione. Non si lanciano eccezioni per una mossa illegale:
 * le mosse arrivano anche dalla rete, e un peer ostile non deve poter far
 * esplodere l'host. Vedi AGENTS.md §4.
 */
export type Risultato =
  | { readonly ok: true; readonly stato: GameState; readonly eventi: readonly Evento[] }
  | { readonly ok: false; readonly motivo: string };
