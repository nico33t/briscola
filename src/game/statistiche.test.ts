import { describe, expect, it } from "vitest";
import { nuovaPartita } from "@/core/machine.ts";
import type { Carta, GameState, Seme } from "@/core/types.ts";
import {
  aggiungiPartita,
  calcolaAggregati,
  calcolaEsitoAbbandono,
  calcolaEsitoNormale,
  type RecordPartita,
  type StatisticheV1,
  statisticheVuote,
  ultimePartite,
  validaStatistiche,
} from "@/game/statistiche.ts";

/** Serializza e rideserializza, come farebbe localStorage. */
const viaJson = (valore: unknown) => JSON.parse(JSON.stringify(valore));

let contatore = 0;
function nuovoRecord(overrides: Partial<RecordPartita> = {}): RecordPartita {
  contatore += 1;
  return {
    id: `id-${contatore}`,
    data: new Date(2026, 6, contatore).toISOString(),
    variante: "1v1",
    modalita: "ai",
    livello: "medio",
    esito: "vittoria",
    puntiFatti: 61,
    puntiSubiti: 59,
    abbandonata: false,
    ...overrides,
  };
}

/** Tutte le carte a punti di un seme: asso+tre+re+cavallo+fante = 30 punti esatti. */
function carteAPunti(seme: Seme): Carta[] {
  return (["asso", "tre", "re", "cavallo", "fante"] as const).map((rango) => ({ seme, rango }));
}

/** Stato 1v1 con le prese impostate a mano, per controllare il punteggio senza giocare una partita vera. */
function stato1v1(
  preseSeat0: readonly Carta[],
  preseSeat1: readonly Carta[],
  fase: "gioco" | "fine" = "fine",
): GameState {
  const base = nuovaPartita({ variante: "1v1", seed: 1 });
  return { ...base, prese: [preseSeat0, preseSeat1], fase };
}

describe("calcolaEsitoNormale", () => {
  it("vittoria contro l'IA quando il seat 0 supera 60", () => {
    // denari + coppe + bastoni = 90 punti, ben oltre 60.
    const stato = stato1v1(
      [...carteAPunti("denari"), ...carteAPunti("coppe"), ...carteAPunti("bastoni")],
      [],
    );
    const r = calcolaEsitoNormale("ai", stato);
    expect(r.esito).toBe("vittoria");
    expect(r.puntiFatti).toBe(90);
    expect(r.puntiSubiti).toBe(0);
  });

  it("sconfitta contro l'IA quando il seat 1 supera 60", () => {
    const stato = stato1v1(
      [],
      [...carteAPunti("denari"), ...carteAPunti("coppe"), ...carteAPunti("bastoni")],
    );
    const r = calcolaEsitoNormale("ai", stato);
    expect(r.esito).toBe("sconfitta");
  });

  it("pareggio a 60 pari", () => {
    // denari+coppe = 60 per il seat 0, bastoni+spade = 60 per il seat 1.
    const stato = stato1v1(
      [...carteAPunti("denari"), ...carteAPunti("coppe")],
      [...carteAPunti("bastoni"), ...carteAPunti("spade")],
    );
    const r = calcolaEsitoNormale("ai", stato);
    expect(r.esito).toBe("pareggio");
    expect(r.puntiFatti).toBe(60);
    expect(r.puntiSubiti).toBe(60);
  });

  it("in hot-seat l'esito è sempre 'giocata', punti a parte", () => {
    const stato = stato1v1(
      [...carteAPunti("denari"), ...carteAPunti("coppe"), ...carteAPunti("bastoni")],
      [],
    );
    const r = calcolaEsitoNormale("locale", stato);
    expect(r.esito).toBe("giocata");
    expect(r.puntiFatti).toBe(90);
  });
});

