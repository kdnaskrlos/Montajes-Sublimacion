# Estado actual
Fecha 2026-11-25. Versión 1.31.0 integrada en el `main` saneado local. En GitHub, `main` conserva 1.30.0 y el PR #7 sigue abierto.

## Preparación local de la publicación

- El propietario informó que activó la privacidad del correo y el bloqueo de pushes que lo exponen. Se confirmó otra vez el respaldo restaurando su bundle y verificando sus referencias y objetos. La integración local conserva los archivos de la PWA. La sustitución remota y la publicación siguen pendientes de autorización.

- Se conserva un único repositorio. Esta limpieza se preparó en una copia Git aislada. En GitHub, Pages sigue deshabilitado y el PR #7 sigue abierto. La PWA conserva la versión 1.31.0.
- El respaldo privado comprobado contiene las 16 referencias Git anunciadas. La copia local reescribe 25 commits, preserva sus relaciones y los instantes de las fechas, normaliza las zonas a UTC y sustituye los correos y nombres personales de Git por la identidad pública de GitHub. Se limpiaron seis mensajes con coautoría. GitHub vinculaba una de las direcciones a la cuenta del propietario. Para la otra se usó la coincidencia de la firma de autoría con commits noreply verificados y las coautorías del historial. Los correos originales siguen en el respaldo privado.
- Se retiraron metadatos de autor y edición del PNG histórico y se reconstruyeron tres variantes de ZIP de distribución. Los píxeles y el perfil de color del PNG se conservaron. El ICO se comprobó en todos sus tamaños y sus bytes se conservaron. En la copia histórica se retiraron enlaces directos al adjunto y al ZIP original.
- La compilación de Pages y los archivos del programa coincidieron byte por byte con la versión previa. Pasaron las 44 comprobaciones con Chromium mediante `node tests/i0.mjs --no-sandbox`. La política de este entorno bloqueó `file://` y se probó su flujo por HTTP local. Los hooks de Git aceptaron noreply y bloquearon identidades, mensajes, antecesores y etiquetas con correos ficticios no permitidos.
- GitHub conserva las ocho ramas y ocho referencias de PR anteriores a la reescritura local. No se anunciaban etiquetas ni se encontraron releases. El adjunto del PR #5 coincide byte por byte con el PNG original y conserva sus metadatos. Se revisaron los dos runs históricos de Actions. No tenían artefactos descargables y sus logs conservan SHA antiguas. Persisten también las posibles vistas en caché y copias fuera del repositorio.
- Antes de publicar, resolver el adjunto y coordinar con GitHub la retirada de referencias de PR, vistas en caché y objetos viejos. La reescritura de ramas exige autorización por separado. Revisar las SHA originales con el repositorio todavía privado y coordinar la sustitución de clones existentes. GitHub Support aplica sus propios criterios para retirar datos.

## Base técnica de 1.29.0
Archivo único Montajes-Sublimacion.html. La base original v1.28.3 tenía 157199 bytes y SHA-256 `0055a2865226253d77ce6cdb6c4aa179ad73b32eaf8e2f1abc1b3e7d653035a5`. Git blob original `08e8e63def45fb35c48a550a91507df3c8015634`. Commit de importación `c59dae4b355842d38e9dd1cafeb2f4a31a5f45d0`.
HTML/CSS/JS nativo, 4 vistas (Pedidos, Resumen, Producción, Historial), 16 tallas y 10 categorías. Datos en localStorage (montajes-sub, montajes-lotes, montajes-tema), imágenes en IndexedDB (montajes-img/img). Adaptadores de Claude opcionales (window.claude.use: db, assets, downloads). Fuente remota Google Fonts. Sin Firebase independiente ni servidor necesario.

## Evidencia inicial
- Node --check: JavaScript sintácticamente válido.
- Pruebas aisladas ejecutadas en Node con funciones originales: 3 franelas + 2 suéteres + 1 short (2 piezas) = 22; valor negativo -2 en franelas se incluye y reduce total a 2; conversión de 3 mangas a pares da 1.5 y alerta de entero; frente + espalda + mangas chemis genera aviso erróneo de falta de mangas.
- Durante la configuración del entorno se verificaron en Chromium las cuatro vistas, tres franelas talla M (12 piezas) y la persistencia del pedido al recargar. La apertura directa con `file://` quedó bloqueada por la política del navegador. Las comprobaciones de I0 usaron HTTP local.

