import { EyeOff } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef } from "react";

/**
 * Overlay a schermo intero per l'hot-seat: copre le carte finché il
 * telefono non è passato al giocatore giusto. Si sblocca con un doppio
 * tocco/doppio click, o da tastiera con due Invio (o due Spazio) di fila —
 * mai con un tocco solo, altrimenti basterebbe sfiorare lo schermo passando
 * il telefono per rivelare la mano.
 */

interface Props {
  readonly nomeGiocatore: string;
  readonly onSblocca: () => void;
}

/** Finestra entro cui due tocchi contano come "doppio". Oltre, si riparte da zero. */
const FINESTRA_DOPPIO_MS = 600;

export function SchermoPrivacy({ nomeGiocatore, onSblocca }: Props) {
  const ultimaAzione = useRef(0);
  const bottoneRef = useRef<HTMLButtonElement>(null);

  // Il focus va subito sull'overlay: chi naviga da tastiera deve poter
  // premere Invio due volte senza prima dover cercare l'elemento giusto.
  useEffect(() => {
    bottoneRef.current?.focus();
  }, []);

  function registraAzione() {
    const adesso = performance.now();
    if (adesso - ultimaAzione.current <= FINESTRA_DOPPIO_MS) {
      ultimaAzione.current = 0;
      onSblocca();
    } else {
      ultimaAzione.current = adesso;
    }
  }

  function onKeyDown(evento: KeyboardEvent<HTMLButtonElement>) {
    if (evento.key !== "Enter" && evento.key !== " ") return;
    // Impedisce lo scroll sullo spazio e un secondo "click" sintetico da Invio.
    evento.preventDefault();
    registraAzione();
  }

  return (
    // Il ruolo dialog+aria-modal segnala agli screen reader che il resto
    // della pagina è temporaneamente irraggiungibile — coerente con l'`inert`
    // messo dal Tavolo sul contenuto sottostante.
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Cambio turno: tocca a ${nomeGiocatore}`}
      className="fixed inset-0 z-50 bg-black animate-in fade-in-0 duration-300"
    >
      <button
        ref={bottoneRef}
        type="button"
        onClick={registraAzione}
        onKeyDown={onKeyDown}
        className="flex h-full w-full flex-col items-center justify-center gap-4 px-6 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass focus-visible:ring-inset"
      >
        <EyeOff aria-hidden="true" className="size-10 text-white/70" />
        <span className="font-semibold text-2xl text-white sm:text-3xl">
          Tocca a te, {nomeGiocatore}
        </span>
        <span className="text-sm text-white/60">
          Passa il telefono, poi doppio tocco (o doppio Invio) per sbloccare
        </span>
      </button>
    </div>
  );
}
