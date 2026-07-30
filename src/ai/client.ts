/**
 * Wrapper main-thread per il Web Worker dell'AI (livello Esperto).
 *
 * 🔴 Questo file vive fuori da `core/` e `ismcts.ts` apposta: qui è legittimo
 * usare `Worker`, `postMessage`, `MessageEvent` — è UI-side glue, non il
 * motore di ricerca. `ismcts.ts` e `worker.ts` restano TypeScript puro
 * (AGENTS.md §3.1); questo file è l'unico punto in cui il main thread parla
 * col worker.
 *
 * Uso previsto (`game/usePartita.ts`): un `ClientAI` per partita, creato solo
 * quando serve (livello Esperto) e terminato all'uscita dal tavolo.
 */
import type { InfoSet } from "../core/infoset.ts";
import type { Carta } from "../core/types.ts";
import type { RichiestaMossa, RispostaMossa } from "./worker.ts";

export interface ClientAI {
  /** Chiede la mossa dell'Esperto per questo InfoSet. Si risolve quando il worker risponde. */
  chiediMossa(info: InfoSet, seed: number, iterazioni?: number): Promise<Carta>;
  /** Ferma il worker. Da chiamare all'uscita dal tavolo o allo smontaggio del componente. */
  termina(): void;
}

/** Crea un client collegato a un nuovo Web Worker dedicato all'ISMCTS. */
export function creaClientAI(): ClientAI {
  const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });

  let prossimoId = 0;
  const inSospeso = new Map<
    number,
    { readonly risolvi: (carta: Carta) => void; readonly rifiuta: (errore: Error) => void }
  >();

  worker.onmessage = (evento: MessageEvent<RispostaMossa>) => {
    const risposta = evento.data;
    const richiesta = inSospeso.get(risposta.id);
    if (!richiesta) return;
    inSospeso.delete(risposta.id);
    if (risposta.tipo === "carta") {
      richiesta.risolvi(risposta.carta);
    } else {
      richiesta.rifiuta(new Error(risposta.errore));
    }
  };

  worker.onerror = (evento: ErrorEvent) => {
    // Un worker che esplode (bug, out-of-memory) non deve lasciare la UI in
    // attesa per sempre: si rifiutano tutte le richieste in sospeso.
    for (const [id, richiesta] of inSospeso) {
      richiesta.rifiuta(new Error(evento.message || "il worker dell'AI è andato in errore"));
      inSospeso.delete(id);
    }
  };

  return {
    chiediMossa(info, seed, iterazioni) {
      return new Promise<Carta>((risolvi, rifiuta) => {
        const id = prossimoId++;
        inSospeso.set(id, { risolvi, rifiuta });
        const messaggio: RichiestaMossa =
          iterazioni === undefined ? { id, info, seed } : { id, info, seed, iterazioni };
        worker.postMessage(messaggio);
      });
    },
    termina() {
      worker.terminate();
      inSospeso.clear();
    },
  };
}
