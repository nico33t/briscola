import { describe, expect, it } from "vitest";
import { idCarta } from "./deck.ts";
import { applica, esito, nuovaPartita, puntiSeat, puntiSquadra } from "./machine.ts";
import { creaRng } from "./rng.ts";
import type { Carta, GameState, Seat, Variante } from "./types.ts";

/** Tutte le carte presenti nello stato, ovunque si trovino. */
function tutteLeCarte(s: GameState): Carta[] {
  return [...s.mazzo, ...s.mani.flat(), ...s.banco.map((g) => g.carta), ...s.prese.flat()];
}

/** Gioca una partita intera scegliendo a caso fra le carte in mano. */
function partitaCasuale(variante: Variante, seed: number): GameState {
  const rng = creaRng(seed * 7919 + 13);
  let stato = nuovaPartita({ variante, seed });
  let passi = 0;

  while (stato.fase !== "fine") {
    if (passi++ > 200) throw new Error("la partita non finisce: possibile ciclo infinito");
    const mano = stato.mani[stato.turno];
    if (!mano || mano.length === 0) throw new Error(`seat ${stato.turno} deve giocare senza carte`);
    const carta = mano[Math.floor(rng() * mano.length)];
    if (!carta) throw new Error("carta non estratta");
    const esitoMossa = applica(stato, { tipo: "GIOCA", seat: stato.turno, carta });
    if (!esitoMossa.ok) throw new Error(`mossa rifiutata: ${esitoMossa.motivo}`);
    stato = esitoMossa.stato;
  }

  return stato;
}

describe("nuovaPartita — 1v1", () => {
  const s = nuovaPartita({ variante: "1v1", seed: 1 });

  it("distribuisce 3 carte a testa a 2 giocatori", () => {
    expect(s.mani).toHaveLength(2);
    for (const mano of s.mani) expect(mano).toHaveLength(3);
  });

  it("lascia 34 carte nel mazzo", () => {
    expect(s.mazzo).toHaveLength(34);
  });

  it("mette la briscola scoperta in fondo al mazzo, ultima a essere pescata", () => {
    expect(s.mazzo.at(-1)).toEqual(s.cartaBriscola);
    expect(s.briscola).toBe(s.cartaBriscola.seme);
  });

  it("apre il primo giro con il seat 0", () => {
    expect(s.diMano).toBe(0);
    expect(s.turno).toBe(0);
    expect(s.banco).toEqual([]);
    expect(s.fase).toBe("gioco");
  });

  it("ha comunque 40 carte in tutto", () => {
    expect(tutteLeCarte(s)).toHaveLength(40);
  });
});

describe("nuovaPartita — 2v2", () => {
  const s = nuovaPartita({ variante: "2v2", seed: 1 });

  it("distribuisce 3 carte a testa a 4 giocatori", () => {
    expect(s.mani).toHaveLength(4);
    for (const mano of s.mani) expect(mano).toHaveLength(3);
  });

  it("lascia 28 carte nel mazzo", () => {
    expect(s.mazzo).toHaveLength(28);
  });

  it("ha comunque 40 carte in tutto", () => {
    expect(tutteLeCarte(s)).toHaveLength(40);
  });
});

describe("nuovaPartita — determinismo", () => {
  it("lo stesso seme produce la stessa partita", () => {
    const a = nuovaPartita({ variante: "1v1", seed: 99 });
    const b = nuovaPartita({ variante: "1v1", seed: 99 });
    expect(a.mazzo.map(idCarta)).toEqual(b.mazzo.map(idCarta));
    expect(a.mani.map((m) => m.map(idCarta))).toEqual(b.mani.map((m) => m.map(idCarta)));
  });

  it("semi diversi producono partite diverse", () => {
    const a = nuovaPartita({ variante: "1v1", seed: 1 });
    const b = nuovaPartita({ variante: "1v1", seed: 2 });
    expect(a.mazzo.map(idCarta)).not.toEqual(b.mazzo.map(idCarta));
  });
});

describe("applica — mosse rifiutate", () => {
  const s = nuovaPartita({ variante: "1v1", seed: 5 });

  it("rifiuta chi gioca fuori turno", () => {
    const carta = s.mani[1]?.[0];
    if (!carta) throw new Error("mano vuota");
    const r = applica(s, { tipo: "GIOCA", seat: 1, carta });
    expect(r.ok).toBe(false);
  });

  it("rifiuta una carta che il giocatore non ha in mano", () => {
    const inMano = new Set(s.mani[0]?.map(idCarta));
    const estranea = s.mazzo.find((c) => !inMano.has(idCarta(c)));
    if (!estranea) throw new Error("nessuna carta estranea trovata");
    const r = applica(s, { tipo: "GIOCA", seat: 0, carta: estranea });
    expect(r.ok).toBe(false);
  });

  it("rifiuta un seat che non esiste", () => {
    const carta = s.mani[0]?.[0];
    if (!carta) throw new Error("mano vuota");
    const r = applica(s, { tipo: "GIOCA", seat: 3 as Seat, carta });
    expect(r.ok).toBe(false);
  });

  it("non modifica lo stato quando rifiuta", () => {
    const prima = JSON.stringify(s);
    const carta = s.mani[1]?.[0];
    if (!carta) throw new Error("mano vuota");
    applica(s, { tipo: "GIOCA", seat: 1, carta });
    expect(JSON.stringify(s)).toBe(prima);
  });
});

