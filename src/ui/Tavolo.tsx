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
import type { Seat } from "@/core/types.ts";
import type { Modalita, Partita } from "@/game/usePartita.ts";
import { cn } from "@/lib/utils.ts";
import { CartaImg, nomeCarta } from "@/ui/Carta.tsx";
import {
  confermaSblocco,
  prossimoStatoPrivacy,
  statoPrivacyIniziale,
} from "@/ui/privacyHotSeat.ts";
import { SchermoPrivacy } from "@/ui/SchermoPrivacy.tsx";

interface Props {
  readonly partita: Partita;
  readonly modalita: Modalita;
  readonly onEsci: () => void;
}

function nomeSeat(seat: Seat, modalita: Modalita, seatUmano: Seat): string {
  if (modalita === "locale") return `Giocatore ${seat + 1}`;
  return seat === seatUmano ? "Tu" : "Avversario";
}

export function Tavolo({ partita, modalita, onEsci }: Props) {
  const {
    stato,
    bancoVisibile,
    presa,
    spazzata,
    puoGiocare: puoGiocareStato,
    seatUmano,
    pensando,
    punti,
  } = partita;
  const [abbandonaAperto, setAbbandonaAperto] = useState(false);

  /**
   * Hot-seat ("in due", stesso device): a ogni cambio di turno lo schermo va
   * coperto finché il telefono non è passato al giocatore giusto — mai
   * contro l'AI, dove non c'è nessuna mano da nascondere all'avversario.
   * La logica di quando scattare vive in `privacyHotSeat.ts`, pura e
   * testata: qui si limita a inseguire i cambi di `stato.turno`.
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
  const seatAvversario = (seatVisibile === 0 ? 1 : 0) as Seat;
  const manoMia = stato.mani[seatVisibile] ?? [];
  const manoAvversario = stato.mani[seatAvversario] ?? [];
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

  return (
    <>
      {/* `inert` mentre lo schermo privacy è su: il contenuto sotto non deve
          essere raggiungibile né da tastiera né da uno screen reader. */}
      <main
        inert={overlayAttivo || undefined}
        className="table-felt flex h-dvh flex-col justify-between overflow-hidden px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6"
      >
        {/* Avversario */}
        <section className="flex flex-col items-center gap-2">
          <div className="flex w-full max-w-2xl items-center justify-between text-xs">
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => setAbbandonaAperto(true)}
              className="text-on-felt-muted hover:text-on-felt"
            >
              Abbandona
            </button>
            <span className="text-on-felt-muted">
              {nomeSeat(seatAvversario, modalita, seatUmano)}{" "}
              <strong className="ml-1 text-on-felt tabular-nums">
                {punti[seatAvversario] ?? 0}
              </strong>
            </span>
          </div>
          <ul className="flex gap-1.5" aria-label="Carte dell'avversario">
            {manoAvversario.map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: sono dorsi indistinguibili, l'indice è l'unica identità che abbiano — e usare la carta come chiave la rivelerebbe nel DOM
              <li key={i} className="w-12 sm:w-16">
                <CartaImg coperta />
              </li>
            ))}
          </ul>
        </section>

        {/* Tavolo */}
        <section className="relative flex flex-1 items-center justify-center py-3">
          <div className="flex min-h-[7rem] items-center gap-3 sm:min-h-[9rem] sm:gap-4">
            {bancoVisibile.length === 0 ? (
              <p className="text-on-felt-muted/60 text-sm">
                {finita ? "Partita finita" : "Tavolo vuoto"}
              </p>
            ) : (
              bancoVisibile.map((giocata, indice) => {
                const miaGiocata = giocata.seat === seatVisibile;
                return (
                  <div
                    key={`${giocata.seat}-${giocata.carta.seme}-${giocata.carta.rango}`}
                    style={spazzata ? { animationDelay: `${indice * 60}ms` } : undefined}
                    className={cn(
                      // Entra dal lato di chi l'ha calata, con un arco invece
                      // che una traslazione dritta.
                      miaGiocata ? "gioca-dal-basso" : "gioca-dallalto",
                      // E quando il giro si chiude, vola verso chi ha vinto —
                      // rimpiazza del tutto l'animazione d'ingresso qui sopra.
                      spazzata && (presa?.vincitore === seatVisibile ? "vola-giu" : "vola-su"),
                    )}
                  >
                    <CartaImg
                      carta={giocata.carta}
                      className={cn(
                        "w-20 transition-all duration-200 sm:w-24",
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

          {/* Mazzo e briscola */}
          <aside className="absolute top-1/2 right-0 -translate-y-1/2 flex flex-col items-center gap-1">
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
              ? `Presa di ${nomeSeat(presa.vincitore, modalita, seatVisibile)}${presa.punti > 0 ? ` · ${presa.punti} punti` : ""}`
              : pensando
                ? "Sta pensando…"
                : puoGiocare
                  ? modalita === "locale"
                    ? `Tocca a ${nomeSeat(stato.turno, modalita, seatVisibile)}`
                    : "Tocca a te"
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
            {nomeSeat(seatVisibile, modalita, seatVisibile)}{" "}
            <strong className="ml-1 text-on-felt tabular-nums">{punti[seatVisibile] ?? 0}</strong>
          </p>
        </section>

        <FinePartita partita={partita} modalita={modalita} onEsci={onEsci} />
      </main>

      {overlayAttivo && privacy.seatInAttesa !== null && (
        <SchermoPrivacy
          nomeGiocatore={nomeSeat(privacy.seatInAttesa, modalita, seatUmano)}
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
            <Button variant="destructive" onClick={onEsci} className="w-full">
              Abbandona
            </Button>
            <Button variant="outline" onClick={() => setAbbandonaAperto(false)} className="w-full">
              Annulla
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function FinePartita({ partita, modalita, onEsci }: Props) {
  const { stato, punti, vincitore } = partita;
  const finita = stato.fase === "fine";
  const pareggio = vincitore === null;

  let titolo: string;
  if (vincitore === null) {
    titolo = "Sessanta pari";
  } else if (modalita === "locale") {
    titolo = `Vince ${nomeSeat(vincitore, modalita, partita.seatUmano)}`;
  } else {
    titolo = vincitore === partita.seatUmano ? "Hai vinto" : "Hai perso";
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
          {([0, 1] as const).map((seat) => (
            <div key={seat} className="text-center">
              <p className="text-muted-foreground text-xs">
                {nomeSeat(seat, modalita, partita.seatUmano)}
              </p>
              <p
                className={cn(
                  "font-semibold text-3xl tabular-nums",
                  vincitore === seat && "text-primary",
                )}
              >
                {punti[seat] ?? 0}
              </p>
            </div>
          ))}
        </div>

        <DialogFooter className="sm:flex-col sm:gap-2">
          <Button onClick={partita.ricomincia} className="w-full">
            Rivincita
          </Button>
          <Button variant="outline" onClick={onEsci} className="w-full">
            Cambia partita
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
