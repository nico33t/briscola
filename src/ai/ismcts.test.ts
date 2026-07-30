import { describe, expect, it } from "vitest";
import { idCarta, mazzoCompleto, stessaCarta } from "../core/deck.ts";
import type { InfoSet } from "../core/infoset.ts";
import { infoSetPer } from "../core/infoset.ts";
import { applica, numeroGiocatori, nuovaPartita, puntiSquadra } from "../core/machine.ts";
import { creaRng } from "../core/rng.ts";
import type { Carta, GameState, Seat } from "../core/types.ts";
import { mossaEuristica } from "./euristica.ts";
import { determinizza, scegliCartaISMCTS } from "./ismcts.ts";

/** Fa avanzare una partita di qualche mossa a caso, per ottenere uno stato a metà. */
function statoAMeta(seed: number, mosse: number): GameState {
  let stato = nuovaPartita({ variante: "1v1", seed });
  const rng = creaRng(seed + 999);
  for (let i = 0; i < mosse && stato.fase !== "fine"; i++) {
    const mano = stato.mani[stato.turno] ?? [];
    const carta = mano[Math.floor(rng() * mano.length)];
    if (!carta) break;
    const r = applica(stato, { tipo: "GIOCA", seat: stato.turno, carta });
    if (!r.ok) throw new Error(r.motivo);
    stato = r.stato;
  }
  return stato;
}

describe("determinizza", () => {
  it("non assegna mai una carta già vista (mano propria, banco, prese)", () => {
    for (let seed = 0; seed < 60; seed++) {
      const stato = statoAMeta(seed, 5 + (seed % 10));
      if (stato.fase === "fine") continue;
      const info = infoSetPer(stato, stato.turno);
      const rng = creaRng(seed);

      for (let iterazione = 0; iterazione < 5; iterazione++) {
        const mondo = determinizza(info, rng);

        // Mai una carta della propria mano o già vista, né in mano ad altri
        // né nel mazzo. La briscola scoperta è l'unica eccezione nota: resta
        // legittimamente in fondo al mazzo (ultima carta), mai nelle mani.
        const noteIds = new Set<string>([...info.mano.map(idCarta), ...info.viste.map(idCarta)]);

        const mazzoSenzaBriscola = info.briscolaInFondoAlMazzo
          ? mondo.mazzo.slice(0, -1)
          : mondo.mazzo;
        for (const carta of mazzoSenzaBriscola) {
          expect(noteIds.has(idCarta(carta))).toBe(false);
        }
        if (info.briscolaInFondoAlMazzo) {
          const ultima = mondo.mazzo[mondo.mazzo.length - 1];
          expect(ultima && stessaCarta(ultima, info.cartaBriscola)).toBe(true);
        }
        for (let seat = 0; seat < mondo.mani.length; seat++) {
          if (seat === info.io) continue;
          for (const carta of mondo.mani[seat] ?? []) {
            expect(noteIds.has(idCarta(carta))).toBe(false);
            expect(stessaCarta(carta, info.cartaBriscola) && info.briscolaInFondoAlMazzo).toBe(
              false,
            );
          }
        }
      }
    }
  });

  it("le mani determinizzate hanno esattamente le taglie note dall'InfoSet", () => {
    for (let seed = 0; seed < 40; seed++) {
      const stato = statoAMeta(seed, 4 + (seed % 12));
      if (stato.fase === "fine") continue;
      const info = infoSetPer(stato, stato.turno);
      const mondo = determinizza(info, creaRng(seed * 7 + 1));

      expect(mondo.mani.length).toBe(info.cartePerSeat.length);
      for (let seat = 0; seat < mondo.mani.length; seat++) {
        expect(mondo.mani[seat]?.length).toBe(info.cartePerSeat[seat]);
      }
      expect(mondo.mani[info.io]).toEqual(info.mano);
    }
  });

  it("la propria mano nel mondo determinizzato è identica a quella dell'InfoSet", () => {
    const stato = statoAMeta(3, 6);
    const info = infoSetPer(stato, stato.turno);
    const mondo = determinizza(info, creaRng(3));
    expect(mondo.mani[info.io]?.map(idCarta)).toEqual(info.mano.map(idCarta));
  });

  it("la briscola scoperta resta in fondo al mazzo finché non è stata pescata", () => {
    for (let seed = 0; seed < 30; seed++) {
      const stato = statoAMeta(seed, 3);
      if (stato.fase === "fine") continue;
      const info = infoSetPer(stato, stato.turno);
      if (!info.briscolaInFondoAlMazzo) continue;
      const mondo = determinizza(info, creaRng(seed));
      const ultima = mondo.mazzo[mondo.mazzo.length - 1];
      expect(ultima && stessaCarta(ultima, info.cartaBriscola)).toBe(true);
    }
  });

  it("mondo determinizzato + mano propria + carte viste = mazzo completo, senza doppioni", () => {
    for (let seed = 0; seed < 25; seed++) {
      const stato = statoAMeta(seed, 7 + (seed % 8));
      if (stato.fase === "fine") continue;
      const info = infoSetPer(stato, stato.turno);
      const mondo = determinizza(info, creaRng(seed + 500));

      const tutte = [...mondo.mani.flat(), ...mondo.mazzo, ...info.viste];
      expect(tutte).toHaveLength(mazzoCompleto().length);
      const ids = new Set(tutte.map(idCarta));
      expect(ids.size).toBe(mazzoCompleto().length);
    }
  });
});

