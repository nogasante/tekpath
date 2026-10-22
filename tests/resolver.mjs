import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const base = path.join(root, specifier.slice(2));
    const file = existsSync(`${base}.ts`) ? `${base}.ts` : existsSync(`${base}.tsx`) ? `${base}.tsx` : base;
    return nextResolve(pathToFileURL(file).href, context);
  }
  return nextResolve(specifier, context);
}
