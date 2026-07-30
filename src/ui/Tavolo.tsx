import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { PUNTI } from "@/core/deck.ts";
import { numeroGiocatori } from "@/core/machine.ts";
import { squadraDi } from "@/core/rules.ts";
import type { Carta, Seat, Squadra } from "@/core/types.ts";
import type { Modalita, Partita } from "@/game/usePartita.ts";
import { cn } from "@/lib/utils.ts";
import type { Ruolo, StatoConnessione } from "@/transport/types.ts";
import { CartaImg, nomeCarta } from "@/ui/Carta.tsx";
import {
  confermaSblocco,
  prossimoStatoPrivacy,
  statoPrivacyIniziale,
} from "@/ui/privacyHotSeat.ts";
import { SchermoPrivacy } from "@/ui/SchermoPrivacy.tsx";

/**
 * `"online"` si aggiunge a `Modalita` (che resta "ai" | "locale" — il vocabolario
 * di `usePartita.ts`/`ConfigPartita`, invariato) solo per le decisioni di
 * rendering qui dentro: nome dei posti, titolo di fine partita. Non a caso i due
 * `if (modalita === "locale")` già esistenti bastano da soli a escludere "online"
 * per costruzione — online eredita lo stesso ramo "contro qualcuno remoto" già
 * scritto per "ai" (mostra "Tu"/"Avversario", niente schermo privacy).
 */
export type ModalitaVisualizzazione = Modalita | "online";

/** Presente solo in modalità "online": stato della connessione P2P e, per l'host, la via d'uscita dopo una disconnessione. */
export interface InfoOnline {
  readonly ruolo: Ruolo;
  readonly connessione: StatoConnessione;
  readonly seatRemotoInAI: boolean;
  readonly continuaControAI: () => void;
}

interface Props {
  readonly partita: Partita;
  readonly modalita: ModalitaVisualizzazione;
  readonly online?: InfoOnline;
  readonly onEsci: () => void;
}

/**
 * Dove sta, sullo schermo, chi siede in `seat` — visto da chi siede in
 * `base`. In due (1v1) esistono solo "basso" (chi guarda) e "alto" (l'unico
 * altro posto). In quattro (2v2, F7) il giro orario
 * base→destra→alto→sinistra rispecchia come ci si siede davvero attorno a un
 * tavolo da coppie: il compagno è sempre di fronte (alto), i due avversari
 * ai lati — coerente con `squadraDi` (0+2 contro 1+3).
 */
type Posizione = "basso" | "destra" | "alto" | "sinistra";

function posizioneDi(seat: Seat, base: Seat, giocatori: number): Posizione {
  const offset = (((seat - base) % giocatori) + giocatori) % giocatori;
  if (giocatori <= 2) return offset === 0 ? "basso" : "alto";
  return (["basso", "destra", "alto", "sinistra"] as const)[offset] ?? "basso";
}

const ANIMAZIONE_INGRESSO: Record<Posizione, string> = {
  basso: "gioca-dal-basso",
  destra: "gioca-da-destra",
  alto: "gioca-dallalto",
  sinistra: "gioca-da-sinistra",
};

const ANIMAZIONE_VOLO: Record<Posizione, string> = {
  basso: "vola-giu",
  destra: "vola-a-destra",
  alto: "vola-su",
  sinistra: "vola-a-sinistra",
};

/**
 * Tutti i posti di una variante, raggruppati per squadra. Nell'1v1 ogni
 * squadra ha un solo posto: è la stessa formula del 2v2, non serve un caso a
 * parte — riusa `squadraDi` del core invece di reinventare chi è compagno di
 * chi (AGENTS.md §3.2).
 */
function squadreDi(giocatori: number): readonly (readonly Seat[])[] {
  const squadre: Seat[][] = [[], []];
  for (let seat = 0; seat < giocatori; seat++) {
    squadre[squadraDi(seat as Seat)]?.push(seat as Seat);
  }
  return squadre;
}

