// Fails when the build outgrows the budget that keeps Mapped comfortably inside free hosting plans.
// The app (everything outside flags/) has the tight budget, since that is what a page load pays for. The flag SVGs are
// budgeted separately: one is fetched per question as it is shown, so they are not part of the page payload. The seas
// geometry is fetched only when a Seas game starts, so it has its own budget too.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const MAX_TOTAL = 1.5 * 1024 * 1024;
const MAX_FILE = 1024 * 1024;
const MAX_FILES = 100;
const MAX_FLAGS_TOTAL = 3 * 1024 * 1024;
const MAX_FLAG = 256 * 1024;
const MAX_FLAGS = 250;
const MAX_SEAS = 600 * 1024;

const all: { path: string; bytes: number }[] = [];
(function walk(dir: string) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else all.push({ path: path.slice(DIST.length), bytes: statSync(path).size });
  }
})(DIST);

const isFlag = (f: { path: string }) => f.path.startsWith('flags/');
const isSeas = (f: { path: string }) => /^assets\/seas\.topo-[^/]+\.json$/.test(f.path);
const files = all.filter((f) => !isFlag(f) && !isSeas(f));
const flags = all.filter(isFlag);
const seas = all.filter(isSeas);

const sum = (list: { bytes: number }[]) => list.reduce((n, f) => n + f.bytes, 0);
const total = sum(files);
const flagsTotal = sum(flags);
const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`;
for (const f of [...files].sort((a, b) => b.bytes - a.bytes).slice(0, 5)) console.log(`${kb(f.bytes).padStart(8)}  ${f.path}`);
console.log(`${kb(total).padStart(8)}  total, ${files.length} files`);
console.log(`${kb(flagsTotal).padStart(8)}  flags, ${flags.length} files`);
// Absent until something imports the seas data; the budget applies from then on.
for (const f of seas) console.log(`${kb(f.bytes).padStart(8)}  ${f.path}`);

const problems = [
  total > MAX_TOTAL && `total ${kb(total)} exceeds ${kb(MAX_TOTAL)}`,
  ...files.filter((f) => f.bytes > MAX_FILE).map((f) => `${f.path} is ${kb(f.bytes)}, over ${kb(MAX_FILE)}`),
  files.length > MAX_FILES && `${files.length} files exceeds ${MAX_FILES}`,
  flagsTotal > MAX_FLAGS_TOTAL && `flags total ${kb(flagsTotal)} exceeds ${kb(MAX_FLAGS_TOTAL)}`,
  ...flags.filter((f) => f.bytes > MAX_FLAG).map((f) => `${f.path} is ${kb(f.bytes)}, over ${kb(MAX_FLAG)}`),
  ...seas.filter((f) => f.bytes > MAX_SEAS).map((f) => `${f.path} is ${kb(f.bytes)}, over ${kb(MAX_SEAS)}`),
  seas.length > 1 && `${seas.length} seas files, expected one`,
  flags.length > MAX_FLAGS && `${flags.length} flags exceeds ${MAX_FLAGS}`,
].filter(Boolean);
if (problems.length) {
  console.error(`Size budget exceeded:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
