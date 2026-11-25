# Pruebas de referencia de I0

Desde la raíz del repositorio, con Node.js 18 o superior, Chromium y `pdftotext` (Poppler) disponibles:

```sh
node tests/i0.mjs
```

Si el ejecutable se llama distinto, indica su ruta con `CHROMIUM`. En la instancia aislada de Codex donde Chromium no pudo iniciar su sandbox interno, el comando verificado fue `node tests/i0.mjs --no-sandbox`. Usa ese argumento solo dentro de un entorno de pruebas aislado.

La prueba sirve el HTML original en un puerto efímero de loopback, bloquea las fuentes remotas y usa perfiles temporales. Crea un SVG y pedidos ficticios, comprueba el almacenamiento, maneja las descargas del navegador e importa el respaldo en un contexto limpio. Los archivos y perfiles temporales se eliminan al terminar.

La comprobación de impresión registra la llamada del botón al iframe y valida el texto del PDF que Chromium produce desde la hoja descargada. Para revisar el diálogo nativo y la paginación visual, abre un pedido ficticio con imagen en un navegador con interfaz gráfica, selecciónalo en Producción, pulsa **Imprimir** y revisa la vista previa o guarda un PDF.

`OK` indica que la comprobación pasó. `FALLO CONOCIDO REPRODUCIDO` documenta el defecto de cuota de v1.28.3 y por sí solo deja un código de salida cero. Tras una corrección, ese caso pasa si el pedido persiste y la interfaz deja de confirmar un guardado inexistente. `FALLO` indica un resultado inesperado y produce código de salida distinto de cero.
