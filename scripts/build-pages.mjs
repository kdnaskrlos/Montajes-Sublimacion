import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = resolve(process.argv[2] || resolve(root, 'dist'));
const appFile = 'Montajes-Sublimacion.html';
const download = `descargas/${appFile}`;
const app = await readFile(resolve(root, appFile), 'utf8');
const worker = await readFile(resolve(root, 'pwa/sw.js'), 'utf8');
const source = ['manifest.webmanifest'];
for (const dir of ['fonts', 'icons']) {
  for (const file of (await readdir(resolve(root, 'pwa', dir))).sort()) source.push(`${dir}/${file}`);
}

const assets = new Map(await Promise.all(source.map(async path => [path, await readFile(resolve(root, 'pwa', path))])));
const controls = `<span id="pwaAviso" role="status" hidden></span>
    <button class="btn sm" id="pwaActualizar" type="button" hidden>Actualizar</button>
    <button class="btn sm" id="pwaInstalar" type="button" hidden>Instalar aplicación</button>
    <a class="btn sm" id="pwaDescargar" href="./${download}" download="${appFile}">Descargar HTML</a>`;
const page = app
  .replace('</head>', `<meta name="montajes-pwa" content="__MONTAJES_BUILD__">
<link rel="manifest" href="./manifest.webmanifest">
<link rel="apple-touch-icon" href="./icons/plotter-180.png">
<meta name="theme-color" content="#ffffff">
</head>`)
  .replace(/<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">\n<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/[^"\n]+">/,
    '<link rel="stylesheet" href="./fonts/plus-jakarta-sans.css">')
  .replace('<!-- controles-pwa -->', controls);
if (!page.includes(controls) || !page.includes('name="montajes-pwa"') || page.includes('fonts.googleapis.com')) {
  throw new Error('No se pudo preparar el HTML de Pages a partir del archivo descargable');
}

const hash = createHash('sha256').update(page).update(app).update(worker);
for (const [path, data] of assets) hash.update(path).update(data);
const version = hash.digest('hex').slice(0, 24);
assets.set('index.html', page.replace('__MONTAJES_BUILD__', version));
assets.set(download, app);
assets.set('sw.js', worker.replace('__MONTAJES_BUILD__', version).replace('__MONTAJES_ASSETS__', JSON.stringify([...assets.keys()])));
assets.set('.nojekyll', '');
for (const [path, data] of assets) {
  const destination = resolve(out, path);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, data);
}
