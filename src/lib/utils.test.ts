import { describe, expect, it } from "vitest";
import { cn } from "./utils.ts";

describe("cn", () => {
  it("unisce le classi", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("scarta i valori falsy", () => {
    expect(cn("a", false && "b", undefined, "c")).toBe("a c");
  });

  it("fa vincere l'ultima classe Tailwind in conflitto", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });
});
