// Build the static site that OCI-2 serves: OCI-2 pulls main every 2 minutes and nginx serves dist/ when dist/index.html exists.
// dist/ = public/* + content/ (docs/, tests/, server/ are never copied, so drafts and answer-key notes stay unpublished).
import { rm, cp, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const entry of await readdir(path.join(root, 'public'))) {
  await cp(path.join(root, 'public', entry), path.join(dist, entry), { recursive: true });
}
await cp(path.join(root, 'content'), path.join(dist, 'content'), { recursive: true });
console.log('dist/ built from public/ + content/');
