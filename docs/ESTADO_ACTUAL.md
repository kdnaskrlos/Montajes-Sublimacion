# Estado actual
Fecha: 2026-11-25. Versión base: 1.28.3. Repositorio privado verificado: kdnaskrlos/Montajes-Sublimacion. Rama base: main.

## Base técnica
Archivo único Montajes-Sublimacion.html, 157199 bytes. SHA-256 original: `0055a2865226253d77ce6cdb6c4aa179ad73b32eaf8e2f1abc1b3e7d653035a5`. Git blob verificado tras importar: `08e8e63def45fb35c48a550a91507df3c8015634`, idéntico al original. Commit de importación: `c59dae4b355842d38e9dd1cafeb2f4a31a5f45d0`.
HTML/CSS/JS nativo, 4 vistas (Pedidos, Resumen, Producción, Historial), 16 tallas y 10 categorías. Datos en localStorage (montajes-sub, montajes-lotes, montajes-tema), imágenes en IndexedDB (montajes-img/img). Adaptadores de Claude opcionales (window.claude.use: db, assets, downloads). Fuente remota Google Fonts. Sin Firebase independiente ni servidor necesario.

## Evidencia inicial
- Node --check: JavaScript sintácticamente válido.
- Pruebas aisladas ejecutadas en Node con funciones originales: 3 franelas + 2 suéteres + 1 short (2 piezas) = 22; valor negativo -2 en franelas se incluye y reduce total a 2; conversión de 3 mangas a pares da 1.5 y alerta de entero; frente + espalda + mangas chemis genera aviso erróneo de falta de mangas.
- Chromium del entorno bloqueó navegación por política; no se certifican flujos completos de interfaz, impresión, almacenamiento ni restauración. Se requieren pruebas de navegador con datos ficticios.

## Hallazgos y prioridades
P0: guardarLotesLocal silencia errores (líneas 1083–1103): posible vaciado de pedidos tras guardado fallido; guardar marca dirty=false aun si falla almacenamiento local; guardado diferido 700/1200 ms sin vaciado al cerrar; respaldo no conserva loteActivo/portadaCli, ignora fallos de imágenes y lotes, valida estructura superficialmente y puede mantener vínculo anterior de lote activo al importar. Evitar falsas confirmaciones de éxito y pérdidas.
P0: cantidades negativas/decimales llegan a totales, exportaciones y lotes; conversiones pares/unidades y shorts/piezas pueden producir fracciones. Proteger consistencia, confirmar reglas para sobrantes y chemis (líneas 643–685, 1161–1203).
P1: historial e imágenes vinculados por ID de cliente; cambios de una imagen pueden afectar múltiples lotes incluso desde historial (1274–1285); deshacer no incluye LOTES ni portadaCli; imágenes huérfanas sin limpieza; dos pestañas pueden sobrescribir datos; JSON importado puede contener valores maliciosos no escapados en plantillas HTML; CSV con nombre de fórmula; hoja de impresión puede recortar indicaciones por altura fija; renombrar cliente no refresca todas las vistas al momento; fecha de entrega no validada contra fecha de pedido.
P2: estados definidos pero sin interfaz, campo diseño residual, funciones/estilos sin uso, accesibilidad y rendimiento de rerender; revisar mejoras de flujo solo tras estabilidad.

## Hoja de ruta
I0: base intacta importada y hash verificado; pendiente configurar Codex y preparar pruebas de referencia sin tocar HTML (esfuerzo medio).
I1: guardado de pedidos y lotes seguro; fallo simulado no puede vaciar pedidos ni informar éxito (alto).
I2: respaldo/restauración segura, validación y aislamiento de lote activo; imágenes verificadas y compatibilidad formato 1 (alto).
I3: integridad de cantidades, conversiones y alertas, pruebas de reglas de producción (alto).
I4: aislamiento historial, deshacer y consistencia entre vistas; protección de importaciones y exportaciones (alto, dividir si es necesario).
I5: impresión sin recortes, experiencia móvil/escritorio, accesibilidad (medio).
I6: mejoras funcionales según necesidades reales del usuario (medio). Evaluar IndexedDB para datos si límites/volumen lo justifican; no nube por defecto.

## Próxima acción
Crear entorno independiente de Codex con acceso a este repositorio. Codex inicia I0, prepara pruebas de referencia y entrega evidencia; no corrige hallazgos todavía. Entorno y pruebas integrales pendientes.
