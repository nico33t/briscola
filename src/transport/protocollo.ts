import { RANGHI, SEMI } from "@/core/deck.ts";
import type { InfoSet } from "@/core/infoset.ts";
import type { Carta, Evento, Fase, Giocata, Seat, Seme, Variante } from "@/core/types.ts";
import type { Messaggio } from "./types.ts";
import { VERSIONE_PROTOCOLLO } from "./types.ts";

/**
 * Validazione **pura** di ogni messaggio in arrivo dal DataChannel.
 *
 * 🔴 Ogni messaggio è input non fidato (AGENTS.md §4): un peer malevolo o buggato
 * può mandare JSON rotto, campi mancanti, tipi sbagliati, un payload enorme, o un
 * messaggio sintatticamente valido ma semanticamente assurdo (una carta che non
 * esiste, un seat fuori range). Niente di tutto questo deve mai far esplodere né
 * l'host né il client: si scarta, silenziosamente, e via.
 *
 * Stesso pattern difensivo di `game/persistenza.ts`: ogni campo passa per una
 * variabile locale prima di essere riusato, così il controllo restringe davvero il
 * tipo invece di lasciare un cast a mentire. Duplicato qui invece di importato da
 * `persistenza.ts` apposta: `transport/` non deve dipendere da `game/` (la
 * direzione delle dipendenze nell'architettura, implements.md §4, va al contrario).
 *
 * La validazione di **legalità** (è il turno di quel seat? possiede davvero quella
 * carta?) non è qui: la fa `core/machine.ts` — `applica()` rifiuta senza lanciare.
 * Questo file garantisce solo che ciò che arriva alla porta di `applica()` abbia
 * la *forma* giusta.
 */

/** Un peer ostile non deve poter mandare 50 MB e riempire la memoria (AGENTS.md §4). */
export const LIMITE_MESSAGGIO_BYTE = 8192;

/** Quanto può essere lungo il motivo di un rifiuto: è testo per l'interfaccia, non un log. */
const LIMITE_MOTIVO_CARATTERI = 300;

function byteUtf8(testo: string): number {
  return new TextEncoder().encode(testo).length;
}

/**
 * Serializza un messaggio uscente. `null` se supera il limite di dimensione (non
 * dovrebbe mai succedere con i messaggi che produciamo noi — briscola ha 40 carte
 * al massimo — ma è la stessa guardia sui due lati del canale, per simmetria).
 */
export function serializza(messaggio: Messaggio): string | null {
  const testo = JSON.stringify(messaggio);
  if (byteUtf8(testo) > LIMITE_MESSAGGIO_BYTE) return null;
  return testo;
}

/**
 * Contatore dei messaggi scartati: diagnostica, mai usato per decidere niente.
 * Uno per lato del canale (host e client tengono il proprio).
 */
export interface ContatoreScarti {
  totale: number;
}

export function creaContatoreScarti(): ContatoreScarti {
  return { totale: 0 };
}

/**
 * Analizza una stringa grezza arrivata dal canale. Non lancia mai: qualunque cosa
 * non torni un messaggio valido restituisce `null`.
 */
export function parseMessaggio(grezzo: string, contatore?: ContatoreScarti): Messaggio | null {
  const scarta = (): null => {
    if (contatore) contatore.totale += 1;
    return null;
  };

  if (typeof grezzo !== "string") return scarta();
  if (byteUtf8(grezzo) > LIMITE_MESSAGGIO_BYTE) return scarta();

  let valore: unknown;
  try {
    valore = JSON.parse(grezzo);
  } catch {
    return scarta();
  }

  const messaggio = validaMessaggio(valore);
  return messaggio ?? scarta();
}

function eSeme(valore: unknown): valore is Seme {
  return typeof valore === "string" && (SEMI as readonly string[]).includes(valore);
}

function eCarta(valore: unknown): valore is Carta {
  if (typeof valore !== "object" || valore === null) return false;
  const c = valore as Record<string, unknown>;
  return (
    eSeme(c.seme) && typeof c.rango === "string" && (RANGHI as readonly string[]).includes(c.rango)
  );
}

function eSeat(valore: unknown): valore is Seat {
  return valore === 0 || valore === 1 || valore === 2 || valore === 3;
}

function eVariante(valore: unknown): valore is Variante {
  return valore === "1v1" || valore === "2v2";
}

function eFase(valore: unknown): valore is Fase {
  return valore === "gioco" || valore === "fine";
}

function eStringaBreve(valore: unknown, massimo: number): valore is string {
  return typeof valore === "string" && valore.length > 0 && valore.length <= massimo;
}

function eNumeroFinito(valore: unknown): valore is number {
  return typeof valore === "number" && Number.isFinite(valore);
}

function eArrayDiCarte(valore: unknown): valore is Carta[] {
  return Array.isArray(valore) && valore.every(eCarta);
}

function eArrayDiNumeri(valore: unknown): valore is number[] {
  return Array.isArray(valore) && valore.every((x) => typeof x === "number" && Number.isFinite(x));
}

