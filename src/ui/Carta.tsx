import retro from "@/assets/cards/back.svg";
import { idCarta } from "@/core/deck.ts";
import type { Carta, IdCarta } from "@/core/types.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Le immagini delle 40 carte, raccolte a build time. Vite risolve il glob e
 * mette nel bundle solo i file davvero presenti: se una carta mancasse, se ne
 * accorgerebbe qui e non a schermo.
 */
const IMMAGINI = import.meta.glob<string>("@/assets/cards/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
});

const PER_ID = new Map<string, string>(
  Object.entries(IMMAGINI).map(([percorso, url]) => {
    const nome = percorso.split("/").pop()?.replace(".webp", "") ?? "";
    return [nome, url];
  }),
);

/** Nome parlato della carta, per gli screen reader. */
export function nomeCarta(carta: Carta): string {
  const articolo = carta.rango === "asso" ? "Asso" : maiuscola(carta.rango);
  return `${articolo} di ${carta.seme}`;
}

function maiuscola(testo: string): string {
  return testo.charAt(0).toUpperCase() + testo.slice(1);
}

export function urlCarta(carta: Carta): string | undefined {
  return PER_ID.get(idCarta(carta) satisfies IdCarta);
}

interface Props {
  readonly carta?: Carta | undefined;
  /** A faccia in giù: mostra il retro e non rivela nulla. */
  readonly coperta?: boolean;
  readonly className?: string;
}

/**
 * Una carta a schermo.
 *
 * Coperta di proposito o senza carta assegnata, mostra il retro: così un
 * componente che non ha il diritto di conoscere la carta non può rivelarla per
 * sbaglio.
 */
export function CartaImg({ carta, coperta = false, className }: Props) {
  const mostraRetro = coperta || !carta;
  const sorgente = mostraRetro ? retro : urlCarta(carta);
  const etichetta = mostraRetro ? "Carta coperta" : nomeCarta(carta);

  return (
    <img
      src={sorgente}
      alt={etichetta}
      draggable={false}
      className={cn(
        "aspect-[320/528] w-full select-none rounded-lg bg-white shadow-md ring-1 ring-black/15",
        className,
      )}
    />
  );
}
