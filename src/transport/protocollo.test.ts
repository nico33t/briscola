import { describe, expect, it } from "vitest";
import { infoSetPer } from "@/core/infoset.ts";
import { nuovaPartita } from "@/core/machine.ts";
import {
  creaContatoreScarti,
  LIMITE_MESSAGGIO_BYTE,
  parseMessaggio,
  serializza,
} from "./protocollo.ts";
import type { Messaggio } from "./types.ts";

const partita = nuovaPartita({ variante: "1v1", seed: 42 });
const infoset = infoSetPer(partita, 1);

describe("protocollo — accetta ciò che è sano", () => {
  it("fa il roundtrip di ogni tipo di messaggio", () => {
    const messaggi: Messaggio[] = [
      { v: 1, type: "BENVENUTO", seat: 1, variante: "1v1" },
      { v: 1, type: "GIOCA_CARTA", carta: { seme: "denari", rango: "asso" } },
      { v: 1, type: "AGGIORNAMENTO", infoset, eventi: [] },
      {
        v: 1,
        type: "AGGIORNAMENTO",
        infoset,
        eventi: [
          { tipo: "CARTA_GIOCATA", seat: 0, carta: { seme: "spade", rango: "re" } },
          {
            tipo: "PRESA",
            vincitore: 0,
            carte: [
              { seme: "spade", rango: "re" },
              { seme: "denari", rango: "due" },
            ],
            punti: 4,
          },
          { tipo: "PESCATA", seat: 0, carta: { seme: "coppe", rango: "sette" } },
          { tipo: "FINE", punti: [61, 59] },
        ],
      },
      { v: 1, type: "RIFIUTO", motivo: "non è il tuo turno" },
      { v: 1, type: "PING", ts: 12345 },
      { v: 1, type: "PONG", ts: 12345 },
      { v: 1, type: "BYE" },
    ];

    for (const messaggio of messaggi) {
      const testo = serializza(messaggio);
      expect(testo).not.toBeNull();
      if (!testo) continue;
      expect(parseMessaggio(testo)).toEqual(messaggio);
    }
  });

  it("non incrementa il contatore per un messaggio sano", () => {
    const contatore = creaContatoreScarti();
    const testo = serializza({ v: 1, type: "BYE" });
    if (!testo) throw new Error("serializzazione fallita");
    parseMessaggio(testo, contatore);
    expect(contatore.totale).toBe(0);
  });
});

