// ===========================================================================
// PUBLICAR: sube a Instagram (y a la página de Facebook) lo que toca hoy
//
// Uso:
//   node scripts/publicar.mjs --probar
//        Muestra la cuenta conectada y cuánto queda del cupo de la API.
//   node scripts/publicar.mjs --pendientes
//        Publica lo de hoy cuya hora ya llegó (carruseles y fotos desde las
//        11:30, reels desde las 20:00, o la "hora" del post.json). Es lo que
//        lanzan la Action de cada hora y el disparador de la Mac.
//   node scripts/publicar.mjs --fecha 2026-11-19
//        Publica todo lo de esa fecha, sin mirar la hora (para relanzar un
//        día que falló).
//   node scripts/publicar.mjs --carpeta semanas/2026-11-19/reel-posada
//        Publica ese post ya, sin mirar la fecha.
//   Con --simular hace todo menos el último paso: Instagram descarga y
//   revisa las imágenes y el video, pero no se publica nada.
//
// En semanas/ (rama main) está SOLO lo aprobado: una pieza entra al repo
// recién cuando el usuario la marcó "Aprobada" en la página de revisión.
//
// Con FACEBOOK=si, cada cosa que sale en Instagram sale también en la página
// de Facebook (ver facebook.mjs). Primero va Instagram y se anota; si
// Facebook falla, se reintenta en las corridas siguientes de ese día.
// Lo que tiene personas hechas con IA ("ia": true) no va a Facebook: su API
// no tiene una forma confirmada de ponerle la etiqueta.
//
// Lo publicado se anota en publicados.json y no se vuelve a publicar.
// ===========================================================================

import { readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { RAIZ, archivosDelPost, buscarPosts, horaDe, horaUY, hoyUY } from './comun.mjs';
import { cuenta, prepararContenedor, publicarContenedor, tieneEtiquetaDeIA, ultimasPublicaciones } from './instagram.mjs';
import { validarPost } from './validar.mjs';
import { facebookPrendido, publicarEnFacebook } from './facebook.mjs';

const RUTA_PUBLICADOS = join(RAIZ, 'publicados.json');

// Dirección pública de los archivos del repo. En GitHub Actions se usa el
// commit exacto, así Instagram nunca recibe una versión vieja.
function baseDeMedios(){
  if (process.env.MEDIOS_URL) return process.env.MEDIOS_URL.replace(/\/?$/, '/');
  const repo = process.env.GITHUB_REPOSITORY || 'varo10uru/almilu-instagram';
  const ref = process.env.GITHUB_SHA || 'main';
  return `https://raw.githubusercontent.com/${repo}/${ref}/`;
}

// Revisa que Instagram vaya a poder descargar la imagen
async function comprobarUrl(url){
  const r = await fetch(url, { method: 'HEAD' });
  if (!r.ok) throw new Error(`no se puede descargar ${url} (${r.status}): ¿está subido a GitHub?`);
  if (!/^image\/jpeg/.test(r.headers.get('content-type') || '')) throw new Error(`${url} no llega como JPEG`);
}

// El texto tal como sale en Instagram: texto + hashtags
const textoCompleto = (datos) => `${datos.texto}\n\n${datos.hashtags.join(' ')}`;
const normalizar = (t = '') => t.replace(/\s+/g, ' ').trim().slice(0, 150);
// Lo que se sube a mano ("a_mano": true) ya va a Facebook desde la app
const vaAFacebook = ({ datos }) => facebookPrendido() && !datos.ia && !datos.a_mano;

// Lo que se sube: el texto, las URLs públicas de las imágenes y el video
async function mediosDelPost({ carpeta, datos }){
  const base = baseDeMedios();
  const archivos = archivosDelPost(datos);
  const imagenes = archivos.filter((a) => a.endsWith('.jpg') && a !== 'portada.jpg').map((a) => base + relative(RAIZ, join(carpeta, a)));
  for (const url of imagenes) await comprobarUrl(url);
  const portada = datos.tipo === 'reel' ? base + relative(RAIZ, join(carpeta, 'portada.jpg')) : undefined;
  if (portada) await comprobarUrl(portada);
  return {
    tipo: datos.tipo,
    texto: textoCompleto(datos),
    alts: (datos.piezas || []).map((p) => p.alt),
    imagenes,
    video: datos.tipo === 'reel' ? join(carpeta, 'reel.mp4') : undefined,
    portada,
    conIA: !!datos.ia,
  };
}

async function aFacebook(post, anotado, publicados){
  const fb = await publicarEnFacebook(await mediosDelPost(post));
  anotado.facebook = fb.link || fb.id;
  await writeFile(RUTA_PUBLICADOS, JSON.stringify(publicados, null, 2) + '\n');
  console.log(`  ${anotado.carpeta}: en Facebook ${anotado.facebook}`);
}

let fallas = 0;

async function publicarPost(post, { simular }){
  const { carpeta, datos } = post;
  const nombre = relative(RAIZ, carpeta);

  const errores = await validarPost(post);
  if (errores.length) throw new Error(`${nombre} no pasa la revisión:\n    ${errores.join('\n    ')}`);

  // Por si una corrida anterior publicó pero no llegó a anotarlo
  const texto = normalizar(textoCompleto(datos));
  const yaEsta = (await ultimasPublicaciones()).find((m) =>
    normalizar(m.caption) === texto && (m.media_product_type === 'REELS') === (datos.tipo === 'reel'));
  if (yaEsta){
    console.log(`  ${nombre}: ya estaba publicado (${yaEsta.permalink}); lo anoto`);
    return { id: yaEsta.id, link: yaEsta.permalink };
  }

  const medios = await mediosDelPost(post);
  const contenedor = await prepararContenedor({ ...medios, ubicacion: datos.ubicacion_id });

  if (simular){
    console.log(`  ${nombre}: Instagram lo aceptó (contenedor ${contenedor}). No se publicó: es una simulación.`);
    if (vaAFacebook(post)){
      await publicarEnFacebook({ ...medios, simular: true });
      console.log(`  ${nombre}: Facebook lo aceptó. No se publicó: es una simulación.`);
    }
    return null;
  }
  const publicado = await publicarContenedor(contenedor);
  console.log(`  ${nombre}: publicado ${publicado.link || publicado.id}`);
  if (medios.conIA && !await tieneEtiquetaDeIA(publicado.id)){
    fallas++;
    console.error(`✗ ${nombre}: salió sin la etiqueta de IA. Hay que ponérsela a mano en Instagram.`);
  }
  return publicado;
}

// ----- Desde la terminal -----
const { values: op } = parseArgs({
  options: {
    probar: { type: 'boolean' },
    pendientes: { type: 'boolean' },
    fecha: { type: 'string' },
    carpeta: { type: 'string' },
    simular: { type: 'boolean' },
  },
});

if (op.probar){
  try {
    const c = await cuenta();
    console.log(`Cuenta: @${c.username}, id ${c.id}`);
    console.log(`Publicaciones por API en las últimas 24 h: ${c.limite?.quota_usage ?? '?'} de ${c.limite?.config?.quota_total ?? 100}`);
    process.exit(0);
  } catch (e){
    console.error(`✗ No me pude conectar con Instagram: ${e.message}`);
    process.exit(1);
  }
}

// Los carruseles y las fotos llevan música y la API no la permite: se suben a
// mano desde la app ("a_mano": true) y acá se saltean, salvo con --carpeta.
const sinLosDeAMano = (lista) => lista.filter((p) => {
  if (p.datos.a_mano) console.log(`  ${relative(RAIZ, p.carpeta)}: va a mano, con música; lo salteo`);
  return !p.datos.a_mano;
});

let posts;
if (op.carpeta){
  posts = await buscarPosts([op.carpeta]);
} else if (op.pendientes){
  const [fecha, ahora] = [hoyUY(), horaUY()];
  posts = sinLosDeAMano((await buscarPosts([join(RAIZ, 'semanas')])).filter((p) => p.datos.fecha === fecha && horaDe(p.datos) <= ahora));
  console.log(`${fecha} ${ahora}: ${posts.length ? posts.length + ' con la hora cumplida' : 'nada para esta hora'}`);
} else if (op.fecha){
  posts = sinLosDeAMano((await buscarPosts([join(RAIZ, 'semanas')])).filter((p) => p.datos.fecha === op.fecha));
  console.log(`${op.fecha}: ${posts.length ? posts.length + ' para publicar' : 'nada'}`);
} else {
  console.error('Uso: node scripts/publicar.mjs --probar | --pendientes | --fecha AAAA-MM-DD | --carpeta <ruta> [--simular]');
  process.exit(2);
}

const publicados = JSON.parse(await readFile(RUTA_PUBLICADOS, 'utf8'));
for (const post of posts){
  const carpeta = relative(RAIZ, post.carpeta);
  const anotado = publicados.find((p) => p.carpeta === carpeta);
  if (anotado){
    if (vaAFacebook(post) && !op.simular && !anotado.facebook && anotado.fecha === hoyUY()){
      try { await aFacebook(post, anotado, publicados); } catch (e){ fallas++; console.error(`✗ ${carpeta} en Facebook: ${e.message}`); }
    } else {
      console.log(`  ${carpeta}: ya publicado, lo salteo`);
    }
    continue;
  }
  let nuevo = null;
  try {
    const r = await publicarPost(post, { simular: op.simular });
    if (r){
      const { fecha: planeada, tipo, tema } = post.datos;
      const fecha = hoyUY();
      nuevo = { fecha, ...(planeada !== fecha && { planeada }), carpeta, tipo, tema, id: r.id, link: r.link, publicado: new Date().toISOString() };
      publicados.push(nuevo);
      // Se anota enseguida, para que nunca quede algo publicado sin anotar
      await writeFile(RUTA_PUBLICADOS, JSON.stringify(publicados, null, 2) + '\n');
    }
  } catch (e){
    fallas++;
    console.error(`✗ ${carpeta}: ${e.message}`);
  }
  if (nuevo && vaAFacebook(post)){
    try { await aFacebook(post, nuevo, publicados); } catch (e){ fallas++; console.error(`✗ ${carpeta} en Facebook: ${e.message}`); }
  }
}
if (fallas) process.exit(1);
