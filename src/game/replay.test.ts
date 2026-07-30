import { describe, expect, it } from "vitest";
import { scegliCarta } from "@/ai/euristica.ts";
import { infoSetPer } from "@/core/infoset.ts";
import { applica, esito, nuovaPartita, puntiSquadra } from "@/core/machine.ts";
import { creaRng } from "@/core/rng.ts";
import type { Azione, GameState, Variante } from "@/core/types.ts";
import {
  aggiungiReplay,
  MAX_REPLAY,
  type ReplayPartita,
  registroVuoto,
  ricostruisciPassi,
  trovaReplay,
  validaRegistroReplay,
} from "@/game/replay.ts";

/** Serializza e rideserializza, come farebbe localStorage. */
const viaJson = (valore: unknown) => JSON.parse(JSON.stringify(valore));

/**
 * Gioca una partita intera con l'euristica, seat per seat, registrando ogni
 * azione GIOCA esattamente come farebbe `game/usePartita.ts`.
 */
function partitaConLog(variante: Variante, seed: number): { finale: GameState; azioni: Azione[] } {
  const rng = creaRng(seed * 7919 + 13);
  let stato = nuovaPartita({ variante, seed });
  const azioni: Azione[] = [];
  let passi = 0;

  while (stato.fase !== "fine") {
    if (passi++ > 400) throw new Error("la partita non finisce: possibile ciclo infinito");
    const info = infoSetPer(stato, stato.turno);
    const carta = scegliCarta(info, "medio", rng);
    if (!carta) throw new Error(`seat ${stato.turno} non ha scelto nessuna carta`);
    const azione: Azione = { tipo: "GIOCA", seat: stato.turno, carta };
    const risultato = applica(stato, azione);
    if (!risultato.ok) throw new Error(`mossa rifiutata dal reducer: ${risultato.motivo}`);
    azioni.push(azione);
    stato = risultato.stato;
  }
  return { finale: stato, azioni };
}

describe("ricostruisciPassi — 🔴 determinismo del replay", () => {
  it("seed + azioni ricostruiscono ESATTAMENTE lo stato finale registrato, 1v1", () => {
    const { finale, azioni } = partitaConLog("1v1", 12345);
    const passi = ricostruisciPassi("1v1", 12345, azioni);
    const ultimo = passi.at(-1);

    expect(ultimo).toBeDefined();
    expect(ultimo?.stato).toEqual(finale);
    // Esplicitamente, come richiesto: i punteggi devono combaciare.
    expect(esito(ultimo?.stato ?? finale)).toEqual(esito(finale));
  });

  it("seed + azioni ricostruiscono ESATTAMENTE lo stato finale registrato, 2v2", () => {
    const { finale, azioni } = partitaConLog("2v2", 999);
    const passi = ricostruisciPassi("2v2", 999, azioni);
    const ultimo = passi.at(-1);

    expect(ultimo?.stato).toEqual(finale);
    expect(puntiSquadra(ultimo?.stato ?? finale, 0)).toBe(puntiSquadra(finale, 0));
    expect(puntiSquadra(ultimo?.stato ?? finale, 1)).toBe(puntiSquadra(finale, 1));
  });

  it("è deterministico su più semi diversi, non solo per fortuna su uno", () => {
    for (const seed of [1, 2, 3, 42, 777]) {
      const { finale, azioni } = partitaConLog("1v1", seed);
      const passi = ricostruisciPassi("1v1", seed, azioni);
      expect(passi.at(-1)?.stato).toEqual(finale);
    }
  });

  it("il primo passo è la distribuzione iniziale, senza nessuna azione", () => {
    const passi = ricostruisciPassi("1v1", 1, []);
    expect(passi).toHaveLength(1);
    expect(passi[0]?.azione).toBeNull();
    expect(passi[0]?.stato).toEqual(nuovaPartita({ variante: "1v1", seed: 1 }));
  });

  it("un seme diverso produce una partita diversa dalla stessa lista di azioni", () => {
    const { azioni } = partitaConLog("1v1", 5);
    const conSemeOriginale = ricostruisciPassi("1v1", 5, azioni);
    const conSemeDiverso = ricostruisciPassi("1v1", 6, azioni);
    expect(conSemeDiverso[0]?.stato).not.toEqual(conSemeOriginale[0]?.stato);
  });

  it("si ferma senza esplodere su un'azione illegale, invece di lanciare (input non fidato)", () => {
    const iniziale = nuovaPartita({ variante: "1v1", seed: 1 });
    const carta = iniziale.mani[0]?.[0];
    if (!carta) throw new Error("mano vuota, impossibile costruire il test");
    // All'apertura tocca al seat 0, non all'1: azione rifiutata dal reducer.
    const passi = ricostruisciPassi("1v1", 1, [{ tipo: "GIOCA", seat: 1, carta }]);
    expect(passi).toHaveLength(1); // resta solo il passo iniziale
  });
});

