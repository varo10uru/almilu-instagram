// ===========================================================================
// AVISAR: muestra un aviso en la Mac si una pieza no salió a su hora
//
// Lo corre el disparador de la Mac (disparar-desde-la-mac.sh) después de
// lanzar "Publicar". Compara lo que está en `main` de GitHub: las piezas de
// hoy y de ayer contra publicados.json. Si una pasó su hora hace más de 25
// minutos y no está anotada, espera a que termine la corrida recién lanzada
// (por si justo está saliendo) y, si sigue faltando, avisa en pantalla con el
// motivo. Avisa hasta 3 veces por pieza. No publica nada ni toca archivos
// del repo.
//
// Uso:
//   node scripts/avisar.mjs                                  lo que hace la tarea
//   node scripts/avisar.mjs --ahora "2026-11-25 12:09"       ensayo: como si fuera esa hora; solo lo escribe
//   node scripts/avisar.mjs --ahora "…" --en-pantalla        ensayo que además muestra el aviso
// Memoria de lo ya avisado: ~/Library/Application Support/almilu-publicar/avisos.json
// ===========================================================================

import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { parseArgs, promisify } from 'node:util';
import { RAIZ, horaDe, hoyUY, horaUY } from './comun.mjs';

const REPO = 'varo10uru/almilu-instagram';
const MEMORIA = join(homedir(), 'Library/Application Support/almilu-publicar/avisos.json');
const MARGEN_MIN = 25;      // minutos después de la hora antes de mirar
const VECES = 3;            // avisos por pieza, como mucho
const ESPERA_MAX_MIN = 8;   // cuánto esperar a que termine la corrida en curso

const { values: op } = parseArgs({ options: { ahora: { type: 'string' }, 'en-pantalla': { type: 'boolean' } } });
const ensayo = Boolean(op.ahora);
const ahora = ensayo ? new Date(`${op.ahora.replace(' ', 'T')}:00-03:00`) : new Date();
if ((ensayo && !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(op.ahora)) || Number.isNaN(ahora.getTime())){ console.error('--ahora va como "AAAA-MM-DD HH:MM"'); process.exit(2); }

const correr = promisify(execFile);
const git = async (...args) => (await correr('git', ['-C', RAIZ, ...args], { timeout: 60_000, maxBuffer: 1e7 })).stdout;
const gh = async (...args) => (await correr('gh', [...args, '-R', REPO], { timeout: 60_000 })).stdout;
const dormir = (s) => new Promise((r) => setTimeout(r, s * 1000));
const decir = (texto) => console.log(`${hoyUY()} ${horaUY()} aviso: ${texto}`);

// ----- Qué falta, según lo que hay en main -----
async function faltantes(){
  await git('fetch', '-q', 'origin', 'main');
  const publicados = new Set(JSON.parse(await git('show', 'origin/main:publicados.json')).map((p) => p.carpeta));
  const archivos = (await git('ls-tree', '-r', '--name-only', 'origin/main', 'semanas')).split('\n').filter((a) => a.endsWith('/post.json'));
  const dias = [hoyUY(ahora), hoyUY(new Date(ahora - 24 * 3600_000))];
  const faltan = [];
  for (const archivo of archivos){
    const carpeta = dirname(archivo);
    if (publicados.has(carpeta)) continue;
    const datos = JSON.parse(await git('show', `origin/main:${archivo}`));
    if (!dias.includes(datos.fecha)) continue;
    const hora = horaDe(datos);
    const salia = new Date(`${datos.fecha}T${hora}:00-03:00`);
    if (ahora - salia >= MARGEN_MIN * 60_000) faltan.push({ carpeta, tema: datos.tema, hora, esHoy: datos.fecha === dias[0] });
  }
  return faltan;
}

// Espera a que termine la corrida que lanzó recién la Mac
async function esperarCorrida(){
  await dormir(20);
  const limite = Date.now() + ESPERA_MAX_MIN * 60_000;
  while (Date.now() < limite){
    const corridas = JSON.parse(await gh('run', 'list', '--workflow', 'publicar.yml', '-L', '3', '--json', 'status'));
    if (corridas.every((c) => c.status === 'completed')) return;
    await dormir(15);
  }
}

// Por qué no salió, en palabras simples
async function motivo(){
  try {
    const secretos = JSON.parse(await gh('secret', 'list', '--json', 'name')).map((s) => s.name);
    if (!secretos.includes('IG_TOKEN')) return 'Falta conectar Meta.';
    const [ultima] = JSON.parse(await gh('run', 'list', '--workflow', 'publicar.yml', '-L', '1', '--json', 'conclusion'));
    if (ultima && ultima.conclusion !== 'success') return 'La publicación dio error en GitHub.';
  } catch { return 'No pude ver el motivo.'; }
  return 'Pedile a Claude que lo mire.';
}

async function enPantalla(texto){
  await correr('osascript', ['-e', 'on run argv', '-e',
    'display notification (item 1 of argv) with title "ALMILU: no salió una publicación" sound name "Glass"',
    '-e', 'end run', texto]);
}

try {
  const memoria = ensayo ? {} : JSON.parse(await readFile(MEMORIA, 'utf8').catch(() => '{}'));
  const sinAvisar = (lista) => lista.filter((f) => (memoria[f.carpeta] || 0) < VECES);

  let faltan = sinAvisar(await faltantes());
  if (faltan.length && !ensayo){
    await esperarCorrida();
    faltan = sinAvisar(await faltantes());
  }
  if (!faltan.length){
    if (ensayo) decir('nada para avisar');
    process.exit(0);
  }

  const porque = await motivo();
  for (const f of faltan){
    const texto = `"${f.tema}" (${f.esHoy ? 'hoy' : 'ayer'} ${f.hora}). ${porque}`;
    decir(texto);
    if (!ensayo || op['en-pantalla']) await enPantalla(texto);
    memoria[f.carpeta] = (memoria[f.carpeta] || 0) + 1;
  }
  if (!ensayo){
    await mkdir(dirname(MEMORIA), { recursive: true });
    await writeFile(MEMORIA, JSON.stringify(memoria, null, 2) + '\n');
  }
} catch (e){
  // Sin internet o sin GitHub no se puede saber: queda anotado y se mira en la próxima
  decir(`no pude comprobar (${String(e.message).split('\n')[0]})`);
}
