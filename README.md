# Presupuestos Van

App web para calcular presupuestos de viajes a pedido en mini van (Buenos Aires) y generar el texto para mandarle al cliente por WhatsApp.
Es HTML + CSS + JavaScript sin dependencias ni compilación. Se puede instalar en el iPhone como app (PWA) y funciona sin conexión.

Recorrido: **A** (salida: Chaco 2625, Valentín Alsina) → **B** (recogida) → paradas opcionales → **C** (dejada) → **D** (llegada: Carpe Diem Art, Gdor. Carlos Tejedor 627, Lanús).

---

## Etapa 1 — Probarla (en la compu y en el celular)

Necesita **Python 3**, que ya viene con macOS. No hay que instalar nada más.

### Levantar el servidor

Doble clic en **`servir.command`**, o desde la terminal, en esta carpeta:

```bash
./servir.command
```

Muestra algo así:

```
  En esta compu:  http://localhost:8000
  En el celular:  http://192.168.1.138:8000   (misma red Wi-Fi)
  Tests:          http://localhost:8000/tests/tests.html
```

- **En la compu:** abrí `http://localhost:8000`.
- **En el celular:** conectalo al mismo Wi-Fi y abrí en Safari la dirección "En el celular".
  La primera vez, macOS puede preguntar si permite conexiones entrantes a Python: aceptá.
- Para cortar el servidor: `Ctrl+C` en la terminal.

> Si la primera vez macOS no deja abrir `servir.command` con doble clic, hacé clic derecho → Abrir.
> Otra opción es correr `python3 servidor.py` en la terminal.

### Qué cambia al probar por Wi-Fi (sin HTTPS)

La dirección `http://192.168…` no es segura (no es HTTPS), y Safari limita algunas cosas:

- **Copiar texto:** funciona con un método alternativo. Si falla, el mensaje queda seleccionado para copiarlo a mano.
- **Sin conexión / instalar como app:** el modo offline (service worker) recién funciona con HTTPS, o sea en la Etapa 2.
  Igual se puede "Agregar a pantalla de inicio" para ver el ícono y cómo se ve.

### Tests

Con el servidor andando, abrí `http://localhost:8000/tests/tests.html`. Arriba tiene que decir **"68/68 tests OK"**. Los tests no usan internet..

### Ejemplos con los valores actuales

Valores: precio por km **USD 1**, precio mínimo **$ 90.000**, tipo de cambio **$ 1.150**; peajes, espera adicional y hotel todavía en 0.

**1. Viaje por km:** Aeroparque → Nordelta, 95 km (A → B → C → D, mirados en Maps), recogida en country (10%), en pesos.

| Concepto | Cálculo | USD | Pesos |
|---|---|---:|---:|
| Recorrido | 95 km × USD 1 | 95,00 | 109.250 |
| Recargo country | 10% del subtotal | 9,50 | 10.925 |
| **Total** | supera el mínimo | **104,50** | **120.175** |

Mensaje generado, con el desglose activado (la recogida es en Aeroparque, por eso la espera es de 1 hora):

```
¡Hola! Te paso el presupuesto del viaje en van 🚐

📍 Recorrido: Aeroparque Jorge Newbery, CABA → Nordelta, Tigre
📅 Fecha: viernes 20/11/2026
🕐 Hora: 08:30 h
👥 Pasajeros: 6

✅ El precio incluye peajes y espera.
⏱️ La espera es de 1 hora desde que aterriza el vuelo, al que le hacemos seguimiento.

Detalle:
• Recorrido (95 km): $ 109.250
• Recargo country / barrio cerrado: $ 10.925

💰 *Total: $ 120.175* (≈ USD 104,50)

Cualquier consulta, quedo a disposición. ¡Gracias!
```

**2. Precio mínimo y agencia:** el mismo viaje con 40 km da $ 46.000 + 10% = $ 50.600, menos que el mínimo, así que se cobra **$ 90.000**.
Si además es **por agencia**, el presupuesto sigue siendo $ 90.000; la app muestra (solo a ustedes) la comisión de $ 18.000 y el neto de $ 72.000.

**3. Tarifa fija:** tipo de viaje "Hotel → Ezeiza", recogida en el Hotel Alvear: **USD 100,00**, sin equivalente en pesos, y el mensaje dice "La espera es de 15 minutos."

---

## Cómo se calcula

Todo se calcula en USD y al final se convierte a la moneda elegida. El orden está en `calcular()` de [`js/calc.js`](js/calc.js):

**Viaje por km:**
1. **Suma** de: km × precio por km + peajes + espera adicional + estacionamiento + hotel + ajuste de chofer = **subtotal**
2. **Recargo country** (%) sobre todo el subtotal (si la recogida es en country o barrio cerrado)
3. **Ajuste general** (%) sobre lo anterior
4. **Redondeo** opcional del total, en la moneda elegida (desactivado)
5. **Precio mínimo:** si el total da menos de $ 90.000, se cobra $ 90.000. En el mensaje el desglose dice "Tarifa mínima".

