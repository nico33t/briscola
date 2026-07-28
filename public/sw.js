/**
 * Service worker minimo, scritto a mano.
 *
 * Serve a due cose:
 *   1. rendere il gioco **installabile** (Chrome vuole un service worker con un
 *      gestore `fetch` per offrire "Installa app");
 *   2. farlo funzionare **offline**, che è uno dei punti del progetto.
 *
 * Niente `vite-plugin-pwa`: quello genera una lista di file da precaricare a
 * build time, e qui non serve. Le risorse hanno il nome con l'hash del
 * contenuto, quindi la cache si può popolare mentre si gioca: una volta vista,
 * una risorsa non cambia mai più.
 *
 * Strategia:
 *   - navigazioni  → rete, e se manca la rete si serve la index dalla cache;
 *   - risorse      → cache, e se manca si va in rete e si mette da parte.
 */

const CACHE = "briscola-v1";
const GUSCIO = "./index.html";

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll([GUSCIO, "./"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((chiavi) =>
        Promise.all(
          chiavi.filter((chiave) => chiave !== CACHE).map((chiave) => caches.delete(chiave)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (evento) => {
  const richiesta = evento.request;
  if (richiesta.method !== "GET") return;

  const url = new URL(richiesta.url);
  if (url.origin !== self.location.origin) return;

  // Una navigazione: si prova la rete, così un aggiornamento arriva subito.
  // Senza rete si serve il guscio dell'app — il router è a hash, quindi
  // qualsiasi rotta riparte da lì.
  if (richiesta.mode === "navigate") {
    evento.respondWith(
      fetch(richiesta)
        .then((risposta) => {
          const copia = risposta.clone();
          caches.open(CACHE).then((cache) => cache.put(GUSCIO, copia));
          return risposta;
        })
        .catch(() => caches.match(GUSCIO).then((c) => c || Response.error())),
    );
    return;
  }

  // Tutto il resto (js, css, carte): se è in cache si serve da lì, senza
  // toccare la rete. I nomi hanno l'hash del contenuto, quindi non invecchiano.
  evento.respondWith(
    caches.match(richiesta).then((inCache) => {
      if (inCache) return inCache;
      return fetch(richiesta).then((risposta) => {
        if (risposta.ok && risposta.type === "basic") {
          const copia = risposta.clone();
          caches.open(CACHE).then((cache) => cache.put(richiesta, copia));
        }
        return risposta;
      });
    }),
  );
});
