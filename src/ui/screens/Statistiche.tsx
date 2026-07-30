import { type ReactNode, useState } from "react";
import type { Livello } from "@/ai/euristica.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import type { Variante } from "@/core/types.ts";
import { caricaRegistroReplay, type RegistroReplayV1, trovaReplay } from "@/game/replay.ts";
import {
  type Aggregati,
  azzeraStatistiche,
  calcolaAggregati,
  caricaStatistiche,
  type EsitoPartita,
  type RecordPartita,
  type StatisticheV1,
  statisticheVuote,
  ultimePartite,
} from "@/game/statistiche.ts";
import { Link } from "@/ui/router.tsx";

const NOME_LIVELLO: Readonly<Record<Livello, string>> = {
  facile: "Facile",
  medio: "Medio",
  esperto: "Esperto",
};

const NOME_VARIANTE: Readonly<Record<Variante, string>> = {
  "1v1": "1 contro 1",
  "2v2": "In coppia",
};

const N_ULTIME = 15;

export function SchermataStatistiche() {
  const [stats, setStats] = useState<StatisticheV1>(() => caricaStatistiche());
  const [registro, setRegistro] = useState<RegistroReplayV1>(() => caricaRegistroReplay());
  const [azzeraAperto, setAzzeraAperto] = useState(false);

  const aggregati = calcolaAggregati(stats);
  const ultime = ultimePartite(stats, N_ULTIME);
  const disponibiliReplay = ultime.filter((p) => trovaReplay(registro, p.id) !== null);

  const azzera = () => {
    azzeraStatistiche();
    setStats(statisticheVuote());
    setRegistro({ versione: 1, replay: [] });
    setAzzeraAperto(false);
  };

  return (
    <main className="table-felt min-h-dvh px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link
              a="/"
              className="text-on-felt-muted text-sm hover:text-on-felt focus-visible:text-on-felt"
            >
              ← Torna al menu
            </Link>
            <h1 className="mt-3 font-semibold text-3xl text-on-felt tracking-tight sm:text-4xl">
              Statistiche
            </h1>
            <p className="mt-2 max-w-xl text-balance text-on-felt-muted text-sm">
              Tutto qui, in locale. Nessun dato lascia questo device.
            </p>
          </div>
          {stats.partite.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => setAzzeraAperto(true)}>
              Azzera statistiche
            </Button>
          )}
        </header>

        {stats.partite.length === 0 ? (
          <p className="rounded-xl border border-brass/25 bg-felt-deep/50 px-5 py-6 text-center text-on-felt-muted text-sm">
            Ancora nessuna partita registrata.{" "}
            <Link a="/gioca" className="text-brass underline underline-offset-2">
              Gioca la prima
            </Link>{" "}
            per vederla qui.
          </p>
        ) : (
          <>
            <Totali aggregati={aggregati} />
            <PerLivello aggregati={aggregati} />
            <PerVariante aggregati={aggregati} />

            {disponibiliReplay.length > 0 && (
              <Sezione titolo="Replay disponibili">
                <p className="mb-3 text-on-felt-muted text-xs">
                  Si conservano le azioni delle ultime 20 partite: quelle più vecchie restano solo
                  in statistica, senza replay.
                </p>
                <ul className="flex flex-col gap-2">
                  {disponibiliReplay.map((p) => (
                    <li key={p.id}>
                      <Link
                        a={`/replay/${p.id}`}
                        className="flex items-center justify-between rounded-lg border border-brass/25 bg-felt-deep/40 px-4 py-2.5 hover:border-brass/60 hover:bg-felt-deep/70"
                      >
                        <RigaPartita record={p} />
                        <span aria-hidden className="ml-3 shrink-0 text-brass text-xs">
                          Rivedi →
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Sezione>
            )}

            <Sezione titolo="Ultime partite">
              <ul className="flex flex-col gap-2">
                {ultime.map((p) => (
                  <li
                    key={p.id}
                    className="rounded-lg border border-white/10 bg-felt-deep/30 px-4 py-2.5"
                  >
                    <RigaPartita record={p} />
                  </li>
                ))}
              </ul>
            </Sezione>
          </>
        )}
      </div>

      <Dialog open={azzeraAperto} onOpenChange={setAzzeraAperto}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Azzerare tutte le statistiche?</DialogTitle>
            <DialogDescription>
              Cancella la cronologia delle partite e tutti i replay salvati su questo device. Non si
              può annullare.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:flex-col sm:gap-2">
            <Button variant="destructive" onClick={azzera} className="w-full">
              Azzera
            </Button>
            <Button variant="outline" onClick={() => setAzzeraAperto(false)} className="w-full">
              Annulla
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function Sezione({ titolo, children }: { readonly titolo: string; readonly children: ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 font-medium text-on-felt text-xl">{titolo}</h2>
      {children}
    </section>
  );
}

function Totali({ aggregati }: { readonly aggregati: Aggregati }) {
  const celle: readonly { etichetta: string; valore: string }[] = [
    { etichetta: "Partite giocate", valore: String(aggregati.totalePartite) },
    { etichetta: "Vinte (contro l'IA)", valore: String(aggregati.vinte) },
    { etichetta: "% vittorie", valore: formattaPercentuale(aggregati.percentualeVittorie) },
    { etichetta: "Striscia attuale", valore: String(aggregati.strisciaCorrente) },
    { etichetta: "Striscia migliore", valore: String(aggregati.strisciaMigliore) },
  ];
  return (
    <Sezione titolo="In totale">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
        {celle.map((c) => (
          <div
            key={c.etichetta}
            className="rounded-xl border border-brass/25 bg-felt-deep/50 px-3 py-3 text-center"
          >
            <p className="font-semibold text-2xl text-on-felt tabular-nums">{c.valore}</p>
            <p className="mt-0.5 text-[11px] text-on-felt-muted leading-tight">{c.etichetta}</p>
          </div>
        ))}
      </div>
      {aggregati.partiteVsAI === 0 && (
        <p className="mt-2 text-on-felt-muted/70 text-xs">
          Le percentuali e la striscia contano solo le partite contro l'IA: in hot-seat non c'è un
          "tu" da far vincere o perdere.
        </p>
      )}
    </Sezione>
  );
}

function PerLivello({ aggregati }: { readonly aggregati: Aggregati }) {
  const livelli: readonly Livello[] = ["facile", "medio", "esperto"];
  return (
    <Sezione titolo="Contro l'IA, per livello">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {livelli.map((l) => {
          const a = aggregati.perLivello[l];
          return (
            <div key={l} className="rounded-lg border border-white/10 bg-felt-deep/30 px-4 py-3">
              <p className="font-medium text-on-felt text-sm">{NOME_LIVELLO[l]}</p>
              <p className="text-on-felt-muted text-xs">
                {a.giocate === 0
                  ? "Mai giocato"
                  : `${a.vinte} vinte su ${a.giocate} · ${formattaPercentuale(a.percentuale)}`}
              </p>
            </div>
          );
        })}
      </div>
    </Sezione>
  );
}

function PerVariante({ aggregati }: { readonly aggregati: Aggregati }) {
  const varianti: readonly Variante[] = ["1v1", "2v2"];
  return (
    <Sezione titolo="Per variante">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {varianti.map((v) => {
          const a = aggregati.perVariante[v];
          return (
            <div key={v} className="rounded-lg border border-white/10 bg-felt-deep/30 px-4 py-3">
              <p className="font-medium text-on-felt text-sm">{NOME_VARIANTE[v]}</p>
              <p className="text-on-felt-muted text-xs">
                {a.totale} {a.totale === 1 ? "partita" : "partite"} in tutto
                {a.giocate > 0 &&
                  ` · ${a.vinte}/${a.giocate} vs IA (${formattaPercentuale(a.percentuale)})`}
              </p>
            </div>
          );
        })}
      </div>
    </Sezione>
  );
}

const ETICHETTA_ESITO: Readonly<Record<EsitoPartita, string>> = {
  vittoria: "Vittoria",
  sconfitta: "Sconfitta",
  pareggio: "Pareggio",
  giocata: "Giocata",
};

const VARIANTE_ESITO: Readonly<
  Record<EsitoPartita, "default" | "secondary" | "destructive" | "outline">
> = {
  vittoria: "default",
  sconfitta: "destructive",
  pareggio: "secondary",
  giocata: "outline",
};

function RigaPartita({ record }: { readonly record: RecordPartita }) {
  const data = new Date(record.data);
  const dataLeggibile = Number.isNaN(data.getTime())
    ? "data sconosciuta"
    : data.toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="flex min-w-0 items-center gap-3">
      <Badge variant={VARIANTE_ESITO[record.esito]} className="shrink-0">
        {ETICHETTA_ESITO[record.esito]}
        {record.abbandonata ? " (abbandonata)" : ""}
      </Badge>
      <div className="min-w-0">
        <p className="truncate text-on-felt text-sm">
          {NOME_VARIANTE[record.variante]}
          {record.modalita === "ai" && record.livello
            ? ` · IA ${NOME_LIVELLO[record.livello]}`
            : ""}
          {record.modalita === "locale" ? " · hot-seat" : ""}
        </p>
        <p className="text-on-felt-muted text-xs tabular-nums">
          {dataLeggibile} · {record.puntiFatti}-{record.puntiSubiti}
        </p>
      </div>
    </div>
  );
}

function formattaPercentuale(valore: number): string {
  return `${Math.round(valore * 100)}%`;
}
