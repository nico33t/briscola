/**
 * Generatore pseudocasuale seedato.
 *
 * Serve perché `core/` deve restare deterministico: `Math.random()` renderebbe
 * impossibili i replay e le simulazioni ripetibili dell'AI. Vedi AGENTS.md §3.1.
 *
 * Algoritmo: mulberry32 — piccolo, veloce, qualità più che sufficiente per
 * mescolare un mazzo. Non è crittografico e non deve esserlo.
 */

export type Rng = () => number;

/** Costruisce un generatore. Lo stesso seme produce sempre la stessa sequenza. */
export function creaRng(seed: number): Rng {
  let stato = seed >>> 0;

  return () => {
    stato = (stato + 0x6d2b79f5) >>> 0;
    let t = stato;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
