// Fails when the build outgrows the budget that keeps Mapped comfortably inside free hosting plans.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const MAX_TOTAL = 1.5 * 1024 * 1024;
const MAX_FILE = 1024 * 1024;
const MAX_FILES = 100;

const files: { path: string; bytes: number }[] = [];
(function walk(dir: string) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else files.push({ path: path.slice(DIST.length), bytes: statSync(path).size });
  }
})(DIST);

const total = files.reduce((n, f) => n + f.bytes, 0);
const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`;
for (const f of [...files].sort((a, b) => b.bytes - a.bytes).slice(0, 5)) console.log(`${kb(f.bytes).padStart(8)}  ${f.path}`);
console.log(`${kb(total).padStart(8)}  total, ${files.length} files`);

const problems = [
  total > MAX_TOTAL && `total ${kb(total)} exceeds ${kb(MAX_TOTAL)}`,
  ...files.filter((f) => f.bytes > MAX_FILE).map((f) => `${f.path} is ${kb(f.bytes)}, over ${kb(MAX_FILE)}`),
  files.length > MAX_FILES && `${files.length} files exceeds ${MAX_FILES}`,
].filter(Boolean);
if (problems.length) {
  console.error(`Size budget exceeded:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
