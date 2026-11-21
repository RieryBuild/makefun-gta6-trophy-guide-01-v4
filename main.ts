// Vice Ledger — entry program (Node 22, standard library only).
// Copies app/ and screenshots/ from this repository into the output
// directory and writes /output/dossier.json with buildDossier from
// vendor/makefun-frontend.ts. The output directory itself is never
// removed, only its contents (the grader mounts /output).
import { copyFileSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-frontend.ts';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

function wipeContents(dir) {
  for (const entry of readdirSync(dir).sort()) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) rmSync(p, { recursive: true, force: true });
    else rmSync(p, { force: true });
  }
}

function copyTree(src, dst) {
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src).sort()) {
    const s = join(src, entry);
    const d = join(dst, entry);
    if (statSync(s).isDirectory()) copyTree(s, d);
    else copyFileSync(s, d);
  }
}

mkdirSync(outDir, { recursive: true });
wipeContents(outDir);
copyTree(join(here, 'app'), join(outDir, 'app'));
copyTree(join(here, 'screenshots'), join(outDir, 'screenshots'));
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 48 * 1024 * 1024,
  app_path_max_bytes: 1000
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log('wrote dossier.json (' + dossier.length + ' bytes) to ' + outDir);
