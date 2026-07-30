import { useState } from "react";
import type { Livello } from "@/ai/euristica.ts";
import { Button } from "@/components/ui/button.tsx";
import type { GameState, Variante } from "@/core/types.ts";
import { caricaPartita, dimenticaPartita } from "@/game/persistenza.ts";
import type { ConfigPartita, Modalita } from "@/game/usePartita.ts";
import { usePartita } from "@/game/usePartita.ts";
import { cn } from "@/lib/utils.ts";
import { CartaImg } from "@/ui/Carta.tsx";
import { Link } from "@/ui/router.tsx";
import { Tavolo } from "@/ui/Tavolo.tsx";

export function SchermataGioca() {
  /**
   * Se c'è una partita a metà salvata sul device, si riprende da lì.
   * Ricaricare la pagina per sbaglio non deve costare la partita.
   * Si legge una volta sola, al montaggio: dopo comanda lo stato in memoria.
   */
  const [ripresa] = useState(() => caricaPartita());
  const [config, setConfig] = useState<ConfigPartita | null>(ripresa?.config ?? null);

  const esci = () => {
    dimenticaPartita();
    setConfig(null);
  };

  if (!config) {
    return <Setup onGioca={setConfig} />;
  }
  return (
    <PartitaInCorso
      config={config}
      // Lo stato ripreso vale solo se è quello della configurazione ripresa:
      // premendo "Cambia partita" e ricominciando, si riparte pulito.
      statoIniziale={config === ripresa?.config ? ripresa.stato : undefined}
      onEsci={esci}
    />
  );
}

/** Montato solo a configurazione scelta, così l'hook parte con il seme giusto. */
function PartitaInCorso({
  config,
  statoIniziale,
  onEsci,
}: {
  readonly config: ConfigPartita;
  readonly statoIniziale: GameState | undefined;
  readonly onEsci: () => void;
}) {
  const partita = usePartita(config, statoIniziale);
  return <Tavolo partita={partita} modalita={config.modalita} onEsci={onEsci} />;
}

const VARIANTI: readonly { valore: Variante; titolo: string; nota: string }[] = [
  { valore: "1v1", titolo: "1 contro 1", nota: "Tu contro un solo avversario" },
  { valore: "2v2", titolo: "In coppia, 2 contro 2", nota: "Tu e un compagno contro due avversari" },
];

/** Le due modalità cambiano nome a seconda della variante, ma restano solo due:
 * "contro il computer" (un solo umano, tutti gli altri posti AI) o "hot-seat"
 * (tutti umani, ci si passa il device). Niente via di mezzo (due umani + due
 * AI nel 2v2): la scelta binaria copre i due casi richiesti, di proposito. */
function modalitaOpzioni(
  variante: Variante,
): readonly { valore: Modalita; titolo: string; nota: string }[] {
  if (variante === "1v1") {
    return [
      { valore: "ai", titolo: "Contro il computer", nota: "Un avversario che gioca sul serio" },
      {
        valore: "locale",
        titolo: "In due, stesso device",
        nota: "Ci si passa il telefono a ogni turno",
      },
    ];
  }
  return [
    {
      valore: "ai",
      titolo: "Contro il computer",
      nota: "Tu e un compagno IA contro due avversari IA",
    },
    {
      valore: "locale",
      titolo: "In quattro, stesso device",
      nota: "Ci si passa il telefono a ogni turno, in quattro",
    },
  ];
}

const LIVELLI: readonly { valore: Livello; titolo: string; nota: string }[] = [
  { valore: "facile", titolo: "Facile", nota: "Sbaglia spesso, va bene per imparare" },
  { valore: "medio", titolo: "Medio", nota: "Risparmia i carichi, taglia quando conviene" },
  {
    valore: "esperto",
    titolo: "Esperto",
    nota: "Ricerca Monte Carlo: valuta centinaia di mani possibili prima di scegliere",
  },
];

