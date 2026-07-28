import { FORZA, PUNTI } from "./deck.ts";
import type { Carta, Giocata, Seat, Seme, Squadra } from "./types.ts";

/**
 * Le regole della Briscola vivono **solo qui**. Se la UI o l'AI hanno bisogno di
 * sapere chi prende o quanto vale un mucchio, chiamano queste funzioni: non
 * riscrivono la logica "perché lì è più comodo". Vedi AGENTS.md §3.2.
 */

/**
 * `sfidante` batte `campione`?
 *
 * `campione` è per costruzione o una briscola o una carta del seme d'apertura,
 * quindi bastano tre casi.
 */
function batte(sfidante: Carta, campione: Carta, briscola: Seme): boolean {
  const sfidanteBriscola = sfidante.seme === briscola;
  const campioneBriscola = campione.seme === briscola;

  if (sfidanteBriscola && !campioneBriscola) return true;
  if (!sfidanteBriscola && campioneBriscola) return false;
  if (sfidante.seme !== campione.seme) return false; // seme diverso, non briscola: non prende
  return FORZA[sfidante.rango] > FORZA[campione.rango];
}

/**
 * Chi vince il giro.
 *
 * Prende la briscola più alta se ne è stata giocata almeno una; altrimenti la
 * carta più alta del **seme d'apertura**. Una carta di seme diverso e non
 * briscola non prende mai, per quanti punti valga.
 *
 * Nella Briscola **non c'è obbligo di rispondere al seme**: giocare una carta
 * "fuori seme" è sempre legale, semplicemente non prende.
 */
export function vincitorePresa(banco: readonly Giocata[], briscola: Seme): Seat {
  const apertura = banco[0];
  if (!apertura) {
    throw new Error("vincitorePresa: il banco è vuoto");
  }

  let migliore = apertura;
  for (let i = 1; i < banco.length; i++) {
    const sfidante = banco[i];
    if (!sfidante) continue;
    if (batte(sfidante.carta, migliore.carta, briscola)) {
      migliore = sfidante;
    }
  }
  return migliore.seat;
}

/** Quanto vale un mucchio di carte. */
export function puntiDelle(carte: readonly Carta[]): number {
  let totale = 0;
  for (const carta of carte) {
    totale += PUNTI[carta.rango];
  }
  return totale;
}

/**
 * A che squadra appartiene un posto.
 *
 * Nel 2v2 i compagni siedono alternati (0+2 contro 1+3); nell'1v1 ognuno è la
 * propria squadra, e la formula funziona lo stesso.
 */
export function squadraDi(seat: Seat): Squadra {
  return (seat % 2) as Squadra;
}
