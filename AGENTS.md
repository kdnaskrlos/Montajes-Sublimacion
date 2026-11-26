# Montajes Sublimación — reglas permanentes

## Metodología project-context v2.0
- ChatGPT planifica, supervisa y audita; Codex implementa y prueba; GitHub conserva versiones. El usuario trabaja mediante vibe coding y no debe editar código manualmente.
- Antes de cada iteración, leer este archivo, docs/ESTADO_ACTUAL.md y las entradas pertinentes de docs/BITACORA.md. Verificar rama y commit; no repetir auditorías ya realizadas salvo evidencia nueva.
- Una iteración = un objetivo acotado, criterios de aceptación, pruebas y un cambio revisable. Usar rama separada y PR; no fusionar sin autorización. Comunicar bloqueos reales y pruebas no ejecutadas.
- Actualizar ESTADO_ACTUAL y añadir entrada breve a BITACORA al cerrar cada iteración; evitar duplicar información y no registrar datos personales de clientes.

## Restricciones técnicas y de negocio
- Conservar HTML/CSS/JS nativo y archivo único inicialmente; no introducir Firebase, frameworks, servidor, autenticación ni dependencias de ejecución sin justificación y autorización. Herramientas de prueba de desarrollo son admisibles si no alteran la ejecución.
- Conservar interfaz, categorías, tallas, fichas, respaldo formato 1 y compatibilidad con datos existentes. No cambiar reglas de producción ambiguas sin confirmación.
- Franela y suéter: frente + espalda + dos mangas estándar cortas o largas, respectivamente. Chemis y chemis suéter: frente + espalda chemis + dos mangas chemis cortas o largas, respectivamente. Franelilla y frente/espalda son dos piezas con significado distinto.
- Desde 1.30.0, registrar pares y unidades adicionales en columnas independientes. El resumen conserva las unidades sueltas aunque sean un número par. El short completo suma dos piezas y el short por pieza suma una. Los registros anteriores se interpretan con su modo y configuración originales. Si el short antiguo usaba un factor distinto de dos, se conserva la cantidad física en la columna de piezas sueltas.
- La ficha de producción y las hojas descargables son para corte y costura, sin precios. No alterar imágenes originales del usuario; las imágenes adjuntas son referencias, no originales de impresión.
- No subir respaldos reales, diseños de clientes, credenciales ni datos de negocio a GitHub. Usar datos ficticios en pruebas. No borrar datos ni cambiar origen de almacenamiento sin ruta de respaldo y restauración comprobada.
- No modificar el HTML durante la iteración 0. La versión base es v1.28.3.

## Entrega de cada tarea
Indicar archivos cambiados, pruebas ejecutadas y resultados, riesgos restantes, rama/commit/PR y siguiente paso concreto. Mantener cambios pequeños y no rehacer el diseño por iniciativa propia.
