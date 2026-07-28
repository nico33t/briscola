import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils.ts";

/**
 * Router minimo basato sull'hash.
 *
 * Perché fatto a mano e non react-router: le rotte sono una manciata e piatte,
 * senza annidamenti né caricamento dati. E l'hash non richiede regole di rewrite
 * sull'hosting statico — un `/carte` ricaricato a mano darebbe 404 senza
 * configurare il server, `#/carte` no.
 *
 * Se un giorno servissero rotte annidate o URL puliti, si sostituisce qui: il
 * resto dell'app conosce solo `useRotta`, `Link` e `vaiA`.
 */

/** Porta un hash grezzo a un percorso normalizzato che inizia con `/`. */
export function normalizzaHash(hash: string): string {
  const grezzo = hash.startsWith("#") ? hash.slice(1) : hash;
  if (grezzo === "" || grezzo === "/") return "/";
  const conBarra = grezzo.startsWith("/") ? grezzo : `/${grezzo}`;
  return conBarra.length > 1 && conBarra.endsWith("/") ? conBarra.slice(0, -1) : conBarra;
}

function percorsoCorrente(): string {
  return normalizzaHash(window.location.hash);
}

function iscriviti(avvisa: () => void): () => void {
  window.addEventListener("hashchange", avvisa);
  return () => window.removeEventListener("hashchange", avvisa);
}

/** Il percorso corrente. Si aggiorna da solo al cambio di hash. */
export function useRotta(): string {
  return useSyncExternalStore(iscriviti, percorsoCorrente, () => "/");
}

export function vaiA(percorso: string): void {
  window.location.hash = percorso;
}

interface PropsLink {
  readonly a: string;
  readonly children: ReactNode;
  readonly className?: string;
}

/** Un collegamento interno. Resta un `<a>` vero: apribile in una nuova scheda. */
export function Link({ a, children, className }: PropsLink) {
  return (
    <a href={`#${a}`} className={cn("transition-colors", className)}>
      {children}
    </a>
  );
}
