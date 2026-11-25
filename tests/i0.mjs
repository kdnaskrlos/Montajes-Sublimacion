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
  const html = path === '/app' ? app : path === '/hoja' ? sheet : null;
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
    await wait(path === '/app' ? "Boolean(document.querySelector('#save.ok'))" : "document.readyState === 'complete' && !!document.querySelector('h1')");
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
  await p.evaluate(`
    document.querySelector('#newName').value = 'CLIENTE FICTICIO I0';
    document.querySelector('#addForm').requestSubmit();
    const input = document.querySelector('#c-M-SM');
    input.value = '2';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  `);
  await p.wait("JSON.parse(localStorage.getItem('montajes-sub'))?.clientes[0]?.q.M?.SM === 2");
}

async function saveLot(p, name) {
  await p.click('#btnLote');
  await p.evaluate(`
    document.querySelector('#l-nombre').value = ${JSON.stringify(name)};
    document.querySelector('#l-vaciar').checked = true;
    document.querySelector('#fLote').requestSubmit();
  `);
}

let failures = 0;
async function check(name, run) {
  try {
    const outcome = await run();
    console.log(outcome === 'known defect' ? 'FALLO CONOCIDO REPRODUCIDO · ' + name : 'OK · ' + name);
  } catch (error) {
    failures++;
    console.error('FALLO · ' + name, error);
  }
}

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
    await isolated.evaluate(`
      const setItem = Storage.prototype.setItem;
      window.i0RejectedWrites = 0;
      Storage.prototype.setItem = function (key, value) {
        if (this === localStorage && key === 'montajes-lotes') {
          window.i0RejectedWrites++;
          throw new DOMException('Cuota ficticia de I0', 'QuotaExceededError');
        }
        return setItem.call(this, key, value);
      };
    `);
    await saveLot(isolated, 'FALLO FICTICIO I0');
    assert.equal(await isolated.evaluate('window.i0RejectedWrites'), 1);
    const message = await isolated.evaluate("document.querySelector('.toast')?.textContent");
    assert.equal(await isolated.evaluate("localStorage.getItem('montajes-lotes')"), null);
    await isolated.wait("document.querySelector('#save.ok')");
    await isolated.navigate();
    const clients = await isolated.evaluate("JSON.parse(localStorage.getItem('montajes-sub')).clientes");
    await isolated.view('historial');
    assert.equal(await isolated.evaluate("document.querySelectorAll('.lote').length"), 0);
    if (clients.length === 0 && message.includes('guardado.')) {
      console.log('  El lote desapareció al recargar, los pedidos quedaron vacíos y la interfaz había informado éxito.');
      return 'known defect';
    }
    assert.equal(clients[0]?.q.M?.SM, 2, 'El pedido original debe seguir guardado');
    assert.ok(message && !message.includes('guardado.'), 'La interfaz debe informar el fallo');
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
