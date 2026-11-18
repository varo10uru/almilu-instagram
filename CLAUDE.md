# Publicador de ALMILU (Instagram + Facebook)

Repo público: GitHub sirve los JPG por raw.githubusercontent para que Meta los descargue. Por eso acá entra
**solo lo aprobado y ya terminado**, sin originales, sin metadatos (EXIF/GPS) y sin nada privado.

## Reglas
- **Nada entra a `semanas/` sin la aprobación del usuario** en la página de revisión de esa tanda (o un "dale" en el
  chat para esa pieza). Lo que está en `main` se publica solo a su hora.
- Las piezas se arman en `~/Desarrollo/Almilu/instagram/<reels|carruseles|fotos>/<fecha>-<slug>/` (con su script,
  `salida/`, `descripcion-ig.txt`, `descripcion-tiktok.txt` y `alt.txt`). Acá se copia solo la salida final.
- Las reglas de contenido son las de `~/Desarrollo/Almilu/PROMPT-REDES.md`: sin dinero, sin urgencia falsa, nunca
  "los dueños" ni nombres propios, la posada es "a una cuadra del médano", la habitación 15 no sale nunca,
  cierre con WhatsApp 096 402 185 + "enlace en el perfil" + una frase de fechas libres revisada ese día
  (https://almilu.uy/api/calendario) y sin fechas exactas. `scripts/validar.mjs` controla lo que se puede controlar.
- Música: solo pistas aprobadas por el usuario, con su licencia en `musica/LICENCIAS.md`.
- No tocar `~/Desarrollo/orum-instagram` ni nada de @orum.uy (cancelado el 5/11).
- Commits en español, uno por tanda aprobada.

## Una pieza: `semanas/<AAAA-MM-DD>/<slug>/`
- `post.json`:
  ```json
  {
    "fecha": "2026-11-19",
    "hora": "20:00",
    "tipo": "reel",
    "tema": "Abrió la Posada Almilu",
    "texto": "Descripción completa, que cierra con el WhatsApp 096 402 185 y el enlace en el perfil.",
    "hashtags": ["#PuntaDelDiablo", "#PosadaAlmilu", "#RochaUruguay"],
    "piezas": [],
    "ia": false,
    "credito_campi": false
  }
  ```
  - `tipo`: `post` (una foto), `carrusel` (2 a 10 láminas) o `reel`.
  - `piezas`: una por imagen, con `alt` (texto alternativo). En un reel va vacío.
  - `hora` es opcional: sin ella, 11:30 para post y carrusel y 20:00 para reel.
  - `ubicacion_id` (opcional): id de la página de Facebook del lugar.
- Archivos: `1.jpg`, `2.jpg`… (1080×1350, JPEG sRGB) o `reel.mp4` (1080×1920, H.264, AAC) + `portada.jpg` (1080×1920).
- Antes del commit: `node scripts/validar.mjs semanas/<fecha>`.
