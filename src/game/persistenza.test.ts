import { describe, expect, it } from "vitest";
import { nuovaPartita } from "@/core/machine.ts";
import { validaSalvataggio } from "@/game/persistenza.ts";
import type { ConfigPartita } from "@/game/usePartita.ts";

const config: ConfigPartita = { modalita: "ai", livello: "medio", seed: 7 };
const buono = () => ({ config, stato: nuovaPartita({ variante: "1v1", seed: 7 }) });

/** Serializza e rideserializza, come farebbe localStorage. */
const viaJson = (valore: unknown) => JSON.parse(JSON.stringify(valore));

describe("validaSalvataggio — accetta ciò che è sano", () => {
  it("accetta una partita appena iniziata", () => {
    expect(validaSalvataggio(viaJson(buono()))).not.toBeNull();
  });

  it("accetta una partita a metà, con carte sul banco", () => {
    const salvato = buono();
    const carta = salvato.stato.mani[0]?.[0];
    if (!carta) throw new Error("mano vuota");
    const conBanco = {
      config,
      stato: {
        ...salvato.stato,
        mani: [salvato.stato.mani[0]?.slice(1) ?? [], salvato.stato.mani[1] ?? []],
        banco: [{ seat: 0, carta }],
        turno: 1,
      },
    };
    expect(validaSalvataggio(viaJson(conBanco))).not.toBeNull();
  });
});

describe("🔒 validaSalvataggio — rifiuta ciò che non torna", () => {
  it("rifiuta valori che non sono oggetti", () => {
    for (const spazzatura of [null, undefined, 42, "ciao", [], true]) {
      expect(validaSalvataggio(spazzatura)).toBeNull();
    }
  });

  it("rifiuta un salvataggio senza stato o senza config", () => {
    expect(validaSalvataggio({ config })).toBeNull();
    expect(validaSalvataggio(viaJson({ stato: buono().stato }))).toBeNull();
  });

  it("rifiuta una modalità o un livello inventati", () => {
    const s = buono();
    expect(
      validaSalvataggio(viaJson({ ...s, config: { ...config, modalita: "telepatia" } })),
    ).toBeNull();
    expect(
      validaSalvataggio(viaJson({ ...s, config: { ...config, livello: "divino" } })),
    ).toBeNull();
  });

  it("rifiuta un seme che non esiste", () => {
    const s = buono();
    const rotto = { ...s, stato: { ...s.stato, briscola: "fiori" } };
    expect(validaSalvataggio(viaJson(rotto))).toBeNull();
  });

  it("rifiuta se manca una carta", () => {
    const s = viaJson(buono());
    s.stato.mazzo.pop();
    expect(validaSalvataggio(s)).toBeNull();
  });

  it("🎴 rifiuta chi si aggiunge una carta in mano — il caso che conta", () => {
    const s = viaJson(buono());
    // Un asso in più: 41 carte, e comunque un doppione.
    s.stato.mani[0].push({ seme: "denari", rango: "asso" });
    expect(validaSalvataggio(s)).toBeNull();
  });

  it("🎴 rifiuta un doppione anche se il totale resta 40", () => {
    const s = viaJson(buono());
    const primaDelMazzo = s.stato.mazzo[0];
    // Sostituisce una carta del mazzo con una copia di quella in mano.
    s.stato.mazzo[0] = { ...s.stato.mani[0][0] };
    expect(primaDelMazzo).toBeDefined();
    expect(validaSalvataggio(s)).toBeNull();
  });

  it("rifiuta un banco malformato", () => {
    const s = viaJson(buono());
    s.stato.banco = [{ seat: 0 }];
    expect(validaSalvataggio(s)).toBeNull();
  });

  it("rifiuta le mani se non sono array di carte", () => {
    const s = viaJson(buono());
    s.stato.mani = ["denari-asso"];
    expect(validaSalvataggio(s)).toBeNull();
  });
});
