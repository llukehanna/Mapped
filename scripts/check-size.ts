// Fails when the build outgrows the budget that keeps Mapped comfortably inside free hosting plans.
// The app (everything outside flags/) has the tight budget, since that is what a page load pays for. The flag SVGs are
// budgeted separately: one is fetched per question as it is shown, so they are not part of the page payload.
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

const all: { path: string; bytes: number }[] = [];
(function walk(dir: string) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else all.push({ path: path.slice(DIST.length), bytes: statSync(path).size });
  }
})(DIST);

const isFlag = (f: { path: string }) => f.path.startsWith('flags/');
const files = all.filter((f) => !isFlag(f));
const flags = all.filter(isFlag);

const sum = (list: { bytes: number }[]) => list.reduce((n, f) => n + f.bytes, 0);
const total = sum(files);
const flagsTotal = sum(flags);
const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`;
for (const f of [...files].sort((a, b) => b.bytes - a.bytes).slice(0, 5)) console.log(`${kb(f.bytes).padStart(8)}  ${f.path}`);
console.log(`${kb(total).padStart(8)}  total, ${files.length} files`);
console.log(`${kb(flagsTotal).padStart(8)}  flags, ${flags.length} files`);

const problems = [
  total > MAX_TOTAL && `total ${kb(total)} exceeds ${kb(MAX_TOTAL)}`,
  ...files.filter((f) => f.bytes > MAX_FILE).map((f) => `${f.path} is ${kb(f.bytes)}, over ${kb(MAX_FILE)}`),
  files.length > MAX_FILES && `${files.length} files exceeds ${MAX_FILES}`,
  flagsTotal > MAX_FLAGS_TOTAL && `flags total ${kb(flagsTotal)} exceeds ${kb(MAX_FLAGS_TOTAL)}`,
  ...flags.filter((f) => f.bytes > MAX_FLAG).map((f) => `${f.path} is ${kb(f.bytes)}, over ${kb(MAX_FLAG)}`),
  flags.length > MAX_FLAGS && `${flags.length} flags exceeds ${MAX_FLAGS}`,
].filter(Boolean);
if (problems.length) {
  console.error(`Size budget exceeded:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