describe("scegliCartaISMCTS gioca sempre una mossa legale", () => {
  it("la carta scelta è sempre nella mano del proprio InfoSet, su molti stati diversi", () => {
    for (let seed = 0; seed < 40; seed++) {
      const stato = statoAMeta(seed, 2 + (seed % 15));
      if (stato.fase === "fine") continue;
      const info = infoSetPer(stato, stato.turno);
      const scelta = scegliCartaISMCTS(info, { iterazioni: 12 }, creaRng(seed));
      expect(scelta).toBeDefined();
      expect(info.mano.some((c) => scelta && stessaCarta(c, scelta))).toBe(true);
    }
  });

  it("con una sola carta in mano gioca quella, senza cercare", () => {
    const stato = nuovaPartita({ variante: "1v1", seed: 1 });
    const info: InfoSet = {
      ...infoSetPer(stato, 0),
      mano: [{ seme: "spade", rango: "re" } as const],
    };
    const scelta = scegliCartaISMCTS(info, { iterazioni: 50 }, creaRng(1));
    expect(scelta && idCarta(scelta)).toBe("spade-re");
  });

  it("con la mano vuota non lancia e ritorna undefined", () => {
    const stato = nuovaPartita({ variante: "1v1", seed: 1 });
    const info: InfoSet = { ...infoSetPer(stato, 0), mano: [] };
    expect(scegliCartaISMCTS(info, { iterazioni: 20 }, creaRng(1))).toBeUndefined();
  });

  it("gioca fino in fondo una partita intera senza mai proporre una mossa rifiutata dal core", () => {
    for (let seed = 0; seed < 15; seed++) {
      let stato = nuovaPartita({ variante: "1v1", seed });
      const rng = creaRng(seed + 42);
      let passi = 0;
      while (stato.fase !== "fine") {
        if (passi++ > 60) throw new Error("partita che non finisce");
        const info = infoSetPer(stato, stato.turno);
        const carta = scegliCartaISMCTS(info, { iterazioni: 10 }, rng);
        if (!carta) throw new Error("ISMCTS non ha scelto");
        const r = applica(stato, { tipo: "GIOCA", seat: stato.turno, carta });
        if (!r.ok) throw new Error(`mossa illegale dall'ISMCTS: ${r.motivo}`);
        stato = r.stato;
      }
    }
  });
});

