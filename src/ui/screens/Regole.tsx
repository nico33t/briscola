import type { ReactNode } from "react";
import { FORZA, PUNTI, RANGHI } from "@/core/deck.ts";
import type { Rango } from "@/core/types.ts";
import { CartaImg } from "@/ui/Carta.tsx";
import { Link } from "@/ui/router.tsx";

/**
 * Le regole spiegate per bene, in italiano. Contenuto statico curato — nessun
 * "componente per la regola X": è testo, con qualche carta di esempio per
 * ancorarlo a qualcosa di concreto.
 *
 * 🔴 Ogni affermazione qui deve combaciare con `core/rules.ts` e
 * `core/machine.ts`, non con una variante "di casa". Vedi AGENTS.md §3.2 e
 * §9 — se una regola sembra sbagliata, si corregge il testo o si apre un
 * dubbio, non si inventa un comportamento che il motore non implementa.
 */

const ORDINE_FORZA: readonly Rango[] = [...RANGHI].sort((a, b) => FORZA[b] - FORZA[a]);

const NOME_RANGO: Readonly<Record<Rango, string>> = {
  asso: "Asso",
  due: "Due",
  tre: "Tre",
  quattro: "Quattro",
  cinque: "Cinque",
  sei: "Sei",
  sette: "Sette",
  fante: "Fante",
  cavallo: "Cavallo",
  re: "Re",
};

