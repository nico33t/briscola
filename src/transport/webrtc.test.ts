import { describe, expect, it } from "vitest";
import { codificaSegnale, comprimiBlob, decodificaSegnale, decomprimiBlob } from "./webrtc.ts";

/** Un SDP finto ma realistico: ripetitivo come uno vero (righe `a=candidate` quasi identiche). */
function sdpFinto(candidati: number): string {
  let sdp = "v=0\r\no=- 4611731400430051336 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n";
  sdp +=
    "a=group:BUNDLE 0\r\na=msid-semantic: WMS\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n";
  sdp += "c=IN IP4 0.0.0.0\r\na=ice-ufrag:abcd\r\na=ice-pwd:0123456789abcdef0123456789\r\n";
  for (let i = 0; i < candidati; i++) {
    sdp += `a=candidate:${i} 1 udp 2122260223 192.168.1.${i % 250} ${50000 + i} typ host generation 0\r\n`;
  }
  sdp += "a=sctp-port:5000\r\n";
  return sdp;
}

describe("comprimiBlob / decomprimiBlob — roundtrip", () => {
  it("testo corto", async () => {
    const testo = "ciao mondo";
    const blob = await comprimiBlob(testo);
    expect(await decomprimiBlob(blob)).toBe(testo);
  });

  it("stringa vuota", async () => {
    const blob = await comprimiBlob("");
    expect(await decomprimiBlob(blob)).toBe("");
  });

  it("testo con caratteri non ASCII (emoji, accenti)", async () => {
    const testo = "è già più forte 🂡🂮 così";
    const blob = await comprimiBlob(testo);
    expect(await decomprimiBlob(blob)).toBe(testo);
  });

  it("un SDP finto ma realistico va e torna identico", async () => {
    const sdp = sdpFinto(15);
    const blob = await comprimiBlob(sdp);
    expect(await decomprimiBlob(blob)).toBe(sdp);
  });

  it("la compressione riduce davvero la dimensione di un SDP ripetitivo", async () => {
    const sdp = sdpFinto(20);
    const blob = await comprimiBlob(sdp);
    // Il blob (marcatore + base64url) dev'essere sensibilmente più corto del
    // testo originale: è tutto il punto della compressione, non solo un
    // roundtrip che torna qualcosa.
    expect(blob.length).toBeLessThan(sdp.length * 0.6);
  });

  it("usa il marcatore di formato '1' (compresso) quando CompressionStream è disponibile", async () => {
    const blob = await comprimiBlob("qualunque cosa");
    expect(blob[0]).toBe("1");
  });
});

describe("decomprimiBlob — input corrotto, mai un'eccezione", () => {
  it("stringa vuota", async () => {
    expect(await decomprimiBlob("")).toBeNull();
  });

  it("marcatore di formato sconosciuto", async () => {
    expect(await decomprimiBlob("9qualcosa")).toBeNull();
  });

  it("base64url non valido dopo il marcatore", async () => {
    await expect(decomprimiBlob("1@@@non-base64@@@")).resolves.toBeNull();
  });

  it("base64 sintatticamente valido ma non deflate valido", async () => {
    // "1" + base64url di byte casuali che non sono un flusso deflate.
    const bytesCasuali = "AAAAAAAAAAAAAAAAAAAA";
    await expect(decomprimiBlob(`1${bytesCasuali}`)).resolves.toBeNull();
  });

  it("blob tagliato a metà (incollato parzialmente)", async () => {
    const blob = await comprimiBlob(sdpFinto(10));
    const tagliato = blob.slice(0, Math.floor(blob.length / 2));
    await expect(decomprimiBlob(tagliato)).resolves.toBeNull();
  });

  it("blob assurdamente lungo viene rifiutato subito", async () => {
    const enorme = `1${"A".repeat(300_000)}`;
    await expect(decomprimiBlob(enorme)).resolves.toBeNull();
  });
});

describe("codificaSegnale / decodificaSegnale", () => {
  it("fa il roundtrip di un'offerta", async () => {
    const sdp = sdpFinto(8);
    const blob = await codificaSegnale({ v: 1, t: "offer", d: sdp });
    const segnale = await decodificaSegnale(blob);
    expect(segnale).toEqual({ v: 1, t: "offer", d: sdp });
  });

  it("fa il roundtrip di una risposta", async () => {
    const sdp = sdpFinto(8);
    const blob = await codificaSegnale({ v: 1, t: "answer", d: sdp });
    const segnale = await decodificaSegnale(blob);
    expect(segnale).toEqual({ v: 1, t: "answer", d: sdp });
  });

  it("rifiuta un blob corrotto invece di lanciare", async () => {
    await expect(decodificaSegnale("blob-a-caso-non-valido")).resolves.toBeNull();
  });

  it("rifiuta un blob che decomprime a JSON valido ma di forma sbagliata", async () => {
    const blob = await comprimiBlob(JSON.stringify({ v: 1, t: "invito-a-cena", d: "sdp" }));
    expect(await decodificaSegnale(blob)).toBeNull();
  });

  it("rifiuta un blob che decomprime a JSON non valido", async () => {
    const blob = await comprimiBlob("{questo non è json");
    expect(await decodificaSegnale(blob)).toBeNull();
  });

  it("rifiuta un blob con campo 'd' mancante o vuoto", async () => {
    const senzaD = await comprimiBlob(JSON.stringify({ v: 1, t: "offer" }));
    expect(await decodificaSegnale(senzaD)).toBeNull();
    const dVuoto = await comprimiBlob(JSON.stringify({ v: 1, t: "offer", d: "" }));
    expect(await decodificaSegnale(dVuoto)).toBeNull();
  });
});
