import { RANGHI, SEMI } from "@/core/deck.ts";
import type { Carta, GameState, Giocata, Seat } from "@/core/types.ts";
import type { ConfigPartita } from "@/game/usePartita.ts";

/**
 * La partita in corso, salvata sul device.
 *
 * Serve a una cosa sola: ricaricare la pagina per sbaglio non deve cancellare
 * una partita a metà. Niente account, niente server — resta tutto qui.
 *
 * Quello che si rilegge da `localStorage` è **input non fidato** quanto un
 * messaggio dalla rete: può essere di una versione vecchia, troncato, o
 * modificato a mano da chi vuole darsi tre assi. Si valida tutto prima di
 * usarlo, e al primo dubbio si butta via e si ricomincia.
 */

const CHIAVE = "briscola.partita.v1";

export interface PartitaSalvata {
  readonly config: ConfigPartita;
  readonly stato: GameState;
}

function eCarta(valore: unknown): valore is Carta {
  if (typeof valore !== "object" || valore === null) return false;
  const c = valore as Record<string, unknown>;
  return (
    typeof c.seme === "string" &&
    typeof c.rango === "string" &&
    (SEMI as readonly string[]).includes(c.seme) &&
    (RANGHI as readonly string[]).includes(c.rango)
  );
}

function eSeat(valore: unknown): valore is Seat {
  return valore === 0 || valore === 1 || valore === 2 || valore === 3;
}

function eMazzoDiCarte(valore: unknown): valore is Carta[] {
  return Array.isArray(valore) && valore.every(eCarta);
}

function eArrayDiMani(valore: unknown): valore is Carta[][] {
  return Array.isArray(valore) && valore.every(eMazzoDiCarte);
}

/**
 * Controlla che il salvataggio sia una partita di briscola sensata.
 *
 * Il controllo forte è l'ultimo: **le carte devono essere 40 e tutte diverse**.
 * Un salvataggio manomesso per aggiungersi un asso fallisce lì.
 */
export function validaSalvataggio(valore: unknown): PartitaSalvata | null {
  if (typeof valore !== "object" || valore === null) return null;
  const salvato = valore as Record<string, unknown>;

  const configGrezza = salvato.config;
  const statoGrezzo = salvato.stato;
  if (typeof configGrezza !== "object" || configGrezza === null) return null;
  if (typeof statoGrezzo !== "object" || statoGrezzo === null) return null;
  const c = configGrezza as Record<string, unknown>;
  const s = statoGrezzo as Record<string, unknown>;

  // Ogni campo passa per una variabile locale: è l'unico modo perché il
  // controllo restringa davvero il tipo, invece di lasciare un cast a mentire.
  const modalita = c.modalita;
  const livello = c.livello;
  const seed = c.seed;
  if (modalita !== "ai" && modalita !== "locale") return null;
  if (livello !== "facile" && livello !== "medio") return null;
  if (typeof seed !== "number" || !Number.isFinite(seed)) return null;

  const variante = s.variante;
  const fase = s.fase;
  const briscola = s.briscola;
  const turno = s.turno;
  const diMano = s.diMano;
  if (variante !== "1v1" && variante !== "2v2") return null;
  if (fase !== "gioco" && fase !== "fine") return null;
  if (typeof briscola !== "string") return null;
  const semeBriscola = SEMI.find((x) => x === briscola);
  if (!semeBriscola) return null;
  if (!eSeat(turno) || !eSeat(diMano)) return null;

  const { cartaBriscola, mazzo, mani, prese, banco } = s;
  if (!eCarta(cartaBriscola)) return null;
  if (!eMazzoDiCarte(mazzo)) return null;
  if (!eArrayDiMani(mani)) return null;
  if (!eArrayDiMani(prese)) return null;
  if (!Array.isArray(banco)) return null;

  const giocate: Giocata[] = [];
  for (const giocata of banco) {
    if (typeof giocata !== "object" || giocata === null) return null;
    const g = giocata as Record<string, unknown>;
    if (!eSeat(g.seat) || !eCarta(g.carta)) return null;
    giocate.push({ seat: g.seat, carta: g.carta });
  }

  // Il controllo che conta: 40 carte, tutte diverse. Un salvataggio manomesso
  // per darsi un asso in più fallisce qui.
  const tutte = [...mazzo, ...mani.flat(), ...prese.flat(), ...giocate.map((g) => g.carta)];
  if (tutte.length !== 40) return null;
  if (new Set(tutte.map((x) => `${x.seme}-${x.rango}`)).size !== 40) return null;

  return {
    config: { modalita, livello, seed },
    stato: {
      variante,
      fase,
      briscola: semeBriscola,
      cartaBriscola,
      mazzo,
      mani,
      prese,
      banco: giocate,
      turno,
      diMano,
    },
  };
}

export function salvaPartita(config: ConfigPartita, stato: GameState): void {
  try {
    localStorage.setItem(CHIAVE, JSON.stringify({ config, stato }));
  } catch {
    // Spazio esaurito o modalità privata: si gioca lo stesso, senza salvare.
  }
}

export function caricaPartita(): PartitaSalvata | null {
  try {
    const grezzo = localStorage.getItem(CHIAVE);
    if (!grezzo) return null;
    const salvato = validaSalvataggio(JSON.parse(grezzo));
    // Una partita già finita non si riprende: si riparte dal menu.
    if (!salvato || salvato.stato.fase === "fine") {
      dimenticaPartita();
      return null;
    }
    return salvato;
  } catch {
    dimenticaPartita();
    return null;
  }
}

export function dimenticaPartita(): void {
  try {
    localStorage.removeItem(CHIAVE);
  } catch {
    // niente da fare
  }
}
