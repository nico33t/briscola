import { describe, expect, it } from "vitest";
import { scegliCarta } from "@/ai/euristica.ts";
import { idCarta } from "@/core/deck.ts";
import { infoSetPer } from "@/core/infoset.ts";
import { applica, esito, nuovaPartita, puntiSeat, puntiSquadra } from "@/core/machine.ts";
import { creaRng } from "@/core/rng.ts";
import { squadraDi } from "@/core/rules.ts";
import type { GameState, Seat } from "@/core/types.ts";

/**
 * Test di integrazione F7 (0.9.0): una partita 2v2 completa, quattro AI,
 * giocata attraverso lo stesso percorso di `game/usePartita.ts` — reducer
 * puro (`applica`) più `scegliCarta` dell'euristica, ognuno alimentato **solo**
 * dal proprio `infoSetPer(stato, seat)`. Non passa mai `stato` per intero a
 * `scegliCarta`: è la stessa garanzia strutturale di AGENTS.md §3.3, qui
 * verificata a livello di partita intera e non di singola funzione.
 *
 * Non tocca `usePartita.ts` (è un hook React, non ha senso montarlo qui):
 * bypassa la UI e guida il reducer direttamente, come già fa
 * `machine.test.ts` per `partitaCasuale`.
 */

/** Gioca una partita 2v2 intera, un seat AI alla volta. */
function partita2v2AI(seed: number): GameState {
  let stato = nuovaPartita({ variante: "2v2", seed });
  const rng = creaRng(seed * 7919 + 13);
  let passi = 0;

  while (stato.fase !== "fine") {
    if (passi++ > 400) throw new Error("la partita 2v2 non finisce: possibile ciclo infinito");

    // Ogni seat riceve SOLO il proprio infoset — mai `stato` per intero.
    const info = infoSetPer(stato, stato.turno);
    const carta = scegliCarta(info, "medio", rng);
    if (!carta) throw new Error(`seat ${stato.turno} non ha scelto nessuna carta`);

    const risultato = applica(stato, { tipo: "GIOCA", seat: stato.turno, carta });
    if (!risultato.ok) throw new Error(`mossa illegale dall'AI: ${risultato.motivo}`);
    stato = risultato.stato;
  }

  return stato;
}

describe("🃏 partita 2v2 completa — quattro AI (F7)", () => {
  it("finisce sempre, su molti seed diversi", () => {
    for (let seed = 0; seed < 60; seed++) {
      expect(() => partita2v2AI(seed)).not.toThrow();
    }
  });

  it("distribuisce tutte e 4 le mani a testa 3 all'inizio e le svuota alla fine", () => {
    const s = partita2v2AI(1);
    expect(s.mani).toHaveLength(4);
    for (const mano of s.mani) expect(mano).toHaveLength(0);
    expect(s.mazzo).toHaveLength(0);
    expect(s.banco).toEqual([]);
  });

  it("i punti delle due squadre fanno sempre 120, su 60 partite", () => {
    for (let seed = 0; seed < 60; seed++) {
      const s = partita2v2AI(seed);
      expect(puntiSquadra(s, 0) + puntiSquadra(s, 1)).toBe(120);
    }
  });

  it("nessuna carta persa o duplicata: le 40 carte finiscono tutte in una presa", () => {
    for (let seed = 0; seed < 60; seed++) {
      const s = partita2v2AI(seed);
      const prese = s.prese.flat();
      expect(prese).toHaveLength(40);
      expect(new Set(prese.map(idCarta)).size).toBe(40);
    }
  });

  it("i punti di squadra sono la somma dei compagni (0+2 e 1+3), su una partita AI", () => {
    expect(squadraDi(0)).toBe(squadraDi(2));
    expect(squadraDi(1)).toBe(squadraDi(3));
    expect(squadraDi(0)).not.toBe(squadraDi(1));

    for (let seed = 0; seed < 30; seed++) {
      const s = partita2v2AI(seed);
      expect(puntiSquadra(s, 0)).toBe(puntiSeat(s, 0) + puntiSeat(s, 2));
      expect(puntiSquadra(s, 1)).toBe(puntiSeat(s, 1) + puntiSeat(s, 3));
    }
  });

  it("`esito` dichiara vincitore la squadra che supera 60, o pareggio a 60-60", () => {
    for (let seed = 0; seed < 60; seed++) {
      const s = partita2v2AI(seed);
      const e = esito(s);
      if (e.punti[0] > 60) expect(e.vincitore).toBe(0);
      else if (e.punti[1] > 60) expect(e.vincitore).toBe(1);
      else {
        expect(e.punti[0]).toBe(60);
        expect(e.punti[1]).toBe(60);
        expect(e.vincitore).toBeNull();
      }
    }
  });

  it("🔴 ogni mossa arriva da un infoset senza le carte altrui — nessuna AI ha barato", () => {
    // Rigioca la partita registrando, a ogni turno, se l'infoset di quel seat
    // conteneva una carta di un altro seat: se sì, l'euristica avrebbe potuto
    // "vedere" mani che non le spettano. Deve non succedere mai.
    let stato = nuovaPartita({ variante: "2v2", seed: 42 });
    const rng = creaRng(99);
    let passi = 0;

    while (stato.fase !== "fine") {
      if (passi++ > 400) throw new Error("ciclo infinito");
      const seat = stato.turno;
      const info = infoSetPer(stato, seat);
      const serializzato = JSON.stringify(info);

      for (let altro = 0; altro < 4; altro++) {
        if (altro === seat) continue;
        for (const carta of stato.mani[altro as Seat] ?? []) {
          expect(serializzato).not.toContain(idCarta(carta));
        }
      }

      const carta = scegliCarta(info, "medio", rng);
      if (!carta) throw new Error("nessuna carta scelta");
      const risultato = applica(stato, { tipo: "GIOCA", seat, carta });
      if (!risultato.ok) throw new Error(risultato.motivo);
      stato = risultato.stato;
    }
  });
});
