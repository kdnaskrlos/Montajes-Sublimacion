# Bitácora

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
