import { applica, nuovaPartita } from "@/core/machine.ts";
import type { Azione, GameState, Variante } from "@/core/types.ts";
import { eCarta, eSeat } from "@/game/persistenza.ts";

/**
 * Replay: rigioca una partita passo-passo dal seme iniziale e dalla sequenza
 * di mosse, senza salvare nessuno stato intermedio.
 *
 * Funziona perché `core/machine.ts` è un reducer puro con **solo** un PRNG
 * seedato come fonte di casualità (AGENTS.md §3.1): `nuovaPartita({variante,
 * seed})` più `applica(stato, azione)` applicata in sequenza riproducono
 * **esattamente** la stessa partita, sempre. Non serve salvare `GameState` a
 * ogni mossa: bastano seme + azioni, la stessa idea di un replay di scacchi
 * con la notazione delle mosse invece delle 40 fotografie della scacchiera.
 *
 * Limite dichiarato: se la pagina viene ricaricata a metà partita, il log
 * delle azioni riparte vuoto (vedi `game/usePartita.ts`, `replayAffidabileRef`)
 * — quella specifica partita non avrà un replay affidabile, ma resta comunque
 * nelle statistiche. Non si rincolla lo stato completo nel salvataggio
 * corrente solo per coprire questo caso raro: il costo (un altro campo da
 * validare difensivamente) non vale il beneficio.
 */

export const CHIAVE_REPLAY = "briscola.replays.v1";

/** Oltre questa soglia i replay più vecchi perdono le azioni: restano solo nelle statistiche. */
export const MAX_REPLAY = 20;

export interface ReplayPartita {
  readonly id: string;
  readonly variante: Variante;
  readonly seed: number;
  readonly azioni: readonly Azione[];
}

export interface RegistroReplayV1 {
  readonly versione: 1;
  readonly replay: readonly ReplayPartita[];
}

export function registroVuoto(): RegistroReplayV1 {
  return { versione: 1, replay: [] };
}

function eAzione(valore: unknown): valore is Azione {
  if (typeof valore !== "object" || valore === null) return false;
  const a = valore as Record<string, unknown>;
  return a.tipo === "GIOCA" && eSeat(a.seat) && eCarta(a.carta);
}

function eReplayPartita(valore: unknown): ReplayPartita | null {
  if (typeof valore !== "object" || valore === null) return null;
  const r = valore as Record<string, unknown>;
  if (typeof r.id !== "string" || r.id === "") return null;
  if (r.variante !== "1v1" && r.variante !== "2v2") return null;
  if (typeof r.seed !== "number" || !Number.isFinite(r.seed)) return null;
  if (!Array.isArray(r.azioni) || !r.azioni.every(eAzione)) return null;
  return { id: r.id, variante: r.variante, seed: r.seed, azioni: r.azioni };
}

/**
 * Difensivo come `validaSalvataggio`, ma non tutto-o-niente: un replay
 * corrotto si scarta e si tengono gli altri. Perdere un replay non rompe
 * niente (resta comunque il record nelle statistiche), quindi non vale la
 * pena buttare via l'intero registro per una voce sola andata male.
 */
export function validaRegistroReplay(valore: unknown): RegistroReplayV1 {
  if (typeof valore !== "object" || valore === null) return registroVuoto();
  const v = valore as Record<string, unknown>;
  if (v.versione !== 1 || !Array.isArray(v.replay)) return registroVuoto();

  const replay: ReplayPartita[] = [];
  for (const voce of v.replay) {
    const valida = eReplayPartita(voce);
    if (valida) replay.push(valida);
  }
  return { versione: 1, replay };
}

/** Aggiunge un replay, scartando i più vecchi oltre `MAX_REPLAY`. Pura, testata a parte. */
export function aggiungiReplay(registro: RegistroReplayV1, voce: ReplayPartita): RegistroReplayV1 {
  const replay = [...registro.replay, voce];
  const eccesso = replay.length - MAX_REPLAY;
  return { versione: 1, replay: eccesso > 0 ? replay.slice(eccesso) : replay };
}

export function trovaReplay(registro: RegistroReplayV1, id: string): ReplayPartita | null {
  return registro.replay.find((r) => r.id === id) ?? null;
}

export function caricaRegistroReplay(): RegistroReplayV1 {
  try {
    const grezzo = localStorage.getItem(CHIAVE_REPLAY);
    if (!grezzo) return registroVuoto();
    return validaRegistroReplay(JSON.parse(grezzo));
  } catch {
    return registroVuoto();
  }
}

export function salvaRegistroReplay(registro: RegistroReplayV1): void {
  try {
    localStorage.setItem(CHIAVE_REPLAY, JSON.stringify(registro));
  } catch {
    // Spazio esaurito o modalità privata: si perde solo il replay, non la partita.
  }
}

export function svuotaRegistroReplay(): void {
  try {
    localStorage.removeItem(CHIAVE_REPLAY);
  } catch {
    // niente da fare
  }
}

export interface PassoReplay {
  readonly stato: GameState;
  /** La mossa che ha portato a questo stato. `null` per il primo passo, appena distribuito. */
  readonly azione: Azione | null;
}

/**
 * Ricostruisce l'intera sequenza di stati di una partita da seme + azioni.
 *
 * Si ferma (senza lanciare) alla prima azione rifiutata dal reducer: un log
 * di azioni arriva da `localStorage`, quindi va trattato come input non
 * fidato quanto un salvataggio di partita (AGENTS.md §4) — un replay
 * troncato è meglio di un replay che manda in crash la schermata.
 */
export function ricostruisciPassi(
  variante: Variante,
  seed: number,
  azioni: readonly Azione[],
): PassoReplay[] {
  const iniziale = nuovaPartita({ variante, seed });
  const passi: PassoReplay[] = [{ stato: iniziale, azione: null }];

  let corrente = iniziale;
  for (const azione of azioni) {
    const risultato = applica(corrente, azione);
    if (!risultato.ok) break;
    corrente = risultato.stato;
    passi.push({ stato: corrente, azione });
  }
  return passi;
}