describe("applica — una giocata legale", () => {
  const s = nuovaPartita({ variante: "1v1", seed: 5 });
  const carta = s.mani[0]?.[0];
  if (!carta) throw new Error("mano vuota");
  const r = applica(s, { tipo: "GIOCA", seat: 0, carta });
  if (!r.ok) throw new Error(r.motivo);

  it("toglie la carta dalla mano e la mette sul banco", () => {
    expect(r.stato.mani[0]).toHaveLength(2);
    expect(r.stato.banco).toEqual([{ seat: 0, carta }]);
  });

  it("passa il turno all'avversario, ma non ancora chi è di mano", () => {
    expect(r.stato.turno).toBe(1);
    expect(r.stato.diMano).toBe(0);
  });

  it("non muta lo stato di partenza", () => {
    expect(s.mani[0]).toHaveLength(3);
    expect(s.banco).toEqual([]);
  });

  it("emette l'evento della carta giocata", () => {
    expect(r.eventi).toContainEqual({ tipo: "CARTA_GIOCATA", seat: 0, carta });
  });
});

describe("applica — chiusura del giro", () => {
  it("assegna la presa, svuota il banco e fa pescare, vincitore per primo", () => {
    let s = nuovaPartita({ variante: "1v1", seed: 11 });
    const cimaMazzo = [s.mazzo[0], s.mazzo[1]];

    for (const seat of [0, 1] as const) {
      const carta = s.mani[seat]?.[0];
      if (!carta) throw new Error("mano vuota");
      const r = applica(s, { tipo: "GIOCA", seat, carta });
      if (!r.ok) throw new Error(r.motivo);
      s = r.stato;
    }

    expect(s.banco).toEqual([]);
    expect(s.mani[0]).toHaveLength(3);
    expect(s.mani[1]).toHaveLength(3);
    expect(s.mazzo).toHaveLength(32);

    // chi ha vinto è di mano e ha pescato la prima carta del mazzo
    expect(s.turno).toBe(s.diMano);
    const primaPescata = cimaMazzo[0];
    if (!primaPescata) throw new Error("mazzo vuoto");
    expect(s.mani[s.diMano]?.map(idCarta)).toContain(idCarta(primaPescata));
  });

  it("dà tutti i punti del giro a chi ha vinto", () => {
    let s = nuovaPartita({ variante: "1v1", seed: 11 });
    for (const seat of [0, 1] as const) {
      const carta = s.mani[seat]?.[0];
      if (!carta) throw new Error("mano vuota");
      const r = applica(s, { tipo: "GIOCA", seat, carta });
      if (!r.ok) throw new Error(r.motivo);
      s = r.stato;
    }
    const perdente = s.diMano === 0 ? 1 : 0;
    expect(s.prese[perdente]).toHaveLength(0);
    expect(s.prese[s.diMano]).toHaveLength(2);
    expect(puntiSeat(s, s.diMano) + puntiSeat(s, perdente)).toBe(puntiSeat(s, s.diMano));
  });
});

describe("partita completa — 1v1", () => {
  const s = partitaCasuale("1v1", 2026);

  it("finisce con tutte le mani e il mazzo vuoti", () => {
    expect(s.fase).toBe("fine");
    expect(s.mazzo).toHaveLength(0);
    for (const mano of s.mani) expect(mano).toHaveLength(0);
    expect(s.banco).toEqual([]);
  });

  it("distribuisce tutte e 40 le carte nelle prese", () => {
    expect(s.prese.flat()).toHaveLength(40);
    expect(new Set(s.prese.flat().map(idCarta)).size).toBe(40);
  });

  it("i punti fanno sempre 120", () => {
    expect(puntiSeat(s, 0) + puntiSeat(s, 1)).toBe(120);
  });

  it("dichiara vincitore chi supera 60", () => {
    const e = esito(s);
    if (e.punti[0] > 60) expect(e.vincitore).toBe(0);
    else if (e.punti[1] > 60) expect(e.vincitore).toBe(1);
    else expect(e.vincitore).toBeNull();
  });
});

describe("partita completa — 2v2", () => {
  const s = partitaCasuale("2v2", 4242);

  it("finisce con tutto vuoto", () => {
    expect(s.fase).toBe("fine");
    expect(s.mazzo).toHaveLength(0);
    for (const mano of s.mani) expect(mano).toHaveLength(0);
  });

  it("i punti delle due squadre fanno 120", () => {
    expect(puntiSquadra(s, 0) + puntiSquadra(s, 1)).toBe(120);
  });

  it("i punti di squadra sono la somma dei compagni", () => {
    expect(puntiSquadra(s, 0)).toBe(puntiSeat(s, 0) + puntiSeat(s, 2));
    expect(puntiSquadra(s, 1)).toBe(puntiSeat(s, 1) + puntiSeat(s, 3));
  });
});

describe("invarianti su molte partite", () => {
  it("1v1: 120 punti e nessuna carta persa, su 150 partite", () => {
    for (let seed = 0; seed < 150; seed++) {
      const s = partitaCasuale("1v1", seed);
      expect(puntiSeat(s, 0) + puntiSeat(s, 1)).toBe(120);
      expect(new Set(s.prese.flat().map(idCarta)).size).toBe(40);
    }
  });

  it("2v2: 120 punti e nessuna carta persa, su 150 partite", () => {
    for (let seed = 0; seed < 150; seed++) {
      const s = partitaCasuale("2v2", seed);
      expect(puntiSquadra(s, 0) + puntiSquadra(s, 1)).toBe(120);
      expect(new Set(s.prese.flat().map(idCarta)).size).toBe(40);
    }
  });

  it("la briscola scoperta finisce sempre in mano a qualcuno prima della fine", () => {
    for (let seed = 0; seed < 50; seed++) {
      const iniziale = nuovaPartita({ variante: "1v1", seed });
      const finale = partitaCasuale("1v1", seed);
      const id = idCarta(iniziale.cartaBriscola);
      expect(finale.prese.flat().map(idCarta)).toContain(id);
    }
  });
});