**Tarifa fija** (Hotel CABA → Ezeiza USD 100, Hotel CABA → Aeroparque USD 80): precio cerrado, siempre en USD y sin equivalente en pesos. No se suman km, peajes, extras ni recargos, y no se aplica el mínimo. Se elige a mano en "Tipo de viaje". Si la dejada queda vacía, el mensaje usa el nombre del aeropuerto.

**Viaje por agencia:** el presupuesto no cambia. La app muestra, solo a ustedes, la comisión (20%) y lo que queda neto. El mensaje no menciona la agencia.

Detalles:
- **Espera incluida:** el mensaje siempre dice que el precio incluye peajes y espera. Si la recogida (B) es en Ezeiza o Aeroparque, agrega "La espera es de 1 hora desde que aterriza el vuelo, al que le hacemos seguimiento."; si no, "La espera es de 15 minutos.". El aeropuerto se detecta por palabras en la dirección (Ezeiza, Pistarini, Aeroparque, Newbery, EZE, AEP), y en la pantalla se ve debajo de la recogida qué espera va a decir el mensaje. Los dos textos se editan en Configuración.
- **Espera adicional:** el campo "Espera adicional" de Extras es para horas de espera más allá de la incluida (horas × tarifa por hora, hoy en 0).
- **Peajes:** cantidad = km ÷ "cada X km", redondeado hacia abajo (solo tramos completos) o hacia arriba (configurable). Si el monto está en pesos, se convierte con el tipo de cambio.
- **Ajuste general:** al cliente no se le muestra como línea aparte. En el desglose del mensaje se reparte en cada concepto, así la suma da el total.
- **Chofer:** por ahora el selector Cristian / Marcelo no cambia el precio. La lógica ya acepta un ajuste por chofer (monto fijo, por km y/o %), en `choferes` de `js/config.js`, todo en 0. Cuando se defina, se agrega a la pantalla de Configuración.
- **Moneda del mensaje:** el total va en la moneda elegida, con el equivalente en la otra entre paréntesis.

## Valores pendientes

Están en [`js/config.js`](js/config.js), marcados con `// PENDIENTE`:
peajes, tarifa de espera adicional, estacionamiento por defecto, ajustes por chofer, % country por defecto (5%), hotel por noche y tipo de cambio inicial.

Los valores de `config.js` son los **por defecto**. Lo que se cambia en la pantalla de Configuración (engranaje) queda guardado en ese celular (localStorage) y tiene prioridad. Desde Configuración también se puede:
- **Exportar** la configuración a un archivo JSON (respaldo o para pasarla a otro celular) e **importarla**.
- **Restablecer** los valores por defecto.

## Estructura

```
index.html            pantalla principal + Configuración
styles.css            estilos (mobile-first, modo claro y oscuro)
js/config.js          valores por defecto
js/calc.js            cálculo (funciones puras)
js/format.js          formato argentino de números y texto de WhatsApp
js/maps.js            URLs de Google Maps y WhatsApp, detección de aeropuertos
js/distancias.js      botón "Calcular km" (OpenStreetMap o Google)
js/validar.js         validación de la configuración
js/storage.js         guardado, exportar/importar
js/app.js             interfaz
sw.js                 service worker (funciona sin conexión)
manifest.webmanifest  datos para instalarla como app
icons/                íconos (icon.svg es el original)
tests/                tests de la lógica (se corren en el navegador)
servidor.py           servidor local para probar
servir.command        atajo para levantar el servidor
```

Pensado para más adelante, sin cambiar la lógica:
- **Historial:** `calcular()` devuelve un objeto que se puede guardar tal cual, con una clave nueva en `storage.js`.
- **Km automáticos:** una función en `maps.js` que consulte una API y complete `kmTotales` o los tramos.
- **Otros idiomas:** la plantilla del mensaje ya es editable; se puede tener una por idioma.

## Botón "Calcular km"

Al lado de "Ver ruta" hay un botón **Calcular km**: busca la ruta A → B → (paradas) → C → D y carga los km totales y los de cada tramo. El total se actualiza solo, y después se pueden corregir los km a mano.

- **Ahora usa OpenStreetMap:** es gratis, no necesita clave y funciona ya.
  - Los km pueden diferir un poco de Google Maps.
  - Debajo del botón hay un link **"Ver la ruta en el mapa de OpenStreetMap"**: abre el mapa de OSRM (el mismo servicio que calcula los km) con la ruta y sus puntos, para compararla con Google Maps. También se pueden ver las direcciones que encontró, para comprobar que son las correctas. Si no encuentra una, avisa cuál es; conviene escribirla con calle, número y localidad.
  - Las direcciones ya encontradas (por ejemplo A y D) quedan guardadas en el celular, así el cálculo es más rápido.
  - Tarda unos segundos, porque el servicio permite una búsqueda por segundo.
