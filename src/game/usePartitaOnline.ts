import { useCallback, useEffect, useReducer, useRef } from "react";
import { esito, nuovaPartita, puntiSeat } from "@/core/machine.ts";
import type { Carta, GameState, Seat, Squadra } from "@/core/types.ts";
import type { MotoreClient, MotoreHost } from "@/game/motoreOnline.ts";
import {
  creaMotoreClient,
  creaMotoreHost,
  statoVetrinaDaInfoSet,
  vincitoreDaPunti,
} from "@/game/motoreOnline.ts";
import type { Partita } from "@/game/usePartita.ts";
import type { Ruolo, StatoConnessione, Transport } from "@/transport/types.ts";
import { SEAT_CLIENT_REMOTO } from "@/transport/types.ts";

/**
 * Hook React sottili sopra `game/motoreOnline.ts` (TypeScript puro, zero React —
 * vedi i commenti lì per il "perché" della separazione). Qui si fa solo una cosa:
 * creare il motore una volta per ciascuna istanza del componente, iscriversi ai
 * suoi cambiamenti, e rimappare lo snapshot nella stessa forma `Partita` che
 * `usePartita.ts` già restituisce per le modalità locali — così `ui/Tavolo.tsx` lo
 * riusa senza modifiche (oltre alla piccola aggiunta dello stato di connessione,
 * vedi `PartitaOnline`).
 *
 * Il motore si crea dentro un `useEffect` (mai in un inizializzatore di
 * `useState`): la creazione ha effetti collaterali veri (si iscrive al transport,
 * avvia il battito cardiaco), e solo un effetto garantisce che React lo distrugga
 * e ricrei in modo pulito in `StrictMode` (mount → cleanup → mount, in sviluppo).
 */

const SEAT_HOST_LOCALE = 0;

export interface PartitaOnline extends Partita {
  readonly ruolo: Ruolo;
  readonly connessione: StatoConnessione;
  /** Diventa vero al primo snapshot del motore (praticamente subito per l'host, dopo il primo `AGGIORNAMENTO` per il client). */
  readonly pronto: boolean;
  /** Solo host: vero se il seat del client è passato in mano all'IA dopo una disconnessione. */
  readonly seatRemotoInAI: boolean;
  /** Solo host, sensato quando `connessione !== "connesso"`: fa proseguire la partita contro il computer invece di restare bloccata. No-op per il client. */
  continuaControAI(): void;
  /** Solo diagnostica: quanti messaggi malformati/ostili sono stati scartati finora. */
  readonly scartati: number;
}

export function useHostOnline(transport: Transport, seed: number): PartitaOnline {
  const motoreRef = useRef<MotoreHost | null>(null);
  const [, forzaAggiornamento] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    const motore = creaMotoreHost(transport, { seed });
    motoreRef.current = motore;
    const cancella = motore.sottoscrivi(forzaAggiornamento);
    forzaAggiornamento();
    return () => {
      cancella();
      motore.distruggi();
      motoreRef.current = null;
    };
  }, [transport, seed]);

  const gioca = useCallback((carta: Carta) => motoreRef.current?.gioca(carta), []);
  const abbandona = useCallback(() => motoreRef.current?.abbandona(), []);
  const continuaControAI = useCallback(() => motoreRef.current?.continuaControAI(), []);
  const ricomincia = useCallback(() => {
    // Fuori scope in F6: la rivincita online richiederebbe risincronizzare due
    // stati indipendenti da zero. `Tavolo.tsx` non mostra il pulsante in
    // modalità "online" — vedi implements.md §8.4.
  }, []);

  const snapshot = motoreRef.current?.leggi();
  const stato = snapshot?.stato ?? STATO_PLACEHOLDER_HOST(seed);
  const presa = snapshot?.presa ?? null;
  const finita = stato.fase === "fine";
  const vincitore = finita ? vincitoreDaSomma(stato) : null;

  return {
    stato,
    bancoVisibile: presa ? presa.banco : stato.banco,
    presa,
    spazzata: snapshot?.spazzata ?? false,
    puoGiocare: !presa && !finita && stato.turno === SEAT_HOST_LOCALE,
    seatUmano: SEAT_HOST_LOCALE,
    pensando:
      (snapshot?.seatRemotoInAI ?? false) &&
      stato.turno === SEAT_CLIENT_REMOTO &&
      !presa &&
      !finita,
    punti: puntiPerSeatDaStato(stato),
    puntiSquadra: puntiSquadraDaStato(stato),
    vincitore,
    gioca,
    ricomincia,
    abbandona,
    ruolo: "host",
    connessione: snapshot?.connessione ?? transport.stato,
    pronto: snapshot !== undefined,
    seatRemotoInAI: snapshot?.seatRemotoInAI ?? false,
    continuaControAI,
    scartati: snapshot?.scartati ?? 0,
  };
}

