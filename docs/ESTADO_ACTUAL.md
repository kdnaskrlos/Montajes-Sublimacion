# Estado actual
Fecha: 2026-11-25. Versión verificada en I2: 1.28.5. Repositorio privado: kdnaskrlos/Montajes-Sublimacion. Rama base: main.

## Base técnica
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

## Hallazgos y prioridades
P0: cantidades negativas/decimales llegan a totales, exportaciones y lotes; conversiones pares/unidades y shorts/piezas pueden producir fracciones. Proteger consistencia y confirmar reglas para sobrantes y chemis.
P1: historial e imágenes vinculados por ID de cliente; cambios de una imagen pueden afectar múltiples lotes incluso desde historial; deshacer no incluye LOTES ni portadaCli; imágenes huérfanas sin limpieza; dos pestañas pueden sobrescribir datos en el guardado ordinario; hoja de impresión puede recortar indicaciones por altura fija; renombrar cliente no refresca todas las vistas al momento; fecha de entrega no validada contra fecha de pedido.
P2: estados definidos pero sin interfaz, campo diseño residual, funciones/estilos sin uso, accesibilidad y rendimiento de rerender; revisar mejoras de flujo solo tras estabilidad.

## Hoja de ruta
I0: entorno Codex configurado y batería de referencia ejecutada con datos ficticios. HTML base v1.28.3 intacto.
I1: guardado seguro de pedidos y lotes integrado en main, commit `db3fc4d`.
I2: implementación local verificada en `codex/i2-respaldos-seguros` desde `db3fc4d`. Pendiente revisión del Pull Request.
I3: integridad de cantidades, conversiones y alertas, pruebas de reglas de producción (alto).
I4: aislamiento general del historial, deshacer y consistencia entre vistas (alto, dividir si es necesario).
I5: impresión sin recortes, experiencia móvil/escritorio, accesibilidad (medio).
I6: mejoras funcionales según necesidades reales del usuario (medio). Evaluar IndexedDB para datos si límites/volumen lo justifican; no nube por defecto.

## Próxima acción
Revisar el Pull Request de I2. Tras su integración autorizada, abordar la integridad de cantidades y conversiones en I3.
