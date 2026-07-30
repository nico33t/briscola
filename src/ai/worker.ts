/**
 * Entry point del Web Worker dell'AI.
 *
 * Questo file — e **solo** questo file — può parlare l'API del Worker
 * (`self`, `postMessage`, `onmessage`). È deliberatamente "solo colla":
 * riceve un messaggio, chiama `ismcts.ts` (TypeScript puro, zero DOM — vedi
 * AGENTS.md §3.1), e rispedisce il risultato. Nessuna logica di gioco né di
 * ricerca vive qui.
 *
 * Il tsconfig del progetto include sia `"DOM"` che `"WebWorker"` nei `lib`
 * (serve DOM per la UI, WebWorker per questo file): le due librerie
 * dichiarano `self` con due tipi incompatibili (`Window` vs
 * `WorkerGlobalScope`). La riga sotto rideclara `self` **solo dentro questo
 * modulo**, con il tipo giusto per un dedicated worker — non tocca il resto
 * del progetto.
 */
declare const self: DedicatedWorkerGlobalScope;

import type { InfoSet } from "../core/infoset.ts";
import { creaRng } from "../core/rng.ts";
import type { Carta } from "../core/types.ts";
import { ITERAZIONI_DEFAULT, scegliCartaISMCTS } from "./ismcts.ts";

/** Richiesta: scegli una carta per l'InfoSet dato, con un seed per la ricerca. */
export interface RichiestaMossa {
  readonly id: number;
  readonly info: InfoSet;
  readonly seed: number;
  /** Facoltativo: per test/tuning. In produzione si usa `ITERAZIONI_DEFAULT`. */
  readonly iterazioni?: number;
}

export type RispostaMossa =
  | { readonly id: number; readonly tipo: "carta"; readonly carta: Carta }
  | { readonly id: number; readonly tipo: "errore"; readonly errore: string };

self.onmessage = (evento: MessageEvent<RichiestaMossa>) => {
  const richiesta = evento.data;
  try {
    const carta = scegliCartaISMCTS(
      richiesta.info,
      { iterazioni: richiesta.iterazioni ?? ITERAZIONI_DEFAULT },
      creaRng(richiesta.seed),
    );
    if (!carta) {
      throw new Error("ISMCTS non ha scelto nessuna carta");
    }
    const risposta: RispostaMossa = { id: richiesta.id, tipo: "carta", carta };
    self.postMessage(risposta);
  } catch (errore) {
    const risposta: RispostaMossa = {
      id: richiesta.id,
      tipo: "errore",
      errore: errore instanceof Error ? errore.message : String(errore),
    };
    self.postMessage(risposta);
  }
};
