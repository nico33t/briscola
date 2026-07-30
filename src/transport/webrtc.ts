import type { StatoConnessione, Transport } from "./types.ts";

/**
 * Trasporto WebRTC: `RTCPeerConnection` + `RTCDataChannel`, signaling **manuale**
 * (offer/answer scambiati a mano, come QR o stringa — vedi `ui/OnlineLobby.tsx`).
 * Nessun server di signaling: implements.md §8.1.
 *
 * Niente trickle ICE: si aspetta `iceGatheringState === 'complete'` (con un tempo
 * massimo, sotto) prima di produrre il blob, così l'SDP è completo e il blob è
 * **unico** — non serve un secondo giro per i candidati che arrivano dopo.
 *
 * Lo SDP è testo ripetitivo (righe `a=candidate` quasi identiche): si comprime con
 * `CompressionStream('deflate')` prima di trasformarlo in base64url. Fallback
 * automatico (nessuna compressione, solo base64url) se l'API manca — non dovrebbe
 * succedere sui browser target (Chrome/Edge/Firefox/Safari recenti la hanno tutti),
 * ma non deve rompere l'onboarding se manca.
 *
 * Questo file è l'unico che parla API del browser specifiche di WebRTC: non è
 * testabile in Vitest (ambiente Node, niente `RTCPeerConnection` — verificato: è
 * `undefined`). Le funzioni pure di codifica/decodifica del blob (`comprimiBlob`,
 * `decomprimiBlob`, `codificaSegnale`, `decodificaSegnale`) sono invece TypeScript
 * puro e testate in `webrtc.test.ts`. Il resto si verifica in browser reale
 * (due schede, vedi CHANGELOG).
 */

/** STUN pubblico opzionale: aiuta fuori NAT, non serve in LAN (gli host candidate arrivano comunque). */
const ICE_SERVERS_DEFAULT: readonly RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

/** Tempo massimo di attesa della raccolta ICE prima di usare quel che si ha. */
const TIMEOUT_RACCOLTA_ICE_MS = 4000;

/** Tetto di sicurezza sulla lunghezza del blob decodificato: difesa da input assurdo (AGENTS.md §4). */
const LIMITE_BLOB_CARATTERI = 200_000;

// ---------------------------------------------------------------------------
// Codifica del blob di signaling: pura, testabile senza browser.
// ---------------------------------------------------------------------------

export interface DescrizioneSegnale {
  readonly v: 1;
  readonly t: "offer" | "answer";
  readonly d: string;
}

function base64UrlEncode(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binario = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binario += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(testo: string): Uint8Array<ArrayBuffer> {
  const normalizzato = testo.replace(/-/g, "+").replace(/_/g, "/");
  const resto = normalizzato.length % 4;
  const paddato = resto === 0 ? normalizzato : normalizzato + "=".repeat(4 - resto);
  const binario = atob(paddato);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

/**
 * Comprime (deflate) e codifica in base64url. Il primo carattere del risultato è
 * un marcatore di formato ("1" = compresso, "0" = fallback senza compressione),
 * così `decomprimiBlob` sa come rileggerlo anche se i due lati hanno browser
 * diversi con supporto diverso per `CompressionStream`.
 */
export async function comprimiBlob(testo: string): Promise<string> {
  if (typeof CompressionStream === "undefined") {
    return `0${base64UrlEncode(new TextEncoder().encode(testo))}`;
  }
  const flusso = new Blob([testo]).stream().pipeThrough(new CompressionStream("deflate"));
  const buffer = await new Response(flusso).arrayBuffer();
  return `1${base64UrlEncode(new Uint8Array(buffer))}`;
}

/**
 * Decomprime un blob prodotto da `comprimiBlob`. **Non lancia mai**: un blob
 * corrotto (incollato a metà, scansionato male, manomesso) torna `null`. È la
 * stessa cautela di `protocollo.ts` verso l'input dal DataChannel — qui l'input
 * ostile arriva da una tastiera o da una fotocamera invece che dalla rete, ma il
 * principio è identico (AGENTS.md §4).
 */
export async function decomprimiBlob(blob: string): Promise<string | null> {
  if (typeof blob !== "string" || blob.length === 0 || blob.length > LIMITE_BLOB_CARATTERI) {
    return null;
  }
  const marcatore = blob.slice(0, 1);
  if (marcatore !== "0" && marcatore !== "1") return null;

  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = base64UrlDecode(blob.slice(1));
  } catch {
    return null;
  }

  try {
    if (marcatore === "0") {
      return new TextDecoder(undefined, { fatal: true }).decode(bytes);
    }
    if (typeof DecompressionStream === "undefined") return null;
    const flusso = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
    const buffer = await new Response(flusso).arrayBuffer();
    return new TextDecoder(undefined, { fatal: true }).decode(buffer);
  } catch {
    return null;
  }
}

function validaDescrizioneSegnale(valore: unknown): DescrizioneSegnale | null {
  if (typeof valore !== "object" || valore === null) return null;
  const v = valore as Record<string, unknown>;
  if (v.v !== 1) return null;
  if (v.t !== "offer" && v.t !== "answer") return null;
  if (typeof v.d !== "string" || v.d.length === 0 || v.d.length > LIMITE_BLOB_CARATTERI)
    return null;
  return { v: 1, t: v.t, d: v.d };
}

/** Offerta/risposta → blob pronto per QR o copia/incolla. */
export async function codificaSegnale(descrizione: DescrizioneSegnale): Promise<string> {
  return comprimiBlob(JSON.stringify(descrizione));
}

/** Blob (da QR scansionato o incollato) → offerta/risposta. `null` se corrotto o non è quel che ci si aspetta. */
export async function decodificaSegnale(blob: string): Promise<DescrizioneSegnale | null> {
  const testo = await decomprimiBlob(blob);
  if (testo === null) return null;
  let valore: unknown;
  try {
    valore = JSON.parse(testo);
  } catch {
    return null;
  }
  return validaDescrizioneSegnale(valore);
}

// ---------------------------------------------------------------------------
// Il trasporto vero e proprio: richiede il browser, non testato in Vitest.
// ---------------------------------------------------------------------------

function attendiRaccoltaICE(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    let risolto = false;
    const fine = () => {
      if (risolto) return;
      risolto = true;
      pc.removeEventListener("icegatheringstatechange", controlla);
      resolve();
    };
    function controlla() {
      if (pc.iceGatheringState === "complete") fine();
    }
    pc.addEventListener("icegatheringstatechange", controlla);
    setTimeout(fine, TIMEOUT_RACCOLTA_ICE_MS);
  });
}

