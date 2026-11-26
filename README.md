# Montajes Sublimación

Aplicación para organizar pedidos, montajes, piezas a imprimir y hojas de corte y costura. Versión 1.31.0.

## Uso

- En GitHub Pages, **Instalar aplicación** aparece cuando el navegador ofrece la instalación. En Safari para iPhone o iPad, se puede usar **Compartir > Agregar a inicio**. Después de completar la primera carga con conexión, se puede volver a abrir la app sin internet.
- Cuando aparezca **Actualización disponible**, pulsa **Actualizar**. La página se recarga tras confirmar el guardado. Si el navegador rechaza la escritura, puedes reintentar el guardado o exportar un respaldo desde Historial.
- Como alternativa, usa **Descargar HTML** y abre `Montajes-Sublimacion.html` en el navegador. Los datos se quedan en el navegador que los guardó. Para llevarlos del HTML descargado a Pages, exporta el respaldo desde Historial en la copia anterior e impórtalo en la nueva. Conserva el JSON en una ubicación privada.

En Historial, **Importar respaldo** valida la copia y guarda el estado anterior en el navegador. Después de una importación, **Restaurar estado anterior** permite recuperar pedidos, historial y ajustes. Se admiten copias originales de formato 1. Para restaurar una copia procedente de Claude, ábrela desde la aplicación local.

**Cargar en pedidos** abre una copia editable del lote guardado. Para modificar el lote del historial, guarda la copia con el mismo nombre y confirma **Sobrescribir**. Si aparece un aviso de cambios en otra pestaña, exporta el borrador desde Historial antes de recargar.

## Despliegue

`node scripts/build-pages.mjs` genera `dist/` con los archivos que se sirven desde `/Montajes-Sublimacion/`. La app usa Plus Jakarta Sans localmente en Pages. La fuente procede de `@fontsource-variable/plus-jakarta-sans@5.3.0`, con licencia OFL incluida.

El workflow verifica los PR y publica desde `main` cuando el repositorio tiene habilitado **Settings > Pages > Build and deployment > Source > GitHub Actions**. Antes de habilitar Pages, revisar los hallazgos de privacidad en [ESTADO_ACTUAL.md](docs/ESTADO_ACTUAL.md). La URL prevista es `https://kdnaskrlos.github.io/Montajes-Sublimacion/`.

Memoria del proyecto en [AGENTS.md](AGENTS.md), [ESTADO_ACTUAL.md](docs/ESTADO_ACTUAL.md) y [BITACORA.md](docs/BITACORA.md). Instrucciones de pruebas en [tests/README.md](tests/README.md).
