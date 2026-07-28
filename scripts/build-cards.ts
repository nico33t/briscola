/**
 * Genera le 40 carte piacentine ritagliandole dall'immagine public domain di
 * Wikimedia Commons.
 *
 *   npm run cards:build
 *
 * Sorgente: "Carte piacentine al completo.jpg" di Florixc, 3507×2417 px,
 * rilasciata dall'autore in public domain worldwide.
 * https://commons.wikimedia.org/wiki/File:Carte_piacentine_al_completo.jpg
 *
 * ⚠️ La sorgente è la fotografia di un mazzo disposto sul tavolo: le carte sono
 * leggermente ruotate e a spaziatura NON uniforme. Una griglia fissa produrrebbe
 * carte storte e tagliate.
 *
 * I riquadri si ricavano invece dai **corridoi bianchi** fra una carta e
 * l'altra: prima le 4 bande orizzontali (i semi), poi dentro ognuna le 10 bande
 * verticali (i ranghi).
 *
 * Perché i corridoi e non la densità d'inchiostro: la densità sembra l'idea
 * ovvia ma è fragile. Le carte con pochi semi (il due, il quattro) sono quasi
 * tutte bianche e scendono sotto qualsiasi soglia sensata, sparendo; quelle con
 * un corridoio bianco verticale al centro (il sei, l'otto di bastoni) si
 * spezzano in due. Un corridoio *fra* due carte invece è bianco su tutta
 * l'altezza della banda, mentre dentro una carta c'è sempre almeno il bordo
 * superiore e inferiore a fare inchiostro. Con questa regola escono 10 colonne
 * esatte su tutte e quattro le righe.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const QUI = dirname(fileURLToPath(import.meta.url));
const RADICE = join(QUI, "..");
const CACHE = join(QUI, ".cache");
const SORGENTE = join(CACHE, "carte-piacentine.jpg");
const USCITA = join(RADICE, "src/assets/cards");

const URL_SORGENTE =
  "https://upload.wikimedia.org/wikipedia/commons/4/4a/Carte_piacentine_al_completo.jpg";

/** Righe dell'immagine, dall'alto. */
const SEMI = ["denari", "coppe", "bastoni", "spade"] as const;
/** Colonne dell'immagine, da sinistra. */
const RANGHI = [
  "asso",
  "due",
  "tre",
  "quattro",
  "cinque",
  "sei",
  "sette",
  "fante",
  "cavallo",
  "re",
] as const;

/** Sotto questa luminosità un pixel conta come "inchiostro". */
const SOGLIA_SCURO = 205;
/**
 * Quanto inchiostro tollerare in un corridoio prima di non considerarlo più
 * vuoto. Non zero: la scansione ha granelli e le carte sono un po' ruotate.
 * Oltre 2 il rilevamento si rompe (i corridoi interni alle figure iniziano a
 * contare come separazioni fra carte).
 */
const TOLLERANZA_CORRIDOIO = 2;
/** Dimensione finale di ogni carta. Rapporto vicino a quello di una carta vera. */
const LARGHEZZA = 320;
const ALTEZZA = 528;

interface Banda {
  readonly inizio: number;
  readonly fine: number;
}

/**
 * Trova i tratti contigui in cui il profilo ha dell'inchiostro, cioè le carte;
 * i tratti vuoti fra l'uno e l'altro sono i corridoi. Scarta i tratti troppo
 * sottili per essere una carta.
 */
function bande(profilo: readonly number[], tolleranza: number, larghezzaMinima: number): Banda[] {
  const trovate: Banda[] = [];
  let inizio: number | null = null;

  for (let i = 0; i < profilo.length; i++) {
    const acceso = (profilo[i] ?? 0) > tolleranza;
    if (acceso && inizio === null) {
      inizio = i;
    } else if (!acceso && inizio !== null) {
      if (i - inizio >= larghezzaMinima) trovate.push({ inizio, fine: i });
      inizio = null;
    }
  }
  if (inizio !== null && profilo.length - inizio >= larghezzaMinima) {
    trovate.push({ inizio, fine: profilo.length });
  }
  return trovate;
}

/** Conta i pixel scuri per riga, sull'intera larghezza. */
function profiloOrizzontale(grigio: Buffer, larghezza: number, altezza: number): number[] {
  const profilo = new Array<number>(altezza).fill(0);
  for (let y = 0; y < altezza; y++) {
    let scuri = 0;
    const base = y * larghezza;
    for (let x = 0; x < larghezza; x++) {
      if ((grigio[base + x] ?? 255) < SOGLIA_SCURO) scuri++;
    }
    profilo[y] = scuri;
  }
  return profilo;
}

