# 🃏 Briscola

Gioco di **Briscola** con **carte piacentine**, nel browser. Offline, senza account,
senza pubblicità, senza raccolta dati.

## ▶️ Gioca ora — **[briscola.pages.dev](https://briscola.pages.dev)**

> ### 🔗 https://briscola.pages.dev
>
> È l'indirizzo dove si accede e si prova il gioco. Non serve installare niente, non serve
> registrarsi: si apre il link e si gioca.
>
> Su telefono si può **aggiungere alla schermata home** e si comporta come un'app —
> a tutto schermo e funzionante anche **senza rete**.

---

## Come si gioca

- **Contro il computer** — un avversario che gioca sul serio: apre con le lisce, risparmia i
  carichi, prende quando conviene. Non vede le tue carte.
- **In due, stesso device** — ci si passa il telefono a ogni turno.
- **Con un amico lontano** *(in arrivo)* — connessione diretta scambiando un QR, senza server.

Varianti: **1v1** oggi, **2v2 a coppie** in arrivo.

La partita si salva da sé: se ricarichi la pagina per sbaglio, riprendi da dove eri.

## Cosa c'è

| Rotta | Cosa |
|---|---|
| [`/`](https://briscola.pages.dev) | Menu |
| [`/#/gioca`](https://briscola.pages.dev/#/gioca) | Nuova partita — contro il computer o in due |
| [`/#/carte`](https://briscola.pages.dev/#/carte) | Tutte e 40 le carte, con i punti e l'ordine di forza |

## Stack

Vite · React 19 · TypeScript 7 · Tailwind v4 · shadcn/ui · Vitest · PWA

## Comandi

```bash
npm install
npm run dev           # dev server
npm run check         # lint + typecheck + test + build  ← prima di ogni push
npm run cards:build   # rigenera le 40 carte dall'immagine sorgente
npm run icons:build   # rigenera le icone dell'app
```

> Non c'è CI: `npm run check` è l'unico controllo che esiste, e va lanciato a mano prima di
> ogni push.

## Licenza

Codice: **MIT** © 2026 Nicola Tomassini — vedi [`LICENSE`](./LICENSE).

Le carte derivano da [Carte piacentine al completo](https://commons.wikimedia.org/wiki/File:Carte_piacentine_al_completo.jpg)
di *Florixc*, rilasciata in **pubblico dominio** su Wikimedia Commons. Dettagli in
[`ASSETS.md`](./ASSETS.md).