function nomeSeat(
  seat: Seat,
  modalita: ModalitaVisualizzazione,
  seatUmano: Seat,
  giocatori: number,
): string {
  if (modalita === "locale") return `Giocatore ${seat + 1}`;
  if (seat === seatUmano) return "Tu";
  if (giocatori <= 2) return "Avversario";
  if (squadraDi(seat) === squadraDi(seatUmano)) return "Compagno";
  const avversari = Array.from({ length: giocatori }, (_, s) => s as Seat).filter(
    (s) => squadraDi(s) !== squadraDi(seatUmano),
  );
  return `Avversario ${avversari.indexOf(seat) + 1}`;
}

function nomeSquadra(
  squadra: readonly Seat[],
  modalita: ModalitaVisualizzazione,
  seatUmano: Seat,
  giocatori: number,
): string {
  return squadra.map((seat) => nomeSeat(seat, modalita, seatUmano, giocatori)).join(" e ");
}

export function Tavolo({ partita, modalita, online, onEsci }: Props) {
  const {
    stato,
    bancoVisibile,
    presa,
    spazzata,
    puoGiocare: puoGiocareStato,
    seatUmano,
    pensando,
    punti,
    puntiSquadra,
  } = partita;
  const giocatori = numeroGiocatori(stato.variante);
  const [abbandonaAperto, setAbbandonaAperto] = useState(false);

  /**
   * Dialog di disconnessione (implements.md §8.4): appare quando il trasporto
   * P2P non è più "connesso" e la partita non è già finita. Chiuderlo (scelta
   * esplicita, o l'host che sceglie di continuare contro l'IA) lo tiene chiuso
   * finché la connessione non torna "connesso" e cade di nuovo — niente
   * riconnessione automatica in questa fase, è l'utente a decidere ogni volta.
   */
  const [dialogDisconnessioneChiuso, setDialogDisconnessioneChiuso] = useState(false);
  useEffect(() => {
    if (online?.connessione === "connesso") setDialogDisconnessioneChiuso(false);
  }, [online?.connessione]);
  const mostraDialogDisconnessione =
    online !== undefined &&
    online.connessione !== "connesso" &&
    stato.fase !== "fine" &&
    !dialogDisconnessioneChiuso &&
    !(online.ruolo === "host" && online.seatRemotoInAI);

  /**
   * Hot-seat: a ogni cambio di turno lo schermo va coperto finché il
   * telefono non è passato al giocatore giusto — mai contro l'AI, dove non
   * c'è nessuna mano da nascondere a nessuno. Generalizzato a N giocatori
   * (F7, 0.9.0): `privacyHotSeat.ts` non ha mai enumerato solo due posti —
   * gira identico nel 2v2 "in quattro", vedi i test dedicati.
   */
  const [privacy, setPrivacy] = useState(() => statoPrivacyIniziale(seatUmano));
  useEffect(() => {
    if (modalita !== "locale") return;
    setPrivacy((precedente) =>
      prossimoStatoPrivacy(precedente, stato.turno, presa !== null, stato.fase === "gioco"),
    );
  }, [modalita, stato.turno, presa, stato.fase]);

  const overlayAttivo = modalita === "locale" && privacy.seatInAttesa !== null;
  // Finché l'overlay è su schermo, quel che si mostra resta congelato sul
  // giocatore già confermato: il turno nel `core` è già passato all'altro,
  // ma la sua mano non deve comparire finché non ha lui in mano il telefono.
  const seatVisibile = overlayAttivo ? privacy.seatConfermato : seatUmano;

  // Nel 2v2 il giro orario è basso(tu)→destra→alto(compagno)→sinistra. Le
  // formule restano valide anche nell'1v1 (dove destra/sinistra non si
  // renderizzano mai): non serve un ramo separato.
  const seatAlto = ((seatVisibile + (giocatori <= 2 ? 1 : 2)) % giocatori) as Seat;
  const seatDestra = ((seatVisibile + 1) % giocatori) as Seat;
  const seatSinistra = ((seatVisibile + 3) % giocatori) as Seat;

  const manoMia = stato.mani[seatVisibile] ?? [];
  const manoAlto = stato.mani[seatAlto] ?? [];
  const manoDestra = stato.mani[seatDestra] ?? [];
  const manoSinistra = stato.mani[seatSinistra] ?? [];
  const finita = stato.fase === "fine";
  const puoGiocare = puoGiocareStato && !overlayAttivo;

  /**
   * Mentre si gioca la pagina non scorre: il campo sta tutto nella viewport.
   * La classe si toglie all'uscita, perché le altre schermate devono scorrere.
   */
  useEffect(() => {
    document.body.classList.add("senza-scroll");
    return () => document.body.classList.remove("senza-scroll");
  }, []);

  // Tastiera: 1, 2, 3 giocano la carta corrispondente.
  useEffect(() => {
    if (!puoGiocare) return;
    function onTasto(evento: KeyboardEvent) {
      const indice = Number.parseInt(evento.key, 10) - 1;
      const carta = manoMia[indice];
      if (carta) {
        evento.preventDefault();
        partita.gioca(carta);
      }
    }
    window.addEventListener("keydown", onTasto);
    return () => window.removeEventListener("keydown", onTasto);
  }, [puoGiocare, manoMia, partita]);

  // La direzione unica in cui vola l'intera presa: dipende solo da dove
  // siede il vincitore rispetto a chi guarda, non dalla singola carta.
  const direzioneVolo = presa
    ? ANIMAZIONE_VOLO[posizioneDi(presa.vincitore, seatVisibile, giocatori)]
    : undefined;

  return (
    <>
      {/* `inert` mentre lo schermo privacy è su: il contenuto sotto non deve
          essere raggiungibile né da tastiera né da uno screen reader. */}
      <main
        inert={overlayAttivo || undefined}
        className="table-felt flex h-dvh flex-col justify-between overflow-hidden px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6"
      >
        {/* Alto: il compagno nel 2v2, l'unico avversario nell'1v1 */}
        <section className="flex flex-col items-center gap-2">
          <div className="flex w-full max-w-2xl items-center justify-between text-xs">
            <span className="flex items-center gap-2">
              <button
                type="button"
                aria-haspopup="dialog"
                onClick={() => setAbbandonaAperto(true)}
                className="text-on-felt-muted hover:text-on-felt"
              >
                Abbandona
              </button>
              {online && <IndicatoreConnessione connessione={online.connessione} />}
            </span>
            {giocatori > 2 && (
              <span className="text-on-felt-muted">
                Voi{" "}
                <strong className="text-on-felt tabular-nums">
                  {puntiSquadra[squadraDi(seatVisibile)]}
                </strong>
                {" · Loro "}
                <strong className="text-on-felt tabular-nums">
                  {puntiSquadra[(squadraDi(seatVisibile) === 0 ? 1 : 0) as Squadra]}
                </strong>
              </span>
            )}
            <span className="text-on-felt-muted">
              {nomeSeat(seatAlto, modalita, seatVisibile, giocatori)}{" "}
              <strong className="ml-1 text-on-felt tabular-nums">{punti[seatAlto] ?? 0}</strong>
            </span>
          </div>
          <ul
            className="flex gap-1.5"
            aria-label={`Carte di ${nomeSeat(seatAlto, modalita, seatVisibile, giocatori)}`}
          >
            {manoAlto.map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: sono dorsi indistinguibili, l'indice è l'unica identità che abbiano — e usare la carta come chiave la rivelerebbe nel DOM
              <li key={i} className="w-12 sm:w-16">
                <CartaImg coperta />
              </li>
            ))}
          </ul>
        </section>

        {/* Tavolo: banco al centro, compagno di lato nel 2v2 */}
        <section className="relative flex flex-1 items-center gap-1 py-3">
          {giocatori > 2 && (
            <ManoLaterale
              seat={seatSinistra}
              mano={manoSinistra}
              punti={punti[seatSinistra] ?? 0}
              modalita={modalita}
              seatVisibile={seatVisibile}
              giocatori={giocatori}
            />
          )}

          <div className="flex min-h-[7rem] flex-1 items-center justify-center gap-2 sm:min-h-[9rem] sm:gap-4">
            {bancoVisibile.length === 0 ? (
              <p className="text-on-felt-muted/60 text-sm">
                {finita ? "Partita finita" : "Tavolo vuoto"}
              </p>
            ) : (
              bancoVisibile.map((giocata, indice) => {
                const posizione = posizioneDi(giocata.seat, seatVisibile, giocatori);
                return (
                  <div
                    key={`${giocata.seat}-${giocata.carta.seme}-${giocata.carta.rango}`}
                    style={spazzata ? { animationDelay: `${indice * 60}ms` } : undefined}
                    className={cn(
                      // Entra dal lato di chi l'ha calata, con un arco invece
                      // che una traslazione dritta.
                      ANIMAZIONE_INGRESSO[posizione],
                      // E quando il giro si chiude, vola verso chi ha vinto —
                      // rimpiazza del tutto l'animazione d'ingresso qui sopra.
                      spazzata && direzioneVolo,
                    )}
                  >
                    <CartaImg
                      carta={giocata.carta}
                      className={cn(
                        "transition-all duration-200",
                        giocatori > 2 ? "w-14 sm:w-20" : "w-20 sm:w-24",
                        presa &&
                          !spazzata &&
                          presa.vincitore === giocata.seat &&
                          "-translate-y-1.5 ring-3 ring-brass",
                      )}
                    />
                  </div>
                );
              })
            )}
          </div>

          {giocatori > 2 && (
            <ManoLaterale
              seat={seatDestra}
              mano={manoDestra}
              punti={punti[seatDestra] ?? 0}
              modalita={modalita}
              seatVisibile={seatVisibile}
              giocatori={giocatori}
            />
          )}

          {/* Mazzo e briscola: in un angolo nel 2v2, per non litigare con le
              mani laterali che occupano i bordi verticali. */}
          <aside
            className={cn(
              "absolute flex flex-col items-center gap-1",
              giocatori > 2 ? "top-0 right-0" : "top-1/2 right-0 -translate-y-1/2",
            )}
          >
            {stato.mazzo.length > 0 ? (
              <>
                <div className="relative h-16 w-16 sm:h-20 sm:w-20">
                  <CartaImg
                    carta={stato.cartaBriscola}
                    className="-translate-y-1/2 absolute top-1/2 left-1 w-14 rotate-90 sm:w-16"
                  />
                  {stato.mazzo.length > 1 && (
                    <CartaImg
                      coperta
                      className="-translate-y-1/2 absolute top-1/2 right-0 w-11 sm:w-13"
                    />
                  )}
                </div>
                <span className="text-[10px] text-on-felt-muted tabular-nums">
                  {stato.mazzo.length} nel mazzo
                </span>
              </>
            ) : (
              <span className="text-[10px] text-on-felt-muted">mazzo finito</span>
            )}
            <span className="rounded-full border border-brass/40 px-2 py-0.5 text-[10px] text-brass capitalize">
              {stato.briscola}
            </span>
          </aside>
        </section>

        {/* La mia mano */}
        <section className="flex flex-col items-center gap-2">
          <p aria-live="polite" className="h-5 text-on-felt-muted text-xs">
            {presa
              ? `Presa di ${nomeSeat(presa.vincitore, modalita, seatVisibile, giocatori)}${presa.punti > 0 ? ` · ${presa.punti} punti` : ""}`
              : pensando
                ? "Sta pensando…"
                : puoGiocare
                  ? modalita === "locale"
                    ? `Tocca a ${nomeSeat(stato.turno, modalita, seatVisibile, giocatori)}`
                    : "Tocca a te"
                  : online && stato.fase !== "fine"
                    ? "In attesa dell'avversario…"
                    : ""}
          </p>

          <ul className="flex items-end gap-2 sm:gap-3" aria-label="Le tue carte">
            {manoMia.map((carta, indice) => (
              <li
                key={`${carta.seme}-${carta.rango}`}
                // Ogni carta nuova entra da sé, come appena sfilata dal
                // mazzo: la distribuzione iniziale e ogni pescata usano lo
                // stesso effetto, sfalsato di poco.
                className="pescata-in-mano"
                style={{ animationDelay: `${indice * 80}ms` }}
              >
                <button
                  type="button"
                  disabled={!puoGiocare}
                  onClick={() => partita.gioca(carta)}
                  aria-label={`Gioca ${nomeCarta(carta)}${PUNTI[carta.rango] > 0 ? `, ${PUNTI[carta.rango]} punti` : ""}`}
                  className={cn(
                    "block w-20 rounded-lg transition-[transform,filter] duration-150 ease-out sm:w-24",
                    "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brass",
                    puoGiocare
                      ? "cursor-pointer hover:-translate-y-3 hover:scale-[1.03] hover:drop-shadow-[0_14px_18px_rgba(0,0,0,0.45)] active:-translate-y-1 active:scale-95 active:drop-shadow-none"
                      : "cursor-not-allowed opacity-70",
                  )}
                >
                  <CartaImg carta={carta} className={cn(puoGiocare && "in-attesa-di-te")} />
                  <span className="mt-0.5 block text-center text-[10px] text-on-felt-muted/70 tabular-nums">
                    {indice + 1}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <p className="text-xs text-on-felt-muted">
            {nomeSeat(seatVisibile, modalita, seatVisibile, giocatori)}{" "}
            <strong className="ml-1 text-on-felt tabular-nums">{punti[seatVisibile] ?? 0}</strong>
          </p>
        </section>

        <FinePartita partita={partita} modalita={modalita} onEsci={onEsci} />
      </main>

      {overlayAttivo && privacy.seatInAttesa !== null && (
        <SchermoPrivacy
          nomeGiocatore={nomeSeat(privacy.seatInAttesa, modalita, seatUmano, giocatori)}
          onSblocca={() => setPrivacy((precedente) => confermaSblocco(precedente))}
        />
      )}

      <Dialog open={abbandonaAperto} onOpenChange={setAbbandonaAperto}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Vuoi abbandonare la partita?</DialogTitle>
            <DialogDescription>
              La partita in corso viene chiusa e non si può riprendere.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:flex-col sm:gap-2">
            <Button
              variant="destructive"
              onClick={() => {
                partita.abbandona();
                onEsci();
              }}
              className="w-full"
            >
              Abbandona
            </Button>
            <Button variant="outline" onClick={() => setAbbandonaAperto(false)} className="w-full">
              Annulla
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {online && (
        <Dialog
          open={mostraDialogDisconnessione}
          onOpenChange={() => setDialogDisconnessioneChiuso(true)}
        >
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>
                {online.ruolo === "host"
                  ? "Connessione persa con l'avversario"
                  : "Connessione persa con l'host"}
              </DialogTitle>
              <DialogDescription>
                {online.ruolo === "host"
                  ? "Il canale con l'altro telefono si è interrotto. Potete continuare la partita contro il computer, o uscire — non c'è una riconnessione automatica."
                  : "Senza l'host la partita non può proseguire: non c'è una riconnessione automatica. Puoi solo tornare al menu."}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="sm:flex-col sm:gap-2">
              {online.ruolo === "host" && (
                <Button
                  onClick={() => {
                    online.continuaControAI();
                    setDialogDisconnessioneChiuso(true);
                  }}
                  className="w-full"
                >
                  Continua contro il computer
                </Button>
              )}
              <Button
                variant={online.ruolo === "host" ? "outline" : "default"}
                onClick={() => {
                  partita.abbandona();
                  onEsci();
                }}
                className="w-full"
              >
                {online.ruolo === "host" ? "Esci" : "Torna al menu"}
              </Button>
              {online.ruolo === "host" && (
                <Button
                  variant="ghost"
                  onClick={() => setDialogDisconnessioneChiuso(true)}
                  className="w-full"
                >
                  Aspetta ancora
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

/** Pallino + etichetta dello stato della connessione P2P, sempre visibile in modalità "online". */
function IndicatoreConnessione({ connessione }: { readonly connessione: StatoConnessione }) {
  const stile: Record<StatoConnessione, { readonly colore: string; readonly testo: string }> = {
    connesso: { colore: "bg-emerald-400", testo: "Connesso" },
    connettendo: { colore: "bg-amber-400 animate-pulse", testo: "Connessione…" },
    disconnesso: { colore: "bg-destructive animate-pulse", testo: "Disconnesso" },
    chiuso: { colore: "bg-on-felt-muted/40", testo: "Chiuso" },
  };
  const { colore, testo } = stile[connessione];
  return (
    <span className="flex items-center gap-1.5 text-on-felt-muted/80">
      <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", colore)} />
      {testo}
    </span>
  );
}

/** Una mano vista di lato: solo nel 2v2, dorsi impilati in verticale per stare nei bordi stretti. */
function ManoLaterale({
  seat,
  mano,
  punti,
  modalita,
  seatVisibile,
  giocatori,
}: {
  readonly seat: Seat;
  readonly mano: readonly Carta[];
  readonly punti: number;
  readonly modalita: ModalitaVisualizzazione;
  readonly seatVisibile: Seat;
  readonly giocatori: number;
}) {
  const nome = nomeSeat(seat, modalita, seatVisibile, giocatori);
  return (
    <aside className="flex shrink-0 flex-col items-center gap-1" aria-label={`Carte di ${nome}`}>
      <span className="max-w-14 text-[10px] text-on-felt-muted leading-tight">{nome}</span>
      <div className="flex flex-col items-center -space-y-9 sm:-space-y-11">
        {mano.map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: sono dorsi indistinguibili, l'indice è l'unica identità che abbiano
          <div key={i} className="w-9 sm:w-11">
            <CartaImg coperta />
          </div>
        ))}
      </div>
      <span className="text-[10px] text-on-felt-muted tabular-nums">{punti}</span>
    </aside>
  );
}

function FinePartita({ partita, modalita, onEsci }: Props) {
  const { stato, puntiSquadra, vincitore } = partita;
  const finita = stato.fase === "fine";
  const pareggio = vincitore === null;
  const giocatori = numeroGiocatori(stato.variante);
  const squadre = squadreDi(giocatori);

  let titolo: string;
  if (vincitore === null) {
    titolo = "Sessanta pari";
  } else if (modalita === "locale") {
    titolo = `Vince ${nomeSquadra(squadre[vincitore] ?? [], modalita, partita.seatUmano, giocatori)}`;
  } else {
    titolo = vincitore === squadraDi(partita.seatUmano) ? "Hai vinto" : "Hai perso";
  }

  return (
    <Dialog open={finita}>
      <DialogContent showCloseButton={false} className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-2xl">{titolo}</DialogTitle>
          <DialogDescription>
            {pareggio
              ? "Sessanta a sessanta: nessuno dei due porta a casa la partita."
              : "I punti in una partita sono sempre 120: chi supera 60 vince."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-center gap-6 py-3">
          {squadre.map((squadra, indice) => (
            <div key={squadra.join("-")} className="text-center">
              <p className="text-muted-foreground text-xs">
                {nomeSquadra(squadra, modalita, partita.seatUmano, giocatori)}
              </p>
              <p
                className={cn(
                  "font-semibold text-3xl tabular-nums",
                  vincitore === indice && "text-primary",
                )}
              >
                {puntiSquadra[indice as Squadra] ?? 0}
              </p>
            </div>
          ))}
        </div>

        <DialogFooter className="sm:flex-col sm:gap-2">
          {/* Online: niente rivincita in F6 — risincronizzare due stati
              indipendenti da zero è fuori scope, vedi implements.md §8.4. */}
          {modalita !== "online" && (
            <Button onClick={partita.ricomincia} className="w-full">
              Rivincita
            </Button>
          )}
          <Button variant="outline" onClick={onEsci} className="w-full">
            {modalita === "online" ? "Torna al menu" : "Cambia partita"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
