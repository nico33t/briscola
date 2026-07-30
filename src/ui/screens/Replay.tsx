import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { esito, numeroGiocatori, puntiSeat } from "@/core/machine.ts";
import { squadraDi } from "@/core/rules.ts";
import type { Carta, Seat } from "@/core/types.ts";
import { caricaRegistroReplay, ricostruisciPassi, trovaReplay } from "@/game/replay.ts";
import { caricaStatistiche, type RecordPartita } from "@/game/statistiche.ts";
import { cn } from "@/lib/utils.ts";
import { CartaImg, nomeCarta } from "@/ui/Carta.tsx";
import { Link } from "@/ui/router.tsx";

/**
 * Rigioca una partita passo-passo. Non riusa `Tavolo.tsx`: quel componente è
 * cablato su `usePartita` (timer dell'AI, schermo privacy, animazioni,
 * abbandono...), tutta roba interattiva che qui non serve. Questa è una vista
 * di sola lettura — le regole restano un'unica fonte di verità comunque,
 * perché lo stato a ogni passo lo produce `ricostruisciPassi` chiamando lo
 * stesso reducer di `core/machine.ts`, non una loro riscrittura.
 */

const VELOCITA_DEFAULT_MS = 1100;
const VELOCITA_MS: readonly { readonly etichetta: string; readonly ms: number }[] = [
  { etichetta: "1×", ms: VELOCITA_DEFAULT_MS },
  { etichetta: "2×", ms: 550 },
  { etichetta: "4×", ms: 270 },
];

interface Props {
  readonly id: string;
}