- **Para pasar a Google Maps** (los mismos km que se ven en Maps): crear una clave y cargarla en Configuración → Cálculo de km → Google Maps. Pasos:
  1. Entrar a https://console.cloud.google.com con una cuenta de Google y crear un proyecto (por ejemplo "Presupuestos Van").
  2. Activar la facturación (pide tarjeta). Con pocos viajes por día el uso queda dentro de la cuota gratuita mensual, pero conviene revisar los precios vigentes y poner una alerta de presupuesto en Facturación → Presupuestos y alertas.
  3. En "APIs y servicios" → "Biblioteca", activar **Routes API**.
  4. En "APIs y servicios" → "Credenciales" → "Crear credenciales" → "Clave de API".
  5. **Restringir la clave** (importante, porque queda visible en la app):
     - Restricción de aplicación: "Sitios web", con la dirección de GitHub Pages (por ejemplo `https://fransorbo.github.io/*`) y, para probar, `http://localhost:8000/*`.
     - Restricción de API: solo "Routes API".
  6. Copiar la clave (empieza con `AIza…`) y cargarla en la app, en Configuración. Para que Cristian la tenga sin cargarla a mano, se puede poner en `googleApiKey` de `js/config.js` antes de publicar, o pasarle el respaldo JSON.

  > Probando por Wi-Fi desde el celular (`http://192.168…`), Google va a rechazar la clave si no agregás también esa dirección en la restricción de sitios web.
  > La parte de Google está programada y tiene tests, pero no se pudo probar contra Google sin una clave real.

## Notas

- **Google Maps:** el botón abre la ruta completa A → B → (paradas) → C → D. En iPhone abre la app de Google Maps si está instalada.
  Google Maps en el celular acepta hasta 3 puntos intermedios (B, una parada y C). Con más paradas, la app muestra un aviso.
- **Plantilla de WhatsApp:** variables disponibles: `{origen}`, `{destino}`, `{paradas}`, `{recorrido}`, `{fecha}`, `{hora}`, `{pasajeros}`, `{espera}`, `{extras}`, `{desglose}`, `{total}`, `{equivalente}`, `{km}`, `{chofer}`.
  Si todas las variables de una línea quedan vacías (por ejemplo, sin fecha), esa línea no aparece.

---

## Etapa 2 — Entrega a Cristian (GitHub Pages)

> **Todavía no ejecutar.** Estos pasos son para cuando la app esté aprobada.

### 1. Publicar

1. Crear un repositorio en GitHub, por ejemplo `presupuestos-van`. Puede ser público; la app no tiene datos privados, porque la configuración queda en cada celular.
2. Subir esta carpeta:
   ```bash
   git init
   git add .
   git commit -m "Presupuestos Van"
   git branch -M main
   git remote add origin https://github.com/fransorbo/presupuestos-van.git
   git push -u origin main
   ```
3. En GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / `(root)` → Save**.
4. En uno o dos minutos queda en `https://fransorbo.github.io/presupuestos-van/`.
5. Abrirla en la compu y revisar los tests en `…/tests/tests.html`.

### 2. Antes de pasársela a Cristian

- Completar los valores `// PENDIENTE` en `js/config.js`, o cargarlos desde Configuración y exportar el JSON para importarlo en su celular.
- Opcional: si no querés que vea los tests, borrá la carpeta `tests/` del repositorio (la app no la usa).

### 3. Instalar en el iPhone de Cristian

1. Abrir el link en **Safari**. Tiene que ser Safari.
2. Tocar **Compartir** (cuadrado con flecha) → **Agregar a pantalla de inicio** → **Agregar**.
3. Abrirla desde el ícono "Presupuestos". Se abre a pantalla completa y funciona sin conexión.
4. Si le pasás una configuración: mandale el JSON por WhatsApp, guardalo en Archivos, y en la app: engranaje → **Importar configuración**.

### 4. Publicar cambios después

1. Hacer los cambios y subirlos (`git add . && git commit -m "…" && git push`).
2. Si cambiaron archivos de la app, subir `VERSION` en `sw.js` (por ejemplo `v2`) y `VERSION_APP` en `js/app.js`.
   Si cambió un valor por defecto que también tiene que cambiar en celulares que ya guardaron su configuración, subir `CONFIG_VERSION` en `js/config.js` y agregar la migración en `migrar()` de `js/storage.js`.
3. Cristian ve la versión nueva la próxima vez que abre la app con internet. A veces hace falta cerrarla y volver a abrirla.

La configuración de Cristian no se pierde al actualizar: está guardada en su celular, no en el código.
