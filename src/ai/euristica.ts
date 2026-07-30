import { FORZA, PUNTI } from "../core/deck.ts";
import type { InfoSet } from "../core/infoset.ts";
import type { Rng } from "../core/rng.ts";
import { puntiDelle, squadraDi, vincitorePresa } from "../core/rules.ts";
import type { Carta } from "../core/types.ts";

/**
 * L'avversario euristico.
 *
 * Non simula niente: applica il buon senso della briscola giocata al bar.
 * Vede **solo** l'`InfoSet` — la sua mano, le carte già passate, la briscola —
 * mai le carte altrui. È l'invariante di AGENTS.md §3.3, e qui la firma della
 * funzione lo rende impossibile da violare per sbaglio.
 *
 * L'ISMCTS di F4 userà la stessa firma e questa euristica come policy di
 * rollout: un rollout casuale in briscola è rumorosissimo, guidarlo migliora
 * molto la qualità per iterazione.
 */

/**
 * `esperto` è qui solo perché è il tipo condiviso da tutta l'app (UI,
 * `usePartita`, persistenza). La sua mossa **non** passa da questa funzione:
 * `game/usePartita.ts` la intercetta prima e la manda al Web Worker
 * dell'ISMCTS (`ai/client.ts` + `ai/worker.ts` + `ai/ismcts.ts`) in modo
 * asincrono — macinare centinaia di simulazioni sul thread principale
 * bloccherebbe l'interfaccia. Se `scegliCarta` viene comunque chiamata con
 * `"esperto"` (percorso di ripiego se il worker fallisce), si comporta come
 * `"medio"`: fallback sicuro, mai un crash.
 */
export type Livello = "facile" | "medio" | "esperto";

/**
 * Quanto mi dispiacerebbe perdere questa carta.
 *
 * Non sono solo i punti: una briscola vale molto più del suo valore nominale
 * perché prende, e più è alta più prende. Il due di briscola non vale un punto
 * ma è comunque roba buona.
 */
function costo(carta: Carta, briscola: string): number {
  const base = PUNTI[carta.rango];
  if (carta.seme !== briscola) return base;
  return base + 7 + FORZA[carta.rango] * 0.6;
}

/** Giocando questa carta, il giro lo prende la mia squadra? */
function vincoCon(info: InfoSet, carta: Carta): boolean {
  const banco = [...info.banco, { seat: info.io, carta }];
  return squadraDi(vincitorePresa(banco, info.briscola)) === squadraDi(info.io);
}

/**
 * Quanti punti devono esserci sul banco perché valga la pena spendere questa
 * carta per prendere.
 *
 * Una liscia di un altro seme è gratis: si prende sempre. Una briscola, anche
 * liscia, no — sprecarla per un giro da zero punti significa non averla quando
 * l'avversario cala l'asso.
 */
function sogliaPerPrendere(carta: Carta, briscola: string): number {
  const punti = PUNTI[carta.rango];
  if (carta.seme !== briscola) return punti === 0 ? 0 : 3;
  if (punti === 0) return 4;
  if (punti <= 4) return 9;
  return 11; // asso o tre di briscola: si tirano fuori solo per una presa grossa
}

function piuEconomica(carte: readonly Carta[], briscola: string): Carta | undefined {
  return [...carte].sort((a, b) => costo(a, briscola) - costo(b, briscola))[0];
}

/**
 * Aprendo il giro non so cosa succederà, quindi la regola è: **non regalare
 * punti**. Si sonda con una liscia; i carichi si tengono per prendere, non per
 * offrirli. Le briscole si conservano.
 */
function costoDiApertura(carta: Carta, briscola: string): number {
  const punti = PUNTI[carta.rango];
  const penalitaBriscola = carta.seme === briscola ? 22 : 0;
  return punti * 3 + penalitaBriscola + FORZA[carta.rango] * 0.4;
}

function scegliInApertura(info: InfoSet): Carta | undefined {
  return [...info.mano].sort(
    (a, b) => costoDiApertura(a, info.briscola) - costoDiApertura(b, info.briscola),
  )[0];
}

function scegliInRisposta(info: InfoSet): Carta | undefined {
  const puntiSulBanco = puntiDelle(info.banco.map((g) => g.carta));
  const vincenti = info.mano.filter((c) => vincoCon(info, c));

  const presa = piuEconomica(vincenti, info.briscola);
  if (presa && puntiSulBanco >= sogliaPerPrendere(presa, info.briscola)) {
    return presa;
  }

  // Non conviene (o non si può) prendere: si scarta il meno prezioso.
  return piuEconomica(info.mano, info.briscola);
}

/** La mossa dell'euristica pura, senza rumore. */
export function mossaEuristica(info: InfoSet): Carta | undefined {
  if (info.mano.length === 0) return undefined;
  if (info.mano.length === 1) return info.mano[0];
  return info.banco.length === 0 ? scegliInApertura(info) : scegliInRisposta(info);
}

/**
 * La carta scelta dall'AI.
 *
 * `facile` gioca a caso metà delle volte: serve a chi sta imparando, non è
 * un'euristica peggiore ma la stessa resa incostante — che è esattamente il
 * modo in cui gioca male una persona.
 */
export function scegliCarta(info: InfoSet, livello: Livello, rng: Rng): Carta | undefined {
  if (info.mano.length === 0) return undefined;

  if (livello === "facile" && rng() < 0.5) {
    return info.mano[Math.floor(rng() * info.mano.length)];
  }
  return mossaEuristica(info);
}
