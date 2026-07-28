import { describe, expect, it } from "vitest";
import { FORZA, idCarta, mazzoCompleto, mescola, PUNTI, RANGHI, SEMI } from "./deck.ts";
import { creaRng } from "./rng.ts";

describe("mazzoCompleto", () => {
  it("ha 40 carte", () => {
    expect(mazzoCompleto()).toHaveLength(40);
  });

  it("non ha doppioni", () => {
    const id = new Set(mazzoCompleto().map(idCarta));
    expect(id.size).toBe(40);
  });

  it("ha 10 carte per ogni seme", () => {
    for (const seme of SEMI) {
      expect(mazzoCompleto().filter((c) => c.seme === seme)).toHaveLength(10);
    }
  });

  it("ha 4 carte per ogni rango", () => {
    for (const rango of RANGHI) {
      expect(mazzoCompleto().filter((c) => c.rango === rango)).toHaveLength(4);
    }
  });

  it("vale esattamente 120 punti — l'invariante della briscola", () => {
    const totale = mazzoCompleto().reduce((somma, c) => somma + PUNTI[c.rango], 0);
    expect(totale).toBe(120);
  });
});

describe("PUNTI", () => {
  it("segue i valori tradizionali", () => {
    expect(PUNTI.asso).toBe(11);
    expect(PUNTI.tre).toBe(10);
    expect(PUNTI.re).toBe(4);
    expect(PUNTI.cavallo).toBe(3);
    expect(PUNTI.fante).toBe(2);
  });

  it("le carte lisce non valgono niente", () => {
    for (const rango of ["due", "quattro", "cinque", "sei", "sette"] as const) {
      expect(PUNTI[rango]).toBe(0);
    }
  });
});

describe("FORZA", () => {
  it("mette l'asso sopra il tre, e il tre sopra il re", () => {
    expect(FORZA.asso).toBeGreaterThan(FORZA.tre);
    expect(FORZA.tre).toBeGreaterThan(FORZA.re);
  });

  it("segue l'ordine asso > 3 > re > cavallo > fante > 7 > 6 > 5 > 4 > 2", () => {
    const atteso = [
      "asso",
      "tre",
      "re",
      "cavallo",
      "fante",
      "sette",
      "sei",
      "cinque",
      "quattro",
      "due",
    ] as const;
    const ordinati = [...RANGHI].sort((a, b) => FORZA[b] - FORZA[a]);
    expect(ordinati).toEqual([...atteso]);
  });

  it("assegna una forza distinta a ogni rango", () => {
    expect(new Set(RANGHI.map((r) => FORZA[r])).size).toBe(10);
  });
});

describe("mescola", () => {
  it("conserva tutte e sole le carte di partenza", () => {
    const mescolato = mescola(mazzoCompleto(), creaRng(42));
    expect(mescolato).toHaveLength(40);
    expect(new Set(mescolato.map(idCarta)).size).toBe(40);
  });

  it("è deterministico a parità di seme", () => {
    const a = mescola(mazzoCompleto(), creaRng(7)).map(idCarta);
    const b = mescola(mazzoCompleto(), creaRng(7)).map(idCarta);
    expect(a).toEqual(b);
  });

  it("dà ordini diversi con semi diversi", () => {
    const a = mescola(mazzoCompleto(), creaRng(1)).map(idCarta);
    const b = mescola(mazzoCompleto(), creaRng(2)).map(idCarta);
    expect(a).not.toEqual(b);
  });

  it("non modifica il mazzo di partenza", () => {
    const originale = mazzoCompleto();
    const copia = originale.map(idCarta);
    mescola(originale, creaRng(3));
    expect(originale.map(idCarta)).toEqual(copia);
  });
});