## Validación de I0
- **Exitosas.** Carga de SVG ficticio, lectura desde IndexedDB y recuperación tras recargar. Creación de lote, carga de su pedido con imagen desde Historial y eliminación persistente. Descarga de respaldo JSON formato 1 e importación en un perfil limpio, con recuperación de las imágenes del pedido y del lote después de recargar. Generación y descarga de la hoja HTML con imagen, invocación de imprimir desde la aplicación y comprobación del nombre y cantidad en el PDF generado por Chromium.
- **Fallida, reproducida de forma controlada.** Con «Vaciar los pedidos» marcado y `QuotaExceededError` solo en `montajes-lotes`, la interfaz confirmó que el lote se guardó y persistió los pedidos vacíos. Tras recargar, el lote y el pedido ficticio se habían perdido.
- **No ejecutadas.** Diálogo nativo de impresión, impresora física y comprobación visual de recortes o paginación con varios clientes. La prueba sustituyó el diálogo por una comprobación de la llamada y generó el PDF desde el HTML descargado. Los servicios opcionales de Claude quedaron fuera del flujo local.

Comando y alcance de las pruebas en [tests/README.md](../tests/README.md).

## Validación de I1

- El historial muestra la última escritura confirmada. Si falla el guardado de un lote, se conservan pedidos y formulario para reintentar. El vaciado opcional se refleja después de que se escriben tanto el lote como los pedidos vacíos.
- Los autosalvados fallidos de pedidos y lotes conservan las ediciones en memoria y muestran **Reintentar guardado**. Ocultar la página, recargarla o cerrarla dispara un intento inmediato. Si quedan cambios en memoria, la aplicación solicita el aviso de salida que admita el navegador.
- Chromium verificó fallos simulados de cuota, reintentos, historial, vaciado, recarga y cierre normal. Un adaptador simulado verificó rechazos y ediciones concurrentes durante la escritura. El servicio real de Claude y los cierres forzados quedaron fuera de estas pruebas.

## Validación de I2

- Los respaldos formato 1 nuevos incluyen lote activo, portada de pedidos y tema. Un respaldo incompleto, con referencias ausentes o con imágenes que no se pueden abrir se rechaza antes de escribir pedidos o lotes.
- IndexedDB conserva un punto de recuperación del navegador. La app revierte fallos parciales y retoma una reversión pendiente al abrir. Historial ofrece **Restaurar estado anterior** tras cambiar el estado con un respaldo.
- Importar la misma copia reutiliza imágenes y lotes. El vínculo activo apunta a la copia importada si está intacta. Si la copia coincide con un lote local previo o el lote importado fue modificado, los pedidos quedan desvinculados para proteger el historial. El formato 1 original, sin vínculo activo, también se restaura desvinculado.
- Las 28 comprobaciones de Chromium con datos ficticios (15 de I0/I1 y 13 de I2) pasaron con `node tests/i0.mjs --no-sandbox` en HTTP local. Los fallos de almacenamiento fueron simulados. La política del entorno bloqueó `file://`.
- La importación segura se realiza en la aplicación local con IndexedDB y Web Locks. El adaptador de Claude se simuló para verificar la indicación de usar el flujo local y sus guardados de I1. El servicio real quedó fuera de las pruebas.

## Estabilización I3/I4

- La entrada y el copiado admiten cantidades enteras seguras. Las conversiones se aplican a todas las tallas juntas y se rechazan si sobra una manga o una pieza de short. Las antiguas fracciones de conversión recuperables se muestran en piezas o unidades exactas. Las demás cantidades antiguas permanecen visibles para su corrección y bloquean imprimir, emitir CSV/hoja o guardar un lote con datos incompletos. El respaldo formato 1 conserva esas cantidades pendientes.
- Las mangas chemis se mantienen en su categoría. Pedidos, Resumen, Producción y el detalle histórico muestran cantidades calculadas con las reglas y ajustes correspondientes. La hoja descargada deja crecer las indicaciones y pagina según el contenido.
- Cargar un lote desde Historial abre una copia editable. Las imágenes de Pedidos y las portadas históricas tienen destinos independientes. El guardado automático continúa para el lote en curso. Deshacer y rehacer incluyen la portada del pedido y evitan reactivar un lote anterior.
- La app local usa Web Locks para dar el guardado a una pestaña por origen y compara el estado de pedidos e historial antes de escribir. Una pestaña rezagada conserva el borrador en memoria y permite exportarlo desde Historial. En navegadores sin Web Locks, la comprobación de estado detecta sobrescrituras que ya llegaron al almacenamiento, sin exclusión mutua.

