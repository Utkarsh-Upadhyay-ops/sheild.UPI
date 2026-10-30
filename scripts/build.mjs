import { copyFile, cp, mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = resolve(projectRoot, 'dist');
const manifest = JSON.parse(
  await readFile(resolve(projectRoot, 'config/frontend-build.json'), 'utf8'),
);
await mkdir(outputDirectory, { recursive: true });
await cp(resolve(projectRoot, 'public'), outputDirectory, { recursive: true });
for (const [outputName, sourcePath] of Object.entries(manifest)) {
  await copyFile(resolve(projectRoot, sourcePath), resolve(outputDirectory, outputName));
}
console.log(
  `Built ${Object.keys(manifest).length} application files and public assets into dist/.`,
);
