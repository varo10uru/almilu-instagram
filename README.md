# Instagram y Facebook de ALMILU

Publica solo, a su hora, lo que ya aprobaste. Es el mismo sistema que se usó para ORUM, aparte y para @almilu.uy.

- **Las piezas se arman** en `~/Desarrollo/Almilu/instagram/` y las revisás en la página de revisión de cada semana.
- **Lo que marcás "Aprobada"** entra a este repo, en `semanas/<fecha>/<pieza>/`. Nada sin aprobar entra acá.
- **A su hora sale solo:** carruseles y fotos a las 11:30, reels a las 20:00 (o la `hora` del `post.json`), en Instagram y en la página de Facebook. Lo publicado queda anotado en `publicados.json` y no se repite.
- **TikTok** sigue a mano: cada semana queda un kit con los videos y los textos, y lo programás en TikTok Studio (unos 10 minutos).

## Qué corre, cuándo y cómo se apaga

| Qué | Cuándo | Cómo se apaga |
|---|---|---|
| Action **Publicar** (este repo) | Cada hora, y cada vez que la lanza la Mac | `gh workflow disable publicar.yml -R varo10uru/almilu-instagram` |
| Tarea de la Mac **uy.almilu.publicar** (launchd) | Minutos 9 y 39 de cada hora, de 10 a 22. Solo con la Mac prendida | `zsh scripts/disparar-desde-la-mac.sh --sacar` |
| Action **Renovar token** | Lunes 09:23: revisa que la conexión siga andando | `gh workflow disable renovar-token.yml -R varo10uru/almilu-instagram` |
| Action **Validar** | Cada vez que entra algo a `semanas/` | `gh workflow disable validar.yml -R varo10uru/almilu-instagram` |

La Mac dispara "Publicar" porque GitHub atrasa sus horarios (en ORUM, hasta 5 horas). Registro de la Mac: `~/Library/Logs/almilu-publicar.log`.

## Puesta en marcha (una sola vez, la hacés vos)

1. **Página de Facebook vinculada a @almilu.uy.** En la app de Instagram: Editar perfil → Página → conectar la página de Facebook de ALMILU (o crearla). La API de Meta publica en Instagram a través de esa página.
2. **App de Meta.** Sirve la que ya existe, "ORUM Publicaciones" (modo desarrollo). La cuenta de Facebook con la que generás el token tiene que ser administradora de la app **y** de la página de ALMILU. Si la página es de otra cuenta de Facebook, sumá tu cuenta como administradora de la página (o sumá esa cuenta a la app: Roles → Administradores).
3. **Token.** En el Explorador de la API Graph (developers.facebook.com/tools/explorer):
   1. Elegí la app y tocá "Obtener token de acceso de usuario".
   2. Agregá los permisos `instagram_basic`, `instagram_content_publish`, `instagram_manage_insights`, `pages_show_list`, `pages_read_engagement`, `business_management` y `pages_manage_posts`.
   3. Tocá "Generate Access Token" y autorizá la página de ALMILU y @almilu.uy.
4. **Guardarlo en el repo.** En la Terminal:
   ```
   cd ~/Desarrollo/almilu-instagram
   node scripts/conectar.mjs
   ```
   Pide el App ID, la clave secreta y el token (lo secreto no se ve al escribirlo). Guarda en GitHub el token de la página, que no vence, y el id de @almilu.uy. **Los tokens nunca se pegan en un chat.**
5. **Probar sin publicar:** Actions → Publicar → Run workflow, con una carpeta y "Simular" marcado.
6. **Prender Facebook** (después de probarlo con "Simular" + "Incluir la página de Facebook"):
   `gh variable set PUBLICAR_EN_FACEBOOK --body si --repo varo10uru/almilu-instagram`

## Música de los reels

Por la API, los reels no pueden llevar música de la biblioteca de Instagram: sale el sonido que trae el video. Cada reel lleva una pista libre de derechos, con licencia para uso comercial, que aprobaste antes. La licencia de cada pista queda anotada en `musica/LICENCIAS.md`.

## Si algo falla

- GitHub manda un mail cuando una corrida de "Publicar" falla. Lo que sí salió queda anotado.
- Para relanzar un día: Actions → Publicar → modo "fecha" y la fecha.
- Para ver qué hay cargado: `node scripts/validar.mjs` (revisa todo `semanas/`).
- Para ver la cuenta conectada: `IG_TOKEN=… IG_USER_ID=… node scripts/publicar.mjs --probar` (o Actions con "Simular").
