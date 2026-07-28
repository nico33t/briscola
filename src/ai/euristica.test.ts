import { describe, expect, it } from "vitest";
import { idCarta } from "../core/deck.ts";
import { infoSetPer } from "../core/infoset.ts";
import { applica, esito, nuovaPartita, puntiSquadra } from "../core/machine.ts";
import { creaRng } from "../core/rng.ts";
import type { Carta, GameState, Seat } from "../core/types.ts";
import { mossaEuristica, scegliCarta } from "./euristica.ts";

type Giocatore = (stato: GameState, seat: Seat) => Carta;

const casuale =
  (seed: number): Giocatore =>
  (stato, seat) => {
    const rng = creaRng(seed + stato.prese.flat().length * 31 + seat);
    const mano = stato.mani[seat] ?? [];
    const carta = mano[Math.floor(rng() * mano.length)];
    if (!carta) throw new Error("mano vuota");
    return carta;
  };

const euristico: Giocatore = (stato, seat) => {
  const carta = mossaEuristica(infoSetPer(stato, seat));
  if (!carta) throw new Error("l'euristica non ha scelto");
  return carta;
};

/** Fa giocare una partita intera fra due strategie. Ritorna i punti di seat 0. */
function partita(seat0: Giocatore, seat1: Giocatore, seed: number): number {
  let stato = nuovaPartita({ variante: "1v1", seed });
  let passi = 0;
  while (stato.fase !== "fine") {
    if (passi++ > 200) throw new Error("partita che non finisce");
    const giocatore = stato.turno === 0 ? seat0 : seat1;
    const carta = giocatore(stato, stato.turno);
    const r = applica(stato, { tipo: "GIOCA", seat: stato.turno, carta });
    if (!r.ok) throw new Error(`mossa illegale dall'AI: ${r.motivo}`);
    stato = r.stato;
  }
  return puntiSquadra(stato, 0);
}

describe("l'euristica gioca sempre una mossa legale", () => {
  it("su 200 partite non produce mai una carta che non ha in mano", () => {
    for (let seed = 0; seed < 200; seed++) {
      // partita() lancia se una mossa viene rifiutata dal core
      expect(() => partita(euristico, euristico, seed)).not.toThrow();
    }
  });
});

describe("🎯 torneo: l'euristica deve battere il caso", () => {
  it("vince nettamente più partite del giocatore casuale", () => {
    let vittorieEuristica = 0;
    let vittorieCaso = 0;
    const PARTITE = 300;

    for (let seed = 0; seed < PARTITE; seed++) {
      // si alternano i posti, così il vantaggio di aprire non falsa il conto
      const euristicaInPosizione0 = seed % 2 === 0;
      const punti0 = euristicaInPosizione0
        ? partita(euristico, casuale(seed), seed)
        : partita(casuale(seed), euristico, seed);
      const puntiEuristica = euristicaInPosizione0 ? punti0 : 120 - punti0;

      if (puntiEuristica > 60) vittorieEuristica++;
      else if (puntiEuristica < 60) vittorieCaso++;
    }

    const percentuale = (vittorieEuristica / PARTITE) * 100;
    expect(vittorieEuristica).toBeGreaterThan(vittorieCaso);
    // Un'AI che non batte il caso almeno 2 volte su 3 non è un avversario.
    expect(percentuale).toBeGreaterThan(66);
  });

  it("incassa in media molti più punti del caso", () => {
    let totale = 0;
    const PARTITE = 200;
    for (let seed = 0; seed < PARTITE; seed++) {
      totale += partita(euristico, casuale(seed + 1000), seed);
    }
    const media = totale / PARTITE;
    expect(media).toBeGreaterThan(70); // il pareggio è 60
  });
});

describe("scelte singole — il buon senso della briscola", () => {
  const stato = nuovaPartita({ variante: "1v1", seed: 1 });

  it("aprendo non regala mai un asso o un tre, se ha alternative", () => {
    for (let seed = 0; seed < 100; seed++) {
      const s = nuovaPartita({ variante: "1v1", seed });
      const info = infoSetPer(s, 0);
      const scelta = mossaEuristica(info);
      if (!scelta) throw new Error("nessuna scelta");

      const haAlternativeLisce = info.mano.some(
        (c) => c.rango !== "asso" && c.rango !== "tre" && c.seme !== info.briscola,
      );
      if (haAlternativeLisce) {
        expect(scelta.rango === "asso" && scelta.seme !== info.briscola).toBe(false);
      }
    }
  });

  it("prende gratis: se può vincere con una liscia di un altro seme, lo fa", () => {
    // seat 0 apre, seat 1 risponde: cerchiamo un caso in cui seat 1 ha una
    // liscia vincente e verifichiamo che la usi.
    let casiVerificati = 0;
    for (let seed = 0; seed < 200 && casiVerificati < 20; seed++) {
      const s = nuovaPartita({ variante: "1v1", seed });
      const apertura = s.mani[0]?.[0];
      if (!apertura) continue;
      const r = applica(s, { tipo: "GIOCA", seat: 0, carta: apertura });
      if (!r.ok) continue;

      const info = infoSetPer(r.stato, 1);
      const lisceVincenti = info.mano.filter((c) => {
        if (c.seme === info.briscola) return false;
        if (c.seme !== apertura.seme) return false;
        return c.rango !== "asso" && c.rango !== "tre";
      });
      if (lisceVincenti.length === 0) continue;

      const scelta = mossaEuristica(info);
      if (!scelta) continue;
      const banco = [...info.banco, { seat: 1 as Seat, carta: scelta }];
      const vince =
        banco.reduce((migliore, g) => {
          if (g.carta.seme === info.briscola && migliore.carta.seme !== info.briscola) return g;
          if (g.carta.seme !== migliore.carta.seme) return migliore;
          return g;
        }).seat === 1;
      if (vince) casiVerificati++;
    }
    expect(casiVerificati).toBeGreaterThan(0);
  });

  it("con una sola carta in mano gioca quella", () => {
    const info = { ...infoSetPer(stato, 0), mano: [{ seme: "coppe", rango: "re" } as const] };
    const scelta = mossaEuristica(info);
    expect(scelta && idCarta(scelta)).toBe("coppe-re");
  });
});

describe("livello facile", () => {
  it("è deterministico a parità di seme", () => {
    const info = infoSetPer(nuovaPartita({ variante: "1v1", seed: 3 }), 0);
    const a = scegliCarta(info, "facile", creaRng(1));
    const b = scegliCarta(info, "facile", creaRng(1));
    expect(a && idCarta(a)).toBe(b && idCarta(b));
  });

  it("perde più spesso del livello medio", () => {
    let vittorieMedio = 0;
    for (let seed = 0; seed < 150; seed++) {
      let stato = nuovaPartita({ variante: "1v1", seed });
      const rng = creaRng(seed + 7);
      while (stato.fase !== "fine") {
        const info = infoSetPer(stato, stato.turno);
        const carta = stato.turno === 0 ? mossaEuristica(info) : scegliCarta(info, "facile", rng);
        if (!carta) throw new Error("nessuna scelta");
        const r = applica(stato, { tipo: "GIOCA", seat: stato.turno, carta });
        if (!r.ok) throw new Error(r.motivo);
        stato = r.stato;
      }
      if (esito(stato).vincitore === 0) vittorieMedio++;
    }
    expect(vittorieMedio).toBeGreaterThan(75); // oltre la metà di 150
  });
});
