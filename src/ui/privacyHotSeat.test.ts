import { describe, expect, it } from "vitest";
import {
  confermaSblocco,
  prossimoStatoPrivacy,
  statoPrivacyIniziale,
} from "@/ui/privacyHotSeat.ts";

describe("statoPrivacyIniziale", () => {
  it("parte confermato sul seat iniziale, senza nessuno in attesa", () => {
    expect(statoPrivacyIniziale(0)).toEqual({ seatConfermato: 0, seatInAttesa: null });
  });
});

describe("prossimoStatoPrivacy", () => {
  it("non fa nulla se il turno resta lo stesso giocatore", () => {
    const iniziale = statoPrivacyIniziale(0);
    expect(prossimoStatoPrivacy(iniziale, 0, false, true)).toBe(iniziale);
  });

  it("mette in attesa il nuovo giocatore quando il turno cambia a presa non in corso", () => {
    const iniziale = statoPrivacyIniziale(0);
    const dopo = prossimoStatoPrivacy(iniziale, 1, false, true);
    expect(dopo).toEqual({ seatConfermato: 0, seatInAttesa: 1 });
  });

  it("non scatta mentre la presa è ferma sul tavolo o sta volando", () => {
    const iniziale = statoPrivacyIniziale(0);
    const dopo = prossimoStatoPrivacy(iniziale, 1, true, true);
    expect(dopo).toBe(iniziale);
  });

  it("scatta solo dopo che la presa è finita di volare", () => {
    const iniziale = statoPrivacyIniziale(0);
    const durantePresa = prossimoStatoPrivacy(iniziale, 1, true, true);
    const dopoPresa = prossimoStatoPrivacy(durantePresa, 1, false, true);
    expect(dopoPresa).toEqual({ seatConfermato: 0, seatInAttesa: 1 });
  });

  it("non scatta a partita finita", () => {
    const iniziale = statoPrivacyIniziale(0);
    expect(prossimoStatoPrivacy(iniziale, 1, false, false)).toBe(iniziale);
  });

  it("non serve passare il telefono se il vincitore della presa è già chi lo tiene", () => {
    // Il seat 0 gioca la carta che chiude il giro e vince la propria presa:
    // il turno torna comunque a 0, non c'è nessuno da mettere in attesa.
    const iniziale = statoPrivacyIniziale(0);
    expect(prossimoStatoPrivacy(iniziale, 0, false, true)).toBe(iniziale);
  });

  it("resta idempotente se richiamato più volte con lo stesso turno in attesa", () => {
    const iniziale = statoPrivacyIniziale(0);
    const primo = prossimoStatoPrivacy(iniziale, 1, false, true);
    const secondo = prossimoStatoPrivacy(primo, 1, false, true);
    expect(secondo).toBe(primo);
  });

  it("pulisce l'attesa se il turno torna indietro al confermato prima della conferma", () => {
    const iniziale = statoPrivacyIniziale(0);
    const inAttesa = prossimoStatoPrivacy(iniziale, 1, false, true);
    const tornato = prossimoStatoPrivacy(inAttesa, 0, false, true);
    expect(tornato).toEqual({ seatConfermato: 0, seatInAttesa: null });
  });
});

describe("confermaSblocco", () => {
  it("promuove il seat in attesa a confermato", () => {
    const inAttesa = prossimoStatoPrivacy(statoPrivacyIniziale(0), 1, false, true);
    expect(confermaSblocco(inAttesa)).toEqual({ seatConfermato: 1, seatInAttesa: null });
  });

  it("non fa nulla se non c'è nessuno in attesa", () => {
    const iniziale = statoPrivacyIniziale(0);
    expect(confermaSblocco(iniziale)).toBe(iniziale);
  });

  it("in entrambe le direzioni: G1→G2 e G2→G1", () => {
    let stato = statoPrivacyIniziale(0);
    stato = confermaSblocco(prossimoStatoPrivacy(stato, 1, false, true));
    expect(stato).toEqual({ seatConfermato: 1, seatInAttesa: null });

    stato = confermaSblocco(prossimoStatoPrivacy(stato, 0, false, true));
    expect(stato).toEqual({ seatConfermato: 0, seatInAttesa: null });
  });
});
