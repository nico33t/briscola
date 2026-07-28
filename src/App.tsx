import { mazzoCompleto, PUNTI } from "@/core/deck.ts";
import { CartaImg, nomeCarta } from "@/ui/Carta.tsx";

/**
 * Schermata provvisoria: mostra il mazzo appena generato, per controllare a
 * occhio che le 40 carte siano ritagliate bene e mappate al posto giusto.
 * Verrà sostituita dal tavolo vero in F3.
 */
export function App() {
  const mazzo = mazzoCompleto();

  return (
    <main className="table-felt min-h-dvh px-4 py-10 sm:px-8">
      <header className="mx-auto mb-10 max-w-5xl text-center">
        <h1 className="font-semibold text-4xl text-on-felt tracking-tight">Briscola</h1>
        <p className="mt-2 text-balance text-on-felt-muted text-sm">
          Carte piacentine · 40 carte ritagliate dall'originale in pubblico dominio
        </p>
      </header>

      <section className="mx-auto grid max-w-5xl grid-cols-5 gap-2.5 sm:grid-cols-10 sm:gap-3">
        {mazzo.map((carta) => (
          <figure key={`${carta.seme}-${carta.rango}`} className="group">
            <CartaImg
              carta={carta}
              className="transition-transform duration-150 group-hover:-translate-y-1"
            />
            <figcaption className="mt-1 text-center text-[10px] text-on-felt-muted leading-tight">
              {nomeCarta(carta)}
              {PUNTI[carta.rango] > 0 && (
                <span className="ml-1 text-brass">{PUNTI[carta.rango]}</span>
              )}
            </figcaption>
          </figure>
        ))}
      </section>

      <section className="mx-auto mt-12 max-w-5xl">
        <h2 className="mb-3 text-center text-on-felt-muted text-xs uppercase tracking-widest">
          Retro
        </h2>
        <div className="mx-auto w-24">
          <CartaImg coperta />
        </div>
      </section>
    </main>
  );
}
