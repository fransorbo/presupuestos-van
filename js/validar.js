// Validación de la configuración. Función pura: devuelve la lista de errores (vacía = todo bien).

const esNumeroValido = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/** Campos numéricos: [ruta, etiqueta, máximo opcional] */
const NUMERICOS = [
  ['precioKmUSD', 'Precio por km'],
  ['precioMinimo.monto', 'Precio mínimo'],
  ['agenciaPorcentaje', 'Comisión de agencia', 100],
  ['peajes.cadaKm', 'Peajes: cada cuántos km'],
  ['peajes.monto', 'Peajes: monto'],
  ['esperaPorHoraUSD', 'Tarifa de espera por hora'],
  ['estacionamiento.montoPorDefecto', 'Estacionamiento por defecto'],
  ['countryPorcentaje', 'Recargo country', 100],
  ['hotelPorNocheUSD', 'Hotel por noche'],
  ['ajusteGeneralPorcentaje', 'Ajuste general', 1000],
  ['redondeo.multiploUSD', 'Redondeo USD'],
  ['redondeo.multiploARS', 'Redondeo ARS'],
  ['tipoCambio', 'Tipo de cambio'],
  ['costos.choferHorasCada100Km', 'Gastos: horas de chofer cada 100 km'],
  ['costos.choferPrecioHora', 'Gastos: precio por hora del chofer'],
  ['costos.combustibleLitrosCada100Km', 'Gastos: litros cada 100 km'],
  ['costos.combustiblePrecioLitro', 'Gastos: precio del litro'],
  ['costos.peajesCada100Km', 'Gastos: peajes cada 100 km'],
  ['costos.aceiteCadaKm', 'Gastos: aceite cada cuántos km'],
  ['costos.aceiteCosto', 'Gastos: costo del cambio de aceite'],
  ['costos.neumaticosCadaKm', 'Gastos: neumáticos cada cuántos km'],
  ['costos.neumaticosCosto', 'Gastos: costo de los neumáticos'],
];

export function obtener(obj, ruta) {
  return ruta.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function validarConfig(cfg) {
  const errores = [];
  if (!cfg || typeof cfg !== 'object') return [{ campo: '', mensaje: 'La configuración no es válida.' }];

  if (typeof cfg.puntoA !== 'string' || !cfg.puntoA.trim()) {
    errores.push({ campo: 'puntoA', mensaje: 'Falta la dirección del punto A (salida).' });
  }
  if (typeof cfg.puntoD !== 'string' || !cfg.puntoD.trim()) {
    errores.push({ campo: 'puntoD', mensaje: 'Falta la dirección del punto D (llegada).' });
  }
  (cfg.tarifasFijas || []).forEach((t, i) => {
    if (!esNumeroValido(t?.usd)) errores.push({ campo: `tarifasFijas.${i}.usd`, mensaje: `Tarifa fija "${t?.nombre || i + 1}": tiene que ser un número mayor o igual a 0.` });
  });
  for (const k of ['textoAeropuerto', 'textoNormal']) {
    if (typeof cfg.esperaIncluida?.[k] !== 'string') errores.push({ campo: `esperaIncluida.${k}`, mensaje: 'Texto de espera no válido.' });
  }
  const dist = cfg.distancias || {};
  if (!['osm', 'google'].includes(dist.proveedor)) errores.push({ campo: 'distancias.proveedor', mensaje: 'Servicio para calcular km no válido.' });
  else if (dist.proveedor === 'google' && !String(dist.googleApiKey || '').trim()) {
    errores.push({ campo: 'distancias.googleApiKey', mensaje: 'Para usar Google Maps hace falta cargar la clave de API.' });
  }
  if (esNumeroValido(cfg.tipoCambio) && cfg.tipoCambio === 0) errores.push({ campo: 'tipoCambio', mensaje: 'Tipo de cambio: tiene que ser mayor a 0.' });
  if (!Array.isArray(cfg.palabrasAeropuerto)) errores.push({ campo: 'palabrasAeropuerto', mensaje: 'Palabras de aeropuerto no válidas.' });
  for (const [ruta, etiqueta, max] of NUMERICOS) {
    const v = obtener(cfg, ruta);
    if (!esNumeroValido(v)) errores.push({ campo: ruta, mensaje: `${etiqueta}: tiene que ser un número mayor o igual a 0.` });
    else if (max != null && v > max) errores.push({ campo: ruta, mensaje: `${etiqueta}: no puede superar ${max}.` });
  }
  for (const [ruta, opciones] of [
    ['peajes.moneda', ['USD', 'ARS']],
    ['peajes.redondeo', ['floor', 'ceil']],
    ['estacionamiento.moneda', ['USD', 'ARS']],
    ['precioMinimo.moneda', ['USD', 'ARS']],
  ]) {
    if (!opciones.includes(obtener(cfg, ruta))) errores.push({ campo: ruta, mensaje: `Valor no válido en ${ruta}.` });
  }
  for (const [id, ch] of Object.entries(cfg.choferes || {})) {
    for (const k of ['fijoUSD', 'porKmUSD', 'porcentaje']) {
      if (!esNumeroValido(ch?.[k])) errores.push({ campo: `choferes.${id}.${k}`, mensaje: `Chofer ${ch?.nombre || id}: ${k} no válido.` });
    }
  }
  if (typeof cfg.plantillaWhatsApp !== 'string' || !cfg.plantillaWhatsApp.includes('{total}')) {
    errores.push({ campo: 'plantillaWhatsApp', mensaje: 'La plantilla de WhatsApp tiene que incluir {total}.' });
  }
  return errores;
}
