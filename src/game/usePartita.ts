import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientAI } from "@/ai/client.ts";
import { creaClientAI } from "@/ai/client.ts";
import type { Livello } from "@/ai/euristica.ts";
import { scegliCarta } from "@/ai/euristica.ts";
import { infoSetPer } from "@/core/infoset.ts";
import { applica, esito, nuovaPartita, puntiSeat } from "@/core/machine.ts";
import { creaRng } from "@/core/rng.ts";
import type { Carta, GameState, Giocata, Seat, Squadra, Variante } from "@/core/types.ts";
import { dimenticaPartita, salvaPartita } from "@/game/persistenza.ts";

/**
 * Il collante fra il motore e l'interfaccia.
 *
 * Il `core` risolve la presa nello stesso istante in cui cade l'ultima carta:
 * è giusto per le regole, ma a schermo significherebbe veder sparire le carte
 * prima di aver capito chi ha vinto. Qui la presa resta ferma sul tavolo per
 * un attimo — lo stato vero è già avanti, quello mostrato aspetta.
 *
 * Generalizzato a N posti (F7, 0.9.0): nel 2v2 il seat 0 resta sempre "tu",
 * tutti gli altri (1, 2 e 3 — compreso il compagno) sono AI in modalità
 * "ai", o umani in hot-seat in modalità "locale". Non esiste una via di
 * mezzo (due umani + due AI): la scelta binaria di `Modalita` copre solo le
 * due combinazioni richieste, di proposito — vedi implements.md §9.
 */

export type Modalita = "ai" | "locale";

export interface ConfigPartita {
  readonly variante: Variante;
  readonly modalita: Modalita;
  readonly livello: Livello;
  readonly seed: number;
}

/** Quanto resta ferma la presa perché si veda chi ha vinto. */
const PAUSA_PRESA_MS = 850;
/** Quanto dura il volo delle carte verso chi ha vinto. Deve combaciare col CSS. */
const VOLO_PRESA_MS = 480;
/** Pausa prima della mossa dell'AI: senza, sembra che bari. */
const PAUSA_AI_MS = 800;

/**
 * In modalità "ai" l'unico posto umano è sempre il seat 0: nel 2v2 tutti gli
 * altri tre — compreso il compagno al seat 2 — sono AI. Ognuno riceve
 * **solo** il proprio InfoSet (AGENTS.md §3.3): il compagno-AI non vede la
 * mano dell'umano più di quanto la veda un avversario.
 */
const SEAT_UMANO_IN_MODALITA_AI: Seat = 0;

interface PresaMostrata {
  readonly banco: readonly Giocata[];
  readonly vincitore: Seat;
  readonly punti: number;
}

export interface Partita {
  readonly stato: GameState;
  /** Cosa mostrare sul tavolo: la presa appena chiusa, oppure il banco corrente. */
  readonly bancoVisibile: readonly Giocata[];
  readonly presa: PresaMostrata | null;
  /** Vero mentre le carte volano verso chi ha vinto il giro. */
  readonly spazzata: boolean;
  readonly puoGiocare: boolean;
  readonly seatUmano: Seat;
  readonly pensando: boolean;
  /** Punti per posto, indicizzati come `stato.mani`. Due voci nell'1v1, quattro nel 2v2. */
  readonly punti: readonly number[];
  /** Punti di squadra: coincide con `punti` nell'1v1, li somma a coppie nel 2v2. */
  readonly puntiSquadra: readonly [number, number];
  readonly vincitore: Squadra | null;
  gioca(carta: Carta): void;
  ricomincia(): void;
}

