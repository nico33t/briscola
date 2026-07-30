import type { Seat } from "@/core/types.ts";

/**
 * Lo schermo privacy dell'hot-seat: quando si gioca "in due" sullo stesso
 * device, il telefono passa di mano a ogni cambio di turno. Prima che la
 * mano del prossimo giocatore compaia, lo schermo va coperto — altrimenti
 * chi tiene ancora il telefono vede le carte dell'altro.
 *
 * Logica pura, separata dalla UI (AGENTS.md §0: lo stato UI vive nella UI,
 * ma la sua logica si testa meglio fuori da React).
 */

export interface StatoPrivacy {
  /** Il posto la cui mano è attualmente mostrata a schermo. */
  readonly seatConfermato: Seat;
  /** Se non nullo, il posto che deve prendere in mano il telefono: lo
   * schermo resta coperto finché non conferma con un doppio tocco. */
  readonly seatInAttesa: Seat | null;
}

export function statoPrivacyIniziale(seatIniziale: Seat): StatoPrivacy {
  return { seatConfermato: seatIniziale, seatInAttesa: null };
}

/**
 * Ricalcola lo stato a ogni cambiamento del turno di gioco.
 *
 * Due guardie prima di reagire:
 * - `presaInCorso`: la presa è ancora ferma sul tavolo o sta volando verso
 *   chi l'ha vinta. Il turno nello stato del `core` è **già** passato al
 *   vincitore, ma finché la coreografia non è finita l'esito deve restare
 *   visibile a entrambi — coprire lo schermo ora nasconderebbe la presa.
 * - `inGioco`: a partita finita non c'è più nessun turno da proteggere.
 *
 * Se il turno è tornato a chi ha già il telefono in mano (stesso seat che
 * ha appena giocato e ha vinto la sua stessa presa), non serve passare
 * niente: l'overlay non scatta.
 */
export function prossimoStatoPrivacy(
  precedente: StatoPrivacy,
  turnoAttuale: Seat,
  presaInCorso: boolean,
  inGioco: boolean,
): StatoPrivacy {
  if (!inGioco || presaInCorso) return precedente;

  if (turnoAttuale === precedente.seatConfermato) {
    return precedente.seatInAttesa === null ? precedente : { ...precedente, seatInAttesa: null };
  }
  if (precedente.seatInAttesa === turnoAttuale) return precedente;
  return { seatConfermato: precedente.seatConfermato, seatInAttesa: turnoAttuale };
}

/** Doppio tocco (o doppio Invio) confermato: si sblocca la mano in attesa. */
export function confermaSblocco(stato: StatoPrivacy): StatoPrivacy {
  if (stato.seatInAttesa === null) return stato;
  return { seatConfermato: stato.seatInAttesa, seatInAttesa: null };
}
