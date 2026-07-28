# 🃏 Briscola

Gioco di **Briscola** con **carte piacentine**, nel browser. Offline-first, senza account,
senza pubblicità, senza raccolta dati.

### ▶️ Gioca ora: **[briscola.pages.dev](https://briscola.pages.dev)**

> **Stato:** ci si gioca. 1v1 contro il computer o in due sullo stesso device.
> In arrivo: livello Esperto con ricerca Monte Carlo, variante 2v2, partita con un amico via QR.
> Il diario delle decisioni è in [`CHANGELOG.md`](./CHANGELOG.md).

## Come si gioca

- **Contro l'AI** — avversario Monte Carlo (ISMCTS) che non vede le tue carte e gioca sul serio
- **In locale** — due o quattro persone sullo stesso device
- **Con un amico vicino** — connessione diretta peer-to-peer scambiando un QR: nessun server,
  funziona anche senza internet

Varianti: **1v1** e **2v2 a coppie**.

## Stack

Vite · React 19 · TypeScript · Tailwind v4 · shadcn/ui · Vitest · WebRTC · PWA

## Comandi

```bash
npm install
npm run dev          # dev server
npm run check        # lint + typecheck + test + build
npm run cards:build  # genera le 40 carte dall'immagine sorgente
```

## Documentazione

| File | Cosa contiene |
|---|---|
| [`CHANGELOG.md`](./CHANGELOG.md) | Storia delle versioni e delle decisioni prese |
| [`ASSETS.md`](./ASSETS.md) | Origine e licenza di ogni asset |
| [`LICENSE`](./LICENSE) | MIT |

## Licenza

Codice: **MIT** © 2026 Nicola Tomassini — vedi [`LICENSE`](./LICENSE).

Le carte derivano da [Carte piacentine al completo](https://commons.wikimedia.org/wiki/File:Carte_piacentine_al_completo.jpg)
di *Florixc*, rilasciata in **public domain** su Wikimedia Commons. Dettagli in [`ASSETS.md`](./ASSETS.md).
