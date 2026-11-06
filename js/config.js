// Valores por defecto de la app.
// Lo que el usuario cambia en "Configuración" se guarda en localStorage y pisa estos valores.
// Si se agrega una clave nueva acá, aparece sola en los celulares que ya tenían la app
// (storage.js combina lo guardado con estos valores).
//
// Si cambia un valor por defecto que también tiene que cambiar en los celulares que ya
// guardaron su configuración, subir CONFIG_VERSION y agregar la migración en storage.js.

export const CONFIG_VERSION = 2;

export const DEFAULT_CONFIG = {
  version: CONFIG_VERSION,

  // Punto A: de donde sale la van.
  puntoA: 'Chaco 2625, Valentín Alsina, Lanús, Buenos Aires, Argentina',
  // Punto D: adonde vuelve la van al terminar.
  puntoD: 'Carpe Diem Art, Gdor. Carlos Tejedor 627, B1824 Lanús, Provincia de Buenos Aires, Argentina',

  // Precio por km recorrido, en USD. Igual para todos los tramos.
  precioKmUSD: 1,

  // Precio mínimo del viaje por km: si el total da menos, se cobra este monto.
  // (No se aplica a las tarifas fijas.)
  precioMinimo: {
    monto: 90000,
    moneda: 'ARS',
  },

  // Tarifas fijas: el total es siempre este monto en USD, sin sumar nada.
  tarifasFijas: [
    { id: 'hotel-ezeiza', corto: 'Hotel → Ezeiza', nombre: 'Hotel CABA → Aeropuerto Ezeiza', destino: 'Aeropuerto Internacional Ministro Pistarini (Ezeiza)', usd: 100 },
    { id: 'hotel-aeroparque', corto: 'Hotel → Aeroparque', nombre: 'Hotel CABA → Aeroparque', destino: 'Aeroparque Jorge Newbery', usd: 80 },

  ],

  // Viajes por agencia: el presupuesto no cambia, pero la agencia se queda con este %.
  // La app lo muestra (solo a ustedes) para ver cuánto queda neto.
  agenciaPorcentaje: 20,

  // Botón "Calcular km": de dónde se sacan los km de la ruta.
  //   'osm'    → OpenStreetMap, gratis y sin clave (los km pueden diferir un poco de Google Maps).
  //   'google' → Google Maps (Routes API). Necesita una clave de API restringida al dominio de la app (ver README).
  distancias: {
    proveedor: 'osm',
    googleApiKey: '', // PENDIENTE: cargar cuando se cree la clave
  },

  // Peajes: cada `cadaKm` km se suma un peaje de `monto` (en `moneda`).
  // redondeo 'floor' = solo peajes completos (250 km / 100 = 2), 'ceil' = cualquier fracción cuenta (= 3).
  // En el mensaje siempre se informa que el precio incluye peajes.
  peajes: {
    cadaKm: 0, // PENDIENTE (0 = no se suman aparte)
    monto: 0, // PENDIENTE
    moneda: 'ARS', // PENDIENTE: 'USD' o 'ARS' (ARS se convierte con el tipo de cambio)
    redondeo: 'floor', // PENDIENTE: 'floor' o 'ceil'
  },

  // Espera incluida en el precio (se informa en el mensaje). Si la recogida es en un aeropuerto
  // (se detecta por las palabras clave de abajo) se usa el texto de aeropuerto.
  esperaIncluida: {
    textoAeropuerto: 'La espera es de 1 hora desde que aterriza el vuelo, al que le hacemos seguimiento.',
    textoNormal: 'La espera es de 15 minutos.',
  },
  // Palabras que indican que una dirección es un aeropuerto (sin importar mayúsculas ni acentos).
  // Las de 3 letras (EZE, AEP) tienen que aparecer como palabra suelta.
  palabrasAeropuerto: ['ezeiza', 'pistarini', 'aeroparque', 'newbery', 'EZE', 'AEP'],

  // Espera adicional (más allá de la incluida): horas × tarifa.
  esperaPorHoraUSD: 0, // PENDIENTE

  // Estacionamiento: se carga a mano en cada viaje. Este monto se precarga en cada presupuesto nuevo.
  estacionamiento: {
    montoPorDefecto: 0, // PENDIENTE: confirmar si pasa a ser un monto fijo
    moneda: 'ARS',
  },

  // Ajustes por chofer. Por ahora el selector no cambia el precio (todo en 0 y sin pantalla
  // de configuración). Cuando se definan, cada uno puede sumar un monto fijo, un monto por km
  // y/o un porcentaje sobre el precio de los km.
  choferes: {
    cristian: { nombre: 'Cristian', fijoUSD: 0, porKmUSD: 0, porcentaje: 0 }, // PENDIENTE
    marcelo: { nombre: 'Marcelo', fijoUSD: 0, porKmUSD: 0, porcentaje: 0 }, // PENDIENTE
  },

  // Recargo por recogida en country o barrio cerrado (se puede ajustar en cada viaje).
  countryPorcentaje: 5, // PENDIENTE: confirmar valor por defecto (entre 5% y 10%)

  // Hotel: noches × monto por noche.
  hotelPorNocheUSD: 0, // PENDIENTE

  // Ajuste general sobre el total (por ejemplo, inflación). 10 = +10%.
  ajusteGeneralPorcentaje: 0,

  // Redondeo opcional del total, en la moneda que se muestra. Desactivado por ahora.
  redondeo: {
    activo: false,
    multiploUSD: 5, // redondea a múltiplos de USD 5
    multiploARS: 1000, // redondea a múltiplos de $ 1.000
  },

  // Tipo de cambio inicial (ARS por 1 USD). Se edita en la pantalla principal y se guarda el último usado.
  tipoCambio: 1150, // PENDIENTE: cargar el del día

  // Plantilla del texto de WhatsApp. Variables disponibles: ver VARIABLES_PLANTILLA en format.js.
  // Si todas las variables de una línea quedan vacías (por ejemplo, sin fecha), esa línea se omite.
  plantillaWhatsApp: [
    '¡Hola! Te paso el presupuesto del viaje en van 🚐',
    '',
    '📍 Recorrido: {recorrido}',
    '📅 Fecha: {fecha}',
    '🕐 Hora: {hora}',
    '👥 Pasajeros: {pasajeros}',
    '',
    '✅ El precio incluye peajes y espera.',
    '⏱️ {espera}',
    '➕ También incluye: {extras}',
    '',
    '{desglose}',
    '',
    '💰 *Total: {total}* {equivalente}',
    '',
    'Cualquier consulta, quedo a disposición. ¡Gracias!',
  ].join('\n'),
};