## Validación de I3/I4

- Pasaron 35 comprobaciones con datos ficticios en Chromium 156 y HTTP de loopback mediante `node tests/i0.mjs --no-sandbox`. Se reutilizaron las 28 pruebas de I0 a I2 y se añadieron 7 comprobaciones para las correcciones. El PDF generado incluye las indicaciones completas del caso de prueba.
- La política de Chromium bloqueó `file://` con `ERR_BLOCKED_BY_ADMINISTRATOR`. Quedaron pendientes la apertura directa, el diálogo nativo de impresión, la impresora física y el servicio real de Claude. Los fallos de almacenamiento y el adaptador se probaron mediante simulación.

## Pendientes fuera de la estabilización

- Limpieza de imágenes huérfanas, validación del orden de fechas, revisión visual y accesibilidad. Los estados sin interfaz y el campo de diseño residual quedan para una iteración de flujo.

## Hoja de ruta
I0: entorno Codex configurado y batería de referencia ejecutada con datos ficticios. HTML base v1.28.3 intacto.
I1: guardado seguro de pedidos y lotes integrado en main, commit `db3fc4d`.
I2: respaldos y restauración segura integrados en `main` en `2994984`.
I3/I4: estabilización de cantidades, producción, historial y guardado local entre pestañas integrada en `de39965`.
I5: revisión visual de impresión, experiencia móvil/escritorio y accesibilidad (medio).
I6: mejoras funcionales según necesidades reales del usuario (medio). Evaluar IndexedDB para datos si límites/volumen lo justifican; no nube por defecto.

## Distribución de 1.29.0

- Instrucciones de apertura, respaldo y acceso directo para Windows en [LEEME.txt](../distribucion/LEEME.txt).
- El PNG aprobado se conserva byte por byte. El ICO contiene tamaños de 16 a 256 píxeles y el HTML incorpora un favicon PNG de 64 × 64. Al retirar la etiqueta del favicon, el HTML coincide byte por byte con `de39965`. La procedencia del icono se registró en el PR n.º 5.
- El ZIP de distribución (rama `codex/distribucion-v1.29.0`) contiene el HTML, ambos formatos de icono y las instrucciones. Se verificaron su integridad y la decodificación del favicon en Chromium por HTTP local. La validación conserva las 35 comprobaciones de la base.

## Versión 1.30.0

- Pedidos tiene 16 columnas y 17 tallas hasta 5XL. Resumen conserva la presentación de Prendas por talla y muestra pares más unidades sueltas. Los cuerpos y mangas de chemis se cuentan por separado de los estándar. El PNG aprobado se incrustó como icono interno y el favicon de distribución se conserva.
- Los pedidos antiguos se migran al abrir y se guardan con el flujo habitual. Los lotes históricos se interpretan al leerlos y conservan sus registros originales hasta que se actualizan mediante el flujo de guardado. Los respaldos siguen en formato 1. Cada pedido o lote usa su configuración histórica para recuperar unidades y piezas. Un short antiguo con un factor distinto de dos pasa a piezas sueltas con su total físico original. Las cantidades inválidas siguen bloqueando la producción hasta corregirlas.
- Pasaron las 38 comprobaciones con datos ficticios en Chromium 156 mediante `node tests/i0.mjs --no-sandbox`. Se verificaron las 16 categorías por separado y las 34 piezas al combinarlas en 5XL, incluida la restauración del respaldo, el CSV, la hoja y el PDF generado. Se revisó el desplazamiento de las tablas en escritorio y móvil. Chromium bloqueó `file://` por su política y el flujo se probó por HTTP de loopback. La llamada al diálogo de impresión y el adaptador de Claude se simularon. Quedaron pendientes la impresora física y el servicio real de Claude.
- El [ZIP de 1.30.0](../distribucion/Montajes-Sublimacion-v1.30.0.zip) incluye el HTML de la rama, el PNG e ICO de distribución y las instrucciones. Se comprobó la integridad del ZIP y la coincidencia de sus entradas con los archivos fuente.