function Setup({ onGioca }: { readonly onGioca: (config: ConfigPartita) => void }) {
  const [variante, setVariante] = useState<Variante>("1v1");
  const [modalita, setModalita] = useState<Modalita>("ai");
  const [livello, setLivello] = useState<Livello>("medio");

  return (
    <main className="table-felt flex min-h-dvh flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <Link a="/" className="text-on-felt-muted text-sm hover:text-on-felt">
          ← Menu
        </Link>

        <h1 className="mt-3 font-semibold text-3xl text-on-felt tracking-tight">Nuova partita</h1>
        <p className="mt-1 text-on-felt-muted text-sm">
          {variante === "1v1" ? "Briscola 1 contro 1, 40 carte." : "Briscola in coppia, 40 carte."}
        </p>

        <fieldset className="mt-7">
          <legend className="mb-2 text-on-felt-muted text-xs uppercase tracking-widest">
            Variante
          </legend>
          <div className="flex flex-col gap-2">
            {VARIANTI.map((voce) => (
              <SceltaRiga
                key={voce.valore}
                titolo={voce.titolo}
                nota={voce.nota}
                attiva={variante === voce.valore}
                onClick={() => setVariante(voce.valore)}
              />
            ))}
          </div>
        </fieldset>

        <fieldset className="mt-6">
          <legend className="mb-2 text-on-felt-muted text-xs uppercase tracking-widest">
            Con chi
          </legend>
          <div className="flex flex-col gap-2">
            {modalitaOpzioni(variante).map((voce) => (
              <SceltaRiga
                key={voce.valore}
                titolo={voce.titolo}
                nota={voce.nota}
                attiva={modalita === voce.valore}
                onClick={() => setModalita(voce.valore)}
              />
            ))}
          </div>
        </fieldset>

        {modalita === "ai" && (
          <fieldset className="mt-6">
            <legend className="mb-2 text-on-felt-muted text-xs uppercase tracking-widest">
              Difficoltà
            </legend>
            <div className="flex flex-col gap-2">
              {LIVELLI.map((voce) => (
                <SceltaRiga
                  key={voce.valore}
                  titolo={voce.titolo}
                  nota={voce.nota}
                  attiva={livello === voce.valore}
                  onClick={() => setLivello(voce.valore)}
                />
              ))}
            </div>
            {variante === "2v2" && (
              <p className="mt-2 text-on-felt-muted/70 text-xs">
                Vale per tutti e tre gli avversari IA, compreso il tuo compagno.
              </p>
            )}
            {livello === "esperto" && (
              <p className="mt-2 text-on-felt-muted/70 text-xs">
                Ci pensa un attimo di più: la ricerca gira in un Web Worker, senza bloccare
                l'interfaccia.
              </p>
            )}
          </fieldset>
        )}

        <Button
          size="lg"
          className="mt-8 w-full"
          onClick={() =>
            onGioca({ variante, modalita, livello, seed: Math.floor(Math.random() * 0xffffffff) })
          }
        >
          Gioca
        </Button>

        <div className="mt-10 flex justify-center gap-1 opacity-60">
          <CartaImg carta={{ seme: "denari", rango: "asso" }} className="w-12" />
          <CartaImg carta={{ seme: "bastoni", rango: "tre" }} className="w-12" />
          <CartaImg carta={{ seme: "coppe", rango: "re" }} className="w-12" />
        </div>
      </div>
    </main>
  );
}

function SceltaRiga({
  titolo,
  nota,
  attiva,
  onClick,
}: {
  readonly titolo: string;
  readonly nota: string;
  readonly attiva: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={attiva}
      className={cn(
        "rounded-xl border px-4 py-3 text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass",
        attiva
          ? "border-brass/70 bg-felt-deep/80"
          : "border-white/12 hover:border-brass/35 hover:bg-felt-deep/40",
      )}
    >
      <span className="block font-medium text-on-felt text-sm">{titolo}</span>
      <span className="block text-on-felt-muted text-xs">{nota}</span>
    </button>
  );
}
