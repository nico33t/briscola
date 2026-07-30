import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { idCarta } from "@/core/deck.ts";
import { applica, esito, nuovaPartita } from "@/core/machine.ts";
import type { Carta, GameState, Seat } from "@/core/types.ts";
import {
  creaMotoreClient,
  creaMotoreHost,
  INTERVALLO_PING_MS,
  PAUSA_AI_MS,
  PAUSA_PRESA_MS,
  TIMEOUT_CONTATTO_MS,
  VOLO_PRESA_MS,
  vincitoreDaPunti,
} from "@/game/motoreOnline.ts";
import { creaCoppiaLocale } from "@/transport/locale.ts";
import { LIMITE_MESSAGGIO_BYTE } from "@/transport/protocollo.ts";
import { SEAT_CLIENT_REMOTO } from "@/transport/types.ts";

/** Aspetta che le microtask in coda (le consegne di `EndpointLocale.invia`) finiscano. */
const flush = () => Promise.resolve().then(() => Promise.resolve());

/** Avanza il tempo finto oltre la coreografia della presa, così `presa`/`spazzata` si azzerano su entrambi i lati. */
async function passaLaPresa() {
  await vi.advanceTimersByTimeAsync(PAUSA_PRESA_MS + VOLO_PRESA_MS + 10);
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

/**
 * Cammina l'intera partita fino alla fine, facendo giocare a ciascun lato la
 * prima carta disponibile nella propria mano (nella Briscola non c'è obbligo di
 * seme: qualunque carta è sempre una mossa legale). Nessuna regola qui: usa solo
 * ciò che il motore host/client espone.
 */
async function giocaFinoAllaFine(
  motoreHost: ReturnType<typeof creaMotoreHost>,
  motoreClient: ReturnType<typeof creaMotoreClient>,
) {
  let guardia = 0;
  while (motoreHost.leggi().stato.fase !== "fine") {
    guardia += 1;
    if (guardia > 100) throw new Error("giocaFinoAllaFine: troppi giri, probabile stallo");

    const turno = motoreHost.leggi().stato.turno;
    if (turno === 0) {
      const carta = motoreHost.leggi().stato.mani[0]?.[0];
      if (!carta) throw new Error("mano host vuota ma non è finita");
      motoreHost.gioca(carta);
    } else {
      const carta = motoreClient.leggi().infoset?.mano[0];
      if (!carta) throw new Error("mano client vuota ma non è finita");
      motoreClient.gioca(carta);
      await flush();
    }
    await flush();
    await passaLaPresa();
    await flush();
  }
}

describe("motoreOnline — partita 1v1 completa via transport locale", () => {
  it("host e client arrivano allo stesso esito, 120 punti esatti", async () => {
    const [tHost, tClient] = creaCoppiaLocale();
    const motoreHost = creaMotoreHost(tHost, { seed: 777 });
    const motoreClient = creaMotoreClient(tClient);
    await flush();

    await giocaFinoAllaFine(motoreHost, motoreClient);

    const statoHost = motoreHost.leggi().stato;
    expect(statoHost.fase).toBe("fine");
    const { punti: puntiHost, vincitore: vincitoreHost } = esito(statoHost);
    expect(puntiHost[0] + puntiHost[1]).toBe(120);

    const infosetClient = motoreClient.leggi().infoset;
    expect(infosetClient).not.toBeNull();
    expect(infosetClient?.fase).toBe("fine");
    expect(infosetClient?.puntiSquadra).toEqual(puntiHost);
    expect(vincitoreDaPunti(infosetClient?.puntiSquadra ?? [0, 0])).toBe(vincitoreHost);

    motoreHost.distruggi();
    motoreClient.distruggi();
  });

  it("🔴 il client non riceve mai una carta della mano dell'host o del mazzo", async () => {
    const [tHost, tClient] = creaCoppiaLocale();
    const seed = 4242;
    const motoreHost = creaMotoreHost(tHost, { seed });
    const motoreClient = creaMotoreClient(tClient);

    // Copia indipendente della partita vera, avanzata con le STESSE mosse: serve
    // da "verità a terra" per sapere, in ogni istante, cos'era ancora segreto.
    let statoVero: GameState = nuovaPartita({ variante: "1v1", seed });

    // Intercetta tutto ciò che arriva al client, grezzo: è esattamente ciò che
    // "transita sul filo" verso di lui.
    const messaggiPerIlClient: string[] = [];
    tClient.onMessaggio((dato) => messaggiPerIlClient.push(dato));
    await flush();

    function applicaAncheAllaVerita(seat: Seat, carta: Carta) {
      const risultato = applica(statoVero, { tipo: "GIOCA", seat, carta });
      if (!risultato.ok)
        throw new Error(`mossa che doveva essere legale è stata rifiutata: ${risultato.motivo}`);
      statoVero = risultato.stato;
    }

    let guardia = 0;
    while (motoreHost.leggi().stato.fase !== "fine") {
      guardia += 1;
      if (guardia > 100) throw new Error("stallo");
      const turno = motoreHost.leggi().stato.turno;
      if (turno === 0) {
        const carta = motoreHost.leggi().stato.mani[0]?.[0];
        if (!carta) throw new Error("mano host vuota");
        applicaAncheAllaVerita(0, carta);
        motoreHost.gioca(carta);
      } else {
        const carta = motoreClient.leggi().infoset?.mano[0];
        if (!carta) throw new Error("mano client vuota");
        applicaAncheAllaVerita(1, carta);
        motoreClient.gioca(carta);
        await flush();
      }
      await flush();

      // Al momento in cui l'ultimo AGGIORNAMENTO è arrivato, quali carte erano
      // ancora segrete (mano dell'host o mazzo, esclusa la briscola scoperta)?
      const segrete = new Set<string>();
      for (const c of statoVero.mani[0] ?? []) segrete.add(idCarta(c));
      for (const c of statoVero.mazzo) {
        if (
          !(c.seme === statoVero.cartaBriscola.seme && c.rango === statoVero.cartaBriscola.rango)
        ) {
          segrete.add(idCarta(c));
        }
      }

      const ultimo = messaggiPerIlClient.at(-1);
      if (ultimo) {
        const trapelate = carteNelTesto(ultimo).filter((id) => segrete.has(id));
        expect(trapelate, `carte segrete trapelate nel messaggio: ${ultimo}`).toEqual([]);
      }

      await passaLaPresa();
      await flush();
    }

    motoreHost.distruggi();
    motoreClient.distruggi();
  });
});

/** Cerca ricorsivamente ogni oggetto `{seme, rango}` nel JSON e ne raccoglie l'id — non importa sotto quale nome di campo compaia. */
function carteNelTesto(grezzo: string): string[] {
  const trovate: string[] = [];
  function cammina(valore: unknown) {
    if (Array.isArray(valore)) {
      for (const v of valore) cammina(v);
      return;
    }
    if (typeof valore !== "object" || valore === null) return;
    const o = valore as Record<string, unknown>;
    if (typeof o.seme === "string" && typeof o.rango === "string") {
      trovate.push(`${o.seme}-${o.rango}`);
    }
    for (const chiave of Object.keys(o)) cammina(o[chiave]);
  }
  cammina(JSON.parse(grezzo));
  return trovate;
}

describe("motoreOnline — messaggi malformati e ostili, via transport locale", () => {
  it("JSON rotto dal client: scartato, stato host invariato, contatore incrementato", async () => {
    const [tHost, tClient] = creaCoppiaLocale();
    const motoreHost = creaMotoreHost(tHost, { seed: 1 });
    await flush();
    const primaScartati = motoreHost.leggi().scartati;
    const primaStato = motoreHost.leggi().stato;

    tClient.invia("{questo non è json valido");
    await flush();

    expect(motoreHost.leggi().scartati).toBe(primaScartati + 1);
    expect(motoreHost.leggi().stato).toEqual(primaStato);
    motoreHost.distruggi();
  });

  it("campi mancanti (GIOCA_CARTA senza carta): scartato senza crash", async () => {
    const [tHost, tClient] = creaCoppiaLocale();
    const motoreHost = creaMotoreHost(tHost, { seed: 1 });
    await flush();
    const primaScartati = motoreHost.leggi().scartati;

    tClient.invia(JSON.stringify({ v: 1, type: "GIOCA_CARTA" }));
    await flush();

    expect(motoreHost.leggi().scartati).toBe(primaScartati + 1);
    motoreHost.distruggi();
  });

  it("tipi sbagliati (seat come stringa): scartato senza crash", async () => {
    const [tHost, tClient] = creaCoppiaLocale();
    const motoreHost = creaMotoreHost(tHost, { seed: 1 });
    await flush();
    const primaScartati = motoreHost.leggi().scartati;

    tClient.invia(JSON.stringify({ v: 1, type: "BENVENUTO", seat: "zero", variante: "1v1" }));
    await flush();

    expect(motoreHost.leggi().scartati).toBe(primaScartati + 1);
    motoreHost.distruggi();
  });

  it("payload sopra il limite di dimensione: scartato senza crash", async () => {
    const [tHost, tClient] = creaCoppiaLocale();
    const motoreHost = creaMotoreHost(tHost, { seed: 1 });
    await flush();
    const primaScartati = motoreHost.leggi().scartati;

    const enorme = JSON.stringify({ v: 1, type: "RIFIUTO", motivo: "x" }).padEnd(
      LIMITE_MESSAGGIO_BYTE + 100,
      "y",
    );
    tClient.invia(enorme);
    await flush();

    expect(motoreHost.leggi().scartati).toBe(primaScartati + 1);
    motoreHost.distruggi();
  });

  it("mossa fuori turno: forma valida ma illegale, l'host la rifiuta senza cambiare stato", async () => {
    const [tHost, tClient] = creaCoppiaLocale();
    const motoreHost = creaMotoreHost(tHost, { seed: 1 });
    await flush();
    // Il turno è dell'host (seat 0): il client (seat 1) prova comunque a giocare.
    expect(motoreHost.leggi().stato.turno).toBe(0);
    const primaStato = motoreHost.leggi().stato;
    const primaScartati = motoreHost.leggi().scartati;

    const rifiuti: string[] = [];
    tClient.onMessaggio((dato) => {
      const v = JSON.parse(dato);
      if (v.type === "RIFIUTO") rifiuti.push(v.motivo);
    });

    const cartaQualsiasi: Carta = { seme: "denari", rango: "asso" };
    tClient.invia(JSON.stringify({ v: 1, type: "GIOCA_CARTA", carta: cartaQualsiasi }));
    await flush();

    expect(motoreHost.leggi().stato).toEqual(primaStato);
    // Illegale ma ben formata: non è un messaggio "scartato" per forma, è
    // rifiutata da `core/machine.ts` — il contatore di scarto non si muove.
    expect(motoreHost.leggi().scartati).toBe(primaScartati);
    expect(rifiuti.length).toBe(1);
    motoreHost.distruggi();
  });

  it("carta che il client non possiede: rifiutata, stato invariato", async () => {
    const [tHost, tClient] = creaCoppiaLocale();
    const motoreHost = creaMotoreHost(tHost, { seed: 1 });
    const motoreClient = creaMotoreClient(tClient);
    await flush();

    // Porta il turno al client (seat 1): l'host gioca la sua prima carta.
    const cartaHost = motoreHost.leggi().stato.mani[0]?.[0];
    if (!cartaHost) throw new Error("mano host vuota");
    motoreHost.gioca(cartaHost);
    await flush();
    expect(motoreHost.leggi().stato.turno).toBe(1);

    const manoClient = motoreClient.leggi().infoset?.mano ?? [];
    const cartaNonPosseduta = (["denari", "coppe", "bastoni", "spade"] as const)
      .flatMap((seme) =>
        (
          [
            "asso",
            "due",
            "tre",
            "quattro",
            "cinque",
            "sei",
            "sette",
            "fante",
            "cavallo",
            "re",
          ] as const
        ).map((rango) => ({ seme, rango }) as Carta),
      )
      .find((c) => !manoClient.some((m) => m.seme === c.seme && m.rango === c.rango));
    if (!cartaNonPosseduta) throw new Error("non trovata una carta assente dalla mano");

    const primaStato = motoreHost.leggi().stato;
    tClient.invia(JSON.stringify({ v: 1, type: "GIOCA_CARTA", carta: cartaNonPosseduta }));
    await flush();

    expect(motoreHost.leggi().stato).toEqual(primaStato);
    motoreHost.distruggi();
    motoreClient.distruggi();
  });

  it("una raffica di messaggi ostili non manda mai in crash il motore", async () => {
    const [tHost, tClient] = creaCoppiaLocale();
    const motoreHost = creaMotoreHost(tHost, { seed: 1 });
    await flush();

    const cattivi = [
      "",
      "null",
      "42",
      "[1,2,3]",
      "{",
      JSON.stringify({ v: 1 }),
      JSON.stringify({ v: 1, type: 123 }),
      JSON.stringify({ v: 1, type: "GIOCA_CARTA", carta: { seme: "cuori", rango: "asso" } }),
      JSON.stringify({ v: 99, type: "GIOCA_CARTA", carta: { seme: "denari", rango: "asso" } }),
      '{"v":1,"type":"GIOCA_CARTA","carta":{"seme":"denari","rango":"asso"},"__proto__":{"x":1}}',
    ];
    expect(() => {
      for (const grezzo of cattivi) tClient.invia(grezzo);
    }).not.toThrow();
    await flush();

    // Il motore è ancora vivo e utilizzabile dopo la raffica.
    expect(motoreHost.leggi().stato.fase).toBe("gioco");
    motoreHost.distruggi();
  });
});

describe("motoreOnline — disconnessione e continuazione contro l'IA", () => {
  it("il canale che si chiude porta l'host a 'disconnesso'", async () => {
    const [tHost, tClient] = creaCoppiaLocale();
    const motoreHost = creaMotoreHost(tHost, { seed: 1 });
    await flush();
    expect(motoreHost.leggi().connessione).toBe("connesso");

    tClient.chiudi();
    await flush();

    expect(motoreHost.leggi().connessione).toBe("disconnesso");
    motoreHost.distruggi();
  });

  it("continuaControAI() fa giocare il seat remoto da solo, senza altro traffico dal client", async () => {
    const [tHost, tClient] = creaCoppiaLocale();
    const motoreHost = creaMotoreHost(tHost, { seed: 1 });
    await flush();

    // Porta il turno al seat remoto (1), poi il client sparisce.
    const cartaHost = motoreHost.leggi().stato.mani[0]?.[0];
    if (!cartaHost) throw new Error("mano host vuota");
    motoreHost.gioca(cartaHost);
    await flush();
    expect(motoreHost.leggi().stato.turno).toBe(1);

    tClient.chiudi();
    await flush();
    expect(motoreHost.leggi().connessione).toBe("disconnesso");

    const statoPrima = motoreHost.leggi().stato;
    motoreHost.continuaControAI();
    expect(motoreHost.leggi().seatRemotoInAI).toBe(true);

    await vi.advanceTimersByTimeAsync(PAUSA_AI_MS + 50);
    await passaLaPresa(); // se l'IA ha chiuso una presa, lascia scorrere anche quell'animazione
    await flush();

    // L'IA ha giocato: lo stato vero è cambiato (banco, mazzo o mani — non
    // importa quale campo esattamente: anche se l'IA vince la presa e resta
    // di mano, turno e lunghezza della mano possono restare identici a
    // prima pur essendo avanzata una mano intera).
    expect(motoreHost.leggi().stato).not.toEqual(statoPrima);

    motoreHost.distruggi();
  });

  it("battito cardiaco: senza contatto per troppo tempo, l'host si considera disconnesso anche se il trasporto non l'ha ancora segnalato", async () => {
    const [tHost] = creaCoppiaLocale();
    // Nessun client dall'altra parte: silenzio totale, ma `tHost.stato` resta
    // "connesso" (nella coppia locale cambia solo con `chiudi()`).
    const motoreHost = creaMotoreHost(tHost, { seed: 1 });
    await flush();
    expect(motoreHost.leggi().connessione).toBe("connesso");

    await vi.advanceTimersByTimeAsync(TIMEOUT_CONTATTO_MS + INTERVALLO_PING_MS);
    await flush();

    expect(motoreHost.leggi().connessione).toBe("disconnesso");
    motoreHost.distruggi();
  });
});

describe("motoreOnline — handshake iniziale", () => {
  it("il client riceve un infoset valido subito dopo la connessione, con la mano già distribuita", async () => {
    const [tHost, tClient] = creaCoppiaLocale();
    const motoreHost = creaMotoreHost(tHost, { seed: 5 });
    const motoreClient = creaMotoreClient(tClient);
    await flush();

    const infoset = motoreClient.leggi().infoset;
    expect(infoset).not.toBeNull();
    expect(infoset?.io).toBe(SEAT_CLIENT_REMOTO);
    expect(infoset?.mano).toHaveLength(3);
    expect(infoset?.turno).toBe(motoreHost.leggi().stato.turno);

    motoreHost.distruggi();
    motoreClient.distruggi();
  });

  it("distruggi() ferma i timer: nessun PING/AGGIORNAMENTO arriva più dopo", async () => {
    const [tHost, tClient] = creaCoppiaLocale();
    const motoreHost = creaMotoreHost(tHost, { seed: 5 });
    await flush();
    motoreHost.distruggi();

    const ricevuti: string[] = [];
    tClient.onMessaggio((d) => ricevuti.push(d));
    await vi.advanceTimersByTimeAsync(INTERVALLO_PING_MS * 3);
    await flush();

    expect(ricevuti).toEqual([]);
  });
});