## Versión 1.31.0 para GitHub Pages

- `Montajes-Sublimacion.html` sigue siendo el archivo autónomo y el origen de la compilación. `scripts/build-pages.mjs` genera `dist/` con la PWA y una copia descargable del HTML. El manifest usa `/Montajes-Sublimacion/`, el plotter aprobado en PNG de 192 y 512 px, una variante enmascarable y un icono de 180 px para Apple. Pages sirve Plus Jakarta Sans desde su propia ruta.
- El service worker precarga únicamente los archivos de la aplicación y comprueba que el HTML corresponde a su compilación. Cada versión de caché se identifica por la compilación y el ámbito del service worker. Al aceptar una actualización, se verifica el guardado antes de recargar. Las demás pestañas conservan su sesión y muestran el aviso.
- Pages usa el prefijo `Montajes-Sublimacion:` en localStorage, IndexedDB y Web Locks. El HTML descargado conserva sus identificadores originales. La migración entre orígenes se hace con **Exportar respaldo** e **Importar respaldo**, en formato 1. La aplicación y el flujo de publicación carecen de un servidor de datos. El prefijo evita colisiones accidentales en el mismo origen, donde el navegador comparte permisos entre aplicaciones.
- GitHub Actions valida los PR y `main`, y prepara el despliegue desde `main`. Pages estaba deshabilitado durante la auditoría. El flujo público y la instalación en dispositivos físicos quedan pendientes.
- Pasaron las 38 comprobaciones existentes y seis nuevas en Chromium 156 con `node tests/i0.mjs --no-sandbox`. Se verificaron el manifest, el arranque sin red, la descarga, la migración por respaldo y el guardado entre versiones. Chromium bloqueó `file://` por política del entorno y se probó el archivo descargable por HTTP local. El aviso de instalación se simuló. `actionlint` validó el workflow y dos compilaciones produjeron archivos idénticos.
- GitHub Actions confirmó las 44 comprobaciones en Chrome y permitió abrir el HTML mediante `file://`. En esa modalidad pasaron las pruebas de imágenes, respaldo, restauración y PDF. [Ejecución del PR](https://github.com/kdnaskrlos/Montajes-Sublimacion/actions/runs/45743061883).

## Auditoría de publicación de 1.31.0

- Se revisaron 22 commits y 51 blobs de las siete ramas remotas, las seis referencias de PR, los archivos comprimidos, las imágenes incrustadas y las conversaciones y revisiones de los seis PR existentes. En GitHub no había issues independientes, versiones publicadas ni ejecuciones de Actions. Wiki y Discussions estaban deshabilitados.
- Gitleaks 8.24.3 no detectó credenciales en el historial analizado. El inventario y la inspección visual encontraron sólo variantes del icono del plotter, además de las referencias ficticias usadas por las pruebas. Los ZIP contienen HTML, iconos e instrucciones de distribución. No se encontraron respaldos JSON ni imágenes de clientes en los archivos analizados.
- Los 22 commits incluyen en sus metadatos al menos uno de dos correos personales. El PNG original y sus copias en los ZIP contienen metadatos XMP con autor y fecha. Los PNG nuevos de la PWA se generaron sin esos metadatos. El comentario del PR #5 identifica un adjunto como icono de Montajes. El adjunto de GitHub no se pudo descargar de forma independiente durante esta revisión.
- Desaconsejamos hacer público este repositorio en su estado actual. Una publicación requiere tratar también los metadatos históricos, los ZIP antiguos y el adjunto, o usar una copia pública limpia con sólo los archivos de distribución revisados. El repositorio sigue privado.

## Próxima acción

Revisar la copia saneada y coordinar la limpieza en GitHub antes de autorizar la reescritura remota o el cambio de visibilidad. [PR #7](https://github.com/kdnaskrlos/Montajes-Sublimacion/pull/7).
