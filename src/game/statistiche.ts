import type { Livello } from "@/ai/euristica.ts";
import { esito as esitoCore, puntiSquadra } from "@/core/machine.ts";
import type { Azione, GameState, Variante } from "@/core/types.ts";
import {
  aggiungiReplay,
  caricaRegistroReplay,
  type ReplayPartita,
  salvaRegistroReplay,
  svuotaRegistroReplay,
} from "@/game/replay.ts";
import type { Modalita } from "@/game/usePartita.ts";

/**
 * Statistiche: cronologia delle partite giocate, tutta in `localStorage`.
 * Nessun dato lascia il device (AGENTS.md §4).
 *
 * Il seat umano in modalità "ai" è sempre il seat 0 (`SEAT_UMANO_IN_MODALITA_AI`
 * in `usePartita.ts`), e `squadraDi(0) === 0` in entrambe le varianti: quindi
 * "punti fatti/subiti" sono sempre `punti[0]`/`punti[1]`, senza bisogno di
 * passare in giro il seat umano. In hot-seat l'etichetta 0/1 non ha un
 * proprietario reale — per quello l'esito degrada comunque a `"giocata"`.
 */

export const CHIAVE_STATISTICHE = "briscola.statistiche.v1";

export type EsitoPartita = "vittoria" | "sconfitta" | "pareggio" | "giocata";

export interface RecordPartita {
  readonly id: string;
  /** ISO 8601. */
  readonly data: string;
  readonly variante: Variante;
  readonly modalita: Modalita;
  /** `null` in hot-seat: non c'è un livello IA da registrare. */
  readonly livello: Livello | null;
  readonly esito: EsitoPartita;
  readonly puntiFatti: number;
  readonly puntiSubiti: number;
  readonly abbandonata: boolean;
}

export interface StatisticheV1 {
  readonly versione: 1;
  readonly partite: readonly RecordPartita[];
}

export function statisticheVuote(): StatisticheV1 {
  return { versione: 1, partite: [] };
}

const ESITI: readonly EsitoPartita[] = ["vittoria", "sconfitta", "pareggio", "giocata"];
const LIVELLI: readonly Livello[] = ["facile", "medio", "esperto"];
const VARIANTI: readonly Variante[] = ["1v1", "2v2"];

function eRecordPartita(valore: unknown): RecordPartita | null {
  if (typeof valore !== "object" || valore === null) return null;
  const r = valore as Record<string, unknown>;

  if (typeof r.id !== "string" || r.id === "") return null;
  if (typeof r.data !== "string" || r.data === "") return null;
  const variante = r.variante;
  if (variante !== "1v1" && variante !== "2v2") return null;
  const modalita = r.modalita;
  if (modalita !== "ai" && modalita !== "locale") return null;
  const livello = r.livello;
  if (livello !== null && !(LIVELLI as readonly unknown[]).includes(livello)) return null;
  const esito = r.esito;
  if (!(ESITI as readonly unknown[]).includes(esito)) return null;
  if (typeof r.puntiFatti !== "number" || !Number.isFinite(r.puntiFatti)) return null;
  if (typeof r.puntiSubiti !== "number" || !Number.isFinite(r.puntiSubiti)) return null;
  if (typeof r.abbandonata !== "boolean") return null;

  return {
    id: r.id,
    data: r.data,
    variante,
    modalita,
    livello: livello as Livello | null,
    esito: esito as EsitoPartita,
    puntiFatti: r.puntiFatti,
    puntiSubiti: r.puntiSubiti,
    abbandonata: r.abbandonata,
  };
}

/**
 * Difensivo ma non tutto-o-niente (a differenza di `validaSalvataggio`): le
 * statistiche sono un log "best effort", non lo stato di una partita in
 * corso. Un record corrotto si scarta, gli altri restano — perdere una riga
 * di cronologia è meglio che azzerarla tutta per un byte fuori posto.
 */