describe("calcolaEsitoAbbandono", () => {
  it("è sempre sconfitta contro l'IA, anche se si stava vincendo", () => {
    const stato = stato1v1(
      [...carteAPunti("denari"), ...carteAPunti("coppe"), ...carteAPunti("bastoni")],
      [],
      "gioco",
    );
    const r = calcolaEsitoAbbandono("ai", stato);
    expect(r.esito).toBe("sconfitta");
    expect(r.puntiFatti).toBe(90);
  });

  it("è 'giocata' in hot-seat", () => {
    const stato = stato1v1([], [], "gioco");
    const r = calcolaEsitoAbbandono("locale", stato);
    expect(r.esito).toBe("giocata");
  });
});

describe("aggiungiPartita — pura", () => {
  it("aggiunge in coda senza toccare l'esistente", () => {
    const vuote = statisticheVuote();
    const record: RecordPartita = {
      id: "a",
      data: "2026-07-30T00:00:00.000Z",
      variante: "1v1",
      modalita: "ai",
      livello: "medio",
      esito: "vittoria",
      puntiFatti: 61,
      puntiSubiti: 59,
      abbandonata: false,
    };
    const dopo = aggiungiPartita(vuote, record);
    expect(dopo.partite).toEqual([record]);
    expect(vuote.partite).toEqual([]); // l'originale non cambia
  });
});

describe("ultimePartite", () => {
  const stats: StatisticheV1 = {
    versione: 1,
    partite: ["a", "b", "c", "d"].map((id) => nuovoRecord({ id })),
  };

  it("restituisce le ultime n, più recente per prima", () => {
    expect(ultimePartite(stats, 2).map((p) => p.id)).toEqual(["d", "c"]);
  });

  it("con n maggiore del totale restituisce tutto, invertito", () => {
    expect(ultimePartite(stats, 100).map((p) => p.id)).toEqual(["d", "c", "b", "a"]);
  });
});

describe("validaStatistiche — difensivo", () => {
  it("accetta un blob sano andata e ritorno per JSON", () => {
    const sane = aggiungiPartita(statisticheVuote(), nuovoRecord({ id: "x" }));
    expect(validaStatistiche(viaJson(sane))).toEqual(sane);
  });

  it("torna vuoto per spazzatura in radice", () => {
    for (const spazzatura of [null, undefined, 1, "x", [], true, {}]) {
      expect(validaStatistiche(spazzatura)).toEqual(statisticheVuote());
    }
  });

  it("torna vuoto se la versione non è 1", () => {
    expect(validaStatistiche({ versione: 2, partite: [] })).toEqual(statisticheVuote());
  });

  it("scarta i record corrotti e tiene i sani (non tutto-o-niente)", () => {
    const grezzo = {
      versione: 1,
      partite: [
        nuovoRecord({ id: "buono" }),
        { ...nuovoRecord({ id: "esito-inventato" }), esito: "boh" },
        { ...nuovoRecord({ id: "variante-inventata" }), variante: "3v3" },
        { ...nuovoRecord({ id: "senza-id" }), id: "" },
        "non è nemmeno un oggetto",
      ],
    };
    const risultato = validaStatistiche(grezzo);
    expect(risultato.partite.map((p) => p.id)).toEqual(["buono"]);
  });

  it("accetta livello null (hot-seat) e lo rifiuta se è un valore a caso", () => {
    const buono = viaJson({
      versione: 1,
      partite: [
        nuovoRecord({ id: "hotseat", modalita: "locale", livello: null, esito: "giocata" }),
      ],
    });
    expect(validaStatistiche(buono).partite).toHaveLength(1);

    const cattivo = {
      versione: 1,
      partite: [{ ...nuovoRecord({ id: "x" }), livello: "divino" }],
    };
    expect(validaStatistiche(cattivo).partite).toHaveLength(0);
  });
});

