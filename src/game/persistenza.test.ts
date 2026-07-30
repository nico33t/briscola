import { describe, expect, it } from "vitest";
import { nuovaPartita } from "@/core/machine.ts";
import { validaSalvataggio } from "@/game/persistenza.ts";
import type { ConfigPartita } from "@/game/usePartita.ts";

const config: ConfigPartita = { variante: "1v1", modalita: "ai", livello: "medio", seed: 7 };
const buono = () => ({ config, stato: nuovaPartita({ variante: "1v1", seed: 7 }) });

const config2v2: ConfigPartita = { variante: "2v2", modalita: "ai", livello: "esperto", seed: 3 };
const buono2v2 = () => ({ config: config2v2, stato: nuovaPartita({ variante: "2v2", seed: 3 }) });

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

  it("🃏 accetta una partita 2v2 (F7)", () => {
    const salvato = validaSalvataggio(viaJson(buono2v2()));
    expect(salvato).not.toBeNull();
    expect(salvato?.stato.variante).toBe("2v2");
    expect(salvato?.stato.mani).toHaveLength(4);
    expect(salvato?.config.variante).toBe("2v2");
  });

  it("🃏 accetta il livello esperto — era escluso per errore prima del 2v2", () => {
    const s = buono();
    const conEsperto = { ...s, config: { ...config, livello: "esperto" } };
    const salvato = validaSalvataggio(viaJson(conEsperto));
    expect(salvato).not.toBeNull();
    expect(salvato?.config.livello).toBe("esperto");
  });

  it("🔁 migrazione: un salvataggio senza config.variante (pre-2v2) resta valido, defaulta a 1v1", () => {
    const s = viaJson(buono());
    // Simula un salvataggio scritto prima che F7 introducesse config.variante.
    delete s.config.variante;
    const salvato = validaSalvataggio(s);
    expect(salvato).not.toBeNull();
    expect(salvato?.config.variante).toBe("1v1");
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

  it("🃏 rifiuta una variante che non esiste in config o in stato", () => {
    const s = viaJson(buono());
    expect(validaSalvataggio({ ...s, config: { ...s.config, variante: "3v3" } })).toBeNull();
    expect(validaSalvataggio({ ...s, stato: { ...s.stato, variante: "3v3" } })).toBeNull();
  });

  it("🃏 rifiuta un config.variante che non combacia con stato.variante — salvataggio incoerente", () => {
    const s = viaJson(buono2v2());
    expect(validaSalvataggio({ ...s, config: { ...s.config, variante: "1v1" } })).toBeNull();
  });

  it("🃏 rifiuta un 2v2 con solo due mani — il core non produce mai questo stato da solo", () => {
    const s = viaJson(buono2v2());
    s.stato.mani = [s.stato.mani[0], s.stato.mani[1]];
    s.stato.prese = [s.stato.prese[0], s.stato.prese[1]];
    expect(validaSalvataggio(s)).toBeNull();
  });
});