export function validaStatistiche(valore: unknown): StatisticheV1 {
  if (typeof valore !== "object" || valore === null) return statisticheVuote();
  const v = valore as Record<string, unknown>;
  if (v.versione !== 1 || !Array.isArray(v.partite)) return statisticheVuote();

  const partite: RecordPartita[] = [];
  for (const voce of v.partite) {
    const record = eRecordPartita(voce);
    if (record) partite.push(record);
  }
  return { versione: 1, partite };
}

/** Pura: aggiunge un record in coda. Testata a parte da qualunque I/O. */
export function aggiungiPartita(stats: StatisticheV1, record: RecordPartita): StatisticheV1 {
  return { versione: 1, partite: [...stats.partite, record] };
}

/** Le ultime `n` partite, più recente per prima. */
export function ultimePartite(stats: StatisticheV1, n: number): readonly RecordPartita[] {
  return stats.partite.slice(-n).reverse();
}

export interface AggregatoParziale {
  readonly giocate: number;
  readonly vinte: number;
  /** 0..1. Zero se `giocate` è zero — non NaN. */
  readonly percentuale: number;
}

export interface AggregatoVariante extends AggregatoParziale {
  /** Totale partite di questa variante, incluse quelle hot-seat (che non entrano in `vinte`). */
  readonly totale: number;
}

export interface Aggregati {
  readonly totalePartite: number;
  readonly partiteVsAI: number;
  readonly vinte: number;
  readonly perse: number;
  readonly pareggiate: number;
  /** 0..1, calcolata solo sulle partite contro l'IA: in hot-seat "vittoria" non esiste. */
  readonly percentualeVittorie: number;
  readonly strisciaCorrente: number;
  readonly strisciaMigliore: number;
  readonly perLivello: Readonly<Record<Livello, AggregatoParziale>>;
  readonly perVariante: Readonly<Record<Variante, AggregatoVariante>>;
}

function aggregatoParziale(partite: readonly RecordPartita[]): AggregatoParziale {
  const giocate = partite.length;
  const vinte = partite.filter((p) => p.esito === "vittoria").length;
  return { giocate, vinte, percentuale: giocate > 0 ? vinte / giocate : 0 };
}

export function calcolaAggregati(stats: StatisticheV1): Aggregati {
  // Le partite in hot-seat ("giocata") non hanno un "vincitore" per il
  // giocatore che guarda lo schermo: contano nel totale generale, mai nelle
  // percentuali di vittoria né nella striscia.
  const vsAI = stats.partite.filter((p) => p.modalita === "ai");
  const vinte = vsAI.filter((p) => p.esito === "vittoria").length;
  const perse = vsAI.filter((p) => p.esito === "sconfitta").length;
  const pareggiate = vsAI.filter((p) => p.esito === "pareggio").length;

  let strisciaCorrente = 0;
  for (let i = vsAI.length - 1; i >= 0; i--) {
    if (vsAI[i]?.esito !== "vittoria") break;
    strisciaCorrente++;
  }

  let strisciaMigliore = 0;
  let corsa = 0;
  for (const p of vsAI) {
    corsa = p.esito === "vittoria" ? corsa + 1 : 0;
    if (corsa > strisciaMigliore) strisciaMigliore = corsa;
  }

  const perLivello = Object.fromEntries(
    LIVELLI.map((livello) => [
      livello,
      aggregatoParziale(vsAI.filter((p) => p.livello === livello)),
    ]),
  ) as Record<Livello, AggregatoParziale>;

  const perVariante = Object.fromEntries(
    VARIANTI.map((variante) => {
      const diQuestaVariante = stats.partite.filter((p) => p.variante === variante);
      const vsAIDiQuestaVariante = diQuestaVariante.filter((p) => p.modalita === "ai");
      const parziale = aggregatoParziale(vsAIDiQuestaVariante);
      const voce: AggregatoVariante = { ...parziale, totale: diQuestaVariante.length };
      return [variante, voce];
    }),
  ) as Record<Variante, AggregatoVariante>;

  return {
    totalePartite: stats.partite.length,
    partiteVsAI: vsAI.length,
    vinte,
    perse,
    pareggiate,
    percentualeVittorie: vsAI.length > 0 ? vinte / vsAI.length : 0,
    strisciaCorrente,
    strisciaMigliore,
    perLivello,
    perVariante,
  };
}

