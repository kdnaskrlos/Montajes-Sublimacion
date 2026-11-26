import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const dir = await mkdtemp(join(tmpdir(), 'montajes-i0-'));
const app = await readFile(new URL('../Montajes-Sublimacion.html', import.meta.url));
const pagesPath = '/Montajes-Sublimacion/';
const buildScript = fileURLToPath(new URL('../scripts/build-pages.mjs', import.meta.url));
const currentBuild = join(dir, 'pages');
execFileSync(process.execPath, [buildScript, currentBuild]);
let pagesBuild = currentBuild, pagesOnline = true, previousIndex = false;
const pagesTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain',
};
let sheet;
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path.startsWith(pagesPath)) {
    if (!pagesOnline) { res.writeHead(503).end(); return; }
    const relative = path.slice(pagesPath.length) || 'index.html';
    const contentType = pagesTypes[extname(relative)];
    const build = previousIndex && relative === 'index.html' ? currentBuild : pagesBuild;
    const asset = contentType && await readFile(join(build, relative)).catch(() => null);
    if (!asset) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' }).end(asset);
    return;
  }
  const html = path === '/app' ? app :
    path === '/app-remota' ? app.toString('utf8').replace('<script>', `<script>\n${remoteAdapter}\n`) :
    path === '/hoja' ? sheet : null;
  res.writeHead(html ? 200 : 404, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = 'http://127.0.0.1:' + server.address().port;
const chrome = spawn(process.env.CHROMIUM || 'chromium', [
  '--headless', '--disable-background-networking', '--no-first-run',
  '--remote-debugging-pipe', '--user-data-dir=' + join(dir, 'profile'),
  ...process.argv.slice(2), 'about:blank',
], { env: { ...process.env, XDG_CONFIG_HOME: dir, XDG_CACHE_HOME: dir }, stdio: ['ignore', 'ignore', 'inherit', 'pipe', 'pipe'] });

const chromeClosed = new Promise(resolve => chrome.once('close', resolve));

let id = 0;
let buffer = '';
const pending = new Map();
function send(method, params = {}, sessionId) {
  const requestId = ++id;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error('CDP sin respuesta: ' + method));
    }, 12000);
    pending.set(requestId, message => {
      clearTimeout(timeout);
      if (message.error) reject(new Error(method + ': ' + message.error.message));
      else resolve(message.result);
    });
    chrome.stdio[3].write(JSON.stringify({ id: requestId, method, params, sessionId }) + '\0');
  });
}
chrome.on('error', error => {
  for (const finish of pending.values()) finish({ error });
  pending.clear();
});
chrome.stdio[3].on('error', () => {});
chrome.stdio[4].setEncoding('utf8').on('data', chunk => {
  buffer += chunk;
  const messages = buffer.split('\0');
  buffer = messages.pop();
  for (const line of messages) {
    const message = JSON.parse(line);
    pending.get(message.id)?.(message);
    pending.delete(message.id);
  }
});

async function waitFor(check, description) {
  for (let attempt = 0; attempt < 80; attempt++) {
    const value = await check();
    if (value) return value;
    await delay(100);
  }
  throw new Error('Tiempo agotado: ' + description);
}

