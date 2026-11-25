import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const dir = await mkdtemp(join(tmpdir(), 'montajes-i0-'));
const app = await readFile(new URL('../Montajes-Sublimacion.html', import.meta.url));
let sheet;
const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
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

async function page(context, path = '/app') {
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
    const url = base + path + '?load=' + ++navigations;
    const result = await command('Page.navigate', { url });
    assert.equal(result.errorText, undefined);
    await wait(`location.href === ${JSON.stringify(url)}`);
    await wait(path.startsWith('/app') ? "Boolean(document.querySelector('#save.ok'))" : "document.readyState === 'complete' && !!document.querySelector('h1')");
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

async function newContext() {
  const { browserContextId } = await send('Target.createBrowserContext');
  await send('Browser.setDownloadBehavior', { behavior: 'allow', browserContextId, downloadPath: dir });
  return browserContextId;
}

async function download(prefix) {
  const name = await waitFor(async () => (await readdir(dir)).find(
    name => name.startsWith(prefix) && !name.endsWith('.crdownload'),
  ), prefix);
  return join(dir, name);
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
const editQuantity = value => `{
  const input = document.querySelector('#c-M-SM');
  input.value = ${JSON.stringify(String(value))};
  input.dispatchEvent(new Event('input', { bubbles: true }));
}`;
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
} finally {
  process.exitCode = failures ? 1 : process.exitCode;
  if (chrome.pid) {
    chrome.kill();
    await chromeClosed;
  }
  server.close();
  await rm(dir, { recursive: true, force: true });
}
