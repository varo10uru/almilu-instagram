// ===========================================================================
// COSAS COMPARTIDAS ENTRE LOS SCRIPTS
// Rutas, horarios de Uruguay y lectura de los post.json.
// ===========================================================================

import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ----- Horarios (hora de Uruguay, UTC-3 todo el año) -----
export const ZONA = 'America/Montevideo';

// Hora de publicación por tipo, si el post.json no trae "hora".
// Salen de Estadísticas de @almilu.uy al 17/11/2026 (picos de 11 y 20 h).
export const HORA_POR_TIPO = {
  post: '11:30',
  carrusel: '11:30',
  reel: '20:00',
};

export const TIPOS = Object.keys(HORA_POR_TIPO);

// Fecha de hoy en Uruguay, como "AAAA-MM-DD"
export function hoyUY(fecha = new Date()){
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(fecha);
}

// Hora actual en Uruguay, como "HH:MM"
export function horaUY(fecha = new Date()){
  return new Intl.DateTimeFormat('en-GB', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hour12: false }).format(fecha);
}

// Hora a la que sale un post
export const horaDe = (datos) => datos.hora || HORA_POR_TIPO[datos.tipo];

// ----- Encontrar y leer los post.json debajo de una o más carpetas -----
export async function buscarPosts(rutas){
  const encontrados = [];
  async function recorrer(ruta){
    const info = await stat(ruta);
    if (info.isFile() && ruta.endsWith('post.json')){
      encontrados.push(ruta);
    } else if (info.isDirectory()){
      for (const nombre of (await readdir(ruta)).sort()){
        if (nombre === 'node_modules' || nombre.startsWith('.')) continue;
        await recorrer(join(ruta, nombre));
      }
    }
  }
  for (const ruta of rutas) if (existsSync(resolve(ruta))) await recorrer(resolve(ruta));

  return Promise.all(encontrados.map(async (archivo) => ({
    archivo,
    carpeta: dirname(archivo),
    datos: JSON.parse(await readFile(archivo, 'utf8')),
  })));
}

// Archivos que tiene que tener un post listo para publicar
export function archivosDelPost(datos){
  if (datos.tipo === 'reel') return ['reel.mp4', 'portada.jpg'];
  return (datos.piezas || []).map((_, i) => `${i + 1}.jpg`);
}

export function existe(ruta){ return existsSync(ruta); }