export function SchermataRegole() {
  return (
    <main className="table-felt min-h-dvh px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8">
          <Link
            a="/"
            className="text-on-felt-muted text-sm hover:text-on-felt focus-visible:text-on-felt"
          >
            ← Torna al menu
          </Link>
          <h1 className="mt-3 font-semibold text-3xl text-on-felt tracking-tight sm:text-4xl">
            Le regole della Briscola
          </h1>
          <p className="mt-2 max-w-2xl text-balance text-on-felt-muted text-sm">
            Con le carte piacentine, quelle che si vedono in questo gioco. Sono esattamente le
            regole che il motore applica — niente varianti "di casa" nascoste.
          </p>
        </header>

        <Sezione titolo="Il mazzo">
          <p>
            40 carte, 4 semi — <strong className="text-on-felt">denari</strong>,{" "}
            <strong className="text-on-felt">coppe</strong>,{" "}
            <strong className="text-on-felt">bastoni</strong>,{" "}
            <strong className="text-on-felt">spade</strong> — da 10 carte l'uno: asso, due, tre,
            quattro, cinque, sei, sette, fante, cavallo, re.
          </p>
        </Sezione>

        <Sezione titolo="Quanto valgono i punti">
          <p>
            Solo cinque carte su dieci valgono punti. Le altre cinque — dal quattro al sette, più il
            due — sono "lisce": zero punti, ma tornano utili per non sprecare le carte buone.
          </p>
          <div className="mt-4 overflow-x-auto">
            <ul className="flex min-w-max gap-2.5">
              {(["asso", "tre", "re", "cavallo", "fante", "sette", "due"] as const).map((rango) => (
                <li key={rango} className="w-16 text-center sm:w-20">
                  <CartaImg carta={{ seme: "denari", rango }} />
                  <p className="mt-1 text-[11px] text-on-felt-muted">{NOME_RANGO[rango]}</p>
                  <p className="font-medium text-brass text-xs">
                    {PUNTI[rango] > 0 ? `${PUNTI[rango]} pt` : "0 pt"}
                  </p>
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-4 text-brass">
            In totale nel mazzo ci sono esattamente <strong>120 punti</strong>. È il numero da
            tenere a mente: decide quando la partita finisce.
          </p>
        </Sezione>

        <Sezione titolo="L'ordine di forza — non è lo stesso dei punti">
          <p>
            Chi prende non lo decide il valore in punti, ma la <em>forza</em> della carta, che segue
            un ordine diverso: dall'asso, il più forte, fino al due, il più debole.
          </p>
          <div className="mt-4 overflow-x-auto">
            <ol className="flex min-w-max gap-2">
              {ORDINE_FORZA.map((rango, indice) => (
                <li key={rango} className="w-14 text-center sm:w-16">
                  <span className="text-[10px] text-on-felt-muted/70">{indice + 1}ª</span>
                  <CartaImg carta={{ seme: "spade", rango }} />
                  <p className="mt-1 text-[10px] text-on-felt-muted leading-tight">
                    {NOME_RANGO[rango]}
                  </p>
                </li>
              ))}
            </ol>
          </div>
          <p className="mt-4">
            Occhio al due: vale <strong className="text-on-felt">zero punti</strong> ma è più forte
            del sette, del sei, del cinque e del quattro. Se è di briscola, prende persino un asso
            di un altro seme.
          </p>
        </Sezione>

        <Sezione titolo="La distribuzione e la briscola">
          <p>
            Si danno <strong className="text-on-felt">3 carte a testa</strong>. Poi si scopre la
            carta successiva del mazzo: il suo seme è la{" "}
            <strong className="text-brass">briscola</strong> per tutta la partita, e quella carta
            resta scoperta in fondo al mazzo — sarà l'ultima a essere pescata, non prima.
          </p>
        </Sezione>

        <Sezione titolo="Come si gioca un giro">
          <p>
            Si comincia da chi è "di mano" e si prosegue in ordine di turno. A ogni giro{" "}
            <strong className="text-on-felt">
              si può calare qualunque carta della propria mano
            </strong>
            : a differenza di giochi come il tressette, in Briscola{" "}
            <strong className="text-on-felt">non c'è obbligo di rispondere al seme</strong>. Si può
            sempre tagliare con la briscola, o scartare una carta di un seme completamente diverso.
          </p>
        </Sezione>

        <Sezione titolo="Chi vince il giro">
          <p>Le regole, in ordine:</p>
          <ol className="mt-3 flex flex-col gap-2">
            <li className="rounded-lg border border-brass/25 bg-felt-deep/40 px-4 py-3">
              <strong className="text-brass">1.</strong> Se qualcuno ha giocato una briscola, vince
              la briscola più forte sul tavolo — qualunque punteggio abbiano le altre carte.
            </li>
            <li className="rounded-lg border border-brass/25 bg-felt-deep/40 px-4 py-3">
              <strong className="text-brass">2.</strong> Se nessuno ha giocato briscola, vince la
              carta più forte del <em>seme di chi ha aperto il giro</em>.
            </li>
            <li className="rounded-lg border border-brass/25 bg-felt-deep/40 px-4 py-3">
              <strong className="text-brass">3.</strong> Una carta di un seme diverso — non
              briscola, non il seme di apertura — non prende mai, per quanti punti valga. Un asso
              calato "fuori seme" può benissimo perdere contro un due.
            </li>
          </ol>
          <p className="mt-3">
            Chi vince incassa tutte le carte del giro (e i loro punti) e apre il giro successivo.
          </p>
        </Sezione>

        <Sezione titolo="La pescata">
          <p>
            Finché il mazzo non è esaurito, dopo ogni giro si pesca una carta a testa per tornare a
            tre in mano: <strong className="text-on-felt">prima chi ha vinto il giro</strong>, poi
            gli altri in ordine di turno. La carta di briscola scoperta, rimasta in fondo al mazzo
            dall'inizio, è sempre l'ultima a essere pescata.
          </p>
        </Sezione>

        <Sezione titolo="Fine partita">
          <p>
            Quando le carte finiscono e le mani si svuotano, si contano i punti delle prese. I 120
            punti del mazzo si dividono fra le due parti:{" "}
            <strong className="text-on-felt">chi supera i 60 punti vince</strong>.{" "}
            <strong className="text-brass">60 pari è pareggio</strong> — capita, con 120 punti
            totali e due parti.
          </p>
        </Sezione>

        <Sezione titolo="Le varianti: 1 contro 1 e in coppia">
          <p>
            <strong className="text-on-felt">1 contro 1</strong>: due giocatori, ognuno gioca (e
            conta i punti) per sé. 34 carte restano nel mazzo dopo la distribuzione.
          </p>
          <p className="mt-3">
            <strong className="text-on-felt">2 contro 2, in coppia</strong>: quattro giocatori,{" "}
            <strong className="text-brass">i compagni siedono alternati</strong> attorno al tavolo —
            il primo e il terzo posto fanno squadra contro il secondo e il quarto. Il punteggio è di
            squadra: quello che prende il compagno conta come tuo. 28 carte restano nel mazzo dopo
            la distribuzione, perché ci sono più mani da servire.
          </p>
        </Sezione>

        <p className="mt-10 text-on-felt-muted/70 text-xs">
          Tutto qui: niente chiamata, niente asta, niente socio segreto. Sono le regole classiche
          della Briscola a due o quattro giocatori, quelle che il motore di gioco applica davvero.
        </p>
      </div>
    </main>
  );
}

function Sezione({ titolo, children }: { readonly titolo: string; readonly children: ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-2.5 font-medium text-on-felt text-xl">{titolo}</h2>
      <div className="flex flex-col gap-2 text-balance text-on-felt-muted text-sm leading-relaxed">
        {children}
      </div>
    </section>
  );
}