describe("determinismo: stesso seed, stessa scelta", () => {
  it("chiamando due volte con lo stesso seed sceglie sempre la stessa carta", () => {
    for (let seed = 0; seed < 10; seed++) {
      const stato = statoAMeta(seed, 4 + seed);
      if (stato.fase === "fine") continue;
      const info = infoSetPer(stato, stato.turno);

      const a = scegliCartaISMCTS(info, { iterazioni: 40 }, creaRng(123 + seed));
      const b = scegliCartaISMCTS(info, { iterazioni: 40 }, creaRng(123 + seed));
      expect(a && idCarta(a)).toBe(b && idCarta(b));
    }
  });

  it("un seed diverso può (ma non deve per forza) scegliere una carta diversa — il test verifica solo che non esploda", () => {
    const stato = statoAMeta(5, 6);
    const info = infoSetPer(stato, stato.turno);
    expect(() => scegliCartaISMCTS(info, { iterazioni: 40 }, creaRng(1))).not.toThrow();
    expect(() => scegliCartaISMCTS(info, { iterazioni: 40 }, creaRng(2))).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 🎯 Torneo di validazione (AGENTS.md §7 / implements.md §6.6)
//
// L'Esperto (ISMCTS) deve battere il Medio in modo netto e stracciare il
// caso. Un livello che non batte quello sotto è un bug, non sfortuna — quindi
// se questi numeri scendono sotto soglia, si sistema l'algoritmo, non
// l'asserzione. Le iterazioni sono ridotte rispetto al default di produzione
// (ITERAZIONI_DEFAULT) solo per tenere il torneo sotto il minuto: anche così
// il vantaggio della ricerca deve restare visibile.
// ---------------------------------------------------------------------------

type Giocatore = (stato: GameState, seat: Seat) => Carta;

const ITERAZIONI_TORNEO = 150;

const casuale =
  (seed: number): Giocatore =>
  (stato, seat) => {
    const rng = creaRng(seed + stato.prese.flat().length * 31 + seat);
    const mano = stato.mani[seat] ?? [];
    const carta = mano[Math.floor(rng() * mano.length)];
    if (!carta) throw new Error("mano vuota");
    return carta;
  };

const medio: Giocatore = (stato, seat) => {
  const carta = mossaEuristica(infoSetPer(stato, seat));
  if (!carta) throw new Error("il medio non ha scelto");
  return carta;
};

const esperto =
  (seedBase: number, iterazioni: number = ITERAZIONI_TORNEO): Giocatore =>
  (stato, seat) => {
    const rng = creaRng(seedBase + stato.prese.flat().length * 97 + seat * 13);
    const info = infoSetPer(stato, seat);
    const carta = scegliCartaISMCTS(info, { iterazioni }, rng);
    if (!carta) throw new Error("l'esperto non ha scelto");
    return carta;
  };

function partita(seat0: Giocatore, seat1: Giocatore, seed: number): number {
  let stato = nuovaPartita({ variante: "1v1", seed });
  let passi = 0;
  while (stato.fase !== "fine") {
    if (passi++ > 200) throw new Error("partita che non finisce");
    const giocatore = stato.turno === 0 ? seat0 : seat1;
    const carta = giocatore(stato, stato.turno);
    const r = applica(stato, { tipo: "GIOCA", seat: stato.turno, carta });
    if (!r.ok) throw new Error(`mossa illegale: ${r.motivo}`);
    stato = r.stato;
  }
  return puntiSquadra(stato, 0);
}

describe("🎯 torneo: l'Esperto (ISMCTS) deve battere nettamente il Medio", () => {
  it("vince più del 55% delle partite contro l'euristica media, su almeno 200 partite", () => {
    const PARTITE = 200;
    let vittorieEsperto = 0;
    let vittorieMedio = 0;

    for (let seed = 0; seed < PARTITE; seed++) {
      const espertoInPosizione0 = seed % 2 === 0;
      const punti0 = espertoInPosizione0
        ? partita(esperto(seed), medio, seed)
        : partita(medio, esperto(seed), seed);
      const puntiEsperto = espertoInPosizione0 ? punti0 : 120 - punti0;

      if (puntiEsperto > 60) vittorieEsperto++;
      else if (puntiEsperto < 60) vittorieMedio++;
    }

    const percentuale = (vittorieEsperto / PARTITE) * 100;
    // biome-ignore lint/suspicious/noConsole: numeri del torneo richiesti nel report
    console.log(
      `[torneo] Esperto vs Medio: ${vittorieEsperto}/${PARTITE} vittorie Esperto (${percentuale.toFixed(1)}%), ${vittorieMedio} vittorie Medio`,
    );

    expect(vittorieEsperto).toBeGreaterThan(vittorieMedio);
    expect(percentuale).toBeGreaterThan(55);
  }, 60_000);
});

describe("🎯 torneo: l'Esperto straccia il giocatore casuale", () => {
  it("vince nettamente più del caso, ben oltre il 50% atteso da un pareggio di forze", () => {
    const PARTITE = 100;
    // Qui l'Esperto gioca con più iterazioni che nel torneo contro il Medio:
    // contro un avversario puramente casuale il vantaggio della ricerca si
    // appiattisce presto (la policy di rollout modella un avversario
    // "ragionevole", non uno che gioca a caso, quindi più budget aiuta poco
    // oltre un certo punto) — ma il margine sul pareggio (60 punti) resta
    // schiacciante, ed è quello che conta per dire che un livello "straccia"
    // l'altro.
    let vittorieEsperto = 0;

    for (let seed = 0; seed < PARTITE; seed++) {
      const espertoInPosizione0 = seed % 2 === 0;
      const punti0 = espertoInPosizione0
        ? partita(esperto(seed + 5000, 300), casuale(seed), seed)
        : partita(casuale(seed), esperto(seed + 5000, 300), seed);
      const puntiEsperto = espertoInPosizione0 ? punti0 : 120 - punti0;
      if (puntiEsperto > 60) vittorieEsperto++;
    }

    const percentuale = (vittorieEsperto / PARTITE) * 100;
    // biome-ignore lint/suspicious/noConsole: numeri del torneo richiesti nel report
    console.log(
      `[torneo] Esperto vs Random: ${vittorieEsperto}/${PARTITE} vittorie (${percentuale.toFixed(1)}%)`,
    );

    expect(percentuale).toBeGreaterThan(65);
  }, 30_000);
});

describe("l'AI vede solo l'InfoSet, mai lo stato completo", () => {
  it("la firma di scegliCartaISMCTS accetta solo un InfoSet: sparire la mano avversaria dallo stato non cambia la funzione", () => {
    // Verifica comportamentale: due stati completi con la stessa InfoSet ma
    // mani avversarie diverse (e coerenti nei conteggi) devono produrre la
    // stessa distribuzione di scelte nel lungo periodo — l'unico input reale
    // è l'InfoSet, il resto è invenzione della determinizzazione a ogni
    // chiamata. Qui ci limitiamo a controllare che la funzione non riceva né
    // usi mai `GameState`: è garantito dai tipi (il parametro è `InfoSet`),
    // e la build/typecheck del progetto lo impedisce a compile time.
    const stato = nuovaPartita({ variante: "1v1", seed: 9 });
    const info = infoSetPer(stato, 0);
    expect(Object.keys(info)).not.toContain("mani");
    expect(Object.keys(info)).not.toContain("mazzo");
  });
});

// Copre anche la variante 2v2 di `numeroGiocatori`, usata da `determinizza`.
describe("numeroGiocatori è coerente fra core e ismcts", () => {
  it("1v1 ha 2 giocatori, 2v2 ne ha 4", () => {
    expect(numeroGiocatori("1v1")).toBe(2);
    expect(numeroGiocatori("2v2")).toBe(4);
  });
});
