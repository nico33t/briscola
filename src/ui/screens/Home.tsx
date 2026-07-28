import { CartaImg } from "@/ui/Carta.tsx";
import { Link } from "@/ui/router.tsx";

const VOCI = [
  { a: "/gioca", titolo: "Gioca", nota: "Contro l'AI o in locale", pronto: false },
  { a: "/carte", titolo: "Le carte", nota: "Tutte e 40, con i punti", pronto: true },
  { a: "/regole", titolo: "Regole", nota: "Come si gioca a Briscola", pronto: false },
] as const;

export function SchermataHome() {
  return (
    <main className="table-felt flex min-h-dvh flex-col items-center justify-center px-6 py-12">
      <div className="flex w-full max-w-md flex-col items-center">
        <div className="mb-8 flex -space-x-8">
          <CartaImg
            carta={{ seme: "denari", rango: "asso" }}
            className="w-20 -rotate-12 origin-bottom"
          />
          <CartaImg carta={{ seme: "coppe", rango: "tre" }} className="w-20 origin-bottom" />
          <CartaImg
            carta={{ seme: "spade", rango: "re" }}
            className="w-20 rotate-12 origin-bottom"
          />
        </div>

        <h1 className="font-semibold text-5xl text-on-felt tracking-tight">Briscola</h1>
        <p className="mt-2 text-balance text-center text-on-felt-muted text-sm">
          Carte piacentine. Offline, senza account, senza pubblicità.
        </p>

        <nav className="mt-10 w-full">
          <ul className="flex flex-col gap-2.5">
            {VOCI.map((voce) => (
              <li key={voce.a}>
                {voce.pronto ? (
                  <Link
                    a={voce.a}
                    className="flex items-center justify-between rounded-xl border border-brass/25 bg-felt-deep/50 px-5 py-3.5 hover:border-brass/60 hover:bg-felt-deep/80 focus-visible:border-brass/60 focus-visible:outline-none"
                  >
                    <span>
                      <span className="block font-medium text-on-felt">{voce.titolo}</span>
                      <span className="block text-on-felt-muted text-xs">{voce.nota}</span>
                    </span>
                    <span aria-hidden className="text-brass">
                      →
                    </span>
                  </Link>
                ) : (
                  <div className="flex items-center justify-between rounded-xl border border-white/10 px-5 py-3.5 opacity-45">
                    <span>
                      <span className="block font-medium text-on-felt">{voce.titolo}</span>
                      <span className="block text-on-felt-muted text-xs">{voce.nota}</span>
                    </span>
                    <span className="text-on-felt-muted text-[10px] uppercase tracking-widest">
                      in arrivo
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </main>
  );
}
