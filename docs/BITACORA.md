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
