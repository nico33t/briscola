import { describe, expect, it } from "vitest";
import { creaCoppiaLocale } from "./locale.ts";

/** Aspetta che le microtask in coda (le consegne di `EndpointLocale.invia`) finiscano. */
const flush = () => Promise.resolve().then(() => Promise.resolve());

describe("transport locale", () => {
  it("parte già connesso su entrambi i lati", () => {
    const [host, client] = creaCoppiaLocale();
    expect(host.stato).toBe("connesso");
    expect(client.stato).toBe("connesso");
  });

  it("consegna un messaggio da un lato all'altro, in modo asincrono", async () => {
    const [host, client] = creaCoppiaLocale();
    const ricevuti: string[] = [];
    client.onMessaggio((dato) => ricevuti.push(dato));

    host.invia("ciao");
    // Non ancora consegnato: la consegna passa da una microtask.
    expect(ricevuti).toEqual([]);

    await flush();
    expect(ricevuti).toEqual(["ciao"]);
  });

  it("consegna nelle due direzioni indipendentemente", async () => {
    const [host, client] = creaCoppiaLocale();
    const dalHost: string[] = [];
    const dalClient: string[] = [];
    client.onMessaggio((d) => dalHost.push(d));
    host.onMessaggio((d) => dalClient.push(d));

    host.invia("da host");
    client.invia("da client");
    await flush();

    expect(dalHost).toEqual(["da host"]);
    expect(dalClient).toEqual(["da client"]);
  });

  it("onMessaggio restituisce una funzione di disiscrizione che funziona davvero", async () => {
    const [host, client] = creaCoppiaLocale();
    const ricevuti: string[] = [];
    const cancella = client.onMessaggio((d) => ricevuti.push(d));

    host.invia("primo");
    await flush();
    cancella();
    host.invia("secondo");
    await flush();

    expect(ricevuti).toEqual(["primo"]);
  });

  it("chiudi() porta il lato che chiude a 'chiuso' e l'altro a 'disconnesso'", async () => {
    const [host, client] = creaCoppiaLocale();
    const statiClient: string[] = [];
    client.onStato((s) => statiClient.push(s));

    host.chiudi();
    expect(host.stato).toBe("chiuso");
    // Il lato remoto non lo sa ancora nello stesso tick.
    expect(client.stato).toBe("connesso");

    await flush();
    expect(client.stato).toBe("disconnesso");
    expect(statiClient).toEqual(["disconnesso"]);
  });

  it("chiudi() è idempotente e non manda più messaggi dopo", async () => {
    const [host, client] = creaCoppiaLocale();
    const ricevuti: string[] = [];
    client.onMessaggio((d) => ricevuti.push(d));

    host.chiudi();
    host.chiudi(); // seconda chiamata: non deve esplodere né rimandare lo stato
    host.invia("dopo la chiusura"); // non consegnato: host non è più "connesso"
    await flush();

    expect(ricevuti).toEqual([]);
  });

  it("invia() su un canale chiuso non lancia", () => {
    const [host] = creaCoppiaLocale();
    host.chiudi();
    expect(() => host.invia("qualunque cosa")).not.toThrow();
  });
});