/** Adatta un `RTCDataChannel` già esistente all'interfaccia `Transport`. */
function creaTransportDaCanale(pc: RTCPeerConnection, canale: RTCDataChannel): Transport {
  let stato: StatoConnessione = canale.readyState === "open" ? "connesso" : "connettendo";
  const ascoltatoriMessaggio = new Set<(dato: string) => void>();
  const ascoltatoriStato = new Set<(stato: StatoConnessione) => void>();

  function imposta(nuovo: StatoConnessione): void {
    if (stato === nuovo) return;
    stato = nuovo;
    for (const ascolta of ascoltatoriStato) ascolta(nuovo);
  }

  canale.addEventListener("open", () => imposta("connesso"));
  canale.addEventListener("close", () => imposta("chiuso"));
  canale.addEventListener("error", () => imposta("disconnesso"));
  canale.addEventListener("message", (evento: MessageEvent) => {
    // Un canale WebRTC può in teoria portare anche binario: non è il nostro
    // protocollo (sempre testo JSON), si scarta senza nemmeno provare a leggerlo.
    if (typeof evento.data !== "string") return;
    for (const ascolta of ascoltatoriMessaggio) ascolta(evento.data);
  });

  pc.addEventListener("connectionstatechange", () => {
    if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
      imposta("disconnesso");
    } else if (pc.connectionState === "closed") {
      imposta("chiuso");
    }
  });

  return {
    get stato() {
      return stato;
    },
    invia(dato) {
      if (canale.readyState !== "open") return;
      try {
        canale.send(dato);
      } catch {
        // Il canale è appena caduto: arriverà comunque l'evento di stato, non c'è altro da fare qui.
      }
    },
    onMessaggio(ascoltatore) {
      ascoltatoriMessaggio.add(ascoltatore);
      return () => ascoltatoriMessaggio.delete(ascoltatore);
    },
    onStato(ascoltatore) {
      ascoltatoriStato.add(ascoltatore);
      return () => ascoltatoriStato.delete(ascoltatore);
    },
    chiudi() {
      imposta("chiuso");
      try {
        canale.close();
      } catch {
        // già chiuso
      }
      try {
        pc.close();
      } catch {
        // già chiuso
      }
    },
  };
}

/**
 * Un `Transport` che esiste subito ma si "collega" a un canale reale solo più
 * tardi: serve al client, il cui `RTCDataChannel` non esiste finché non arriva
 * l'evento `datachannel` (l'ha creato l'host). Finché non è collegato, `invia` non
 * fa nulla e lo stato resta "connettendo" — nessuna eccezione, nessun messaggio perso
 * silenziosamente più di quanto lo sarebbe comunque su un canale non ancora aperto.
 */