export function SchermataReplay({ id }: Props) {
  const [record] = useState<RecordPartita | null>(
    () => caricaStatistiche().partite.find((p) => p.id === id) ?? null,
  );
  const [replay] = useState(() => trovaReplay(caricaRegistroReplay(), id));

  const passi = useMemo(
    () => (replay ? ricostruisciPassi(replay.variante, replay.seed, replay.azioni) : []),
    [replay],
  );

  const [indice, setIndice] = useState(0);
  const [inPlay, setInPlay] = useState(false);
  const [velocitaMs, setVelocitaMs] = useState(VELOCITA_DEFAULT_MS);

  const ultimoIndice = passi.length - 1;

  useEffect(() => {
    if (!inPlay) return;
    if (indice >= ultimoIndice) {
      setInPlay(false);
      return;
    }
    const timer = setTimeout(() => setIndice((i) => Math.min(i + 1, ultimoIndice)), velocitaMs);
    return () => clearTimeout(timer);
  }, [inPlay, indice, ultimoIndice, velocitaMs]);

  if (!replay || passi.length === 0) {
    return (
      <main className="table-felt flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="font-semibold text-2xl text-on-felt">Replay non disponibile</h1>
        <p className="max-w-sm text-on-felt-muted text-sm">
          Questa partita non ha (più) un replay salvato: si conservano solo le ultime 20, o la
          pagina potrebbe essere stata ricaricata mentre si giocava.
        </p>
        <Link
          a="/statistiche"
          className="mt-2 rounded-lg border border-brass/40 px-4 py-2 text-brass text-sm hover:bg-brass/10"
        >
          Torna alle statistiche
        </Link>
      </main>
    );
  }

  const passo = passi[indice] ?? passi[0];
  if (!passo) return null; // passi non è mai vuoto qui: solo per noUncheckedIndexedAccess

  const giocatori = numeroGiocatori(passo.stato.variante);
  const { punti: puntiFinali, vincitore } = esito(passi[ultimoIndice]?.stato ?? passo.stato);

  return (
    <main className="table-felt min-h-dvh px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6">
          <Link
            a="/statistiche"
            className="text-on-felt-muted text-sm hover:text-on-felt focus-visible:text-on-felt"
          >
            ← Torna alle statistiche
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-2.5">
            <h1 className="font-semibold text-2xl text-on-felt tracking-tight sm:text-3xl">
              Replay
            </h1>
            <Badge variant="outline">
              {passo.stato.variante === "1v1" ? "1 contro 1" : "In coppia"}
            </Badge>
            {record && (
              <Badge variant="outline">
                {new Date(record.data).toLocaleDateString("it-IT", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </Badge>
            )}
          </div>
        </header>

        {/* Mani, rivelate: un replay non nasconde nulla, la partita è già finita. */}
        <div
          className={cn(
            "mb-4 grid gap-2.5",
            giocatori > 2 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2",
          )}
        >
          {Array.from({ length: giocatori }, (_, s) => s as Seat).map((seat) => (
            <PannelloGiocatore
              key={seat}
              seat={seat}
              giocatori={giocatori}
              mano={passo.stato.mani[seat] ?? []}
              punti={puntiSeat(passo.stato, seat)}
              diTurno={passo.stato.turno === seat && passo.stato.fase === "gioco"}
            />
          ))}
        </div>

        {/* Il tavolo: banco corrente + mazzo/briscola. */}
        <div className="mb-4 rounded-xl border border-brass/25 bg-felt-deep/50 px-4 py-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {passo.stato.banco.length === 0 ? (
                <p className="text-on-felt-muted/60 text-sm">
                  {passo.stato.fase === "fine" ? "Partita finita" : "Tavolo vuoto"}
                </p>
              ) : (
                passo.stato.banco.map((g) => (
                  <div
                    key={`${g.seat}-${g.carta.seme}-${g.carta.rango}`}
                    className="w-14 text-center"
                  >
                    <CartaImg carta={g.carta} />
                    <p className="mt-0.5 text-[10px] text-on-felt-muted">G{g.seat + 1}</p>
                  </div>
                ))
              )}
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="rounded-full border border-brass/40 px-2 py-0.5 text-[10px] text-brass capitalize">
                Briscola: {passo.stato.briscola}
              </span>
              <span className="text-[10px] text-on-felt-muted tabular-nums">
                {passo.stato.mazzo.length} nel mazzo
              </span>
            </div>
          </div>
        </div>

        {/* Descrizione del passo corrente. */}
        <p aria-live="polite" className="mb-4 min-h-5 text-center text-on-felt-muted text-sm">
          {passo.azione === null
            ? "Distribuzione iniziale."
            : `Giocatore ${passo.azione.seat + 1} gioca ${nomeCarta(passo.azione.carta)}.`}
          {passo.stato.fase === "fine" && indice === ultimoIndice && (
            <>
              {" "}
              {vincitore === null
                ? `Sessanta pari: ${puntiFinali[0]}-${puntiFinali[1]}.`
                : `Vince la squadra ${vincitore + 1}: ${puntiFinali[0]}-${puntiFinali[1]}.`}
            </>
          )}
        </p>

        {/* Controlli di navigazione. */}
        <div className="rounded-xl border border-brass/25 bg-felt-deep/50 px-4 py-4">
          <input
            type="range"
            min={0}
            max={ultimoIndice}
            value={indice}
            onChange={(e) => {
              setInPlay(false);
              setIndice(Number(e.target.value));
            }}
            className="w-full accent-brass"
            aria-label="Passo del replay"
          />
          <p className="mt-1 text-center text-on-felt-muted text-xs tabular-nums">
            Passo {indice} di {ultimoIndice}
          </p>

          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setInPlay(false);
                setIndice(0);
              }}
              disabled={indice === 0}
            >
              ⏮ Inizio
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setInPlay(false);
                setIndice((i) => Math.max(0, i - 1));
              }}
              disabled={indice === 0}
            >
              ← Indietro
            </Button>
            <Button
              size="sm"
              onClick={() => setInPlay((p) => !p)}
              disabled={indice >= ultimoIndice && !inPlay}
            >
              {inPlay ? "⏸ Pausa" : "▶ Play"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setInPlay(false);
                setIndice((i) => Math.min(ultimoIndice, i + 1));
              }}
              disabled={indice >= ultimoIndice}
            >
              Avanti →
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setInPlay(false);
                setIndice(ultimoIndice);
              }}
              disabled={indice >= ultimoIndice}
            >
              Fine ⏭
            </Button>
          </div>

          <div className="mt-3 flex items-center justify-center gap-1.5">
            <span className="text-[10px] text-on-felt-muted uppercase tracking-widest">
              Velocità
            </span>
            {VELOCITA_MS.map((v) => (
              <Button
                key={v.etichetta}
                size="xs"
                variant={velocitaMs === v.ms ? "default" : "outline"}
                onClick={() => setVelocitaMs(v.ms)}
              >
                {v.etichetta}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

function PannelloGiocatore({
  seat,
  giocatori,
  mano,
  punti,
  diTurno,
}: {
  readonly seat: Seat;
  readonly giocatori: number;
  readonly mano: readonly Carta[];
  readonly punti: number;
  readonly diTurno: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2.5",
        diTurno ? "border-brass/60 bg-felt-deep/70" : "border-white/10 bg-felt-deep/30",
      )}
    >
      <div className="mb-1.5 flex items-center justify-between">
        <p className="font-medium text-on-felt text-xs">
          Giocatore {seat + 1}
          {giocatori > 2 && (
            <span className="ml-1 font-normal text-on-felt-muted">
              · Squadra {squadraDi(seat) + 1}
            </span>
          )}
        </p>
        <span className="text-[10px] text-on-felt-muted tabular-nums">{punti} pt</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {mano.length === 0 ? (
          <span className="text-[10px] text-on-felt-muted/50">—</span>
        ) : (
          mano.map((carta) => (
            <div key={`${carta.seme}-${carta.rango}`} className="w-10">
              <CartaImg carta={carta} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