export function usePartita(config: ConfigPartita, statoIniziale?: GameState): Partita {
  const [seed, setSeed] = useState(config.seed);
  const [stato, setStato] = useState<GameState>(
    () => statoIniziale ?? nuovaPartita({ variante: config.variante, seed: config.seed }),
  );
  const [presa, setPresa] = useState<PresaMostrata | null>(null);
  const [spazzata, setSpazzata] = useState(false);
  const rng = useRef(creaRng(config.seed ^ 0x9e3779b9));

  const esegui = useCallback((corrente: GameState, seat: Seat, carta: Carta) => {
    const risultato = applica(corrente, { tipo: "GIOCA", seat, carta });
    if (!risultato.ok) return;

    const evento = risultato.eventi.find((e) => e.tipo === "PRESA");
    if (evento?.tipo === "PRESA") {
      setPresa({
        banco: [...corrente.banco, { seat, carta }],
        vincitore: evento.vincitore,
        punti: evento.punti,
      });
    }
    setStato(risultato.stato);
  }, []);

  /**
   * La presa in due tempi: prima resta ferma perché si veda chi ha vinto, poi
   * le carte volano verso di lui e il tavolo si pulisce. Il `core` ha già
   * risolto tutto nell'istante in cui è caduta l'ultima carta — questa è solo
   * la coreografia.
   */
  useEffect(() => {
    if (!presa) return;
    const volo = setTimeout(() => setSpazzata(true), PAUSA_PRESA_MS);
    const fine = setTimeout(() => {
      setPresa(null);
      setSpazzata(false);
    }, PAUSA_PRESA_MS + VOLO_PRESA_MS);
    return () => {
      clearTimeout(volo);
      clearTimeout(fine);
    };
  }, [presa]);

  /**
   * Ogni mossa finisce su disco: ricaricare la pagina per sbaglio non deve
   * cancellare una partita a metà. A partita finita si dimentica tutto, così
   * al ritorno si riparte dal menu invece di riaprire un tavolo già chiuso.
   */
  useEffect(() => {
    if (stato.fase === "fine") {
      dimenticaPartita();
    } else {
      salvaPartita({ ...config, seed }, stato);
    }
  }, [stato, config, seed]);

  /**
   * Il livello Esperto macina centinaia di simulazioni ISMCTS: farlo sul
   * thread principale bloccherebbe l'interfaccia, quindi vive in un Web
   * Worker dedicato (`ai/client.ts` + `ai/worker.ts`). Il worker si crea solo
   * quando serve — non ha senso spendere il costo per Facile e Medio, che
   * restano sincroni — e si smonta quando si cambia livello o si esce dal
   * tavolo, così non resta a girare a vuoto. Un solo worker basta anche nel
   * 2v2: i tre posti AI giocano in sequenza, mai in contemporanea.
   */
  const clientRef = useRef<ClientAI | null>(null);
  useEffect(() => {
    if (config.modalita !== "ai" || config.livello !== "esperto") return;
    const client = creaClientAI();
    clientRef.current = client;
    return () => {
      client.termina();
      clientRef.current = null;
    };
  }, [config.modalita, config.livello]);

  const seatUmano = config.modalita === "ai" ? SEAT_UMANO_IN_MODALITA_AI : stato.turno;
  const turnoDellAI = config.modalita === "ai" && stato.turno !== SEAT_UMANO_IN_MODALITA_AI;
  const inAttesa = presa !== null;

  // Il turno dell'AI (qualunque posto, nel 2v2 anche il compagno), con una
  // pausa perché si veda cosa succede.
  useEffect(() => {
    if (!turnoDellAI || inAttesa || stato.fase === "fine") return;
    const seatAI = stato.turno;

    if (config.livello === "esperto") {
      let annullato = false;
      const infoset = infoSetPer(stato, seatAI);
      const seedMossa = Math.floor(rng.current() * 0xffffffff);

      const timer = setTimeout(() => {
        const client = clientRef.current;
        if (!client) return;
        client
          .chiediMossa(infoset, seedMossa)
          .then((carta) => {
            if (!annullato) esegui(stato, seatAI, carta);
          })
          .catch(() => {
            // Difesa: se il worker fallisce (bug, browser che lo nega), la
            // partita non deve incastrarsi — si ripiega sull'euristica media.
            if (annullato) return;
            const carta = scegliCarta(infoset, "medio", rng.current);
            if (carta) esegui(stato, seatAI, carta);
          });
      }, PAUSA_AI_MS);

      return () => {
        annullato = true;
        clearTimeout(timer);
      };
    }

    const timer = setTimeout(() => {
      const carta = scegliCarta(infoSetPer(stato, seatAI), config.livello, rng.current);
      if (carta) esegui(stato, seatAI, carta);
    }, PAUSA_AI_MS);
    return () => clearTimeout(timer);
  }, [turnoDellAI, inAttesa, stato, config.livello, esegui]);

  const umanoDiTurno = config.modalita === "locale" || stato.turno === SEAT_UMANO_IN_MODALITA_AI;
  const puoGiocare = !inAttesa && stato.fase !== "fine" && umanoDiTurno;

  const gioca = useCallback(
    (carta: Carta) => {
      if (!puoGiocare) return;
      esegui(stato, stato.turno, carta);
    },
    [puoGiocare, stato, esegui],
  );

  const ricomincia = useCallback(() => {
    const nuovoSeed = (seed * 1103515245 + 12345) >>> 0;
    setSeed(nuovoSeed);
    rng.current = creaRng(nuovoSeed ^ 0x9e3779b9);
    setPresa(null);
    setSpazzata(false);
    setStato(nuovaPartita({ variante: config.variante, seed: nuovoSeed }));
  }, [seed, config.variante]);

  const { punti: puntiSquadra, vincitore } = esito(stato);

  return {
    stato,
    bancoVisibile: presa ? presa.banco : stato.banco,
    presa,
    spazzata,
    puoGiocare,
    // In locale il "mio" posto è sempre quello di turno: ci si passa il device.
    seatUmano,
    pensando: turnoDellAI && !inAttesa && stato.fase !== "fine",
    punti: stato.mani.map((_, seat) => puntiSeat(stato, seat as Seat)),
    puntiSquadra,
    vincitore: stato.fase === "fine" ? vincitore : null,
    gioca,
    ricomincia,
  };
}