describe("protocollo — scarta senza crash", () => {
  const contatore = () => creaContatoreScarti();

  it("JSON sintatticamente rotto", () => {
    const c = contatore();
    let risultato: unknown;
    expect(() => {
      risultato = parseMessaggio("{non è json", c);
    }).not.toThrow();
    expect(risultato).toBeNull();
    expect(c.totale).toBe(1);
  });

  it("stringa vuota", () => {
    expect(parseMessaggio("")).toBeNull();
  });

  it("un JSON valido ma non un oggetto (array, numero, stringa, null)", () => {
    for (const valore of ["[1,2,3]", "42", '"ciao"', "null", "true"]) {
      expect(parseMessaggio(valore)).toBeNull();
    }
  });

  it("versione del protocollo mancante o sbagliata", () => {
    expect(parseMessaggio(JSON.stringify({ type: "BYE" }))).toBeNull();
    expect(parseMessaggio(JSON.stringify({ v: 2, type: "BYE" }))).toBeNull();
    expect(parseMessaggio(JSON.stringify({ v: "1", type: "BYE" }))).toBeNull();
  });

  it("type mancante, non stringa, o sconosciuto", () => {
    expect(parseMessaggio(JSON.stringify({ v: 1 }))).toBeNull();
    expect(parseMessaggio(JSON.stringify({ v: 1, type: 7 }))).toBeNull();
    expect(parseMessaggio(JSON.stringify({ v: 1, type: "AUTODISTRUZIONE" }))).toBeNull();
  });

  it("GIOCA_CARTA con carta assente, malformata, o con seme/rango inventati", () => {
    expect(parseMessaggio(JSON.stringify({ v: 1, type: "GIOCA_CARTA" }))).toBeNull();
    expect(parseMessaggio(JSON.stringify({ v: 1, type: "GIOCA_CARTA", carta: null }))).toBeNull();
    expect(
      parseMessaggio(JSON.stringify({ v: 1, type: "GIOCA_CARTA", carta: { seme: "denari" } })),
    ).toBeNull();
    expect(
      parseMessaggio(
        JSON.stringify({
          v: 1,
          type: "GIOCA_CARTA",
          carta: { seme: "cuori", rango: "asso" }, // seme inesistente nel mazzo piacentino
        }),
      ),
    ).toBeNull();
    expect(
      parseMessaggio(
        JSON.stringify({
          v: 1,
          type: "GIOCA_CARTA",
          carta: { seme: "denari", rango: "jolly" }, // rango inventato
        }),
      ),
    ).toBeNull();
  });

  it("BENVENUTO con seat o variante fuori range", () => {
    expect(
      parseMessaggio(JSON.stringify({ v: 1, type: "BENVENUTO", seat: 9, variante: "1v1" })),
    ).toBeNull();
    expect(
      parseMessaggio(JSON.stringify({ v: 1, type: "BENVENUTO", seat: 1, variante: "3v3" })),
    ).toBeNull();
    expect(
      parseMessaggio(JSON.stringify({ v: 1, type: "BENVENUTO", seat: 1.5, variante: "1v1" })),
    ).toBeNull();
  });

  it("AGGIORNAMENTO con infoset tagliato o con campi del tipo sbagliato", () => {
    const { io: _io, ...senzaIo } = infoset;
    expect(
      parseMessaggio(JSON.stringify({ v: 1, type: "AGGIORNAMENTO", infoset: senzaIo, eventi: [] })),
    ).toBeNull();
    expect(
      parseMessaggio(
        JSON.stringify({
          v: 1,
          type: "AGGIORNAMENTO",
          infoset: { ...infoset, io: "zero" },
          eventi: [],
        }),
      ),
    ).toBeNull();
    expect(
      parseMessaggio(
        JSON.stringify({
          v: 1,
          type: "AGGIORNAMENTO",
          infoset: { ...infoset, mano: "non un array" },
          eventi: [],
        }),
      ),
    ).toBeNull();
    expect(
      parseMessaggio(
        JSON.stringify({ v: 1, type: "AGGIORNAMENTO", infoset, eventi: "non un array" }),
      ),
    ).toBeNull();
    expect(parseMessaggio(JSON.stringify({ v: 1, type: "AGGIORNAMENTO", infoset }))).toBeNull();
  });

  it("AGGIORNAMENTO con un evento malformato dentro l'array", () => {
    expect(
      parseMessaggio(
        JSON.stringify({
          v: 1,
          type: "AGGIORNAMENTO",
          infoset,
          eventi: [{ tipo: "PRESA", vincitore: 9, carte: [], punti: 0 }],
        }),
      ),
    ).toBeNull();
    expect(
      parseMessaggio(
        JSON.stringify({
          v: 1,
          type: "AGGIORNAMENTO",
          infoset,
          eventi: [{ tipo: "MAGIA", forza: 9000 }],
        }),
      ),
    ).toBeNull();
  });

  it("RIFIUTO con motivo assente, vuoto, o assurdamente lungo", () => {
    expect(parseMessaggio(JSON.stringify({ v: 1, type: "RIFIUTO" }))).toBeNull();
    expect(parseMessaggio(JSON.stringify({ v: 1, type: "RIFIUTO", motivo: "" }))).toBeNull();
    expect(
      parseMessaggio(JSON.stringify({ v: 1, type: "RIFIUTO", motivo: "x".repeat(500) })),
    ).toBeNull();
  });

  it("PING/PONG con ts mancante, non numerico, o non finito", () => {
    expect(parseMessaggio(JSON.stringify({ v: 1, type: "PING" }))).toBeNull();
    expect(parseMessaggio(JSON.stringify({ v: 1, type: "PING", ts: "adesso" }))).toBeNull();
    expect(parseMessaggio(JSON.stringify({ v: 1, type: "PING", ts: Number.NaN }))).toBeNull();
    expect(
      parseMessaggio(JSON.stringify({ v: 1, type: "PING", ts: Number.POSITIVE_INFINITY })),
    ).toBeNull();
  });

  it("payload sopra il limite di dimensione — un peer non deve poter riempire la memoria", () => {
    // Forma per-campo valida (eventi PESCATA legittimi), ma l'array è enorme: deve
    // scattare il tetto sulla dimensione totale del messaggio, non un controllo di
    // forma sul singolo evento.
    const eventiValidiMaTanti = Array.from({ length: 2000 }, () => ({
      tipo: "PESCATA",
      seat: 0,
      carta: { seme: "denari", rango: "asso" },
    }));
    const enorme = JSON.stringify({
      v: 1,
      type: "AGGIORNAMENTO",
      infoset,
      eventi: eventiValidiMaTanti,
    });
    expect(enorme.length).toBeGreaterThan(LIMITE_MESSAGGIO_BYTE);
    const contatore = creaContatoreScarti();
    expect(parseMessaggio(enorme, contatore)).toBeNull();
    expect(contatore.totale).toBe(1);
  });

  it("serializza rifiuta di produrre un messaggio sopra il limite", () => {
    const eventiEnormi = Array.from({ length: 500 }, () => ({
      tipo: "PESCATA" as const,
      seat: 0 as const,
      carta: { seme: "denari" as const, rango: "asso" as const },
    }));
    const risultato = serializza({ v: 1, type: "AGGIORNAMENTO", infoset, eventi: eventiEnormi });
    expect(risultato).toBeNull();
  });

  it("prototype pollution: __proto__ come chiave non deve avvelenare nulla", () => {
    const grezzo =
      '{"v":1,"type":"GIOCA_CARTA","carta":{"seme":"denari","rango":"asso"},"__proto__":{"polluted":true}}';
    const messaggio = parseMessaggio(grezzo);
    expect(messaggio).toEqual({
      v: 1,
      type: "GIOCA_CARTA",
      carta: { seme: "denari", rango: "asso" },
    });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