describe("calcolaAggregati", () => {
  it("conta tutto, ma vinte/percentuale/striscia solo sulle partite contro l'IA", () => {
    const stats: StatisticheV1 = {
      versione: 1,
      partite: [
        nuovoRecord({ esito: "vittoria" }),
        nuovoRecord({ modalita: "locale", livello: null, esito: "giocata" }),
        nuovoRecord({ esito: "vittoria" }),
        nuovoRecord({ esito: "sconfitta" }),
        nuovoRecord({ esito: "pareggio" }),
      ],
    };
    const a = calcolaAggregati(stats);
    expect(a.totalePartite).toBe(5);
    expect(a.partiteVsAI).toBe(4);
    expect(a.vinte).toBe(2);
    expect(a.perse).toBe(1);
    expect(a.pareggiate).toBe(1);
    expect(a.percentualeVittorie).toBeCloseTo(0.5);
  });

  it("non esplode e non dà NaN quando non c'è ancora nessuna partita vs IA", () => {
    const stats: StatisticheV1 = {
      versione: 1,
      partite: [nuovoRecord({ modalita: "locale", livello: null, esito: "giocata" })],
    };
    const a = calcolaAggregati(stats);
    expect(a.percentualeVittorie).toBe(0);
    expect(a.strisciaCorrente).toBe(0);
    expect(a.strisciaMigliore).toBe(0);
  });

  it("la striscia corrente conta le vittorie consecutive più recenti, ignorando le partite hot-seat", () => {
    const stats: StatisticheV1 = {
      versione: 1,
      partite: [
        nuovoRecord({ esito: "sconfitta" }),
        nuovoRecord({ esito: "vittoria" }),
        nuovoRecord({ modalita: "locale", livello: null, esito: "giocata" }),
        nuovoRecord({ esito: "vittoria" }),
        nuovoRecord({ esito: "vittoria" }),
      ],
    };
    const a = calcolaAggregati(stats);
    expect(a.strisciaCorrente).toBe(3);
  });

  it("la striscia migliore è la più lunga corsa di vittorie di sempre, non solo l'ultima", () => {
    const stats: StatisticheV1 = {
      versione: 1,
      partite: [
        nuovoRecord({ esito: "vittoria" }),
        nuovoRecord({ esito: "vittoria" }),
        nuovoRecord({ esito: "vittoria" }),
        nuovoRecord({ esito: "sconfitta" }),
        nuovoRecord({ esito: "vittoria" }),
      ],
    };
    const a = calcolaAggregati(stats);
    expect(a.strisciaMigliore).toBe(3);
    expect(a.strisciaCorrente).toBe(1);
  });

  it("spacca per livello IA", () => {
    const stats: StatisticheV1 = {
      versione: 1,
      partite: [
        nuovoRecord({ livello: "facile", esito: "vittoria" }),
        nuovoRecord({ livello: "facile", esito: "sconfitta" }),
        nuovoRecord({ livello: "esperto", esito: "vittoria" }),
      ],
    };
    const a = calcolaAggregati(stats);
    expect(a.perLivello.facile).toEqual({ giocate: 2, vinte: 1, percentuale: 0.5 });
    expect(a.perLivello.esperto).toEqual({ giocate: 1, vinte: 1, percentuale: 1 });
    expect(a.perLivello.medio).toEqual({ giocate: 0, vinte: 0, percentuale: 0 });
  });

  it("spacca per variante, contando anche le hot-seat nel totale ma non nella percentuale", () => {
    const stats: StatisticheV1 = {
      versione: 1,
      partite: [
        nuovoRecord({ variante: "1v1", esito: "vittoria" }),
        nuovoRecord({ variante: "1v1", modalita: "locale", livello: null, esito: "giocata" }),
        nuovoRecord({ variante: "2v2", esito: "sconfitta" }),
      ],
    };
    const a = calcolaAggregati(stats);
    expect(a.perVariante["1v1"]).toEqual({ totale: 2, giocate: 1, vinte: 1, percentuale: 1 });
    expect(a.perVariante["2v2"]).toEqual({ totale: 1, giocate: 1, vinte: 0, percentuale: 0 });
  });
});
