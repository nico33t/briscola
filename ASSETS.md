# ASSETS.md — origine e licenza di ogni asset

> Registro permanente. **Nessun asset entra nel repo senza la sua riga qui.**
> Regola vincolante: vedi [`AGENTS.md`](./AGENTS.md) §5.

Il **codice** di questo repo è MIT © 2026 Nicola Tomassini (vedi [`LICENSE`](./LICENSE)).
Gli **asset** hanno la loro licenza, elencata qui sotto.

---

## Carte da gioco

| Asset | Origine | Autore | Licenza |
|---|---|---|---|
| `src/assets/cards/*.webp` (40 carte) | Ritagliate da [`Carte piacentine al completo.jpg`](https://commons.wikimedia.org/wiki/File:Carte_piacentine_al_completo.jpg) — Wikimedia Commons, 3507×2417 px | **Florixc** | **Public domain worldwide** — dichiarazione dell'autore: *"I, the copyright holder of this work, release this work into the public domain. This applies worldwide."* |

Il ritaglio è fatto da `scripts/build-cards.ts`. L'immagine sorgente **non** è versionata
(2,8 MB): lo script la scarica da Wikimedia al primo run e la mette in cache.

## Simboli dei semi

| Asset | Origine | Licenza |
|---|---|---|
| `src/assets/suits/bastoni.svg` | [`Suit Bastoni.svg`](https://commons.wikimedia.org/wiki/Category:Piacenza_deck) — Wikimedia Commons | Public domain |
| `src/assets/suits/coppe.svg` | [`Suit Coppe.svg`](https://commons.wikimedia.org/wiki/Category:Piacenza_deck) | Public domain |
| `src/assets/suits/denari.svg` | [`Suit Denari.svg`](https://commons.wikimedia.org/wiki/Category:Piacenza_deck) | Public domain |
| `src/assets/suits/spade.svg` | [`Suit Spade.svg`](https://commons.wikimedia.org/wiki/Category:Piacenza_deck) | Public domain |

## Grafiche originali

| Asset | Note | Licenza |
|---|---|---|
| `src/assets/cards/back.svg` | Retro della carta — disegno originale, motivo geometrico verde/oro | MIT © 2026 Nicola Tomassini |
| Icone PWA | Disegno originale | MIT © 2026 Nicola Tomassini |

## Font

Solo font di sistema (`font-family` con stack nativo). Nessun font incorporato, nessuna
richiesta a Google Fonts: il gioco deve funzionare offline e non deve chiamare terze parti.

---

## 🚫 Vietati

Le grafiche dei mazzi commerciali — **Modiano**, **Dal Negro**, **Masenghini** e simili —
sono opere protette da copyright e **non entrano in questo repo** in nessuna forma
(scansioni, ridisegni derivati, screenshot).

Se un asset non ha una licenza **verificabile e scritta**, non si usa.