/** Esito di una partita finita normalmente. Pura: nessun I/O, testata a parte. */
export function calcolaEsitoNormale(
  modalita: Modalita,
  stato: GameState,
): { readonly esito: EsitoPartita; readonly puntiFatti: number; readonly puntiSubiti: number } {
  const { vincitore, punti } = esitoCore(stato);
  const puntiFatti = punti[0];
  const puntiSubiti = punti[1];
  if (modalita === "locale") return { esito: "giocata", puntiFatti, puntiSubiti };
  if (vincitore === null) return { esito: "pareggio", puntiFatti, puntiSubiti };
  return { esito: vincitore === 0 ? "vittoria" : "sconfitta", puntiFatti, puntiSubiti };
}

/** Esito di una partita abbandonata a metà: sconfitta forzata contro l'IA. */
export function calcolaEsitoAbbandono(
  modalita: Modalita,
  stato: GameState,
): { readonly esito: EsitoPartita; readonly puntiFatti: number; readonly puntiSubiti: number } {
  const puntiFatti = puntiSquadra(stato, 0);
  const puntiSubiti = puntiSquadra(stato, 1);
  if (modalita === "locale") return { esito: "giocata", puntiFatti, puntiSubiti };
  return { esito: "sconfitta", puntiFatti, puntiSubiti };
}

function nuovoId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Ripiego per ambienti senza crypto.randomUUID (Safari vecchi, contesti non
  // sicuri): non serve crittografico, solo un id stabile e improbabile da
  // collidere all'interno dello stesso device.
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function caricaStatistiche(): StatisticheV1 {
  try {
    const grezzo = localStorage.getItem(CHIAVE_STATISTICHE);
    if (!grezzo) return statisticheVuote();
    return validaStatistiche(JSON.parse(grezzo));
  } catch {
    return statisticheVuote();
  }
}

export function salvaStatistiche(stats: StatisticheV1): void {
  try {
    localStorage.setItem(CHIAVE_STATISTICHE, JSON.stringify(stats));
  } catch {
    // Spazio esaurito o modalità privata: si continua a giocare senza salvare.
  }
}

/** Cancella statistiche e replay insieme: un azzeramento parziale confonderebbe di più. */
export function azzeraStatistiche(): void {
  try {
    localStorage.removeItem(CHIAVE_STATISTICHE);
  } catch {
    // niente da fare
  }
  svuotaRegistroReplay();
}

export interface DatiFinePartita {
  readonly variante: Variante;
  readonly modalita: Modalita;
  readonly livello: Livello;
  readonly seed: number;
  readonly stato: GameState;
  /** `null` quando il replay non è affidabile (partita ripresa dopo un refresh). */
  readonly azioni: readonly Azione[] | null;
  readonly abbandonata: boolean;
}

/**
 * Registra una partita conclusa (normalmente o per abbandono) sia nelle
 * statistiche sia — se il log delle azioni è affidabile — nel registro
 * replay. Unico punto che scrive entrambe le chiavi, chiamato da
 * `game/usePartita.ts`.
 */
export function registraFinePartita(dati: DatiFinePartita): void {
  const risultato = dati.abbandonata
    ? calcolaEsitoAbbandono(dati.modalita, dati.stato)
    : calcolaEsitoNormale(dati.modalita, dati.stato);

  const record: RecordPartita = {
    id: nuovoId(),
    data: new Date().toISOString(),
    variante: dati.variante,
    modalita: dati.modalita,
    livello: dati.modalita === "ai" ? dati.livello : null,
    esito: risultato.esito,
    puntiFatti: risultato.puntiFatti,
    puntiSubiti: risultato.puntiSubiti,
    abbandonata: dati.abbandonata,
  };

  salvaStatistiche(aggiungiPartita(caricaStatistiche(), record));

  if (dati.azioni !== null) {
    const voce: ReplayPartita = {
      id: record.id,
      variante: dati.variante,
      seed: dati.seed,
      azioni: dati.azioni,
    };
    salvaRegistroReplay(aggiungiReplay(caricaRegistroReplay(), voce));
  }
}
