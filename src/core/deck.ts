import type { Rng } from "./rng.ts";
import { type Carta, type IdCarta, RANGHI, type Rango, SEMI } from "./types.ts";

export { RANGHI, SEMI };

/**
 * Quanto vale ogni carta. La somma sull'intero mazzo fa **120 esatti**:
 * è l'invariante che i test controllano a ogni partita simulata.
 */
export const PUNTI: Readonly<Record<Rango, number>> = {
  asso: 11,
  tre: 10,
  re: 4,
  cavallo: 3,
  fante: 2,
  sette: 0,
  sei: 0,
  cinque: 0,
  quattro: 0,
  due: 0,
};

/**
 * Ordine di forza dentro lo stesso seme: asso > 3 > re > cavallo > fante >
 * 7 > 6 > 5 > 4 > 2. Attenzione: **non coincide con i punti** — il 2 di
 * briscola vale zero punti ma prende l'asso di un altro seme.
 */
export const FORZA: Readonly<Record<Rango, number>> = {
  asso: 10,
  tre: 9,
  re: 8,
  cavallo: 7,
  fante: 6,
  sette: 5,
  sei: 4,
  cinque: 3,
  quattro: 2,
  due: 1,
};

/** Identificatore stabile, usato per confronti e come chiave React. */
export function idCarta(carta: Carta): IdCarta {
  return `${carta.seme}-${carta.rango}`;
}

export function stessaCarta(a: Carta, b: Carta): boolean {
  return a.seme === b.seme && a.rango === b.rango;
}

/** Le 40 carte, in ordine canonico: per seme, dall'asso al re. */
export function mazzoCompleto(): Carta[] {
  const carte: Carta[] = [];
  for (const seme of SEMI) {
    for (const rango of RANGHI) {
      carte.push({ seme, rango });
    }
  }
  return carte;
}

/**
 * Fisher-Yates con generatore seedato. Restituisce un nuovo array: il mazzo
 * passato non viene toccato.
 */
export function mescola(carte: readonly Carta[], rng: Rng): Carta[] {
  const risultato = [...carte];
  for (let i = risultato.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = risultato[i];
    const b = risultato[j];
    // Non può accadere: i e j sono sempre dentro i limiti. Il controllo esiste
    // solo perché `noUncheckedIndexedAccess` non può saperlo.
    if (a === undefined || b === undefined) continue;
    risultato[i] = b;
    risultato[j] = a;
  }
  return risultato;
}