function eGiocata(valore: unknown): Giocata | null {
  if (typeof valore !== "object" || valore === null) return null;
  const g = valore as Record<string, unknown>;
  if (!eSeat(g.seat) || !eCarta(g.carta)) return null;
  return { seat: g.seat, carta: g.carta };
}

function eArrayDiGiocate(valore: unknown): valore is Giocata[] {
  if (!Array.isArray(valore)) return false;
  return valore.every((g) => eGiocata(g) !== null);
}

/** Valida un `InfoSet` ricevuto dalla rete: la forma dev'essere esattamente quella di `core/infoset.ts`. */
function validaInfoSet(valore: unknown): InfoSet | null {
  if (typeof valore !== "object" || valore === null) return null;
  const i = valore as Record<string, unknown>;

  const { variante, io, briscola, cartaBriscola, briscolaInFondoAlMazzo, mano, banco } = i;
  const { viste, carteInMazzo, cartePerSeat, diMano, turno, puntiSquadra, fase } = i;

  if (!eVariante(variante)) return null;
  if (!eSeat(io)) return null;
  if (!eSeme(briscola)) return null;
  if (!eCarta(cartaBriscola)) return null;
  if (typeof briscolaInFondoAlMazzo !== "boolean") return null;
  if (!eArrayDiCarte(mano)) return null;
  if (!eArrayDiGiocate(banco)) return null;
  if (!eArrayDiCarte(viste)) return null;
  if (!eNumeroFinito(carteInMazzo) || carteInMazzo < 0) return null;
  if (!eArrayDiNumeri(cartePerSeat)) return null;
  if (!eSeat(diMano) || !eSeat(turno)) return null;
  if (!Array.isArray(puntiSquadra) || puntiSquadra.length !== 2) return null;
  const [a, b] = puntiSquadra as unknown[];
  if (!eNumeroFinito(a) || !eNumeroFinito(b)) return null;
  if (!eFase(fase)) return null;

  return {
    variante,
    io,
    briscola,
    cartaBriscola,
    briscolaInFondoAlMazzo,
    mano,
    banco,
    viste,
    carteInMazzo,
    cartePerSeat,
    diMano,
    turno,
    puntiSquadra: [a, b],
    fase,
  };
}

function validaEvento(valore: unknown): Evento | null {
  if (typeof valore !== "object" || valore === null) return null;
  const e = valore as Record<string, unknown>;
  const tipo = e.tipo;

  switch (tipo) {
    case "CARTA_GIOCATA": {
      if (!eSeat(e.seat) || !eCarta(e.carta)) return null;
      return { tipo, seat: e.seat, carta: e.carta };
    }
    case "PRESA": {
      if (!eSeat(e.vincitore)) return null;
      if (!eArrayDiCarte(e.carte)) return null;
      if (!eNumeroFinito(e.punti)) return null;
      return { tipo, vincitore: e.vincitore, carte: e.carte, punti: e.punti };
    }
    case "PESCATA": {
      if (!eSeat(e.seat) || !eCarta(e.carta)) return null;
      return { tipo, seat: e.seat, carta: e.carta };
    }
    case "FINE": {
      if (!Array.isArray(e.punti) || e.punti.length !== 2) return null;
      const [a, b] = e.punti as unknown[];
      if (!eNumeroFinito(a) || !eNumeroFinito(b)) return null;
      return { tipo, punti: [a, b] };
    }
    default:
      return null;
  }
}

function eArrayDiEventi(valore: unknown): valore is Evento[] {
  if (!Array.isArray(valore)) return false;
  return valore.every((e) => validaEvento(e) !== null);
}

function validaMessaggio(valore: unknown): Messaggio | null {
  if (typeof valore !== "object" || valore === null) return null;
  const m = valore as Record<string, unknown>;
  if (m.v !== VERSIONE_PROTOCOLLO) return null;
  if (typeof m.type !== "string") return null;

  switch (m.type) {
    case "BENVENUTO": {
      if (!eSeat(m.seat) || !eVariante(m.variante)) return null;
      return { v: 1, type: "BENVENUTO", seat: m.seat, variante: m.variante };
    }
    case "GIOCA_CARTA": {
      if (!eCarta(m.carta)) return null;
      return { v: 1, type: "GIOCA_CARTA", carta: m.carta };
    }
    case "AGGIORNAMENTO": {
      const infoset = validaInfoSet(m.infoset);
      if (!infoset) return null;
      if (!eArrayDiEventi(m.eventi)) return null;
      return { v: 1, type: "AGGIORNAMENTO", infoset, eventi: m.eventi };
    }
    case "RIFIUTO": {
      if (!eStringaBreve(m.motivo, LIMITE_MOTIVO_CARATTERI)) return null;
      return { v: 1, type: "RIFIUTO", motivo: m.motivo };
    }
    case "PING": {
      if (!eNumeroFinito(m.ts)) return null;
      return { v: 1, type: "PING", ts: m.ts };
    }
    case "PONG": {
      if (!eNumeroFinito(m.ts)) return null;
      return { v: 1, type: "PONG", ts: m.ts };
    }
    case "BYE":
      return { v: 1, type: "BYE" };
    default:
      return null;
  }
}