function creaTransportProxy(): { readonly transport: Transport; collega(reale: Transport): void } {
  let statoLocale: StatoConnessione = "connettendo";
  const ascoltatoriMessaggio = new Set<(dato: string) => void>();
  const ascoltatoriStato = new Set<(stato: StatoConnessione) => void>();
  let reale: Transport | null = null;

  const transport: Transport = {
    get stato() {
      return reale ? reale.stato : statoLocale;
    },
    invia(dato) {
      reale?.invia(dato);
    },
    onMessaggio(ascoltatore) {
      ascoltatoriMessaggio.add(ascoltatore);
      return () => ascoltatoriMessaggio.delete(ascoltatore);
    },
    onStato(ascoltatore) {
      ascoltatoriStato.add(ascoltatore);
      return () => ascoltatoriStato.delete(ascoltatore);
    },
    chiudi() {
      if (reale) {
        reale.chiudi();
      } else {
        statoLocale = "chiuso";
      }
    },
  };

  return {
    transport,
    collega(canaleReale) {
      reale = canaleReale;
      canaleReale.onMessaggio((dato) => {
        for (const ascolta of ascoltatoriMessaggio) ascolta(dato);
      });
      canaleReale.onStato((s) => {
        for (const ascolta of ascoltatoriStato) ascolta(s);
      });
      /**
       * 🔴 Il canale reale può arrivare **già "connesso"**: l'evento `datachannel`
       * del browser a volte consegna un canale il cui evento `open` è già passato
       * (il canale nasce già aperto, o si apre nello stesso istante). `onStato`
       * sopra inoltra solo i cambiamenti FUTURI — chi si è iscritto PRIMA di
       * `collega()` (es. `OnlineLobby`, iscritta fin da quando comincia l'attesa)
       * altrimenti non riceverebbe MAI la notifica, restando in attesa per
       * sempre pur essendo il canale già pronto. Verificato in browser reale (due
       * schede): il client restava bloccato sulla schermata di attesa nonostante
       * `RTCDataChannel.readyState` fosse già "open" — non un'ipotesi, un bug
       * vero. Si notifica subito lo stato attuale, oltre a quelli futuri.
       */
      for (const ascolta of [...ascoltatoriStato]) ascolta(reale.stato);
    },
  };
}

export interface OpzioniSessione {
  readonly iceServers?: readonly RTCIceServer[];
}

export interface SessioneHost {
  /** Il blob (offer) da mostrare come QR o stringa, pronto dopo la raccolta ICE. */
  readonly offerta: Promise<string>;
  /** Il blob (answer) incollato/scansionato dall'ospite. `true` se accettato. */
  accettaRisposta(blobRisposta: string): Promise<boolean>;
  readonly transport: Transport;
  /** Chiude tutto prima ancora che una connessione si stabilisca (es. l'utente annulla). */
  annulla(): void;
}

/** L'host: crea offerta e canale dati, aspetta la risposta dell'ospite. */
export function creaSessioneHost(opzioni: OpzioniSessione = {}): SessioneHost {
  const pc = new RTCPeerConnection({
    iceServers: [...(opzioni.iceServers ?? ICE_SERVERS_DEFAULT)],
  });
  const canale = pc.createDataChannel("briscola", { ordered: true });
  const transport = creaTransportDaCanale(pc, canale);

  const offerta = (async () => {
    const descrizione = await pc.createOffer();
    await pc.setLocalDescription(descrizione);
    await attendiRaccoltaICE(pc);
    const locale = pc.localDescription;
    if (!locale?.sdp) {
      throw new Error("creaSessioneHost: nessuna localDescription dopo la raccolta ICE");
    }
    return codificaSegnale({ v: 1, t: "offer", d: locale.sdp });
  })();

  return {
    offerta,
    async accettaRisposta(blobRisposta) {
      const segnale = await decodificaSegnale(blobRisposta);
      if (segnale?.t !== "answer") return false;
      try {
        await pc.setRemoteDescription({ type: "answer", sdp: segnale.d });
        return true;
      } catch {
        return false;
      }
    },
    transport,
    annulla() {
      transport.chiudi();
    },
  };
}

export interface SessioneClient {
  /** Il blob (offer) incollato/scansionato dall'host. Risolve col blob di risposta, `null` se l'offerta era corrotta o illeggibile. */
  accettaOfferta(blobOfferta: string): Promise<string | null>;
  readonly transport: Transport;
  annulla(): void;
}

/** L'ospite: legge l'offerta, produce la risposta, aspetta che il canale dati (creato dall'host) arrivi. */
export function creaSessioneClient(opzioni: OpzioniSessione = {}): SessioneClient {
  const pc = new RTCPeerConnection({
    iceServers: [...(opzioni.iceServers ?? ICE_SERVERS_DEFAULT)],
  });
  const proxy = creaTransportProxy();

  pc.addEventListener("datachannel", (evento) => {
    proxy.collega(creaTransportDaCanale(pc, evento.channel));
  });

  return {
    async accettaOfferta(blobOfferta) {
      const segnale = await decodificaSegnale(blobOfferta);
      if (segnale?.t !== "offer") return null;
      try {
        await pc.setRemoteDescription({ type: "offer", sdp: segnale.d });
        const risposta = await pc.createAnswer();
        await pc.setLocalDescription(risposta);
        await attendiRaccoltaICE(pc);
        const locale = pc.localDescription;
        if (!locale?.sdp) return null;
        return codificaSegnale({ v: 1, t: "answer", d: locale.sdp });
      } catch {
        return null;
      }
    },
    transport: proxy.transport,
    annulla() {
      proxy.transport.chiudi();
      try {
        pc.close();
      } catch {
        // già chiuso
      }
    },
  };
}
