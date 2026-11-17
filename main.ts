// Vice Harbor — entry program for the make.fun gta6-01 bounty.
//
// Runs as-is with plain `node main.ts` (Node 24 type-stripping: no build
// step, no dependencies beyond the Node standard library and the vendored
// make.fun game library). It validates the entry, copies game/ and
// screenshots/ into the output directory, builds the dossier from those
// copies with buildDossier, and writes it to <out>/dossier.json.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { buildDossier } from './vendor/makefun-game.ts';

/** Where the packaged entry goes: MAKEFUN_OUTPUT_DIR, or ./out by default. */
const OUT_DIR = process.env.MAKEFUN_OUTPUT_DIR || 'out';
/** The repository root this program runs from. */
const ROOT = process.cwd();

/** Preflight caps, mirroring the bounty's gate. */
const MAX_SCREENSHOT_BYTES = 256 * 1024; // 256 KiB per screenshot
const MAX_GAME_BYTES = 48 * 1024 * 1024; // 48 MiB across all of game/
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png']);

/** Refuse the run, naming the preflight check that failed. */
function fail(check: string, detail: string): never {
  throw new Error(`preflight failed [${check}]: ${detail}`);
}

/** Every file under dir, as paths relative to dir, in directory order. */
function walkFiles(dir: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) out.push(...walkFiles(join(dir, entry.name), rel));
    else if (entry.isFile()) out.push(rel);
  }
  return out;
}

/** The game must ship its page: game/index.html, a real file. */
function checkIndexHtml(): void {
  const page = join(ROOT, 'game', 'index.html');
  if (!existsSync(page) || !statSync(page).isFile()) {
    fail('game/index.html', 'the game page is missing');
  }
}

/** screenshots/ must hold 3–4 image files, each at most 256 KiB. */
function checkScreenshots(): string[] {
  const dir = join(ROOT, 'screenshots');
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    fail('screenshots/', 'the screenshots directory is missing');
  }
  const images = readdirSync(dir)
    .filter((name) => IMAGE_EXTENSIONS.has(extname(name).toLowerCase()))
    .sort();
  if (images.length < 3 || images.length > 4) {
    fail('screenshots/', `expected 3-4 image files, found ${images.length}`);
  }
  for (const name of images) {
    const bytes = statSync(join(dir, name)).size;
    if (bytes > MAX_SCREENSHOT_BYTES) {
      fail('screenshots/', `${name} is ${bytes} bytes, over the ${MAX_SCREENSHOT_BYTES}-byte cap`);
    }
  }
  return images;
}

/** game/ as a whole must stay within the 48 MiB cap; returns its file count and total size. */
function checkGameSize(): { files: number; bytes: number } {
  const dir = join(ROOT, 'game');
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    fail('game/', 'the game directory is missing');
  }
  const files = walkFiles(dir);
  let bytes = 0;
  for (const rel of files) bytes += statSync(join(dir, rel)).size;
  if (bytes > MAX_GAME_BYTES) {
    fail('game/', `game files total ${bytes} bytes, over the ${MAX_GAME_BYTES}-byte cap`);
  }
  return { files: files.length, bytes };
}

/**
 * Package the entry: run the preflight checks, copy game/ and screenshots/
 * into the output directory, then build the dossier from the copies (the
 * scorer rebuilds it from exactly these files) and write dossier.json
 * beside them.
 */
function main(): void {
  checkIndexHtml();
  const shots = checkScreenshots();
  const game = checkGameSize();

  mkdirSync(OUT_DIR, { recursive: true });
  cpSync(join(ROOT, 'game'), join(OUT_DIR, 'game'), { recursive: true });
  cpSync(join(ROOT, 'screenshots'), join(OUT_DIR, 'screenshots'), { recursive: true });

  const dossier = buildDossier(OUT_DIR, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
  });
  writeFileSync(join(OUT_DIR, 'dossier.json'), dossier);

  const copied = game.files + shots.length;
  console.log(
    `vice-harbor: copied ${copied} files (game ${game.bytes} bytes, ${shots.length} screenshots) to ${OUT_DIR}; dossier.json ${dossier.byteLength} bytes`,
  );
}

main();
