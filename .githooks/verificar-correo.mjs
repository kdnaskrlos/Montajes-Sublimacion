import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const correoCuenta = /^(?:\d+\+)?[\w-]+(?:\[bot\])?@users\.noreply\.github\.com$/i;
const correoGitHub = correo => correoCuenta.test(correo) || correo.toLowerCase() === 'noreply@github.com';
const correosEnTexto = /[\w.!#$%&'*+/=?^\x60{|}~\[\]-]+@[a-z\d-]+(?:\.[a-z\d-]+)+/gi;

function exigir(condicion, mensaje) {
  if (!condicion) throw new Error(mensaje);
}

function verificarMensaje(mensaje) {
  exigir((mensaje.match(correosEnTexto) ?? []).every(correoGitHub), 'El mensaje contiene un correo fuera de los dominios noreply de GitHub.');
}

function verificarIdentidad(variable) {
  const identidad = git('var', variable);
  const correo = identidad.match(/<([^>]+)>\s+\d+ [+-]\d{4}/)?.[1] ?? '';
  exigir(correoCuenta.test(correo), 'Configura el correo noreply de tu cuenta de GitHub para autoría y confirmación.');
}

function verificarReferencia(oid, commits) {
  exigir(/^(?:[a-f\d]{40}|[a-f\d]{64})$/.test(oid), 'La referencia de salida no tiene un identificador Git válido.');
  if (/^0+$/.test(oid)) return;

  let tipo = git('cat-file', '-t', oid).trim();
  while (tipo === 'tag') {
    const etiqueta = git('cat-file', 'tag', oid);
    const [metadatos, ...mensaje] = etiqueta.split('\n\n');
    const correo = metadatos.match(/^tagger [^\n]* <([^>]+)>/m)?.[1] ?? '';
    exigir(correoGitHub(correo), 'Una etiqueta contiene un correo de autor fuera de los dominios noreply de GitHub.');
    verificarMensaje(mensaje.join('\n\n'));
    oid = metadatos.match(/^object ([a-f\d]+)$/m)[1];
    tipo = git('cat-file', '-t', oid).trim();
  }
  if (tipo === 'commit') commits.add(oid);
}

function verificarSalida() {
  const commits = new Set();
  for (const ref of readFileSync(0, 'utf8').trim().split('\n').filter(Boolean)) {
    verificarReferencia(ref.split(/\s+/)[1] ?? '', commits);
  }
  if (!commits.size) return;
  const datos = git('log', '-z', '--format=%ae%x00%ce%x00%B', ...commits, '--').split('\0');
  datos.pop();
  for (let i = 0; i < datos.length; i += 3) {
    exigir(correoGitHub(datos[i]) && correoGitHub(datos[i + 1]),
      'Un commit de salida contiene un correo de autoría o confirmación fuera de los dominios noreply de GitHub.');
    verificarMensaje(datos[i + 2]);
  }
}

try {
  const [accion, archivo] = process.argv.slice(2);
  if (accion === 'commit') {
    verificarIdentidad('GIT_AUTHOR_IDENT');
    verificarIdentidad('GIT_COMMITTER_IDENT');
    verificarMensaje(readFileSync(archivo, 'utf8'));
  } else {
    exigir(accion === 'push', 'Acción del hook desconocida.');
    verificarSalida();
  }
} catch (error) {
  console.error(`Privacidad de Git. ${error.message}`);
  process.exitCode = 1;
}
