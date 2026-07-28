import { describe, expect, it } from "vitest";
import { puntiDelle, squadraDi, vincitorePresa } from "./rules.ts";
import type { Carta, Giocata, Rango, Seat, Seme } from "./types.ts";

const c = (seme: Seme, rango: Rango): Carta => ({ seme, rango });
const g = (seat: Seat, carta: Carta): Giocata => ({ seat, carta });

describe("vincitorePresa — senza briscole sul banco", () => {
  it("vince la carta più forte del seme d'apertura", () => {
    const banco = [g(0, c("coppe", "sei")), g(1, c("coppe", "re"))];
    expect(vincitorePresa(banco, "spade")).toBe(1);
  });

  it("una carta di seme diverso non prende mai, anche se vale di più", () => {
    // L'asso di denari vale 11 punti, ma non è del seme d'apertura né briscola.
    const banco = [g(0, c("coppe", "quattro")), g(1, c("denari", "asso"))];
    expect(vincitorePresa(banco, "spade")).toBe(0);
  });

  it("vince chi ha aperto se nessuno risponde a seme", () => {
    const banco = [
      g(2, c("bastoni", "due")),
      g(3, c("coppe", "asso")),
      g(0, c("denari", "tre")),
      g(1, c("coppe", "re")),
    ];
    expect(vincitorePresa(banco, "spade")).toBe(2);
  });
});

describe("vincitorePresa — con le briscole", () => {
  it("una briscola qualsiasi batte la carta più forte di un altro seme", () => {
    // Il due di spade non vale un punto, ma è briscola: prende l'asso di coppe.
    const banco = [g(0, c("coppe", "asso")), g(1, c("spade", "due"))];
    expect(vincitorePresa(banco, "spade")).toBe(1);
  });

  it("fra più briscole vince la più forte", () => {
    const banco = [
      g(0, c("spade", "re")),
      g(1, c("spade", "asso")),
      g(2, c("spade", "tre")),
      g(3, c("coppe", "asso")),
    ];
    expect(vincitorePresa(banco, "spade")).toBe(1);
  });

  it("la briscola vince anche se giocata per ultima", () => {
    const banco = [
      g(1, c("denari", "asso")),
      g(2, c("denari", "tre")),
      g(3, c("denari", "re")),
      g(0, c("bastoni", "due")),
    ];
    expect(vincitorePresa(banco, "bastoni")).toBe(0);
  });

  it("se il seme d'apertura è la briscola, vince comunque la più forte", () => {
    const banco = [g(0, c("spade", "fante")), g(1, c("spade", "cavallo"))];
    expect(vincitorePresa(banco, "spade")).toBe(1);
  });
});

describe("puntiDelle", () => {
  it("somma i valori delle carte", () => {
    expect(puntiDelle([c("coppe", "asso"), c("spade", "tre"), c("denari", "re")])).toBe(25);
  });

  it("una presa di sole lisce vale zero", () => {
    expect(puntiDelle([c("coppe", "due"), c("spade", "quattro")])).toBe(0);
  });

  it("un mucchio vuoto vale zero", () => {
    expect(puntiDelle([])).toBe(0);
  });
});

describe("squadraDi", () => {
  it("nell'1v1 ognuno è la propria squadra", () => {
    expect(squadraDi(0)).toBe(0);
    expect(squadraDi(1)).toBe(1);
  });

  it("nel 2v2 i compagni siedono alternati", () => {
    expect(squadraDi(0)).toBe(squadraDi(2));
    expect(squadraDi(1)).toBe(squadraDi(3));
    expect(squadraDi(0)).not.toBe(squadraDi(1));
  });
});