export function useClientOnline(transport: Transport): PartitaOnline {
  const motoreRef = useRef<MotoreClient | null>(null);
  const [, forzaAggiornamento] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    const motore = creaMotoreClient(transport);
    motoreRef.current = motore;
    const cancella = motore.sottoscrivi(forzaAggiornamento);
    forzaAggiornamento();
    return () => {
      cancella();
      motore.distruggi();
      motoreRef.current = null;
    };
  }, [transport]);

  const gioca = useCallback((carta: Carta) => motoreRef.current?.gioca(carta), []);
  const abbandona = useCallback(() => motoreRef.current?.abbandona(), []);
  const ricomincia = useCallback(() => {
    // Come per l'host: nessuna rivincita online in F6, vedi sopra.
  }, []);
  const continuaControAI = useCallback(() => {
    // Non pertinente per il client: solo l'host può decidere di continuare da solo.
  }, []);

  const snapshot = motoreRef.current?.leggi();
  const infoset = snapshot?.infoset ?? null;
  const presa = snapshot?.presa ?? null;
  const finita = infoset?.fase === "fine";
  const puntiSquadra: readonly [number, number] = infoset?.puntiSquadra ?? [0, 0];

  return {
    stato: infoset ? statoVetrinaDaInfoSet(infoset) : STATO_PLACEHOLDER_HOST(1),
    bancoVisibile: presa ? presa.banco : (infoset?.banco ?? []),
    presa,
    spazzata: snapshot?.spazzata ?? false,
    puoGiocare:
      infoset !== null &&
      !presa &&
      !finita &&
      infoset.turno === infoset.io &&
      !(snapshot?.inAttesaConferma ?? false),
    seatUmano: infoset?.io ?? SEAT_CLIENT_REMOTO,
    pensando: false,
    punti: puntiSquadra,
    puntiSquadra,
    vincitore: finita ? vincitoreDaPunti(puntiSquadra) : null,
    gioca,
    ricomincia,
    abbandona,
    ruolo: "client",
    connessione: snapshot?.connessione ?? transport.stato,
    pronto: infoset !== null,
    seatRemotoInAI: false,
    continuaControAI,
    scartati: snapshot?.scartati ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Piccoli helper di rimappatura verso la forma `Partita` — nessuna regola di
// gioco qui dentro, solo lettura di campi già calcolati altrove.
// ---------------------------------------------------------------------------

/** Placeholder mostrato solo nel primo istante, prima che il motore abbia prodotto
 * il suo primo snapshot (`pronto` resta `false`/il chiamante mostra un'attesa). */
function STATO_PLACEHOLDER_HOST(seed: number): GameState {
  return nuovaPartita({ variante: "1v1", seed });
}

function puntiPerSeatDaStato(stato: GameState): readonly number[] {
  return stato.mani.map((_, seat) => puntiSeat(stato, seat as Seat));
}

function puntiSquadraDaStato(stato: GameState): readonly [number, number] {
  return esito(stato).punti;
}

function vincitoreDaSomma(stato: GameState): Squadra | null {
  return esito(stato).vincitore;
}
