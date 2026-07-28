import { Link, useRotta } from "@/ui/router.tsx";
import { SchermataCarte } from "@/ui/screens/Carte.tsx";
import { SchermataGioca } from "@/ui/screens/Gioca.tsx";
import { SchermataHome } from "@/ui/screens/Home.tsx";

export function App() {
  const rotta = useRotta();

  switch (rotta) {
    case "/":
      return <SchermataHome />;
    case "/carte":
      return <SchermataCarte />;
    case "/gioca":
      return <SchermataGioca />;
    default:
      return <NonTrovata percorso={rotta} />;
  }
}

function NonTrovata({ percorso }: { readonly percorso: string }) {
  return (
    <main className="table-felt flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-semibold text-3xl text-on-felt">Questa pagina non c'è</h1>
      <p className="text-on-felt-muted text-sm">
        <code className="rounded bg-black/25 px-1.5 py-0.5">#{percorso}</code> non porta da nessuna
        parte.
      </p>
      <Link
        a="/"
        className="mt-2 rounded-lg border border-brass/40 px-4 py-2 text-brass text-sm hover:bg-brass/10"
      >
        Torna al menu
      </Link>
    </main>
  );
}
