import { describe, expect, it } from "vitest";
import { idCarta, mazzoCompleto } from "./deck.ts";
import { carteNonViste, infoSetPer } from "./infoset.ts";
import { applica, nuovaPartita } from "./machine.ts";
import { creaRng } from "./rng.ts";
import type { GameState, Seat, Variante } from "./types.ts";

/** Avanza la partita di N mosse scegliendo a caso, per arrivare a metà gioco. */
function avanza(stato: GameState, mosse: number, seed: number): GameState {
  const rng = creaRng(seed);
  let s = stato;
  for (let i = 0; i < mosse && s.fase !== "fine"; i++) {
    const mano = s.mani[s.turno];
    if (!mano || mano.length === 0) break;
    const carta = mano[Math.floor(rng() * mano.length)];
    if (!carta) break;
    const r = applica(s, { tipo: "GIOCA", seat: s.turno, carta });
    if (!r.ok) throw new Error(r.motivo);
    s = r.stato;
  }
  return s;
}

describe("infoSetPer — cosa mostra", () => {
  const s = nuovaPartita({ variante: "1v1", seed: 77 });
  const info = infoSetPer(s, 0);

  it("mostra la propria mano per intero", () => {
    expect(info.mano.map(idCarta)).toEqual(s.mani[0]?.map(idCarta));
  });

  it("mostra la briscola, che è scoperta sul tavolo", () => {
    expect(info.briscola).toBe(s.briscola);
    expect(info.cartaBriscola).toEqual(s.cartaBriscola);
  });

  it("del mazzo mostra solo quante carte restano, non quali", () => {
    expect(info.carteInMazzo).toBe(34);
    expect(JSON.stringify(info)).not.toContain('"mazzo"');
  });

  it("mostra quante carte ha in mano ciascuno", () => {
    expect(info.cartePerSeat).toEqual([3, 3]);
  });

  it("sa di chi è il turno e chi è di mano", () => {
    expect(info.turno).toBe(s.turno);
    expect(info.diMano).toBe(s.diMano);
    expect(info.io).toBe(0);
  });
});

describe("🔴 infoSetPer — cosa NON deve mostrare", () => {
  it("non contiene nessuna carta dell'avversario, in nessuna forma", () => {
    for (let seed = 0; seed < 30; seed++) {
      const s = avanza(nuovaPartita({ variante: "1v1", seed }), 7, seed + 500);
      const info = infoSetPer(s, 0);
      const serializzato = JSON.stringify(info);

      for (const carta of s.mani[1] ?? []) {
        expect(serializzato).not.toContain(idCarta(carta));
      }
    }
  });

  it("nel 2v2 non mostra nemmeno le carte del compagno", () => {
    const s = avanza(nuovaPartita({ variante: "2v2", seed: 3 }), 9, 999);
    const serializzato = JSON.stringify(infoSetPer(s, 0));
    for (const seat of [1, 2, 3] as const) {
      for (const carta of s.mani[seat] ?? []) {
        expect(serializzato).not.toContain(idCarta(carta));
      }
    }
  });

  it("non contiene le carte ancora nel mazzo", () => {
    const s = avanza(nuovaPartita({ variante: "1v1", seed: 8 }), 5, 111);
    const serializzato = JSON.stringify(infoSetPer(s, 0));
    // la briscola scoperta è l'unica carta del mazzo che si può vedere
    const nascoste = s.mazzo.filter((c) => idCarta(c) !== idCarta(s.cartaBriscola));
    for (const carta of nascoste) {
      expect(serializzato).not.toContain(idCarta(carta));
    }
  });
});

describe("infoSetPer — le carte già passate sul tavolo", () => {
  it("mostra tutte le carte giocate, da chiunque", () => {
    const s = avanza(nuovaPartita({ variante: "1v1", seed: 21 }), 6, 21);
    const info = infoSetPer(s, 0);
    const attese = new Set([...s.prese.flat(), ...s.banco.map((g) => g.carta)].map(idCarta));
    expect(new Set(info.viste.map(idCarta))).toEqual(attese);
  });

  it("mostra i punti di entrambe le squadre — sono pubblici", () => {
    const s = avanza(nuovaPartita({ variante: "1v1", seed: 21 }), 6, 21);
    const info = infoSetPer(s, 0);
    expect(info.puntiSquadra[0] + info.puntiSquadra[1]).toBeGreaterThanOrEqual(0);
  });
});

describe("carteNonViste — la base della determinizzazione ISMCTS", () => {
  const varianti: Variante[] = ["1v1", "2v2"];

  for (const variante of varianti) {
    it(`${variante}: conta esattamente le carte di posizione ignota`, () => {
      for (let seed = 0; seed < 25; seed++) {
        const s = avanza(nuovaPartita({ variante, seed }), 11, seed + 900);
        const info = infoSetPer(s, 0);
        const nonViste = carteNonViste(info);

        // Ignote = mani altrui + mazzo, meno la briscola scoperta che sappiamo
        // dov'è (in fondo, ultima a essere pescata).
        const inManiAltrui = s.mani.reduce(
          (n, mano, seat) => (seat === 0 ? n : n + mano.length),
          0,
        );
        const briscolaAncoraNota = s.mazzo.length > 0 ? 1 : 0;
        expect(nonViste).toHaveLength(inManiAltrui + s.mazzo.length - briscolaAncoraNota);
      }
    });
  }

  it("non include mai le carte che ho in mano", () => {
    const s = avanza(nuovaPartita({ variante: "1v1", seed: 4 }), 9, 4);
    const info = infoSetPer(s, 0);
    const nonViste = new Set(carteNonViste(info).map(idCarta));
    for (const carta of info.mano) {
      expect(nonViste.has(idCarta(carta))).toBe(false);
    }
  });

  it("non include mai le carte già passate sul tavolo", () => {
    const s = avanza(nuovaPartita({ variante: "1v1", seed: 4 }), 9, 4);
    const info = infoSetPer(s, 0);
    const nonViste = new Set(carteNonViste(info).map(idCarta));
    for (const carta of info.viste) {
      expect(nonViste.has(idCarta(carta))).toBe(false);
    }
  });

  it("esclude la briscola scoperta finché è in fondo al mazzo", () => {
    const s = nuovaPartita({ variante: "1v1", seed: 4 });
    const info = infoSetPer(s, 0);
    const nonViste = carteNonViste(info).map(idCarta);
    expect(nonViste).not.toContain(idCarta(s.cartaBriscola));
  });

  it("viste + mano + non viste + briscola nota = 40 carte, sempre", () => {
    for (let seed = 0; seed < 25; seed++) {
      const s = avanza(nuovaPartita({ variante: "2v2", seed }), 13, seed);
      const info = infoSetPer(s, 0);
      const briscolaAncoraNota = info.briscolaInFondoAlMazzo ? 1 : 0;
      const totale =
        info.viste.length + info.mano.length + carteNonViste(info).length + briscolaAncoraNota;
      expect(totale).toBe(mazzoCompleto().length);
    }
  });
});

describe("infoSetPer — coerenza fra i posti", () => {
  it("ogni giocatore vede la propria mano e nessun'altra", () => {
    const s = avanza(nuovaPartita({ variante: "2v2", seed: 12 }), 8, 12);
    for (const seat of [0, 1, 2, 3] as const) {
      const info = infoSetPer(s, seat as Seat);
      expect(info.mano.map(idCarta)).toEqual(s.mani[seat]?.map(idCarta));
    }
  });
});
