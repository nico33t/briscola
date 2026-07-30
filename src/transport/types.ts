import type { InfoSet } from "@/core/infoset.ts";
import type { Carta, Evento, Seat, Variante } from "@/core/types.ts";

/**
 * Modulo di trasporto: collega un tavolo di Briscola a un peer remoto.
 *
 * `transport/` non conosce React, non conosce `usePartita`, e — a parte i tipi che
 * descrive — non esegue nessuna regola di gioco: quella resta unicamente in `core/`
 * (AGENTS.md §3.2). Qui dentro vive solo "come far viaggiare i byte" (`Transport`,
 * `locale.ts`, `webrtc.ts`) e "cosa è lecito farci viaggiare sopra" (questo file +
 * `protocollo.ts`).
 *
 * 🔴 Ogni stringa che arriva da `onMessaggio` è INPUT NON FIDATO (AGENTS.md §4): può
 * venire da un peer malevolo, da un bug dell'altro lato, o da un DataChannel
 * corrotto. `Transport` la passa così com'è, senza fidarsi né interpretarla: la
 * validazione vive in `protocollo.ts`, la legalità della mossa in `core`.
 */

export type StatoConnessione = "connettendo" | "connesso" | "disconnesso" | "chiuso";

/**
 * Un canale bidirezionale che trasporta stringhe, niente di più.
 *
 * Il livello applicativo (`game/usePartitaOnline.ts`) è responsabile di serializzare
 * (`protocollo.serializza`) prima di `invia` e di validare (`protocollo.parseMessaggio`)
 * ogni cosa che arriva da `onMessaggio`. Questa interfaccia non lo fa da sola apposta:
 * è la stessa forma di un `RTCDataChannel` reale (`send(string)` /
 * `onmessage: (MessageEvent) => void`), e i test la usano per iniettare stringhe
 * volutamente malformate senza dover passare da un `RTCPeerConnection`.
 */
export interface Transport {
  readonly stato: StatoConnessione;
  /** Manda una stringa grezza sul canale. Non lancia se il canale non è pronto: la ignora. */
  invia(dato: string): void;
  /** Iscrive un ascoltatore ai messaggi grezzi in arrivo. Restituisce la funzione per disiscriversi. */
  onMessaggio(ascoltatore: (dato: string) => void): () => void;
  /** Iscrive un ascoltatore ai cambi di stato della connessione. Restituisce la funzione per disiscriversi. */
  onStato(ascoltatore: (stato: StatoConnessione) => void): () => void;
  /** Chiude il canale. Idempotente. */
  chiudi(): void;
}

/**
 * Chi siede da che parte del tavolo di rete.
 *
 * Fase F6: solo 1v1. L'host è sempre il seat 0 ("tu" per chi ha creato la
 * partita), il client remoto è sempre il seat 1. Il 2v2 via P2P (topologia a
 * stella, implements.md §8.2) resta 🔜 per F7.
 */
export type Ruolo = "host" | "client";

/** Il seat che l'host assegna sempre al client remoto, nella variante 1v1. */
export const SEAT_CLIENT_REMOTO: Seat = 1;

/**
 * Protocollo dei messaggi sul DataChannel, versionato (AGENTS.md §9: si estende in
 * modo **additivo**, non si rinomina mai un campo già in circolazione).
 *
 * Nomi in italiano, coerenti col resto del codice (`GIOCA`, `PRESA`, `PESCATA`...).
 * Rispetto alla bozza iniziale di implements.md §8.3 (HELLO/STATE/PLAY_CARD/EVENT/
 * PING/BYE) sono stati accorpati STATE+EVENT in un unico `AGGIORNAMENTO` (arrivano
 * sempre insieme, mai serve un caso col solo uno dei due) e aggiunto `PONG` per un
 * battito cardiaco simmetrico. Dettagli e "perché" in implements.md §8.3.
 *
 * Il client manda **solo intenzioni**: l'unica azione di gioco possibile è
 * `GIOCA_CARTA`. Lo stato vero, filtrato sull'information set del destinatario,
 * arriva sempre e solo dall'host (AGENTS.md §3.4).
 */
export const VERSIONE_PROTOCOLLO = 1;

interface MessaggioBase {
  readonly v: 1;
}

/** Host → client, subito dopo l'apertura del canale: assegna il posto. */
export interface MsgBenvenuto extends MessaggioBase {
  readonly type: "BENVENUTO";
  readonly seat: Seat;
  readonly variante: Variante;
}

/** Client → host: l'unica intenzione di gioco possibile. */
export interface MsgGiocaCarta extends MessaggioBase {
  readonly type: "GIOCA_CARTA";
  readonly carta: Carta;
}

/**
 * Host → client, dopo ogni mossa applicata (sua o del client): lo stato vero,
 * filtrato sull'infoset del client, più gli eventi pubblici di quella mossa (per
 * far vedere la stessa coreografia — presa che resta ferma, poi vola — di una
 * partita locale).
 */
export interface MsgAggiornamento extends MessaggioBase {
  readonly type: "AGGIORNAMENTO";
  readonly infoset: InfoSet;
  readonly eventi: readonly Evento[];
}

/** Host → client: la mossa proposta era illegale (fuori turno, carta non posseduta, partita finita...). */
export interface MsgRifiuto extends MessaggioBase {
  readonly type: "RIFIUTO";
  readonly motivo: string;
}

/** Le due direzioni: battito cardiaco, per accorgersi di una disconnessione silenziosa. */
export interface MsgPing extends MessaggioBase {
  readonly type: "PING";
  readonly ts: number;
}
export interface MsgPong extends MessaggioBase {
  readonly type: "PONG";
  readonly ts: number;
}

/** Le due direzioni: uscita annunciata, prima di chiudere il canale (se il tempo lo permette). */
export interface MsgBye extends MessaggioBase {
  readonly type: "BYE";
}

export type MessaggioClienteHost = MsgGiocaCarta | MsgPing | MsgPong | MsgBye;
export type MessaggioHostCliente =
  | MsgBenvenuto
  | MsgAggiornamento
  | MsgRifiuto
  | MsgPing
  | MsgPong
  | MsgBye;

export type Messaggio = MessaggioClienteHost | MessaggioHostCliente;
