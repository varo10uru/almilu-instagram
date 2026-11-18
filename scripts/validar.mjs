// ===========================================================================
// VALIDAR: revisa que cada post cumpla las reglas de ALMILU antes de salir
//
// Uso:  node scripts/validar.mjs [carpetas...]     (sin nada: todo semanas/)
// Sale con error si algún post no pasa. publicar.mjs lo corre antes de
// publicar cada cosa: lo que no pasa, no sale.
//
// Reglas (del PROMPT-REDES de ALMILU):
// - nada de dinero: ni precios, ni seña, ni formas de pago;
// - sin urgencia falsa ("últimos lugares", "reservá ya");
// - nunca "los dueños" ni el otro número; la posada es "a una cuadra del
//   médano", nunca "de la playa";
// - cada descripción cierra con el WhatsApp 096 402 185 y "enlace en el
//   perfil", y lleva de 3 a 5 hashtags;
// - cada imagen lleva texto alternativo;
// - si hay personas hechas con IA ("ia": true), la descripción lo aclara;
// - el aéreo de Marcelo Campi ("credito_campi": true) lleva su crédito.
// ===========================================================================

import { readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { RAIZ, TIPOS, archivosDelPost, buscarPosts, existe } from './comun.mjs';

const normalizar = (t = '') => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Palabras y frases que no pueden aparecer (ya normalizadas: sin tildes)
const PROHIBIDAS = [
  [/\bprecios?\b|\btarifas?\b|\bcuesta\b|\bsale\s+\$|\bu\$s\b|us\$|\$u\b|\bdolares\b|\bpesos\b/, 'dinero (precios)'],
  [/\bsenas?\b|\bsenar\b/, 'la seña'],
  [/\bpagos?\b|\bpagar\b|\btransferencia\b|mercado ?pago|\befectivo\b|\bcuotas\b/, 'formas de pago'],
  [/ultimos lugares|ultimas fechas|reserva(r)? ya\b|reserva hoy|no te lo pierdas|apurate/, 'urgencia falsa'],
  [/los duenos|\bduenos\b/, '"los dueños"'],
  [/096 ?239 ?730/, 'el otro número'],
  [/cuadra de la playa|cuadra del mar/, 'la posada es "a una cuadra del médano"'],
  [/monoambiente/, 'se dice "la posada" o "la habitación", no "monoambiente"'],
];

// Ancho y alto de un JPEG, leyendo su encabezado
async function medidasJPEG(ruta){
  const b = await readFile(ruta);
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i < b.length){
    if (b[i] !== 0xff){ i++; continue; }
    const marca = b[i + 1];
    const largo = b.readUInt16BE(i + 2);
    if (marca >= 0xc0 && marca <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marca)){
      return { alto: b.readUInt16BE(i + 5), ancho: b.readUInt16BE(i + 7) };
    }
    i += 2 + largo;
  }
  return null;
}

// Devuelve la lista de problemas de un post (vacía si está todo bien)
export async function validarPost({ carpeta, datos }){
  const e = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datos.fecha || '')) e.push('"fecha" tiene que ser AAAA-MM-DD');
  if (datos.hora && !/^\d{2}:\d{2}$/.test(datos.hora)) e.push('"hora" tiene que ser HH:MM');
  if (!TIPOS.includes(datos.tipo)) e.push(`"tipo" tiene que ser ${TIPOS.join(', ')}`);
  if (typeof datos.texto !== 'string' || !datos.texto.trim()) e.push('falta "texto"');

  const hashtags = datos.hashtags || [];
  if (hashtags.length < 3 || hashtags.length > 5) e.push(`van de 3 a 5 hashtags (tiene ${hashtags.length})`);
  for (const h of hashtags) if (!/^#[\p{L}\p{N}_]+$/u.test(h)) e.push(`hashtag mal escrito: "${h}"`);

  const texto = datos.texto || '';
  const completo = `${texto}\n\n${hashtags.join(' ')}`;
  if (completo.length > 2200) e.push(`la descripción pasa los 2.200 caracteres (${completo.length})`);
  if (!texto.includes('096 402 185')) e.push('la descripción tiene que cerrar con el WhatsApp 096 402 185');
  if (!/enlace en el perfil/i.test(texto)) e.push('la descripción tiene que decir "enlace en el perfil"');

  const todo = normalizar([texto, ...(datos.piezas || []).map((p) => p.alt || '')].join('\n'));
  for (const [regla, motivo] of PROHIBIDAS) if (regla.test(todo)) e.push(`no puede ir: ${motivo}`);

  if (datos.ia === true && !/\bIA\b|inteligencia artificial/i.test(texto)) e.push('tiene personas hechas con IA: la descripción lo tiene que aclarar');
  if (datos.credito_campi === true && !/Marcelo Campi/.test(texto)) e.push('usa el aéreo de Marcelo Campi: falta su crédito en la descripción');

  // Piezas y archivos
  const piezas = datos.piezas || [];
  if (datos.tipo === 'post' && piezas.length !== 1) e.push('un post lleva una sola pieza');
  if (datos.tipo === 'carrusel' && (piezas.length < 2 || piezas.length > 10)) e.push('un carrusel lleva de 2 a 10 láminas');
  if (datos.tipo !== 'reel') piezas.forEach((p, i) => { if (!p.alt || p.alt.trim().length < 15) e.push(`a la lámina ${i + 1} le falta un texto alternativo que la describa`); });

  for (const archivo of archivosDelPost(datos)){
    const ruta = join(carpeta, archivo);
    if (!existe(ruta)){ e.push(`falta ${archivo}`); continue; }
    const { size } = await stat(ruta);
    if (archivo.endsWith('.jpg')){
      if (size > 8 * 1024 * 1024) e.push(`${archivo} pesa más de 8 MB`);
      const m = await medidasJPEG(ruta);
      const esperado = archivo === 'portada.jpg' ? [1080, 1920] : [1080, 1350];
      if (!m) e.push(`${archivo} no es un JPEG`);
      else if (m.ancho !== esperado[0] || m.alto !== esperado[1]) e.push(`${archivo} mide ${m.ancho}×${m.alto}; tiene que medir ${esperado.join('×')}`);
    }
    if (archivo.endsWith('.mp4') && size > 300 * 1024 * 1024) e.push(`${archivo} pesa más de 300 MB`);
  }
  return e;
}

// ----- Desde la terminal -----
if (import.meta.url === `file://${process.argv[1]}`){
  const rutas = process.argv.slice(2);
  const posts = await buscarPosts(rutas.length ? rutas : [join(RAIZ, 'semanas')]);
  let malos = 0;
  for (const post of posts){
    const errores = await validarPost(post);
    const nombre = relative(RAIZ, post.carpeta);
    if (errores.length){ malos++; console.log(`✗ ${nombre}\n    ${errores.join('\n    ')}`); }
    else console.log(`✓ ${nombre}`);
  }
  console.log(`\n${posts.length - malos} de ${posts.length} pasan la revisión.`);
  if (malos) process.exit(1);
}