/** Conta i pixel scuri per colonna, limitandosi a una banda orizzontale. */
function profiloVerticale(grigio: Buffer, larghezza: number, banda: Banda): number[] {
  const profilo = new Array<number>(larghezza).fill(0);
  for (let y = banda.inizio; y < banda.fine; y++) {
    const base = y * larghezza;
    for (let x = 0; x < larghezza; x++) {
      if ((grigio[base + x] ?? 255) < SOGLIA_SCURO) {
        profilo[x] = (profilo[x] ?? 0) + 1;
      }
    }
  }
  return profilo;
}

async function scaricaSorgente(): Promise<Buffer> {
  try {
    const inCache = await readFile(SORGENTE);
    console.info(`sorgente presa dalla cache (${(inCache.length / 1024 / 1024).toFixed(1)} MB)`);
    return inCache;
  } catch {
    console.info("scarico la sorgente da Wikimedia Commons…");
  }

  const risposta = await fetch(URL_SORGENTE, {
    headers: { "User-Agent": "briscola-build-cards/1.0 (https://github.com/nico33t/briscola)" },
  });
  if (!risposta.ok) {
    throw new Error(`download fallito: HTTP ${risposta.status}`);
  }
  const dati = Buffer.from(await risposta.arrayBuffer());
  await mkdir(CACHE, { recursive: true });
  await writeFile(SORGENTE, dati);
  console.info(`scaricata (${(dati.length / 1024 / 1024).toFixed(1)} MB)`);
  return dati;
}

async function main(): Promise<void> {
  const originale = await scaricaSorgente();

  const { data: grigio, info } = await sharp(originale)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: larghezza, height: altezza } = info;
  console.info(`sorgente: ${larghezza}×${altezza}`);

  const righe = bande(
    profiloOrizzontale(grigio, larghezza, altezza),
    larghezza * 0.005, // sulle righe serve più tolleranza: i bordi laterali sono lunghi
    altezza / 20,
  );
  if (righe.length !== SEMI.length) {
    throw new Error(`attese ${SEMI.length} righe di carte, trovate ${righe.length}`);
  }

  await mkdir(USCITA, { recursive: true });
  const manifest: Record<string, string> = {};

  for (const [indiceRiga, riga] of righe.entries()) {
    const seme = SEMI[indiceRiga];
    if (!seme) continue;

    const colonne = bande(
      profiloVerticale(grigio, larghezza, riga),
      TOLLERANZA_CORRIDOIO,
      larghezza / 40,
    );
    if (colonne.length !== RANGHI.length) {
      throw new Error(`riga "${seme}": attese ${RANGHI.length} carte, trovate ${colonne.length}`);
    }

    for (const [indiceColonna, colonna] of colonne.entries()) {
      const rango = RANGHI[indiceColonna];
      if (!rango) continue;

      // Un filo di margine: le carte sono un po' ruotate, meglio prendere
      // qualche pixel di bianco in più che tagliare un angolo della figura.
      const margine = 4;
      const left = Math.max(0, colonna.inizio - margine);
      const top = Math.max(0, riga.inizio - margine);
      const width = Math.min(larghezza - left, colonna.fine - colonna.inizio + margine * 2);
      const height = Math.min(altezza - top, riga.fine - riga.inizio + margine * 2);

      const nome = `${seme}-${rango}.webp`;
      await sharp(originale)
        .extract({ left, top, width, height })
        .resize(LARGHEZZA, ALTEZZA, {
          fit: "contain",
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        })
        .webp({ quality: 82, effort: 6 })
        .toFile(join(USCITA, nome));

      manifest[`${seme}-${rango}`] = nome;
    }
    console.info(`✓ ${seme}: 10 carte`);
  }

  await writeFile(
    join(USCITA, "manifest.json"),
    `${JSON.stringify(
      {
        fonte: URL_SORGENTE,
        autore: "Florixc",
        licenza: "public domain (Wikimedia Commons)",
        dimensioni: { larghezza: LARGHEZZA, altezza: ALTEZZA },
        carte: manifest,
      },
      null,
      2,
    )}\n`,
  );

  console.info(`\n${Object.keys(manifest).length} carte generate in src/assets/cards/`);
}

main().catch((errore: unknown) => {
  console.error(errore);
  process.exitCode = 1;
});