describe("aggiungiReplay — tetto alle ultime 20 partite (F5)", () => {
  const voce = (id: string): ReplayPartita => ({ id, variante: "1v1", seed: 1, azioni: [] });

  it("accumula liberamente sotto il tetto", () => {
    let registro = registroVuoto();
    for (let i = 0; i < 5; i++) registro = aggiungiReplay(registro, voce(`p${i}`));
    expect(registro.replay.map((r) => r.id)).toEqual(["p0", "p1", "p2", "p3", "p4"]);
  });

  it("oltre MAX_REPLAY scarta i più vecchi, mantenendo l'ordine dei più recenti", () => {
    let registro = registroVuoto();
    for (let i = 0; i < 25; i++) registro = aggiungiReplay(registro, voce(`p${i}`));

    expect(registro.replay).toHaveLength(MAX_REPLAY);
    expect(registro.replay[0]?.id).toBe("p5"); // p0..p4 sono cadute
    expect(registro.replay.at(-1)?.id).toBe("p24");
  });

  it("MAX_REPLAY è 20, come da spec", () => {
    expect(MAX_REPLAY).toBe(20);
  });
});

describe("trovaReplay", () => {
  it("trova per id, null se non c'è", () => {
    const registro = aggiungiReplay(registroVuoto(), {
      id: "x",
      variante: "1v1",
      seed: 1,
      azioni: [],
    });
    expect(trovaReplay(registro, "x")?.id).toBe("x");
    expect(trovaReplay(registro, "non-esiste")).toBeNull();
  });
});

describe("validaRegistroReplay — difensivo", () => {
  it("accetta un registro sano andata e ritorno per JSON", () => {
    const sano = aggiungiReplay(registroVuoto(), {
      id: "a",
      variante: "2v2",
      seed: 42,
      azioni: [{ tipo: "GIOCA", seat: 0, carta: { seme: "denari", rango: "asso" } }],
    });
    expect(validaRegistroReplay(viaJson(sano))).toEqual(sano);
  });

  it("torna un registro vuoto per spazzatura", () => {
    for (const spazzatura of [null, undefined, 1, "x", [], true, {}]) {
      expect(validaRegistroReplay(spazzatura)).toEqual(registroVuoto());
    }
  });

  it("scarta le voci malformate ma tiene quelle sane", () => {
    const grezzo = {
      versione: 1,
      replay: [
        { id: "buona", variante: "1v1", seed: 1, azioni: [] },
        { id: "variante-inventata", variante: "3v3", seed: 1, azioni: [] },
        { id: "", variante: "1v1", seed: 1, azioni: [] },
        { id: "seme-non-numero", variante: "1v1", seed: "sette", azioni: [] },
        {
          id: "azione-rotta",
          variante: "1v1",
          seed: 1,
          azioni: [{ tipo: "GIOCA", seat: 9, carta: { seme: "denari", rango: "asso" } }],
        },
      ],
    };
    const risultato = validaRegistroReplay(grezzo);
    expect(risultato.replay.map((r) => r.id)).toEqual(["buona"]);
  });
});
