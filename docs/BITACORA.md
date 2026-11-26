# Bitácora

## 2026-11-25 — Preparación local de la limpieza para publicación

- Se respaldaron las referencias anunciadas y se verificó su restauración en una copia aislada. Se preparó la reescritura de correos, el saneamiento de archivos y la protección local para futuros commits.
- Pasaron las 44 comprobaciones existentes. La compilación v1.31.0 se conservó byte por byte. Las referencias y superficies pendientes de GitHub están en [ESTADO_ACTUAL.md](ESTADO_ACTUAL.md).

## 2026-11-25 — Análisis inicial (I0, preparación)
- Fuente: HTML original de Claude, v1.28.3, SHA-256 `0055a2865226253d77ce6cdb6c4aa179ad73b32eaf8e2f1abc1b3e7d653035a5`.
- Revisados código, interfaz declarada, cálculos, almacenamiento, historial, imágenes, exportaciones, respaldo, eventos y adaptadores Claude.
- Verificado Node --check y ejemplos de cálculos aislados; navegación Chromium bloqueada por política del entorno. Sin validación end-to-end.
- Detectados riesgos de guardado, recuperación, validación y mutabilidad del historial; priorizados en ESTADO_ACTUAL.
- Decisión: mantener arquitectura de archivo único, local, sin Firebase; repositorio privado e independiente.

## 2026-11-25 — Importación en GitHub (I0)
- Repositorio privado kdnaskrlos/Montajes-Sublimacion creado por el usuario. ChatGPT inicializó main con README y subió el HTML original, commit c59dae4b355842d38e9dd1cafeb2f4a31a5f45d0.
- Git blob 08e8e63def45fb35c48a550a91507df3c8015634 comprobado idéntico al archivo original. Sin modificación del código.
- Se incorporan reglas, estado, bitácora y exclusiones de datos reales. Pendiente entorno Codex y pruebas base I0.

## 2026-11-25 — Validación de referencia (I0)
- Exitosas con datos ficticios en Chromium: imagen en IndexedDB y recarga, creación/carga/eliminación de lote, respaldo formato 1 con imágenes en perfil limpio, descarga de hoja HTML e impresión a PDF. También se comprobó que el botón Imprimir invoca la impresión con la imagen cargada.
- Fallo reproducido: al rechazar la escritura del lote por cuota con el vaciado activado, la app indicó éxito. Tras recargar habían desaparecido tanto el lote como el pedido.
- No ejecutados: diálogo nativo, impresora física, revisión visual de recortes y paginación de varios clientes, e integraciones de Claude.
- Se añadió una prueba reproducible de desarrollo. Se conservó el HTML v1.28.3 y su hash.

## 2026-11-25 — Guardado seguro de pedidos y lotes (I1)

- Base `d4a9930` verificada en origin/main. Corrección en `codex/i1-guardado-seguro`, versión 1.28.4.
- Se confirma la escritura antes de publicar cambios en el historial o vaciar pedidos. Los errores muestran el resultado y conservan los cambios pendientes para reintentar.
- Se adelanta la escritura al ocultar la página, recargarla o cerrarla. Cuando quedan cambios en memoria, la aplicación solicita al navegador un aviso de salida.
- La batería de regresión de Chromium cubrió cuotas, reintentos, cambios de historial, recarga y cierre normal. El adaptador opcional se comprobó con un simulador, con las integraciones reales de Claude pendientes.

## 2026-11-25 — Respaldos y restauración segura (I2)

- Base `db3fc4d` verificada en origin/main. Versión 1.28.5 en `codex/i2-respaldos-seguros`.
- El formato 1 conserva ajustes, portadas, lote activo e imágenes. La app valida el contenido antes de importar y comprueba las escrituras antes de confirmar. La repetición de una copia no duplica lotes ni imágenes.
- La copia previa y el diario de IndexedDB permiten recuperar el estado anterior. Los pedidos importados quedan aislados de los lotes previos. Se protege el texto importado en vistas, hojas HTML y CSV.
- Pasaron 28 comprobaciones en Chromium con datos ficticios, incluidas las 15 de I0/I1. La importación se validó en almacenamiento local por HTTP de loopback. La política del entorno bloqueó `file://` y el servicio real de Claude quedó fuera de la prueba.

## 2026-11-25 — Estabilización para uso diario (I3/I4)

- Se actualizó la base a `2994984` y se unificaron I3 e I4 en `codex/estabilizacion-v1.29.0`. El HTML pasa a 1.29.0.
- Se verificaron cantidades y conversiones exactas, alertas de mangas chemis, aislamiento de lotes y portadas, coherencia de producción y exclusión de guardado entre pestañas.
- Pasaron las 28 comprobaciones anteriores y 7 nuevas. Chromium bloqueó `file://` por política del entorno. Las pruebas funcionales, incluidas imágenes, respaldo y PDF, se completaron por HTTP local.

## 2026-11-25 — Preparación de la distribución 1.29.0

- Se verificó la integración del PR #4 en `main` (`de39965`) y se prepararon las instrucciones en `codex/distribucion-v1.29.0`.
- Se confirmó la identidad del HTML con la versión verificada de estabilización. Los archivos del icono, el favicon y el ZIP final dependen del original aprobado, pendiente de recibir.
- Se repitieron las 35 comprobaciones de regresión con éxito en Chromium por HTTP local.

## Distribución final de 1.29.0

- Se recuperó el PNG definitivo del PR #5 con su transparencia original. Se generó el ICO, se incrustó el favicon y se verificaron el arranque, la decodificación del icono y el contenido del ZIP.
- La comparación con `de39965` confirmó que el único cambio en el HTML es la etiqueta del favicon. Se conservó la validación funcional previa.

## 2026-11-25 — Prendas y distribución 1.30.0

- Se reutilizó la rama `codex/v1.30.0-prendas` desde `18b34e8`, con distribución 1.29.0 ya integrada en `main` en `08f031d`.
- Se incorporaron las columnas independientes, chemis corta y larga, la talla 5XL y el icono interno aprobado. Cálculos, avisos, historial y exportaciones comparten el conteo físico.
- Se conservaron los modos históricos y el conteo de shorts con configuraciones antiguas. Se actualizó el ZIP y la documentación de distribución.
- Pasaron 38 comprobaciones en Chromium, con 34 piezas confirmadas para una unidad de cada categoría en 5XL. Se verificaron la migración, las exportaciones y el contenido del ZIP.

- El PR #6 incorpora el icono SVG de piezas sueltas de short. Se comprobó en Pedidos, Resumen y el detalle por talla a 390 y 1440 px. Se regeneró el ZIP de 1.30.0.

## 2026-11-25 — Montajes Sublimación 1.31.0 para GitHub Pages

- Base `61c9387` verificada en `main`. Se prepara `codex/pwa-v1.31.0` con instalación, funcionamiento sin red, descarga del HTML y actualización explícita con guardado verificado.
- El formato 1 permite trasladar pedidos, lotes, imágenes y tema entre el HTML descargado y Pages. El producto mantiene las reglas, las vistas y los cálculos de 1.30.0.
- Pasaron 44 comprobaciones en Chromium, incluidas seis para instalación, uso sin red, actualización y persistencia. Se verificó el workflow con `actionlint`.
- La revisión de GitHub detectó correos personales en los commits y metadatos de autor en el icono original y los ZIP históricos. Se conserva la visibilidad privada. El alcance y las limitaciones de la auditoría están en [ESTADO_ACTUAL.md](ESTADO_ACTUAL.md).
- El PR #7 quedó abierto para revisión. GitHub Actions confirmó las 44 pruebas y la apertura del HTML con `file://`.
