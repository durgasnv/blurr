import { copyFile, cp, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const source = dirname(require.resolve('@mediapipe/tasks-vision'));
const target = new URL('../public/vendor/mediapipe/', import.meta.url);
await mkdir(target, { recursive: true });
await copyFile(join(source, 'vision_bundle.js'), new URL('vision_bundle.js', target));
await cp(join(source, 'wasm'), new URL('wasm/', target), { recursive: true });
console.log('Prepared local MediaPipe runtime.');
