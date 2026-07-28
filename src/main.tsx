import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./index.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Elemento #root non trovato in index.html");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/**
 * Il service worker rende il gioco installabile e utilizzabile offline.
 * Solo in produzione: in sviluppo servirebbe versioni vecchie dalla cache
 * mentre si lavora, che è il modo più veloce per perdere un pomeriggio.
 */
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // Niente offline: il gioco funziona lo stesso, con la rete.
    });
  });
}
