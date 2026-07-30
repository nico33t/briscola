import type { StatoConnessione, Transport } from "./types.ts";

/**
 * Trasporto in-process: due estremità collegate in memoria, nessuna rete.
 *
 * Serve a una cosa sola: **testare tutto il protocollo P2P senza il browser e
 * senza WebRTC**. Ha la stessa forma esatta di `webrtc.ts` (stessa interfaccia
 * `Transport`), quindi il codice che parla con un `Transport` — `protocollo.ts`,
 * `game/usePartitaOnline.ts` — non sa e non deve sapere se dall'altra parte c'è un
 * `RTCDataChannel` vero o questa coppia finta. È lo stesso principio del pattern
 * "adapter" già usato per l'AI (`ai/client.ts` sincrono in test, Worker in browser).
 *
 * La consegna è **asincrona** (una microtask), non sincrona: un canale vero non
 * consegna mai nello stesso tick in cui si è chiamato `send`, e un trasporto finto
 * che lo facesse nasconderebbe bug di rientranza che un trasporto vero
 * rivelerebbe. I test che vogliono osservare l'effetto di `invia` aspettano un
 * `await` (anche solo `await Promise.resolve()`), esattamente come aspetterebbero
 * la rete vera.
 */

class EndpointLocale implements Transport {
  private statoInterno: StatoConnessione = "connesso";
  private altro: EndpointLocale | null = null;
  private readonly ascoltatoriMessaggio = new Set<(dato: string) => void>();
  private readonly ascoltatoriStato = new Set<(stato: StatoConnessione) => void>();

  get stato(): StatoConnessione {
    return this.statoInterno;
  }

  /** @internal collegamento reciproco, fatto una volta sola da `creaCoppiaLocale`. */
  collega(altro: EndpointLocale): void {
    this.altro = altro;
  }

  invia(dato: string): void {
    if (this.statoInterno !== "connesso" || !this.altro) return;
    const destinatario = this.altro;
    // Copia difensiva degli ascoltatori al momento della consegna: se uno di loro
    // si disiscrive mentre gira, non deve alterare l'iterazione in corso.
    queueMicrotask(() => {
      if (destinatario.statoInterno !== "connesso") return;
      for (const ascolta of [...destinatario.ascoltatoriMessaggio]) ascolta(dato);
    });
  }

  onMessaggio(ascoltatore: (dato: string) => void): () => void {
    this.ascoltatoriMessaggio.add(ascoltatore);
    return () => this.ascoltatoriMessaggio.delete(ascoltatore);
  }

  onStato(ascoltatore: (stato: StatoConnessione) => void): () => void {
    this.ascoltatoriStato.add(ascoltatore);
    return () => this.ascoltatoriStato.delete(ascoltatore);
  }

  chiudi(): void {
    if (this.statoInterno === "chiuso") return;
    this.impostaStato("chiuso");
    const altro = this.altro;
    if (altro && altro.statoInterno !== "chiuso") {
      // Dall'altra parte non si è chiusa una scelta: è la connessione che è
      // caduta da sotto i piedi — proprio come una scheda del browser chiusa
      // fa cadere il DataChannel dell'altro lato senza preavviso.
      queueMicrotask(() => altro.impostaStato("disconnesso"));
    }
  }

  private impostaStato(nuovo: StatoConnessione): void {
    if (this.statoInterno === nuovo) return;
    this.statoInterno = nuovo;
    for (const ascolta of [...this.ascoltatoriStato]) ascolta(nuovo);
  }
}

/**
 * Crea una coppia di trasporti collegati fra loro: `[latoHost, latoClient]`. Cosa
 * inviato da uno arriva all'altro (asincrono, vedi sopra) e viceversa. Partono già
 * "connesso": non c'è handshake di rete da simulare, l'app costruisce comunque il
 * proprio handshake applicativo (`BENVENUTO`) sopra, come farebbe con WebRTC.
 */
export function creaCoppiaLocale(): readonly [Transport, Transport] {
  const a = new EndpointLocale();
  const b = new EndpointLocale();
  a.collega(b);
  b.collega(a);
  return [a, b];
}
