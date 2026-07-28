/**
 * Genera le icone dell'app: le tre carte del menu, a ventaglio sul feltro.
 *
 *   npm run icons:build
 *
 * Le carte sono le stesse che si vedono in home — asso di denari, tre di
 * bastoni, re di coppe — ritagliate dall'originale in pubblico dominio. L'icona
 * non è un disegno a parte: è letteralmente il gioco in miniatura, così chi la
 * vede sulla home del telefono riconosce subito cos'è.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const QUI = dirname(fileURLToPath(import.meta.url));
const RADICE = join(QUI, "..");
const CARTE = join(RADICE, "src/assets/cards");
const USCITA = join(RADICE, "public");

/** Gli stessi colori del tema, presi da src/index.css. */
const FELTRO = "#103c26";
const FELTRO_PROFONDO = "#012918";
const OTTONE = "#d5aa48";

/** Le tre carte della home, con la stessa inclinazione. */
const VENTAGLIO = [
  { file: "denari-asso.webp", rotazione: -16 },
  { file: "bastoni-tre.webp", rotazione: 0 },
  { file: "coppe-re.webp", rotazione: 16 },
] as const;

/** Il feltro con la stessa luce radiale del tavolo, più un filo d'ottone. */
function sfondo(lato: number, conCornice: boolean): Buffer {
  const cornice = conCornice
    ? `<rect x="${lato * 0.055}" y="${lato * 0.055}" width="${lato * 0.89}" height="${lato * 0.89}"
         rx="${lato * 0.16}" fill="none" stroke="${OTTONE}" stroke-opacity="0.5"
         stroke-width="${Math.max(2, lato * 0.012)}"/>`
    : "";

  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${lato}" height="${lato}">
    <defs>
      <radialGradient id="lume" cx="50%" cy="42%" r="72%">
        <stop offset="0%" stop-color="${FELTRO}"/>
        <stop offset="100%" stop-color="${FELTRO_PROFONDO}"/>
      </radialGradient>
    </defs>
    <rect width="${lato}" height="${lato}" fill="url(#lume)"/>
    ${cornice}
  </svg>`);
}

/**
 * Compone un'icona.
 *
 * `occupazione` è la frazione del lato che il ventaglio può prendersi: per le
 * icone `maskable` serve stare stretti, perché Android ne ritaglia i bordi in
 * qualunque forma decida il lanciatore.
 */
async function icona(lato: number, occupazione: number, conCornice: boolean): Promise<Buffer> {
  const larghezzaCarta = Math.round(lato * occupazione * 0.42);
  const altezzaCarta = Math.round(larghezzaCarta * (528 / 320));
  const passo = Math.round(larghezzaCarta * 0.62);

  const strati = await Promise.all(
    VENTAGLIO.map(async ({ file, rotazione }, indice) => {
      const carta = await sharp(join(CARTE, file))
        .resize(larghezzaCarta, altezzaCarta)
        .rotate(rotazione, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .toBuffer();
      const { width = 0, height = 0 } = await sharp(carta).metadata();
      return {
        input: carta,
        left: Math.round(lato / 2 + (indice - 1) * passo - width / 2),
        top: Math.round(lato / 2 - height / 2 + lato * 0.02),
      };
    }),
  );

  return sharp(sfondo(lato, conCornice)).composite(strati).png({ compressionLevel: 9 }).toBuffer();
}

async function main(): Promise<void> {
  await mkdir(USCITA, { recursive: true });

  const daFare = [
    { nome: "icon-192.png", lato: 192, occupazione: 0.78, cornice: true },
    { nome: "icon-512.png", lato: 512, occupazione: 0.78, cornice: true },
    // maskable: il ventaglio sta dentro la zona sicura (~80% del lato), niente
    // cornice — verrebbe tagliata via dal ritaglio del lanciatore.
    { nome: "icon-maskable-512.png", lato: 512, occupazione: 0.66, cornice: false },
    { nome: "apple-touch-icon.png", lato: 180, occupazione: 0.78, cornice: true },
  ] as const;

  for (const { nome, lato, occupazione, cornice } of daFare) {
    const dati = await icona(lato, occupazione, cornice);
    await writeFile(join(USCITA, nome), dati);
    console.info(`✓ ${nome} — ${lato}×${lato}, ${(dati.length / 1024).toFixed(1)} kB`);
  }

  // La favicon: una carta sola, che a 32 px un ventaglio è illeggibile.
  const favicon = await sharp(sfondo(64, false))
    .composite([
      {
        input: await sharp(join(CARTE, "denari-asso.webp")).resize(34, 56).toBuffer(),
        left: 15,
        top: 4,
      },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();
  await writeFile(join(USCITA, "favicon.png"), favicon);
  console.info(`✓ favicon.png — 64×64, ${(favicon.length / 1024).toFixed(1)} kB`);
}

main().catch((errore: unknown) => {
  console.error(errore);
  process.exitCode = 1;
});