async function page(context, path = '/app', ready = "Boolean(document.querySelector('#save.ok'))") {
  const { targetId } = await send('Target.createTarget', { browserContextId: context, url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const command = (method, params) => send(method, params, sessionId);
  const evaluate = async expression => {
    const { exceptionDetails, result } = await command('Runtime.evaluate', {
      expression, awaitPromise: true, returnByValue: true,
    });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
    return result.value;
  };
  const wait = expression => waitFor(() => evaluate(expression), expression);
  let navigations = 0;
  const navigate = async () => {
    const isFile = path.startsWith('file:');
    const url = (isFile ? path : base + path) + '?load=' + ++navigations;
    const result = await command('Page.navigate', { url });
    assert.equal(result.errorText, undefined);
    await wait(`location.href === ${JSON.stringify(url)}`);
    await wait(path === '/hoja' ? "document.readyState === 'complete' && !!document.querySelector('h1')" : ready);
  };
  await command('Network.enable');
  await command('Network.setBlockedURLs', { urls: ['https://fonts.googleapis.com/*', 'https://fonts.gstatic.com/*'] });
  await navigate();
  return {
    command, evaluate, wait, navigate,
    click: selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`),
    view: async view => {
      await evaluate(`location.hash = ${JSON.stringify(view)}`);
      await wait(`!document.querySelector('#v-${view}').hidden`);
    },
    upload: async (selector, file) => {
      const { root } = await command('DOM.getDocument');
      const { nodeId } = await command('DOM.querySelector', { nodeId: root.nodeId, selector });
      assert.ok(nodeId, selector);
      await command('DOM.setFileInputFiles', { nodeId, files: [file] });
    },
  };
}

async function newContext(downloadPath = dir) {
  const { browserContextId } = await send('Target.createBrowserContext');
  await send('Browser.setDownloadBehavior', { behavior: 'allow', browserContextId, downloadPath });
  return browserContextId;
}

async function download(prefix, carpeta = dir) {
  const name = await waitFor(async () => (await readdir(carpeta)).find(
    name => name.startsWith(prefix) && !name.endsWith('.crdownload'),
  ), prefix);
  return join(carpeta, name);
}

const imageReady = selector =>
  `[...document.querySelectorAll(${JSON.stringify(selector)})].some(img => img.complete && img.naturalWidth > 0)`;

async function seedOrder(p) {
  await p.evaluate(`{
    document.querySelector('#newName').value = 'CLIENTE FICTICIO I0';
    document.querySelector('#addForm').requestSubmit();
    const input = document.querySelector('#c-M-SM');
    input.value = '2';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }`);
  await p.wait("JSON.parse(localStorage.getItem('montajes-sub'))?.clientes[0]?.q.M?.SM === 2");
}

async function saveLot(p, name, empty = true) {
  await p.click('#btnLote');
  await p.evaluate(`
    document.querySelector('#l-nombre').value = ${JSON.stringify(name)};
    document.querySelector('#l-vaciar').checked = ${empty};
    document.querySelector('#fLote').requestSubmit();
  `);
}

let failures = 0;
async function check(name, run) {
  try {
    await run();
    console.log('OK · ' + name);
  } catch (error) {
    failures++;
    console.error('FALLO · ' + name, error);
  }
}

const stored = key => `JSON.parse(localStorage.getItem(${JSON.stringify(key)}))`;
const orderQuantity = `${stored('montajes-sub')}?.clientes[0]?.q.M?.SM`;
const lotQuantity = `${stored('montajes-lotes')}?.[0]?.clientes[0]?.q.M?.SM`;
const editCell = (id, value) => `{
  const input = document.getElementById(${JSON.stringify(id)});
  input.value = ${JSON.stringify(String(value))};
  input.dispatchEvent(new Event('input', { bubbles: true }));
}`;
const editQuantity = value => editCell('c-M-SM', value);
const beforeUnload = "window.dispatchEvent(new Event('beforeunload', { cancelable: true }))";

async function blockWrite(p, key) {
  await p.evaluate(`
    window.blockedStorageKey = ${JSON.stringify(key)};
    window.rejectedWrites = 0;
    window.originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (this === localStorage && key === window.blockedStorageKey) {
        window.rejectedWrites++;
        throw new DOMException('Cuota ficticia', 'QuotaExceededError');
      }
      return window.originalSetItem.call(this, key, value);
    };
  `);
}

const unblockWrite = p => p.evaluate('window.blockedStorageKey = null');

const remoteAdapter = `{
  window.remoteWrites = [];
  window.remoteOrders = { clientes: [{ id: 'ficticio', nombre: 'PEDIDO FICTICIO', q: { M: { SM: 2 } } }] };
  window.remoteLots = [];
  const write = (type, id, data) => new Promise((resolve, reject) => {
    window.remoteWrites.push({
      type, data, accept() {
        if (type === 'orders') window.remoteOrders = data;
        else window.remoteLots.push({ id, ...data });
        resolve();
      },
      fail: () => reject(new Error('Rechazo ficticio del adaptador')),
    });
  });
  const db = {
    doc: () => ({
      onSnapshot: callback => queueMicrotask(() => callback({ exists: true, data: () => window.remoteOrders })),
      set: data => write('orders', null, data),
    }),
    collection: () => ({
      onSnapshot: callback => queueMicrotask(() => callback({ docs: [] })),
      doc: id => ({ set: data => write('lots', id, data) }),
    }),
  };
  window.claude = { use: async name => name === 'db' ? db : null };
}`;

const lotName = 'LOTE FICTICIO I0';
const imageFile = join(dir, 'referencia-ficticia.svg');
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="24"><rect width="32" height="24" fill="purple"/></svg>';
const expectedImage = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
await writeFile(imageFile, svg);

const dataSvg = svg => 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
const secondImage = dataSvg(svg.replace('purple', 'orange'));
const toastText = "document.querySelector('#toast').textContent";
let respaldoCompleto;
function respaldoI2(editar = () => {}) {
  const cliente = { id: 'cliente-ficticio', nombre: 'PEDIDO FICTICIO I2', pedido: '2026-11-25',
    q: { M: { SM: 4 } }, img: { ref: 'pedido', nombre: 'pedido.svg' } };
  const obj = {
    app: 'Montajes Sublimación', formato: 1, exportado: '2026-11-25T12:00:00.000Z',
    datos: { clientes: [cliente], ajustes: { piezasShort: 3 }, tema: 'dark',
      loteActivo: 'lote-ficticio', portadaCli: cliente.id },
    lotes: [{ id: 'lote-ficticio', nombre: 'LOTE FICTICIO I2', fecha: '2026-11-26', creado: 1795608000000,
      portada: { ref: 'portada', nombre: 'portada.svg' }, ajustes: { piezasShort: 3 },
      clientes: [{ ...structuredClone(cliente), imgProd: { ref: 'produccion', nombre: 'producción.svg' } }],
      resumen: { clientes: 1, franelillas: 4, piezas: 8 } }],
    imagenes: { pedido: expectedImage, produccion: secondImage, portada: secondImage },
  };
  editar(obj);
  return obj;
}
const estadoRespaldo = p => p.evaluate(
  "['montajes-sub', 'montajes-lotes', 'montajes-tema'].map(k => localStorage.getItem(k))",
);
async function clavesImagenes(p) {
  return p.evaluate(`
    new Promise(resolve => {
      const open = indexedDB.open('montajes-img');
      open.onsuccess = () => {
        const tx = open.result.transaction('img');
        const keys = tx.objectStore('img').getAllKeys();
        tx.oncomplete = () => { open.result.close(); resolve(keys.result); };
      };
    })`);
}
let numeroArchivo = 0;
async function archivoI2(p, obj) {
  const archivo = join(dir, `i2-${++numeroArchivo}.json`);
  await writeFile(archivo, typeof obj === 'string' || Buffer.isBuffer(obj) ? obj : JSON.stringify(obj));
  await p.view('historial');
  await p.evaluate("document.querySelector('#toast').hidden = true");
  await p.upload('#fileResp', archivo);
}
async function importarI2(p, obj) {
  await archivoI2(p, obj);
  await p.wait("!document.querySelector('#modal').hidden && !!document.querySelector('#impOk')");
  await p.click('#impOk');
  await p.wait("document.querySelector('#modal').hidden && !document.querySelector('#toast').hidden");
}
async function rechazarI2(p, obj, mensaje) {
  await archivoI2(p, obj);
  await p.wait("!document.querySelector('#toast').hidden");
  assert.match(await p.evaluate(toastText), mensaje);
  assert.equal(await p.evaluate("document.querySelector('#modal').hidden"), true);
}

try {
  const context = await newContext();
  const p = await page(context);
  await seedOrder(p);

  await check('Carga de imagen, escritura en IndexedDB y recuperación tras recargar', async () => {
    await p.upload('#fileImg', imageFile);
    await p.wait(imageReady('#imgbox img'));
    await p.wait("Boolean(JSON.parse(localStorage.getItem('montajes-sub'))?.clientes[0]?.img?.lid)");
    const stored = await p.evaluate(`new Promise((resolve, reject) => {
      const client = JSON.parse(localStorage.getItem('montajes-sub')).clientes[0];
      const open = indexedDB.open('montajes-img');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const read = db.transaction('img').objectStore('img').get(client.img.lid);
        read.onerror = () => reject(read.error);
        read.onsuccess = () => { db.close(); resolve(read.result); };
      };
    })`);
    assert.equal(stored, expectedImage);
    await p.navigate();
    await p.wait(imageReady('#imgbox img'));
    assert.equal(await p.evaluate("document.querySelector('#imgbox img').src"), expectedImage);
  });

  await check('Creación y recuperación de lote con datos e imagen', async () => {
    await saveLot(p, lotName);
    await p.wait("JSON.parse(localStorage.getItem('montajes-sub')).clientes.length === 0");
    await p.navigate();
    await p.view('historial');
    assert.equal(await p.evaluate("document.querySelector('.lote h3').textContent"), lotName);
    await p.click('[data-la="cargar"]');
    await p.click('[data-lc]');
    await p.wait("!document.querySelector('#v-pedidos').hidden && document.querySelector('#c-M-SM')?.value === '2'");
    await p.wait(imageReady('#imgbox img'));
  });

  await check('Descarga e importación de respaldo formato 1 en un perfil limpio', async () => {
    await p.view('historial');
    await p.click('#resExp');
    const file = await download('respaldo-montajes-');
    const backup = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(backup.formato, 1);
    assert.equal(backup.lotes[0].nombre, lotName);
    for (const client of [backup.datos.clientes[0], backup.lotes[0].clientes[0]]) {
      assert.equal(backup.imagenes[client.img.ref], expectedImage);
    }
    const restored = await page(await newContext());
    assert.equal(await restored.evaluate("localStorage.getItem('montajes-sub')"), null);
    await restored.view('historial');
    await restored.upload('#fileResp', file);
    await restored.wait("Boolean(document.querySelector('#impOk'))");
    await restored.click('#impOk');
    await restored.wait("JSON.parse(localStorage.getItem('montajes-sub'))?.clientes[0]?.q.M?.SM === 2");
    await restored.navigate();
    await restored.wait(imageReady('#imgbox img'));
    assert.equal(await restored.evaluate("document.querySelector('#imgbox img').src"), expectedImage);
    await restored.view('historial');
    assert.equal(await restored.evaluate("document.querySelector('.lote h3').textContent"), lotName);
    await restored.click('[data-la="cargar"]');
    await restored.click('[data-lc]');
    await restored.wait(imageReady('#imgbox img'));
    assert.equal(await restored.evaluate("document.querySelector('#imgbox img').src"), expectedImage);
  });

  await check('Eliminación de lote confirmada y persistente tras recargar', async () => {
    await p.view('historial');
    await p.click('[data-la="borrar"]');
    await p.click('[data-ld]');
    assert.deepEqual(await p.evaluate("JSON.parse(localStorage.getItem('montajes-lotes'))"), []);
    await p.navigate();
    await p.view('historial');
    assert.equal(await p.evaluate("document.querySelectorAll('.lote').length"), 0);
  });

  await check('Generación, descarga, llamada a imprimir y PDF de la hoja', async () => {
    await p.view('produccion');
    if (await p.evaluate("Boolean(document.querySelector('#psTodos'))")) await p.click('#psTodos');
    assert.equal(await p.evaluate("document.querySelector('#dlHoja').disabled"), false);
    await p.click('#dlHoja');
    sheet = await readFile(await download('hoja-produccion-'), 'utf8');
    assert.match(sheet, /CLIENTE FICTICIO I0/);
    assert.ok(sheet.includes(expectedImage));
    const output = await page(context, '/hoja');
    await output.wait(imageReady('section img'));
    const { data } = await output.command('Page.printToPDF', { preferCSSPageSize: true, printBackground: true });
    const pdf = join(dir, 'hoja.pdf');
    await writeFile(pdf, Buffer.from(data, 'base64'));
    const text = execFileSync('pdftotext', ['-layout', pdf, '-'], { encoding: 'utf8' });
    assert.match(text, /Hoja de producción/i);
    assert.match(text, /CLIENTE FICTICIO I0/);
    assert.match(text, /Franelilla\s+2\b/i);

    // Sustituye el diálogo nativo en el iframe. La impresión a PDF se comprueba arriba.
    await p.evaluate(`
      document.addEventListener('load', event => {
        if (event.target instanceof HTMLIFrameElement && event.target.srcdoc) {
          const frame = event.target;
          frame.contentWindow.print = () => {
            window.i0Printed = {
              name: frame.contentDocument.querySelector('h2').textContent,
              image: frame.contentDocument.querySelector('section img').naturalWidth,
            };
          };
        }
      }, true);
    `);
    await p.click('#prHoja');
    await p.wait("Boolean(window.i0Printed)");
    assert.deepEqual(await p.evaluate('window.i0Printed'), { name: 'CLIENTE FICTICIO I0', image: 32 });
  });

  await check('Cuota agotada al guardar lote con la opción de vaciar pedidos', async () => {
    const isolated = await page(await newContext());
    await seedOrder(isolated);
    await blockWrite(isolated, 'montajes-lotes');
    await saveLot(isolated, 'FALLO FICTICIO I0');
    await isolated.wait("!document.querySelector('#l-error').hidden");
    assert.equal(await isolated.evaluate('window.rejectedWrites'), 1);
    const message = await isolated.evaluate("document.querySelector('.toast')?.textContent");
    assert.match(message, /No se pudo guardar el lote/);
    assert.equal(await isolated.evaluate("document.querySelector('#l-nombre').value"), 'FALLO FICTICIO I0');
    assert.equal(await isolated.evaluate("document.querySelector('#l-vaciar').checked"), true);
    assert.equal(await isolated.evaluate("localStorage.getItem('montajes-lotes')"), null);
    assert.equal(await isolated.evaluate(beforeUnload), false, 'Debe advertir antes de descartar el intento');
    await isolated.wait("document.querySelector('#save.ok')");
    await isolated.navigate();
    await isolated.view('historial');
    assert.equal(await isolated.evaluate("document.querySelectorAll('.lote').length"), 0);
    assert.equal(await isolated.evaluate(orderQuantity), 2, 'El pedido original debe seguir guardado');
  });

  await check('Pedidos pendientes tras un fallo y reintento con el último cambio', async () => {
    const isolated = await page(await newContext());
    await seedOrder(isolated);
    const original = await isolated.evaluate("localStorage.getItem('montajes-sub')");
    await blockWrite(isolated, 'montajes-sub');
    await isolated.evaluate(editQuantity(4));
    await isolated.wait("document.querySelector('#save.bad') && !document.querySelector('#reintentarGuardar').hidden");
    assert.match(await isolated.evaluate("document.querySelector('#save').textContent"), /No se pudieron guardar los pedidos/);
    assert.equal(await isolated.evaluate("localStorage.getItem('montajes-sub')"), original);
    assert.equal(await isolated.evaluate("document.querySelector('#c-M-SM').value"), '4');
    assert.equal(await isolated.evaluate(beforeUnload), false);
    await isolated.evaluate(editQuantity(5));
    await unblockWrite(isolated);
    await isolated.click('#reintentarGuardar');
    await isolated.wait(`${orderQuantity} === 5 && document.querySelector('#save.ok')`);
    await isolated.navigate();
    assert.equal(await isolated.evaluate("document.querySelector('#c-M-SM').value"), '5');
  });

  await check('Lote en curso conserva su versión guardada y admite reintento', async () => {
    const isolated = await page(await newContext());
    await seedOrder(isolated);
    await saveLot(isolated, 'LOTE EN CURSO', false);
    await isolated.wait(`${lotQuantity} === 2 && document.querySelector('#save.ok')`);
    const original = await isolated.evaluate("localStorage.getItem('montajes-lotes')");
    await blockWrite(isolated, 'montajes-lotes');
    await isolated.evaluate(editQuantity(4));
    await isolated.wait("document.querySelector('#save.bad') && document.querySelector('#lotePill.err')");
    assert.equal(await isolated.evaluate(orderQuantity), 4);
    assert.equal(await isolated.evaluate("localStorage.getItem('montajes-lotes')"), original);
    await isolated.view('historial');
    assert.equal(await isolated.evaluate("document.querySelector('.lote .stats span:last-child b').textContent"), '4');
    await unblockWrite(isolated);
    await isolated.click('#reintentarGuardar');
    await isolated.wait(`${lotQuantity} === 4 && document.querySelector('#save.ok')`);
    await isolated.navigate();
    await isolated.view('historial');
    assert.equal(await isolated.evaluate("document.querySelector('.lote .stats span:last-child b').textContent"), '8');
  });

  await check('Sobrescritura rechazada conserva lote y pedidos hasta confirmar el reintento', async () => {
    const isolated = await page(await newContext());
    await seedOrder(isolated);
    await saveLot(isolated, 'LOTE FICTICIO PARA SOBRESCRIBIR');
    await isolated.wait(`${stored('montajes-sub')}.clientes.length === 0`);
    const original = await isolated.evaluate(stored('montajes-lotes'));
    await seedOrder(isolated);
    await isolated.evaluate(editQuantity(3));
    await isolated.wait(`${orderQuantity} === 3`);
    await blockWrite(isolated, 'montajes-lotes');
    await saveLot(isolated, original[0].nombre);
    await isolated.click('#l-sob');
    await isolated.wait("!document.querySelector('#l-error').hidden");
    assert.deepEqual(await isolated.evaluate(stored('montajes-lotes')), original);
    assert.equal(await isolated.evaluate("document.querySelector('#c-M-SM').value"), '3');
    await unblockWrite(isolated);
    await isolated.click('#l-sob');
    await isolated.wait(`${stored('montajes-sub')}.clientes.length === 0 && document.querySelector('#loteForm').hidden`);
    const saved = await isolated.evaluate(stored('montajes-lotes'));
    assert.equal(saved.length, 1);
    assert.equal(saved[0].id, original[0].id);
    assert.equal(saved[0].clientes[0].q.M.SM, 3);
  });

  await check('Si se guarda el lote pero falla el vaciado, los pedidos siguen disponibles', async () => {
    const isolated = await page(await newContext());
    await seedOrder(isolated);
    await blockWrite(isolated, 'montajes-sub');
    await isolated.evaluate(editQuantity(4));
    await saveLot(isolated, 'LOTE CON VACIADO RECHAZADO');
    await isolated.wait("document.querySelector('#loteForm').hidden && document.querySelector('#save.bad')");
    assert.match(await isolated.evaluate("document.querySelector('#toast').textContent"), /guardado.*No se pudieron vaciar los pedidos/);
    assert.equal(await isolated.evaluate(lotQuantity), 4);
    assert.equal(await isolated.evaluate(orderQuantity), 2);
    assert.equal(await isolated.evaluate("document.querySelector('#c-M-SM').value"), '4');
    await unblockWrite(isolated);
    await isolated.click('#reintentarGuardar');
    await isolated.wait(`${orderQuantity} === 4 && document.querySelector('#save.ok')`);
  });

  await check('Renombrar o eliminar con escritura rechazada conserva el historial y permite reintentar', async () => {
    const isolated = await page(await newContext());
    await seedOrder(isolated);
    await saveLot(isolated, 'LOTE PARA EDITAR');
    await isolated.wait(`${lotQuantity} === 2 && document.querySelector('#loteForm').hidden`);
    await isolated.view('historial');
    const original = await isolated.evaluate("localStorage.getItem('montajes-lotes')");
    await blockWrite(isolated, 'montajes-lotes');
    await isolated.evaluate(`{
      document.querySelector('.lote h3').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      const input = document.querySelector('#lrenIn');
      input.value = 'NUEVO NOMBRE FICTICIO';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }`);
    await isolated.click('#lrenOk');
    await isolated.wait("document.querySelector('#toast').textContent.includes('No se pudo cambiar')");
    assert.equal(await isolated.evaluate("localStorage.getItem('montajes-lotes')"), original);
    assert.equal(await isolated.evaluate("document.querySelector('#lrenIn').value"), 'NUEVO NOMBRE FICTICIO');
    await unblockWrite(isolated);
    await isolated.click('#lrenOk');
    await isolated.wait("document.querySelector('.lote h3')?.textContent === 'NUEVO NOMBRE FICTICIO'");
    await isolated.evaluate("window.blockedStorageKey = 'montajes-lotes'");
    await isolated.click('[data-la="borrar"]');
    await isolated.click('[data-ld]');
    await isolated.wait("document.querySelector('#toast').textContent.includes('No se pudo eliminar')");
    assert.equal(await isolated.evaluate(`${stored('montajes-lotes')}[0].nombre`), 'NUEVO NOMBRE FICTICIO');
    assert.equal(await isolated.evaluate("document.querySelectorAll('.lote').length"), 1);
    await unblockWrite(isolated);
    await isolated.click('[data-ld]');
    await isolated.wait(`${stored('montajes-lotes')}.length === 0 && !document.querySelector('.lote')`);
  });

  await check('La imagen de un lote sigue visible tras un fallo y el reintento aplica el cambio', async () => {
    const isolated = await page(await newContext());
    await seedOrder(isolated);
    await isolated.upload('#fileImg', imageFile);
    await isolated.wait(`${stored('montajes-sub')}?.clientes[0]?.img?.lid`);
    await saveLot(isolated, 'LOTE CON IMAGEN FICTICIA');
    await isolated.wait("document.querySelector('#loteForm').hidden");
    await isolated.view('historial');
    await isolated.wait(imageReady('.lthumb img'));
    const original = await isolated.evaluate("localStorage.getItem('montajes-lotes')");
    await blockWrite(isolated, 'montajes-lotes');
    await isolated.click('[data-pdel]');
    await isolated.wait("document.querySelector('#save.bad')");
    assert.equal(await isolated.evaluate("localStorage.getItem('montajes-lotes')"), original);
    assert.equal(await isolated.evaluate("Boolean(document.querySelector('.lthumb img'))"), true);
    await unblockWrite(isolated);
    await isolated.click('#reintentarGuardar');
    await isolated.wait(`${stored('montajes-lotes')}[0].clientes[0].imgProd.none && !document.querySelector('.lthumb img')`);
  });

  await check('Recarga inmediata y cierre vacían los guardados diferidos de pedidos y lote', async () => {
    const context = await newContext();
    const isolated = await page(context);
    await seedOrder(isolated);
    await saveLot(isolated, 'LOTE DEL CICLO DE VIDA', false);
    await isolated.wait("document.querySelector('#save.ok')");
    assert.equal(await isolated.evaluate(`${editQuantity(6)} ${orderQuantity}`), 2);
    await isolated.navigate();
    assert.equal(await isolated.evaluate(orderQuantity), 6);
    assert.equal(await isolated.evaluate(lotQuantity), 6);
    await isolated.evaluate(`${editQuantity(7)}
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      delete document.visibilityState;
    `);
    assert.equal(await isolated.evaluate(orderQuantity), 7);
    assert.equal(await isolated.evaluate(lotQuantity), 7);
    assert.equal(await isolated.evaluate(`${editQuantity(8)} ${orderQuantity}`), 7);
    await isolated.command('Page.close');
    const reopened = await page(context);
    assert.equal(await reopened.evaluate(orderQuantity), 8);
    assert.equal(await reopened.evaluate(lotQuantity), 8);
  });

  await check('El adaptador asíncrono conserva la edición posterior y permite reintentar un rechazo', async () => {
    const isolated = await page(await newContext(), '/app-remota');
    await isolated.evaluate(editQuantity(4));
    await isolated.wait('window.remoteWrites.length === 1');
    await isolated.evaluate(`${editQuantity(5)} window.remoteWrites[0].accept()`);
    await isolated.wait('window.remoteWrites.length === 2');
    assert.equal(await isolated.evaluate('window.remoteOrders.clientes[0].q.M.SM'), 4);
    assert.equal(await isolated.evaluate('window.remoteWrites[1].data.clientes[0].q.M.SM'), 5);
    assert.equal(await isolated.evaluate("Boolean(document.querySelector('#save.ok'))"), false);
    await isolated.evaluate('window.remoteWrites[1].fail()');
    await isolated.wait("document.querySelector('#save.bad') && !document.querySelector('#reintentarGuardar').hidden");
    assert.equal(await isolated.evaluate("document.querySelector('#c-M-SM').value"), '5');
    await isolated.click('#reintentarGuardar');
    await isolated.wait('window.remoteWrites.length === 3');
    await isolated.evaluate('window.remoteWrites[2].accept()');
    await isolated.wait("document.querySelector('#save.ok')");
    assert.equal(await isolated.evaluate('window.remoteOrders.clientes[0].q.M.SM'), 5);
  });

  await check('Confirmar un lote asíncrono preserva los pedidos editados durante la escritura', async () => {
    const isolated = await page(await newContext(), '/app-remota');
    await saveLot(isolated, 'LOTE ASÍNCRONO');
    await isolated.wait('window.remoteWrites.length === 1');
    assert.equal(await isolated.evaluate('window.remoteWrites[0].type'), 'lots');
    await isolated.evaluate(`
      ${editQuantity(3)}
      document.querySelector('#fLote').requestSubmit();
      window.remoteWrites[0].accept();
    `);
    await isolated.wait("document.querySelector('#loteForm').hidden");
    assert.match(await isolated.evaluate("document.querySelector('#toast').textContent"), /Se conservaron los cambios/);
    assert.equal(await isolated.evaluate("document.querySelector('#c-M-SM').value"), '3');
    await isolated.wait('window.remoteWrites.length === 2');
    assert.equal(await isolated.evaluate('window.remoteWrites[1].type'), 'orders');
    await isolated.evaluate('window.remoteWrites[1].accept()');
    await isolated.wait("document.querySelector('#save.ok')");
    assert.equal(await isolated.evaluate('window.remoteLots.length'), 1);
    assert.equal(await isolated.evaluate('window.remoteOrders.clientes[0].q.M.SM'), 3);
  });

  await check('I2 · Exportación completa y restauración verificada en un navegador limpio', async () => {
    const carpeta = await mkdtemp(join(dir, "completo-"));
    const origen = await page(await newContext(carpeta));
    await seedOrder(origen);
    await origen.upload('#fileImg', imageFile);
    await origen.wait(imageReady('#imgbox img'));
    const portada = await origen.evaluate(`
      new Promise(resolve => {
        const open = indexedDB.open('montajes-img');
        open.onsuccess = () => {
          const tx = open.result.transaction('img', 'readwrite');
          tx.objectStore('img').put(${JSON.stringify(secondImage)}, 'portada-ficticia');
          tx.oncomplete = () => { open.result.close(); resolve(true); };
        };
      })`);
    assert.ok(portada);
    await saveLot(origen, 'LOTE ACTIVO FICTICIO', false);
    await origen.wait(`${stored('montajes-sub')}?.loteActivo && ${lotQuantity} === 2`);
    await origen.view('produccion');
    await origen.click('[data-cport]');
    await origen.wait(`Boolean(${stored('montajes-sub')}?.portadaCli && ${stored('montajes-lotes')}?.[0]?.portadaCli)`);
    await origen.evaluate(`{
      const pedido = ${stored('montajes-sub')};
      const historial = ${stored('montajes-lotes')};
      pedido.ajustes.piezasShort = 3;
      pedido.ajustes.listas.tela = ['Tela ficticia'];
      historial[0].clientes[0].imgProd = { lid: 'portada-ficticia', nombre: 'producción' };
      historial[0].portada = { lid: 'portada-ficticia', nombre: 'portada' };
      historial[0].portadaCli = null;
      localStorage.setItem('montajes-sub', JSON.stringify(pedido));
      localStorage.setItem('montajes-lotes', JSON.stringify(historial));
      localStorage.setItem('montajes-tema', 'dark');
    }`);
    await origen.navigate();
    await origen.view('historial');
    await origen.click('#resExp');
    await origen.wait(`/Respaldo verificado/.test(${toastText})`);
    const archivo = await download('respaldo-montajes-', carpeta);
    respaldoCompleto = JSON.parse(await readFile(archivo, 'utf8'));
    assert.equal(respaldoCompleto.formato, 1);
    assert.equal(respaldoCompleto.datos.loteActivo, respaldoCompleto.lotes[0].id);
    assert.equal(respaldoCompleto.datos.portadaCli, respaldoCompleto.datos.clientes[0].id);
    assert.equal(respaldoCompleto.datos.tema, 'dark');
    assert.equal(respaldoCompleto.imagenes[respaldoCompleto.datos.clientes[0].img.ref], expectedImage);
    assert.equal(respaldoCompleto.imagenes[respaldoCompleto.lotes[0].clientes[0].imgProd.ref], secondImage);
    assert.equal(respaldoCompleto.imagenes[respaldoCompleto.lotes[0].portada.ref], secondImage);

    const destino = await page(await newContext());
    assert.deepEqual(await estadoRespaldo(destino), [null, null, null]);
    await importarI2(destino, respaldoCompleto);
    assert.match(await destino.evaluate(toastText), /^Respaldo importado\./);
    await destino.navigate();
    await destino.wait(imageReady('#imgbox img'));
    assert.equal(await destino.evaluate("document.querySelector('#imgbox img').src"), expectedImage);
    await destino.view('historial');
    await destino.wait(imageReady('#v-historial .lthumb img'));
    assert.equal(await destino.evaluate("document.querySelector('#v-historial .lthumb img').src"), secondImage);
    const [pedidos, lotes, tema] = (await estadoRespaldo(destino)).map((x, i) => i < 2 ? JSON.parse(x) : x);
    assert.equal(pedidos.portadaCli, pedidos.clientes[0].id);
    assert.equal(pedidos.loteActivo, lotes[0].id);
    assert.equal(pedidos.ajustes.piezasShort, 3);
    assert.deepEqual(pedidos.ajustes.listas.tela, ['Tela ficticia']);
    assert.equal(tema, 'dark');
    assert.equal(await destino.evaluate("document.documentElement.dataset.theme"), 'dark');
    assert.equal(await destino.evaluate("document.querySelector('#resRec').hidden"), false);
  });

  await check('I2 · El adaptador de Claude simulado muestra la ruta local sin iniciar escrituras', async () => {
    const p = await page(await newContext(), '/app-remota');
    await importarI2(p, respaldoI2());
    assert.match(await p.evaluate(toastText), /Importa el respaldo en la aplicación descargada/);
    assert.equal(await p.evaluate('window.remoteWrites.length'), 0);
    assert.equal(await p.evaluate('window.remoteOrders.clientes[0].q.M.SM'), 2);
  });

  await check('I2 · JSON corrupto, formato ajeno y datos anidados inválidos se rechazan sin escribir', async () => {
    const p = await page(await newContext());
    await seedOrder(p);
    const antes = await estadoRespaldo(p);
    const casos = [
      ['{', /corrupto/],
      [Buffer.concat([Buffer.from('{"texto":"'), Buffer.from([0xff]), Buffer.from('"}')]), /corrupto/],
      [{ ...respaldoI2(), app: 'Aplicación ficticia' }, /no es un respaldo/],
      [{ ...respaldoI2(), formato: 7 }, /formato.*compatible/],
      [{ ...respaldoI2(), lotes: null }, /lista de lotes/],
      [respaldoI2(obj => { obj.datos.clientes[0].q.M.SM = '3'; }), /pedidos.clientes.*q.M.SM/],
      [respaldoI2(obj => { obj.datos.clientes[0].pedido = '2026-02-30'; }), /pedido/],
      [respaldoI2(obj => { obj.datos.ajustes.listas = { tela: [null] }; }), /listas.tela/],
      [respaldoI2(obj => { obj.datos.loteActivo = 'inexistente'; }), /loteActivo/],
      [respaldoI2(obj => { obj.lotes[0].resumen.piezas = {}; }), /Resumen inválido/],
      [respaldoI2(obj => { obj.lotes.push(structuredClone(obj.lotes[0])); }), /duplicado/],
    ];
    for (const [obj, mensaje] of casos) {
      await rechazarI2(p, obj, mensaje);
      assert.deepEqual(await estadoRespaldo(p), antes);
    }
  });

  await check('I2 · Se rechazan imágenes ausentes o corruptas en pedidos, producción y portadas', async () => {
    const p = await page(await newContext());
    await seedOrder(p);
    const antes = await estadoRespaldo(p);
    await rechazarI2(p, respaldoI2(obj => { delete obj.imagenes.pedido; }), /Falta la imagen/);
    await rechazarI2(p, respaldoI2(obj => { obj.imagenes.portada = null; }), /Falta la imagen.*portada/);
    await rechazarI2(p, respaldoI2(obj => { obj.imagenes.produccion = 'data:image/png;base64,AAAA'; }), /corrupta.*imgProd/);
    assert.deepEqual(await estadoRespaldo(p), antes);

    await p.upload('#fileImg', imageFile);
    await p.wait(imageReady('#imgbox img'));
    await p.wait(`Boolean(${stored('montajes-sub')}?.clientes[0]?.img?.lid)`);
    await p.evaluate(`
      new Promise(resolve => {
        const open = indexedDB.open('montajes-img');
        open.onsuccess = () => {
          const tx = open.result.transaction('img', 'readwrite');
          tx.objectStore('img').delete(${stored('montajes-sub')}.clientes[0].img.lid);
          tx.oncomplete = () => { open.result.close(); resolve(); };
        };
      })`);
    await p.view('historial');
    await p.click('#resExp');
    await p.wait(`/Falta la imagen/.test(${toastText})`);
  });

  await check('I2 · El aborto de IndexedDB deja intactos los pedidos y permite reintentar', async () => {
    const p = await page(await newContext());
    await seedOrder(p);
    const antes = await estadoRespaldo(p);
    await p.evaluate(`
      window.originalAdd = IDBObjectStore.prototype.add;
      IDBObjectStore.prototype.add = function (value, key) {
        const request = window.originalAdd.call(this, value, key);
        if (key.startsWith('ir-')) this.transaction.abort();
        return request;
      };
    `);
    await importarI2(p, respaldoI2());
    assert.match(await p.evaluate(toastText), /No se pudo guardar/);
    assert.deepEqual(await estadoRespaldo(p), antes);
    assert.deepEqual(await clavesImagenes(p), []);
    await p.evaluate('IDBObjectStore.prototype.add = window.originalAdd');
    await importarI2(p, respaldoI2());
    assert.match(await p.evaluate(toastText), /^Respaldo importado\./);
  });

  await check('I2 · Un fallo tras escribir los pedidos revierte la importación y las imágenes nuevas', async () => {
    const p = await page(await newContext());
    await seedOrder(p);
    await saveLot(p, 'LOTE PREVIO FICTICIO', false);
    await p.wait(`${stored('montajes-sub')}?.loteActivo && ${lotQuantity} === 2`);
    await p.wait("Boolean(document.querySelector('#save.ok'))");
    const antes = await estadoRespaldo(p);
    await blockWrite(p, 'montajes-lotes');
    await importarI2(p, respaldoI2());
    assert.match(await p.evaluate(toastText), /Se conservaron los datos anteriores/);
    assert.equal(await p.evaluate('window.rejectedWrites'), 1);
    assert.deepEqual(await estadoRespaldo(p), antes);
    assert.deepEqual(await clavesImagenes(p), []);
    await p.navigate();
    assert.deepEqual(await estadoRespaldo(p), antes);
    assert.equal(await p.evaluate("document.querySelector('#c-M-SM').value"), '2');
  });

  await check('I2 · Una escritura no verificable o un fallo de confirmación impiden el éxito', async () => {
    const p = await page(await newContext());
    await seedOrder(p);
    const antes = await estadoRespaldo(p);
    await p.evaluate(`
      window.originalAdd = IDBObjectStore.prototype.add;
      IDBObjectStore.prototype.add = function (value, key) {
        return key.startsWith('ir-') ? this.count() : window.originalAdd.call(this, value, key);
      };
    `);
    await importarI2(p, respaldoI2());
    assert.match(await p.evaluate(toastText), /No se pudo verificar una imagen/);
    assert.deepEqual(await estadoRespaldo(p), antes);
    assert.deepEqual(await clavesImagenes(p), []);
    await p.evaluate(`
      IDBObjectStore.prototype.add = window.originalAdd;
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (value, key) {
        const solicitud = put.call(this, value, key);
        if (key === 'respaldo:anterior') this.transaction.abort();
        return solicitud;
      };
    `);
    await importarI2(p, respaldoI2());
    assert.match(await p.evaluate(toastText), /Se conservaron los datos anteriores/);
    assert.deepEqual(await estadoRespaldo(p), antes);
    assert.deepEqual(await clavesImagenes(p), []);
  });

  await check('I2 · El diario completa la recuperación al reabrir tras un fallo de reversión', async () => {
    const p = await page(await newContext());
    await seedOrder(p);
    await p.evaluate("localStorage.setItem('montajes-tema', 'light')");
    const antes = await estadoRespaldo(p);
    await p.evaluate(`
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (value, key) {
        const solicitud = put.call(this, value, key);
        if (key === 'respaldo:anterior') this.transaction.abort();
        return solicitud;
      };
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === 'montajes-tema' && value === 'light') {
          throw new DOMException('Fallo ficticio', 'QuotaExceededError');
        }
        return setItem.call(this, key, value);
      };
    `);
    await importarI2(p, respaldoI2());
    assert.match(await p.evaluate(toastText), /copia anterior está guardada/);
    assert.ok((await clavesImagenes(p)).includes('respaldo:pendiente'));
    await p.navigate();
    assert.deepEqual(await estadoRespaldo(p), antes);
    assert.deepEqual(await clavesImagenes(p), []);
    assert.equal(await p.evaluate("document.querySelector('#c-M-SM').value"), '2');
    assert.equal(await p.evaluate("document.documentElement.dataset.theme"), 'light');
  });

  await check('I2 · Restaurar estado anterior recupera pedidos, lote activo, portada, imagen y tema tras recargar', async () => {
    const p = await page(await newContext());
    await importarI2(p, respaldoI2());
    const antes = await estadoRespaldo(p);
    await importarI2(p, respaldoI2(obj => { obj.datos.tema = 'light'; obj.datos.clientes[0].q.M.SM = 9; }));
    assert.equal(await p.evaluate(orderQuantity), 9);
    await p.navigate();
    await p.view('historial');
    await p.click('#resRec');
    await p.click('#impOk');
    await p.wait("document.querySelector('#modal').hidden");
    assert.match(await p.evaluate(toastText), /Estado anterior restaurado/);
    assert.deepEqual(await estadoRespaldo(p), antes);
    await p.navigate();
    await p.wait(imageReady('#imgbox img'));
    assert.equal(await p.evaluate("document.querySelector('#imgbox img').src"), expectedImage);
    assert.equal(await p.evaluate("document.documentElement.dataset.theme"), 'dark');
  });

  await check('I2 · Reimportar la misma copia conserva el total de lotes y reutiliza las imágenes', async () => {
    const p = await page(await newContext());
    const obj = respaldoCompleto || respaldoI2();
    await importarI2(p, obj);
    const [pedido, lotes] = (await estadoRespaldo(p)).slice(0, 2).map(JSON.parse);
    const claves = await clavesImagenes(p);
    const antes = await estadoRespaldo(p);
    await importarI2(p, obj);
    assert.deepEqual(await estadoRespaldo(p), antes);
    const [repetido, historial] = (await estadoRespaldo(p)).slice(0, 2).map(JSON.parse);
    assert.deepEqual(historial, lotes);
    assert.deepEqual(repetido.clientes, pedido.clientes);
    assert.equal(repetido.loteActivo, pedido.loteActivo);
    assert.deepEqual(await clavesImagenes(p), claves);
    await p.click('#resRec');
    await p.click('#impOk');
    await p.wait("document.querySelector('#modal').hidden");
    assert.deepEqual(await estadoRespaldo(p), [null, null, null]);
  });

  await check('I2 · Respaldo original formato 1 con imágenes L:, U: y D: conserva los datos', async () => {
    const p = await page(await newContext());
    await seedOrder(p);
    await saveLot(p, 'LOTE LOCAL ANTES DEL FORMATO 1', false);
    await p.wait(`${stored('montajes-sub')}?.loteActivo && document.querySelector('#save.ok')`);
    const previo = JSON.parse((await estadoRespaldo(p))[1])[0];
    await p.click('#themeBtn');
    const tema = (await estadoRespaldo(p))[2];
    const antiguo = respaldoI2(obj => {
      delete obj.datos.loteActivo;
      delete obj.datos.portadaCli;
      delete obj.datos.tema;
      for (const [img, ref] of [
        [obj.datos.clientes[0].img, 'L:imagen-ficticia'],
        [obj.lotes[0].clientes[0].img, 'L:imagen-ficticia'],
        [obj.lotes[0].clientes[0].imgProd, 'D:produccion-ficticia'],
        [obj.lotes[0].portada, 'U:https://example.invalid/portada-ficticia.svg'],
      ]) {
        obj.imagenes[ref] = obj.imagenes[img.ref];
        img.ref = ref;
      }
      for (const key of ['pedido', 'produccion', 'portada']) delete obj.imagenes[key];
      obj.datos.clientes[0].q.M.MC = 0.5;
      obj.datos.clientes[0].q.M.L = -1;
    });
    await importarI2(p, antiguo);
    const [datos, lotes, nuevoTema] = await estadoRespaldo(p);
    assert.equal(JSON.parse(datos).loteActivo, null);
    assert.equal(JSON.parse(datos).clientes[0].q.M.MCU, 1);
    assert.equal(JSON.parse(datos).clientes[0].q.M.MCP, undefined);
    assert.equal(JSON.parse(datos).clientes[0].q.M.L, -1);
    assert.equal(JSON.parse(lotes).length, 2);
    assert.deepEqual(JSON.parse(lotes)[0], previo);
    assert.equal(nuevoTema, tema);
    await p.navigate();
    await p.wait(imageReady('#imgbox img'));
    await p.view('historial');
    await p.wait(imageReady('.lthumb img'));
  });

  await check('I2 · Un lote activo importado se vincula a su copia y los lotes previos quedan aislados', async () => {
    const p = await page(await newContext());
    await seedOrder(p);
    await saveLot(p, 'LOTE PREEXISTENTE FICTICIO', false);
    await p.wait(`${stored('montajes-sub')}?.loteActivo && ${lotQuantity} === 2 && document.querySelector('#save.ok')`);
    const previo = JSON.parse((await estadoRespaldo(p))[1])[0];
    const obj = respaldoI2(respaldo => {
      respaldo.lotes[0].id = respaldo.datos.loteActivo = previo.id;
      respaldo.lotes[0].nombre = previo.nombre;
      respaldo.lotes[0].creado = previo.creado;
      respaldo.lotes[0].clientes[0].id = respaldo.datos.clientes[0].id = previo.clientes[0].id;
      respaldo.datos.portadaCli = previo.clientes[0].id;
    });
    await importarI2(p, obj);
    const [pedido, lotes] = (await estadoRespaldo(p)).slice(0, 2).map(JSON.parse);
    assert.notEqual(pedido.loteActivo, previo.id);
    assert.notEqual(pedido.clientes[0].id, previo.clientes[0].id);
    assert.equal(lotes.length, 2);
    const nuevo = lotes.find(l => l.id === pedido.loteActivo);
    assert.ok(nuevo);
    await p.view('pedidos');
    await p.evaluate(editQuantity(11));
    await p.wait(`${stored('montajes-lotes')}.find(l => l.id === ${JSON.stringify(nuevo.id)}).clientes[0].q.M.SM === 11`);
    await importarI2(p, obj);
    assert.equal(JSON.parse((await estadoRespaldo(p))[0]).loteActivo, null);
    await p.view('pedidos');
    await p.click('#noimg');
    await p.wait(`${stored('montajes-sub')}.clientes[0].img === null`);
    const historial = JSON.parse((await estadoRespaldo(p))[1]);
    assert.equal(historial.length, 2);
    assert.deepEqual(historial[0], previo);
    assert.equal(historial[1].clientes[0].q.M.SM, 11);
    assert.ok(historial[1].clientes[0].img.lid);
    await saveLot(p, previo.nombre, false);
    assert.equal(await p.evaluate("Boolean(document.querySelector('#l-sob'))"), false);
    assert.match(await p.evaluate("document.querySelector('#l-dup').textContent"), /varios lotes/);
  });

  await check('I2 · Rechazo de referencias, SVG activos y propiedades inseguras, y texto literal en todas las vistas', async () => {
    const carpeta = await mkdtemp(join(dir, "texto-"));
    const p = await page(await newContext(carpeta));
    await rechazarI2(p, respaldoI2(obj => { obj.datos.clientes[0].id = 'cliente" extra="ficticio'; }), /Identificador inválido/);
    await rechazarI2(p, respaldoI2(obj => { obj.datos.clientes[0].img = { url: 'https://example.invalid/ficticia.svg' }; }), /Estructura inválida.*img/);
    await rechazarI2(p, respaldoI2(obj => { obj.datos.ajustes = JSON.parse('{"__proto__":{"ficticio":true}}'); }), /Estructura inválida/);
    await rechazarI2(p, respaldoI2(obj => {
      obj.imagenes.pedido = dataSvg('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script/></svg>');
    }), /SVG con contenido activo/);
    const texto = '<b data-marca-ficticia="1">detalle ficticio</b>';
    await importarI2(p, respaldoI2(obj => {
      obj.datos.clientes[0].nombre = '=1+1';
      obj.datos.clientes[0].req = { notas: texto, extras: ['marca'] };
      obj.datos.ajustes.detalles = [{ k: 'marca', n: texto, p: 'todo' }];
    }));
    await p.view('pedidos');
    assert.equal(await p.evaluate("document.querySelector('[data-ex=marca]').textContent"), texto);
    await p.view('produccion');
    assert.equal(await p.evaluate('document.querySelector("[data-marca-ficticia]")'), null);
    assert.ok(await p.evaluate(`document.querySelector('#v-produccion').textContent.includes(${JSON.stringify(texto)})`));
    // La hoja generada y el CSV también conservan el texto sin interpretarlo como código.
    await p.click('#dlHoja');
    const hoja = await download('hoja-produccion-', carpeta);
    const html = await readFile(hoja, 'utf8');
    assert.match(html, /&lt;b data-marca-ficticia=/);
    assert.doesNotMatch(html, /<b data-marca-ficticia=/);
    await p.view('resumen');
    await p.click('#exportar');
    const csv = await download('montajes-', carpeta);
    assert.match(await readFile(csv, 'utf8'), /'=1\+1;/);
  });
  await check('I3/I4 · Las cantidades inválidas no sustituyen los valores guardados ni llegan a producción', async () => {
    const p = await page(await newContext());
    await seedOrder(p);
    for (const valor of ['-3', '1.5', '1e3', '9007199254740993', '9007199254740991']) {
      await p.evaluate(editQuantity(valor));
      assert.match(await p.evaluate(toastText), /cantidad entera|límite de cálculo/);
      assert.equal(await p.evaluate(orderQuantity), 2);
      await p.evaluate("document.querySelector('#c-M-SM').dispatchEvent(new FocusEvent('focusout', { bubbles: true }))");
      assert.equal(await p.evaluate("document.querySelector('#c-M-SM').value"), '2');
    }
    const control = "document.querySelector('#c-M-SM')";
    await p.evaluate(`{
      Object.defineProperty(${control}, 'validity', { configurable: true, value: { badInput: true } });
      ${editQuantity('')}
      delete ${control}.validity;
      ${control}.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    }`);
    assert.equal(await p.evaluate(`${control}.value`), '2');
    await p.evaluate(editQuantity(4));
    assert.equal(await p.evaluate("document.querySelector('#v-resumen .rt tfoot td:last-child').textContent"), '8');
    assert.equal(await p.evaluate("document.querySelector('#v-produccion .tot b').textContent"), '8');
    await p.wait(`${orderQuantity} === 4`);
    await p.navigate();
    assert.equal(await p.evaluate("document.querySelector('#v-produccion .tot b').textContent"), '8');
  });

  await check('I3/I4 · Pares, unidades y shorts son independientes y conservan el total', async () => {
    const p = await page(await newContext());
    await seedOrder(p);
    assert.equal(await p.evaluate("document.querySelector('#m-par,#m-ind,#s-comp,#s-pz,#pzShort')"), null);
    await p.evaluate(editCell('c-M-MCP', 1) + editCell('c-M-MCU', 4) +
      editCell('c-M-MLU', 2) + editCell('c-L-MQU', 3) +
      editCell('c-M-SHC', 2) + editCell('c-L-SHP', 1));
    const total = () => p.evaluate("document.querySelector('#v-produccion .tot b').textContent");
    assert.equal(await total(), '20');
    await p.view('resumen');
    assert.deepEqual(await p.evaluate(`[
      document.querySelector('#tlt [data-talla=M] [data-rcol=MCp] .pv').textContent,
      document.querySelector('#tlt [data-talla=M] [data-rcol=MLp] .pv').textContent,
      document.querySelector('#tlt [data-talla=L] [data-rcol=MQp] .pv').textContent
    ]`), ['1+4', '0+2', '0+3']);
    await p.wait(`${stored('montajes-sub')}?.clientes[0]?.q.L?.SHP === 1`);
    await p.navigate();
    assert.equal(await total(), '20');
    await p.view('pedidos');
    assert.equal(await p.evaluate("document.querySelector('#c-M-MCP').value"), '1');
    assert.equal(await p.evaluate("document.querySelector('#c-M-MCU').value"), '4');
  });

  await check('I3/I4 · Chemis se reconoce sin reclasificar sus mangas como estándar', async () => {
    const p = await page(await newContext());
    await seedOrder(p);
    await p.evaluate(editCell('c-M-F', 2) + editCell('c-M-E', 2) + editCell('c-M-MQP', 2));
    const alertas = () => p.evaluate("document.querySelector('#ed-alertas').textContent");
    assert.match(await alertas(), /4 mangas chemis.*2 prenda/);
    assert.doesNotMatch(await alertas(), /sin mangas|Convertir en franelillas|Convertir en completas/);
    await p.evaluate(editCell('c-M-MCP', 1));
    await p.click('[data-fix="M"]');
    assert.equal(await p.evaluate("document.querySelector('#c-M-C').value"), '1');
    assert.equal(await p.evaluate("document.querySelector('#c-M-MQP').value"), '2');
    assert.equal(await p.evaluate("document.querySelector('#v-produccion .tot b').textContent"), '14');
    await p.evaluate(editCell('c-M-MQP', 0) + editCell('c-M-MQU', 1));
    assert.match(await alertas(), /Mangas cortas chemis, 1 en unidades sueltas.*falta la otra manga/);
  });

  await check('I3/I4 · Datos anteriores recuperables conservan piezas y los valores pendientes bloquean la producción', async () => {
    const p = await page(await newContext());
    await importarI2(p, respaldoI2(obj => {
      obj.datos.ajustes.piezasShort = obj.lotes[0].ajustes.piezasShort = 25;
      const cantidades = { FE: 1, MC: 1.5, SH: 7 / 25, F: -2, E: 0.5 };
      obj.datos.clientes[0].q.M = { ...cantidades };
      obj.lotes[0].clientes[0].q.M = { ...cantidades };
    }));
    assert.match(await p.evaluate(toastText), /^Respaldo importado/);
    assert.equal(await p.evaluate("document.querySelector('.lote .stats span:last-child b').textContent"), '12');
    await p.click('[data-lv]');
    assert.match(await p.evaluate("document.querySelector('#modal').textContent"), /12 piezas/);
    await p.click('#rs-no');
    await p.view('pedidos');
    assert.equal(await p.evaluate("document.querySelector('#c-M-MCU').value"), '3');
    assert.equal(await p.evaluate("document.querySelector('#c-M-SHP').value"), '7');
    assert.equal(await p.evaluate("document.querySelector('#c-M-F').value"), '-2');
    await p.view('produccion');
    await p.click('#dlHoja');
    assert.match(await p.evaluate(toastText), /Corrige las cantidades/);
    await p.view('resumen');
    await p.click('#exportar');
    assert.match(await p.evaluate(toastText), /Corrige las cantidades/);
    await p.view('pedidos');
    await p.evaluate(editCell('c-M-F', 0) + editCell('c-M-E', 0));
    assert.equal(await p.evaluate("document.querySelector('#v-produccion .tot b').textContent"), '12');
    await p.wait("!document.querySelector('#v-produccion [role=alert]')");
  });

  await check('I3/I4 · Las copias, las portadas y el historial permanecen aislados al editar o deshacer', async () => {
    const p = await page(await newContext());
    await seedOrder(p);
    await p.upload('#fileImg', imageFile);
    await p.wait(imageReady('#imgbox img'));
    await saveLot(p, 'HISTÓRICO A', false);
    await p.wait(`${lotQuantity} === 2 && document.querySelector('#save.ok')`);
    await saveLot(p, 'EN CURSO B', false);
    await p.wait(`${stored('montajes-lotes')}.length === 2 && document.querySelector('#save.ok')`);
    const lotes = () => p.evaluate(stored('montajes-lotes'));
    const [historico, activo] = await lotes();
    const card = id => `.lote:has([data-lv="${id}"])`;
    await p.view('produccion');
    await p.click('[data-cport]');
    await p.wait(`${stored('montajes-lotes')}[1].portadaCli`);
    await p.click('#btnUndo');
    await p.wait(`${stored('montajes-lotes')}[1].portadaCli === null`);
    await p.click('#btnRedo');
    await p.wait(`${stored('montajes-lotes')}[1].portadaCli`);
    assert.deepEqual((await lotes())[0], historico);
    await p.view('historial');
    await p.click(`${card(historico.id)} [data-pdel]`);
    await p.wait(`${stored('montajes-lotes')}[0].clientes[0].imgProd?.none`);
    assert.equal((await lotes())[1].clientes[0].img.lid, activo.clientes[0].img.lid);
    assert.equal(await p.evaluate(`${stored('montajes-sub')}.clientes[0].img.lid`), activo.clientes[0].img.lid);
    const guardados = await lotes();
    await p.click(`${card(historico.id)} [data-la="cargar"]`);
    await p.click('[data-lc]');
    await p.wait("!document.querySelector('#v-pedidos').hidden");
    await p.evaluate(editQuantity(9));
    await p.click('#noimg');
    await p.evaluate(`{
      const campo = document.querySelector('#f-nombre');
      campo.value = 'pedido editable';
      campo.dispatchEvent(new Event('change', { bubbles: true }));
    }`);
    assert.equal(await p.evaluate("document.querySelector('#v-produccion .pcard h2').textContent"), 'PEDIDO EDITABLE');
    assert.match(await p.evaluate("document.querySelector('#v-resumen').textContent"), /PEDIDO EDITABLE/);
    await p.wait(`${orderQuantity} === 9 && ${stored('montajes-sub')}.loteActivo === null`);
    assert.deepEqual(await lotes(), guardados);
  });

  await check('I3/I4 · Una pestaña rezagada conserva su borrador y no sobrescribe pedidos, lotes ni respaldos', async () => {
    const context = await newContext();
    const primera = await page(context);
    await seedOrder(primera);
    const segunda = await page(context, '/app', "Boolean(document.querySelector('#save.bad'))");
    await segunda.evaluate(editQuantity(8));
    await segunda.evaluate(beforeUnload);
    assert.equal(await primera.evaluate(orderQuantity), 2);
    await primera.evaluate(editQuantity(5));
    await saveLot(primera, 'LOTE DE LA PRIMERA PESTAÑA', false);
    await primera.wait(`${orderQuantity} === 5 && ${lotQuantity} === 5 && document.querySelector('#save.ok')`);
    const esperado = await estadoRespaldo(primera);
    await segunda.wait("document.querySelector('#save').textContent.includes('Exporta tus cambios')");
    await saveLot(segunda, 'SEGUNDA PESTAÑA', false);
    assert.match(await segunda.evaluate("document.querySelector('#l-error').textContent"), /Otra pestaña cambió/);
    await importarI2(segunda, respaldoI2());
    assert.match(await segunda.evaluate(toastText), /Otra pestaña cambió/);
    assert.equal(await segunda.evaluate("document.querySelector('#c-M-SM').value"), '8');
    await primera.command('Page.close');
    await segunda.click('#reintentarGuardar');
    assert.deepEqual(await estadoRespaldo(segunda), esperado);
    await segunda.command('Page.close');
    const recargada = await page(context);
    assert.equal(await recargada.evaluate("document.querySelector('#c-M-SM').value"), '5');
    const siguiente = await page(context, '/app', "Boolean(document.querySelector('#save.bad'))");
    await siguiente.evaluate(editQuantity(10));
    await recargada.command('Page.close');
    await siguiente.wait(`${orderQuantity} === 10 && ${lotQuantity} === 10 && document.querySelector('#save.ok')`);
  });

  const categorias130 = [
    ['C', 'Franela', '4 piezas', 4, ['Frentes', 'Espaldas', 'Mangas cortas']],
    ['L', 'Suéter', '4 piezas', 4, ['Frentes', 'Espaldas', 'Mangas largas']],
    ['FE', 'Frente y espalda', '2 piezas', 2, ['Frentes', 'Espaldas']],
    ['CH', 'Chemis', '4 piezas', 4, ['Frentes chemis', 'Espaldas chemis', 'Mangas cortas chemis']],
    ['CHL', 'Chemis suéter', '4 piezas', 4, ['Frentes chemis', 'Espaldas chemis', 'Mangas largas chemis']],
    ['SM', 'Franelilla', '2 piezas', 2, ['Frentes', 'Espaldas']],
    ['F', 'Solo frente', '1 pieza', 1, ['Frentes']],
    ['E', 'Solo espalda', '1 pieza', 1, ['Espaldas']],
    ['MCP', 'Mangas cortas', 'pares', 2, ['Mangas cortas']],
    ['MQP', 'Mangas cortas chemis', 'pares', 2, ['Mangas cortas chemis']],
    ['MLP', 'Mangas largas', 'pares', 2, ['Mangas largas']],
    ['MCU', 'Mangas cortas', 'unidad', 1, ['Mangas cortas']],
    ['MQU', 'Mangas cortas chemis', 'unidad', 1, ['Mangas cortas chemis']],
    ['MLU', 'Mangas largas', 'unidad', 1, ['Mangas largas']],
    ['SHC', 'Short', '2 piezas', 2, ['Piezas de short']],
    ['SHP', 'Short', 'pieza', 1, ['Piezas de short']],
  ];

  await check('1.30.0 · Orden, iconos y piezas físicas de cada una de las 16 categorías', async () => {
    const p = await page(await newContext());
    await seedOrder(p);
    await p.evaluate(editQuantity(0));
    assert.deepEqual(await p.evaluate(`[...document.querySelectorAll('#grid [data-col]')].map(th =>
      [th.dataset.col, th.querySelector('.t').textContent, th.querySelector('.s').textContent])`),
    categorias130.map(([id, nombre, unidad]) => [id, nombre, unidad]));
    assert.deepEqual(await p.evaluate(`['MCP','MQP','MLP','MCU','MQU','MLU'].map(k =>
      document.querySelectorAll('#grid [data-col='+k+'] svg > g').length)`), [2, 2, 2, 0, 0, 0]);
    assert.equal(await p.evaluate(`['CH','CHL'].every(k =>
      document.querySelector('#grid [data-col='+k+'] svg path:nth-child(2)').getAttribute('d').includes('M12 6v5'))`), true);
    const logo = await readFile(new URL('../docs/icono-interno-v1.30.base64', import.meta.url), 'utf8');
    await p.wait(imageReady('#logo'));
    assert.equal(await p.evaluate("document.querySelector('#logo').src"), 'data:image/png;base64,' + logo.trim());
    assert.equal(await p.evaluate(`getComputedStyle(document.querySelector('#logo')).backgroundColor`), 'rgb(0, 0, 0)');

    const piezasTile = ".tile.dark .num";
    for (const [id, nombre, unidad, total, piezas] of categorias130) {
      await p.evaluate(editCell('c-M-' + id, 1));
      assert.equal(await p.evaluate(`document.querySelector('${piezasTile}').textContent`), String(total), id);
      assert.equal(await p.evaluate("document.querySelector('#v-produccion .tot b').textContent"), String(total), id);
      assert.deepEqual(await p.evaluate(`[...document.querySelectorAll('.pcard .meta .pill:not(.tot)')]
        .map(pill => pill.textContent.split(':')[0])`), piezas, id);
      const fila = await p.evaluate("document.querySelector('.ptab tbody tr').textContent");
      assert.ok(fila.startsWith(nombre), id);
      if (['pares', 'unidad', 'pieza'].includes(unidad)) assert.ok(fila.includes('(' + unidad + ')'), id);
      await p.evaluate(editCell('c-M-' + id, 0));
    }
  });

  await check('1.30.0 · 34 piezas en 5XL y coherencia entre vistas, respaldo, CSV, hoja y PDF', async () => {
    const carpeta = await mkdtemp(join(dir, 'prendas-'));
    const p = await page(await newContext(carpeta));
    await seedOrder(p);
    await p.evaluate(editQuantity(0) + categorias130.map(([k]) => editCell('c-5XL-' + k, 1)).join(''));
    assert.equal(await p.evaluate("document.querySelector('.tile.dark .num').textContent"), '34');
    const piezas = [5, 5, 2, 2, 5, 5, 5, 2, 3];
    await p.view('resumen');
    assert.deepEqual(await p.evaluate(`[...document.querySelector('#v-resumen .rt').tBodies[0].rows[0].cells]
      .slice(1).map(td => Number(td.textContent))`), [...piezas, 34]);
    assert.deepEqual(await p.evaluate(`['CLQ','MCp','MLp','MQp','MQLp'].map(k =>
      document.querySelector('#tlt [data-talla="5XL"] [data-rcol='+k+'] .pv').textContent)`),
    ['2', '2+1', '2+1', '2+1', '1']);
    await p.click('#tlt [data-talla="5XL"]');
    assert.equal(await p.evaluate("document.querySelector('#mt').textContent"), 'Talla 5XL');
    await p.click('#rs-no');
    await p.click('#exportar');
    const csv = await readFile(await download('montajes-', carpeta), 'utf8');
    const [cabecera, fila] = csv.trim().split('\n').map(line => line.split(';'));
    assert.equal(fila[3], '5XL');
    assert.deepEqual(fila.slice(4).map(Number), [...categorias130.map(() => 1), ...piezas, 34]);
    assert.ok(cabecera.includes('Mangas largas chemis'));
    assert.ok(cabecera.includes('Mangas cortas chemis (pares)') && cabecera.includes('Mangas cortas chemis (unidad)'));

    await saveLot(p, 'LOTE 5XL', false);
    await p.wait(`${stored('montajes-lotes')}?.[0]?.resumen.piezas === 34 && document.querySelector('#save.ok')`);
    await p.view('historial');
    assert.equal(await p.evaluate("document.querySelector('.lote .stats span:last-child b').textContent"), '34');
    await p.click('[data-lv]');
    assert.match(await p.evaluate("document.querySelector('#modal').textContent"), /34 piezas/);
    await p.click('#rs-no');
    await p.click('#resExp');
    const respaldo = JSON.parse(await readFile(await download('respaldo-montajes-', carpeta), 'utf8'));
    const destino = await page(await newContext());
    await importarI2(destino, respaldo);
    assert.match(await destino.evaluate(toastText), /^Respaldo importado/);
    assert.equal(await destino.evaluate("document.querySelector('#c-5XL-CHL').value"), '1');
    assert.equal(await destino.evaluate("document.querySelector('.lote .stats span:last-child b').textContent"), '34');

    await p.view('produccion');
    assert.equal(await p.evaluate("document.querySelector('.ptab thead th:nth-child(2)').textContent"), '5XL');
    assert.equal(await p.evaluate("document.querySelectorAll('.ptab tbody tr').length"), 16);
    assert.equal(await p.evaluate("document.querySelector('#v-produccion .tot b').textContent"), '34');
    await p.evaluate(`document.addEventListener('load', event => {
      if (event.target instanceof HTMLIFrameElement && event.target.srcdoc) {
        const frame = event.target;
        frame.contentWindow.print = () => { window.hojaImpresa = frame.srcdoc; };
      }
    }, true)`);
    await p.click('#prHoja');
    await p.wait("Boolean(window.hojaImpresa)");
    await p.click('#dlHoja');
    sheet = await readFile(await download('hoja-produccion-', carpeta), 'utf8');
    assert.equal(await p.evaluate('window.hojaImpresa'), sheet);
    const output = await page(await newContext(), '/hoja');
    const { data } = await output.command('Page.printToPDF', { preferCSSPageSize: true });
    const pdf = join(carpeta, '5xl.pdf');
    await writeFile(pdf, Buffer.from(data, 'base64'));
    const text = execFileSync('pdftotext', ['-layout', pdf, '-'], { encoding: 'utf8' });
    assert.match(text, /Total de piezas:\s*34/);
    assert.match(text, /T-5XL/);
    assert.match(text, /Mangas largas chemis:\s*2/);
    assert.match(text, /Mangas cortas chemis\s*(?:\(unidad\)\s+1\s+1|1\s+1\s+\(unidad\))/);
  });

  await check('1.30.0 · Migra pedidos locales y lotes con modos y piezas por short propios', async () => {
    const p = await page(await newContext());
    const pedido = {
      clientes: [
        { id: 'pedido-a', nombre: 'PARES Y SHORTS', modoManga: 'par', modoShort: 'comp',
          q: { M: { MC: 2, MQ: 1, ML: 1, SH: 3 } } },
        { id: 'pedido-b', nombre: 'UNIDADES Y PIEZAS', modoManga: 'ind', modoShort: 'pz',
          q: { L: { MC: 4, MQ: 3, ML: 2, SH: 5 } } },
      ],
      ajustes: { piezasShort: 3, listas: { tela: ['Tela ficticia'] } },
    };
    const lote = {
      id: 'lote-antiguo', nombre: 'LOTE ANTIGUO', fecha: '2026-11-25', creado: 1795608000000,
      ajustes: { piezasShort: 5 }, clientes: structuredClone(pedido.clientes),
      resumen: { piezas: 37 },
    };
    await p.evaluate(`{
      localStorage.setItem('montajes-sub', ${JSON.stringify(JSON.stringify(pedido))});
      localStorage.setItem('montajes-lotes', ${JSON.stringify(JSON.stringify([lote]))});
    }`);
    await p.navigate();
    assert.equal(await p.evaluate("document.querySelector('.tile.dark .num').textContent"), '31');
    assert.deepEqual(await p.evaluate(`['MCP','MQP','MLP','SHP','SHC'].map(k =>
      document.querySelector('#c-M-'+k).value)`), ['2', '1', '1', '9', '']);
    await p.click('[data-pick="pedido-b"]');
    assert.deepEqual(await p.evaluate(`['MCU','MQU','MLU','SHP','SHC'].map(k =>
      document.querySelector('#c-L-'+k).value)`), ['4', '3', '2', '5', '']);
    await p.view('historial');
    assert.equal(await p.evaluate("document.querySelector('.lote .stats span:last-child b').textContent"), '37');
    await p.click('[data-la=cargar]');
    await p.click('[data-lc]');
    await p.wait("!document.querySelector('#v-pedidos').hidden");
    assert.equal(await p.evaluate("document.querySelector('#c-M-SHP').value"), '15');
    assert.equal(await p.evaluate("document.querySelector('.tile.dark .num').textContent"), '37');
    await p.evaluate(editCell('c-M-SHC', 1));
    assert.equal(await p.evaluate("document.querySelector('.tile.dark .num').textContent"), '39');
    await p.wait(`${stored('montajes-sub')}?.clientes[0]?.q.M?.SHP === 15 && document.querySelector('#save.ok')`);
    await p.navigate();
    assert.equal(await p.evaluate("document.querySelector('.tile.dark .num').textContent"), '39');
    assert.equal(await p.evaluate("document.querySelector('.lote .stats span:last-child b').textContent"), '37');
  });

  await check('I3/I4 · Imágenes, respaldo y PDF con indicaciones completas', async () => {
    const carpeta = await mkdtemp(join(dir, 'archivo-'));
    let ruta = new URL('../Montajes-Sublimacion.html', import.meta.url).href;
    let p;
    try {
      p = await page(await newContext(carpeta), ruta);
      console.log('INFO · Chromium permitió abrir el HTML con file://.');
    } catch (error) {
      if (!/ERR_BLOCKED_BY_ADMINISTRATOR/.test(error.message)) throw error;
      console.log('OMITIDA · Apertura file:// por política de Chromium (ERR_BLOCKED_BY_ADMINISTRATOR). Se valida por HTTP local.');
      ruta = '/app';
      p = await page(await newContext(carpeta), ruta);
    }
    await seedOrder(p);
    await p.upload('#fileImg', imageFile);
    await p.wait(imageReady('#imgbox img'));
    await p.wait(`Boolean(${stored('montajes-sub')}.clientes[0].img?.lid)`);
    await p.navigate();
    assert.equal(await p.evaluate('location.protocol'), ruta.startsWith('file:') ? 'file:' : 'http:');
    await p.wait(imageReady('#imgbox img'));
    await p.evaluate(`{
      const notas = document.querySelector('#r-notas');
      notas.value = 'Indicación de corte y costura. '.repeat(24) + 'FIN DE INDICACIONES';
      notas.dispatchEvent(new Event('input', { bubbles: true }));
    }`);
    await saveLot(p, 'LOTE DESDE ARCHIVO', false);
    await p.wait(`${lotQuantity} === 2 && document.querySelector('#save.ok')`);
    await p.view('historial');
    await p.click('#resExp');
    const respaldo = JSON.parse(await readFile(await download('respaldo-montajes-', carpeta), 'utf8'));
    const destino = await page(await newContext(), ruta);
    await importarI2(destino, respaldo);
    assert.match(await destino.evaluate(toastText), /^Respaldo importado/);
    await destino.view('historial');
    await destino.wait(imageReady('#v-historial .lthumb img'));
    await p.view('produccion');
    await p.click('#dlHoja');
    sheet = await readFile(await download('hoja-produccion-', carpeta), 'utf8');
    const output = await page(await newContext(), '/hoja');
    await output.wait(imageReady('section img'));
    const { data } = await output.command('Page.printToPDF', { preferCSSPageSize: true, printBackground: true });
    const pdf = join(carpeta, 'archivo.pdf');
    await writeFile(pdf, Buffer.from(data, 'base64'));
    const text = execFileSync('pdftotext', ['-layout', pdf, '-'], { encoding: 'utf8' });
    assert.match(text, /Franelilla\s+2\b/i);
    assert.match(text, /FIN\s+DE\s+INDICACIONES/);
  });

  const pwaDownloads = await mkdtemp(join(dir, 'pwa-descargas-'));
  const pwaContext = await newContext(pwaDownloads);
  const key = name => `Montajes-Sublimacion:montajes-${name}`;
  const pwaQuantity = `${stored(key('sub'))}?.clientes[0]?.q.M?.SM`;
  const pwaLotQuantity = `${stored(key('lotes'))}?.[0]?.clientes[0]?.q.M?.SM`;
  const serviceWorkerReady = `navigator.serviceWorker.controller?.scriptURL === location.origin + '${pagesPath}sw.js'`;
  const waiting = '(async () => !!(await navigator.serviceWorker.ready).waiting)()';
  const updateVisible = '!document.querySelector("#pwaActualizar").hidden';
  const version = 'document.querySelector(".ver")?.textContent';
  const appVersion = app.toString().match(/title="Versión del programa">(v\d+\.\d+\.\d+)</)[1];
  const nextVersion = appVersion.replace(/\d+$/, patch => String(Number(patch) + 1));
  const aviso = 'document.querySelector("#pwaAviso").textContent';
  const otherCache = `montajes-sublimacion:${base}/Otro-Proyecto/:anterior`;
  let pwa;

  await check('PWA · Manifest, iconos y opción de instalar en la subruta', async () => {
    pwa = await page(pwaContext, pagesPath);
    await pwa.wait(serviceWorkerReady);
    const installation = await page(undefined, pagesPath);
    await installation.wait(serviceWorkerReady);
    const manifestUrl = base + pagesPath + 'manifest.webmanifest';
    const { url, errors } = await installation.command('Page.getAppManifest');
    assert.equal(url, manifestUrl);
    assert.deepEqual(errors, []);
    const { installabilityErrors } = await installation.command('Page.getInstallabilityErrors');
    assert.deepEqual(installabilityErrors, []);
    const manifest = await pwa.evaluate(`fetch(${JSON.stringify(manifestUrl)}).then(r => r.json())`);
    assert.equal(manifest.id, pagesPath);
    assert.equal(new URL(manifest.scope, manifestUrl).pathname, pagesPath);
    assert.equal(new URL(manifest.start_url, manifestUrl).pathname, pagesPath);
    assert.equal(manifest.display, 'standalone');
    for (const { src, sizes } of manifest.icons) {
      assert.equal(await pwa.evaluate(`(async () => {
        const img = new Image(); img.src = ${JSON.stringify(src)}; await img.decode();
        return img.naturalWidth + 'x' + img.naturalHeight;
      })()`), sizes);
    }
    assert.ok(manifest.icons.some(icon => icon.sizes === '512x512' && icon.purpose === 'maskable'));
    await installation.evaluate(`{
      const event = new Event('beforeinstallprompt', { cancelable: true });
      event.prompt = async () => { window.promptInvocado = true; };
      window.dispatchEvent(event);
    }`);
    await installation.wait('!document.querySelector("#pwaInstalar").hidden');
    await installation.click('#pwaInstalar');
    assert.equal(await installation.evaluate('window.promptInvocado && document.querySelector("#pwaInstalar").hidden'), true);
    await installation.evaluate('window.dispatchEvent(new Event("appinstalled"))');
    assert.equal(await installation.evaluate('document.querySelector("#pwaInstalar").hidden'), true);
  });

  await check('PWA · Recarga, fuente e HTML descargable sin red', async () => {
    await pwa.command('Page.bringToFront');
    pagesOnline = false;
    try {
      await pwa.navigate();
      await pwa.wait(serviceWorkerReady);
      assert.equal(await pwa.evaluate(version), appVersion);
      assert.equal(await pwa.evaluate(`document.fonts.load('600 14px "Plus Jakarta Sans"', 'Producción').then(fonts => fonts.length)`), 1);
      assert.equal(await pwa.evaluate("fetch('./index.html?offline=1').then(r => r.ok)"), true);
      for (const view of ['resumen', 'produccion', 'historial', 'pedidos']) await pwa.view(view);
      const result = await pwa.command('Page.navigate', { url: base + pagesPath + 'index.html?offline=2' });
      assert.equal(result.errorText, undefined);
      await pwa.wait(`location.search === '?offline=2' && ${serviceWorkerReady}`);
      await pwa.click('a[download="Montajes-Sublimacion.html"]');
      const offlineFile = await download('Montajes-Sublimacion.html', pwaDownloads);
      assert.deepEqual(await readFile(offlineFile), app);
      await pwa.navigate();
    } finally { pagesOnline = true; }
  });

  await check('PWA · Respaldo formato 1, restauración offline e independencia de almacenamiento', async () => {
    const legacy = await page(pwaContext);
    await importarI2(legacy, respaldoI2());
    const legacyData = await estadoRespaldo(legacy);
    await pwa.evaluate(`caches.open(${JSON.stringify(otherCache)}).then(cache => cache.put('/otra-app', new Response('otra app')))`);
    assert.equal(await pwa.evaluate(pwaQuantity), undefined);
    pagesOnline = false;
    try {
      await importarI2(pwa, respaldoI2());
      assert.match(await pwa.evaluate(toastText), /^Respaldo importado/);
      await importarI2(pwa, respaldoI2(obj => { obj.datos.clientes[0].q.M.SM = 7; }));
      assert.equal(await pwa.evaluate(pwaQuantity), 7);
      await pwa.click('#resRec');
      await pwa.click('#impOk');
      await pwa.wait(`document.querySelector('#modal').hidden && ${pwaQuantity} === 4`);
      await pwa.navigate();
      await pwa.wait(imageReady('#imgbox img'));
      assert.equal(await pwa.evaluate(pwaLotQuantity), 4);
      assert.equal(await pwa.evaluate(`localStorage.getItem(${JSON.stringify(key('tema'))})`), 'dark');
      const databases = await pwa.evaluate('indexedDB.databases().then(dbs => dbs.map(db => db.name))');
      assert.ok(databases.includes(key('img')) && databases.includes('montajes-img'));
      await pwa.view('historial');
      await pwa.wait(imageReady('#v-historial .lthumb img'));
      await pwa.click('#resExp');
      const copyPath = await download('respaldo-montajes-', pwaDownloads);
      const copy = JSON.parse(await readFile(copyPath, 'utf8'));
      assert.equal(copy.formato, 1);
      assert.equal(copy.imagenes[copy.datos.clientes[0].img.ref], expectedImage);
      assert.equal(copy.imagenes[copy.lotes[0].portada.ref], secondImage);
      const restoredLegacy = await page(await newContext());
      await importarI2(restoredLegacy, copy);
      assert.equal(await restoredLegacy.evaluate(orderQuantity), 4);
      assert.deepEqual(await estadoRespaldo(legacy), legacyData);
    } finally { pagesOnline = true; }
  });

  await check('PWA · Una publicación con versiones mezcladas conserva la versión activa', async () => {
    const nextSource = join(dir, 'siguiente');
    const nextBuild = join(dir, 'pages-siguiente');
    await mkdir(join(nextSource, 'scripts'), { recursive: true });
    await cp(buildScript, join(nextSource, 'scripts/build-pages.mjs'));
    await cp(new URL('../pwa', import.meta.url), join(nextSource, 'pwa'), { recursive: true });
    await writeFile(join(nextSource, 'Montajes-Sublimacion.html'), app.toString().replace(appVersion, nextVersion));
    execFileSync(process.execPath, [join(nextSource, 'scripts/build-pages.mjs'), nextBuild]);
    previousIndex = true;
    pagesBuild = nextBuild;
    try {
      await pwa.evaluate(`(async () => {
        const registration = await navigator.serviceWorker.ready;
        registration.addEventListener('updatefound', () => {
          const candidate = registration.installing;
          candidate.addEventListener('statechange', () => { window.candidate = candidate.state; });
        }, { once: true });
        await registration.update();
      })()`);
      await pwa.wait("window.candidate === 'redundant'");
      assert.equal(await pwa.evaluate(waiting), false);
      assert.equal(await pwa.evaluate(updateVisible), false);
      assert.equal(await pwa.evaluate(version), appVersion);
    } finally { previousIndex = false; }
  });

  await check('PWA · Actualización disponible, aviso ante formularios y guardados rechazados', async () => {
    await pwa.evaluate('navigator.serviceWorker.ready.then(r => r.update())');
    await pwa.wait(waiting);
    await pwa.wait(updateVisible);
    await pwa.view('pedidos');
    await pwa.evaluate("document.querySelector('#newName').value = 'BORRADOR FICTICIO'");
    await pwa.click('#pwaActualizar');
    assert.match(await pwa.evaluate(aviso), /Completa o cierra el formulario/);
    assert.equal(await pwa.evaluate(waiting), true);
    await pwa.evaluate("document.querySelector('#newName').value = ''");
    await pwa.click('#btnLote');
    await pwa.click('#pwaActualizar');
    assert.match(await pwa.evaluate(aviso), /Completa o cierra el formulario/);
    await pwa.click('#l-cancel');
    await blockWrite(pwa, key('sub'));
    await pwa.evaluate(editQuantity(8));
    await pwa.wait('window.rejectedWrites > 0');
    await pwa.click('#pwaActualizar');
    await pwa.wait(`${aviso}.includes('Hay cambios sin guardar')`);
    assert.equal(await pwa.evaluate(waiting), true);
    assert.equal(await pwa.evaluate(version), appVersion);
    assert.equal(await pwa.evaluate(pwaQuantity), 4);
    assert.equal(await pwa.evaluate("document.querySelector('#c-M-SM').value"), '8');
  });

  await check('PWA · Actualiza con guardado confirmado y conserva el borrador de otra pestaña', async () => {
    const second = await page(pwaContext, pagesPath, "document.querySelector('main').inert === false && !!document.querySelector('#save.bad')");
    await second.wait(serviceWorkerReady);
    await second.evaluate(editQuantity(9));
    await second.wait("!document.querySelector('#reintentarGuardar').hidden");
    await unblockWrite(pwa);
    await pwa.click('#pwaActualizar');
    await pwa.wait(`${version} === '${nextVersion}' && !!document.querySelector('#save.ok')`);
    assert.equal(await pwa.evaluate(pwaQuantity), 8);
    assert.equal(await pwa.evaluate(pwaLotQuantity), 8);
    await second.wait(updateVisible);
    assert.equal(await second.evaluate(version), appVersion);
    assert.equal(await second.evaluate("document.querySelector('#c-M-SM').value"), '9');
    await second.click('#pwaActualizar');
    await second.wait(`${aviso}.includes('Hay cambios sin guardar')`);
    assert.equal(await second.evaluate("document.querySelector('#c-M-SM').value"), '9');
    assert.equal(await pwa.evaluate(`caches.open(${JSON.stringify(otherCache)}).then(c => c.match('/otra-app')).then(r => r?.text())`), 'otra app');
    const cacheNames = await pwa.evaluate('caches.keys()');
    assert.equal(cacheNames.filter(name => name.startsWith(`montajes-sublimacion:${base}${pagesPath}:`)).length, 1);
    pagesOnline = false;
    try {
      await pwa.command('Page.bringToFront');
      await pwa.navigate();
      assert.equal(await pwa.evaluate(version), nextVersion);
      assert.equal(await pwa.evaluate(pwaQuantity), 8);
      await pwa.wait(imageReady('#imgbox img'));
      await pwa.view('historial');
      await pwa.wait(imageReady('#v-historial .lthumb img'));
    } finally { pagesOnline = true; }
  });
} finally {
  process.exitCode = failures ? 1 : process.exitCode;
  if (chrome.pid) {
    chrome.kill();
    await chromeClosed;
  }
  server.close();
  await rm(dir, { recursive: true, force: true, maxRetries: 5 });
}
