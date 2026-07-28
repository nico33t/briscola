import { describe, expect, it } from "vitest";
import { normalizzaHash } from "./router.tsx";

describe("normalizzaHash", () => {
  it("tratta l'hash vuoto come radice", () => {
    expect(normalizzaHash("")).toBe("/");
    expect(normalizzaHash("#")).toBe("/");
    expect(normalizzaHash("#/")).toBe("/");
  });

  it("toglie il cancelletto", () => {
    expect(normalizzaHash("#/carte")).toBe("/carte");
  });

  it("aggiunge la barra iniziale se manca", () => {
    expect(normalizzaHash("#carte")).toBe("/carte");
    expect(normalizzaHash("carte")).toBe("/carte");
  });

  it("toglie la barra finale", () => {
    expect(normalizzaHash("#/carte/")).toBe("/carte");
  });

  it("lascia stare i percorsi annidati", () => {
    expect(normalizzaHash("#/gioca/1v1")).toBe("/gioca/1v1");
  });

  it("è idempotente", () => {
    const percorsi = ["", "#", "#/", "#carte", "#/carte/", "#/gioca/1v1"];
    for (const p of percorsi) {
      expect(normalizzaHash(normalizzaHash(p))).toBe(normalizzaHash(p));
    }
  });
});
