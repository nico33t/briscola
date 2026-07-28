import { useState } from "react";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { FORZA, mazzoCompleto, PUNTI, RANGHI, SEMI } from "@/core/deck.ts";
import type { Carta, Seme } from "@/core/types.ts";
import { CartaImg, nomeCarta } from "@/ui/Carta.tsx";
import { Link } from "@/ui/router.tsx";

type Ordine = "tradizionale" | "forza";

const NOME_SEME: Readonly<Record<Seme, string>> = {
  denari: "Denari",
  coppe: "Coppe",
  bastoni: "Bastoni",
  spade: "Spade",
};

function carteDelSeme(seme: Seme, ordine: Ordine): Carta[] {
  const carte = mazzoCompleto().filter((c) => c.seme === seme);
  if (ordine === "forza") {
    return carte.sort((a, b) => FORZA[b.rango] - FORZA[a.rango]);
  }
  return carte.sort((a, b) => RANGHI.indexOf(a.rango) - RANGHI.indexOf(b.rango));
}

/**
 * Il mazzo intero, sempre consultabile su `#/carte`.
 *
 * Non è una schermata di prova: serve a chi impara (quanto vale il tre? il
 * cavallo batte il fante?) e a noi per controllare a vista che il ritaglio
 * degli asset sia rimasto sano dopo un rigenero.
 */
export function SchermataCarte() {
  const [ordine, setOrdine] = useState<Ordine>("tradizionale");

  return (
    <main className="table-felt min-h-dvh px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8">
          <Link
            a="/"
            className="text-on-felt-muted text-sm hover:text-on-felt focus-visible:text-on-felt"
          >
            ← Torna al menu
          </Link>
          <h1 className="mt-3 font-semibold text-3xl text-on-felt tracking-tight sm:text-4xl">
            Le 40 carte piacentine
          </h1>
          <p className="mt-2 max-w-2xl text-balance text-on-felt-muted text-sm">
            L'<strong className="font-medium text-on-felt">asso</strong> vale 11, il{" "}
            <strong className="font-medium text-on-felt">tre</strong> 10, poi re 4, cavallo 3, fante
            2. Tutte insieme fanno <strong className="font-medium text-brass">120 punti</strong>:
            chi supera 60 vince.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="text-on-felt-muted text-xs uppercase tracking-widest">Ordina per</span>
            <Button
              size="sm"
              variant={ordine === "tradizionale" ? "default" : "outline"}
              onClick={() => setOrdine("tradizionale")}
            >
              Asso → Re
            </Button>
            <Button
              size="sm"
              variant={ordine === "forza" ? "default" : "outline"}
              onClick={() => setOrdine("forza")}
            >
              Forza in presa
            </Button>
          </div>

          {ordine === "forza" && (
            <p className="mt-3 max-w-2xl text-balance text-on-felt-muted text-xs">
              Attenzione: la forza <strong className="text-on-felt">non segue i punti</strong>. Il
              due di briscola non vale niente, ma prende l'asso di qualunque altro seme.
            </p>
          )}
        </header>

        {SEMI.map((seme) => (
          <section key={seme} className="mb-10">
            <h2 className="mb-3 flex items-baseline gap-2 font-medium text-on-felt text-xl">
              {NOME_SEME[seme]}
              <span className="text-on-felt-muted text-xs">10 carte</span>
            </h2>
            <ul className="grid grid-cols-5 gap-2.5 sm:grid-cols-10 sm:gap-3">
              {carteDelSeme(seme, ordine).map((carta) => (
                <li key={carta.rango}>
                  <CartaImg
                    carta={carta}
                    className="transition-transform duration-150 hover:-translate-y-1"
                  />
                  <p className="mt-1.5 text-center text-[11px] text-on-felt-muted capitalize leading-tight">
                    {carta.rango}
                  </p>
                  <p className="text-center">
                    {PUNTI[carta.rango] > 0 ? (
                      <Badge className="bg-brass/20 text-[10px] text-brass hover:bg-brass/20">
                        {PUNTI[carta.rango]} pt
                      </Badge>
                    ) : (
                      <span className="text-[10px] text-on-felt-muted/60">liscia</span>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <section className="mb-10">
          <h2 className="mb-3 font-medium text-on-felt text-xl">Il retro</h2>
          <div className="w-24 sm:w-28">
            <CartaImg coperta />
          </div>
          <p className="mt-3 max-w-2xl text-on-felt-muted text-xs">
            Disegno originale. Le facce vengono dal mazzo piacentino in{" "}
            <a
              href="https://commons.wikimedia.org/wiki/File:Carte_piacentine_al_completo.jpg"
              target="_blank"
              rel="noreferrer"
              className="text-brass underline underline-offset-2"
            >
              pubblico dominio
            </a>{" "}
            di Wikimedia Commons, ritagliate una per una.
          </p>
        </section>

        <p className="sr-only">Elenco completo: {mazzoCompleto().map(nomeCarta).join(", ")}.</p>
      </div>
    </main>
  );
}
