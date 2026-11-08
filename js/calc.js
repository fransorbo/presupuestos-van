// Lógica de cálculo: funciones puras, sin DOM ni localStorage.
// Todo se calcula en USD; al final se convierte a la moneda de presentación.
import { formatNumero } from './format.js';
//
// ORDEN DE APLICACIÓN (para cambiarlo, tocar solo `calcular`):
//
// Viaje por km:
//   1. Sumas: km + peajes + espera + estacionamiento + hotel + ajuste de chofer = subtotal
//   2. Recargo country (%) sobre el subtotal
//   3. Ajuste general (%) sobre (subtotal + recargo country)
//   4. Precio mínimo: si el total queda por debajo, se cobra el mínimo
//
// Viaje con tarifa fija (por ejemplo, hotel de CABA → Ezeiza):
//   El total es la tarifa, siempre en USD. No se suma nada ni se aplica el mínimo.
//
// Después, en ambos casos, los ajustes a mano de la pantalla principal (en la moneda elegida):
//   a. Aumento (%) sobre el total
//   b. Redondeo hacia arriba o hacia abajo (al múltiplo de la configuración)
//   c. Precio elegido a mano: si se escribe, reemplaza todo lo anterior
//
// En ambos casos, si el viaje es por agencia, el presupuesto NO cambia: solo se informa
// (en la app, nunca al cliente) la comisión de la agencia y lo que queda neto.

/**
 * Lee un número escrito a mano (acepta coma decimal y punto de miles). Vacío → 0, inválido → NaN.
 * '12,5' → 12.5 · '1.250,50' → 1250.5 · '1.150' → 1150 · '12.5' → 12.5
 */
export function parsearNumero(v) {
  if (typeof v === 'number') return v;
  if (v == null) return 0;
  let t = String(v).trim().replace(/\s/g, '');
  if (t === '') return 0;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  return /^-?\d*\.?\d+$/.test(t) ? Number(t) : NaN;
}

/** Como parsearNumero, pero devuelve siempre un número finito ≥ 0 (inválido o negativo → 0). */
export function num(v) {
  const n = parsearNumero(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Pasa un monto a USD. Si el tipo de cambio no es válido, los montos en ARS valen 0. */
export function aUSD(monto, moneda, tipoCambio) {
  const m = num(monto);
  if (moneda === 'ARS') {
    const tc = num(tipoCambio);
    return tc > 0 ? m / tc : 0;
  }
  return m;
}

/** Pasa un monto en USD a la moneda de presentación. */
export function desdeUSD(usd, moneda, tipoCambio) {
  return moneda === 'ARS' ? usd * num(tipoCambio) : usd;
}

/** Nombres de los tramos según las paradas: A→B, B→Parada 1, …, →C, C→D. */
export function nombresTramos(cantParadas = 0) {
  const puntos = ['A', 'B'];
  for (let i = 1; i <= cantParadas; i++) puntos.push(`Parada ${i}`);
  puntos.push('C', 'D');
  const tramos = [];
  for (let i = 0; i < puntos.length - 1; i++) tramos.push(`${puntos[i]} → ${puntos[i + 1]}`);
  return tramos;
}

/** Km del viaje: el total cargado, o la suma de los tramos si se usa el modo por tramo. */
export function kmDelViaje(viaje) {
  if (viaje.modoTramos) return (viaje.tramos || []).reduce((s, t) => s + num(t), 0);
  return num(viaje.kmTotales);
}

/** Cantidad de peajes según los km. */
export function cantidadPeajes(km, peajes) {
  const cada = num(peajes?.cadaKm);
  if (!cada || !num(km)) return 0;
  const veces = km / cada;
  return peajes.redondeo === 'ceil' ? Math.ceil(veces - 1e-9) : Math.floor(veces + 1e-9);
}

/** Redondea `valor` al múltiplo indicado (sin efecto si el múltiplo es 0). */
export function redondearA(valor, multiplo) {
  const m = num(multiplo);
  return m > 0 ? Math.round(valor / m) * m : valor;
}

/** Redondea hacia arriba ('arriba') o hacia abajo ('abajo') al múltiplo indicado. */
export function redondearHacia(valor, multiplo, sentido) {
  const m = num(multiplo);
  if (!(m > 0)) return valor;
  const veces = valor / m;
  return (sentido === 'abajo' ? Math.floor(veces + 1e-9) : Math.ceil(veces - 1e-9)) * m;
}

/** Tarifa fija elegida en el viaje (o undefined si el viaje es por km). */
export function tarifaFija(viaje, config) {
  if (!viaje.tipoViaje || viaje.tipoViaje === 'km') return undefined;
  return (config.tarifasFijas || []).find((t) => t.id === viaje.tipoViaje);
}



const plural = (n, uno, varios) => `${formatNumero(n, 0, 2)} ${n === 1 ? uno : varios}`;

/**
 * Calcula el presupuesto.
 * @param {object} viaje  datos del formulario (ver tests/calc.test.js para ejemplos)
 * @param {object} config configuración completa (DEFAULT_CONFIG combinado con lo guardado)
 * @returns {{ km, tarifaFija, lineas, subtotalUSD, totalUSD, total, moneda, tipoCambio, equivalente,
 *            minimoAplicado, agencia, desgloseCliente, avisos }}
 *   lineas: [{ id, etiqueta, detalle, usd, extra }] (todas, incluso las de 0; extra = se lista en "También incluye")
 *   agencia: null, o { porcentaje, comisionUSD, netoUSD }
 */
export function calcular(viaje, config) {
  const fija = tarifaFija(viaje, config);
  const r = fija ? calcularTarifaFija(viaje, config, fija) : calcularPorKm(viaje, config);
  aplicarAjustesFinales(r, viaje, config);

  // Agencia: no cambia el presupuesto; solo se informa la comisión y el neto
  const pctAgencia = viaje.porAgencia ? num(config.agenciaPorcentaje) : 0;
  r.agencia = viaje.porAgencia
    ? { porcentaje: pctAgencia, comisionUSD: (r.totalUSD * pctAgencia) / 100, netoUSD: r.totalUSD * (1 - pctAgencia / 100) }
    : null;
  r.gastos = calcularGastos(r, viaje, config);
  return r;
}

/**
 * Gastos variables aproximados del viaje (solo para ustedes), ganancia neta y margen.
 * Los costos de la configuración están en pesos y se calculan según los km del viaje.
 * El chofer cuenta solo si viaja Marcelo; la comisión, solo si el viaje es por agencia.
 * @returns {{ lineas: {id, etiqueta, detalle, usd}[], totalUSD, gananciaUSD, margen }}
 *   margen: ganancia / total del presupuesto, en % (null si el total es 0)
 */
export function calcularGastos(r, viaje, config) {
  const c = config.costos || {};
  const tc = r.tipoCambio;
  const deARS = (ars) => (tc ? ars / tc : 0);
  const km = r.km;
  const cada100 = km / 100;
  const lineas = [];

  if (viaje.chofer === 'marcelo') {
    const horas = cada100 * num(c.choferHorasCada100Km);
    lineas.push({ id: 'chofer', etiqueta: 'Marcelo', detalle: `${fmtNum(redondear1(horas))} h × $ ${formatNumero(num(c.choferPrecioHora), 0, 0)}`, usd: deARS(horas * num(c.choferPrecioHora)) });
  }
  const litros = cada100 * num(c.combustibleLitrosCada100Km);
  lineas.push({ id: 'combustible', etiqueta: 'Combustible', detalle: `${fmtNum(redondear1(litros))} l × $ ${formatNumero(num(c.combustiblePrecioLitro), 0, 0)}`, usd: deARS(litros * num(c.combustiblePrecioLitro)) });
  lineas.push({ id: 'peajes', etiqueta: 'Peajes', detalle: 'aprox.', usd: deARS(cada100 * num(c.peajesCada100Km)) });
  const porKm = (costo, cadaKm) => (num(cadaKm) ? (km * num(costo)) / num(cadaKm) : 0);
  lineas.push({ id: 'aceite', etiqueta: 'Aceite / service', detalle: '', usd: deARS(porKm(c.aceiteCosto, c.aceiteCadaKm)) });
  lineas.push({ id: 'neumaticos', etiqueta: 'Neumáticos', detalle: '', usd: deARS(porKm(c.neumaticosCosto, c.neumaticosCadaKm)) });
  if (r.agencia) lineas.push({ id: 'agencia', etiqueta: 'Comisión agencia', detalle: `${fmtNum(r.agencia.porcentaje)}%`, usd: r.agencia.comisionUSD });

  const totalUSD = lineas.reduce((s, l) => s + l.usd, 0);
  const gananciaUSD = r.totalUSD - totalUSD;
  return { lineas, totalUSD, gananciaUSD, margen: r.totalUSD > 0 ? (gananciaUSD / r.totalUSD) * 100 : null };
}

const redondear1 = (n) => Math.round(n * 10) / 10;

function calcularTarifaFija(viaje, config, fija) {
  const tc = num(viaje.tipoCambio ?? config.tipoCambio);
  const usd = num(fija.usd);
  const lineas = [{ id: 'fija', etiqueta: `Tarifa fija: ${fija.nombre}`, detalle: '', usd }];
  return {
    km: kmDelViaje(viaje),
    tarifaFija: fija,
    lineas,
    subtotalUSD: usd,
    totalUSD: usd,
    total: usd,
    moneda: 'USD', // las tarifas fijas son siempre en USD
    tipoCambio: tc,
    equivalente: null,
    minimoAplicado: false,
    desgloseCliente: [{ id: 'fija', etiqueta: fija.nombre, detalle: '', extra: false, usd }],
    avisos: [],
  };
}

function calcularPorKm(viaje, config) {
  const avisos = [];
  const moneda = viaje.moneda === 'ARS' ? 'ARS' : 'USD';
  const tc = num(viaje.tipoCambio ?? config.tipoCambio);
  const minimo = config.precioMinimo || {};
  const necesitaTC =
    moneda === 'ARS' ||
    (config.peajes?.moneda === 'ARS' && num(config.peajes?.monto) > 0) ||
    (viaje.estacionamiento?.moneda === 'ARS' && num(viaje.estacionamiento?.monto) > 0) ||
    (minimo.moneda === 'ARS' && num(minimo.monto) > 0);
  if (necesitaTC && !tc) avisos.push('Falta el tipo de cambio: los montos en pesos (y el precio mínimo) no se pueden calcular.');

  const km = kmDelViaje(viaje);
  const precioKm = num(config.precioKmUSD);
  const lineas = [];

  // 1. Sumas
  const kmUSD = km * precioKm;
  lineas.push({ id: 'km', etiqueta: 'Recorrido', detalle: `${fmtNum(km)} km × USD ${fmtNum(precioKm)}`, usd: kmUSD });

  const nPeajes = cantidadPeajes(km, config.peajes);
  const peajeUSD = aUSD(config.peajes?.monto, config.peajes?.moneda, tc);
  lineas.push({ id: 'peajes', etiqueta: 'Peajes', detalle: plural(nPeajes, 'peaje', 'peajes'), usd: nPeajes * peajeUSD });

  const horas = num(viaje.horasEspera);
  lineas.push({ id: 'espera', etiqueta: 'Espera adicional', detalle: plural(horas, 'hora', 'horas'), usd: horas * num(config.esperaPorHoraUSD), extra: true });

  const est = viaje.estacionamiento || {};
  lineas.push({ id: 'estacionamiento', etiqueta: 'Estacionamiento', detalle: '', usd: aUSD(est.monto, est.moneda, tc), extra: true });

  const noches = num(viaje.noches);
  lineas.push({ id: 'hotel', etiqueta: 'Hotel', detalle: plural(noches, 'noche', 'noches'), usd: noches * num(config.hotelPorNocheUSD), extra: true });

  const ch = config.choferes?.[viaje.chofer];
  const choferUSD = ch ? num(ch.fijoUSD) + num(ch.porKmUSD) * km + (kmUSD * num(ch.porcentaje)) / 100 : 0;
  lineas.push({ id: 'chofer', etiqueta: `Chofer${ch ? ` (${ch.nombre})` : ''}`, detalle: '', usd: choferUSD });

  const subtotalUSD = lineas.reduce((s, l) => s + l.usd, 0);

  // 2. Recargo country sobre el subtotal
  const pctCountry = viaje.esCountry ? num(viaje.countryPorcentaje ?? config.countryPorcentaje) : 0;
  const countryUSD = (subtotalUSD * pctCountry) / 100;
  lineas.push({ id: 'country', etiqueta: 'Recargo country / barrio cerrado', detalle: `${fmtNum(pctCountry)}%`, usd: countryUSD });

  // 3. Ajuste general
  const pctGeneral = num(config.ajusteGeneralPorcentaje);
  const antesAjuste = subtotalUSD + countryUSD;
  const generalUSD = (antesAjuste * pctGeneral) / 100;
  lineas.push({ id: 'ajuste', etiqueta: 'Ajuste general', detalle: `${fmtNum(pctGeneral)}%`, usd: generalUSD });

  const totalUSDsinRedondeo = antesAjuste + generalUSD;

  let total = desdeUSD(totalUSDsinRedondeo, moneda, tc);
  let totalUSD = totalUSDsinRedondeo;

  // 4. Precio mínimo (solo si ya hay km cargados)
  const minimoUSD = aUSD(minimo.monto, minimo.moneda, tc);
  let minimoAplicado = false;
  if (km > 0 && minimoUSD > 0 && totalUSD < minimoUSD - 1e-9) {
    const detalle = minimo.moneda === 'ARS' ? `mínimo $ ${formatNumero(num(minimo.monto), 0, 0)}` : `mínimo USD ${formatNumero(num(minimo.monto), 2, 2)}`;
    lineas.push({ id: 'minimo', etiqueta: 'Ajuste a precio mínimo', detalle, usd: minimoUSD - totalUSD });
    totalUSD = minimoUSD;
    total = minimo.moneda === moneda ? num(minimo.monto) : desdeUSD(minimoUSD, moneda, tc);
    minimoAplicado = true;
  }

  const otra = moneda === 'ARS' ? 'USD' : 'ARS';
  const equivalente = tc ? { moneda: otra, monto: desdeUSD(totalUSD, otra, tc) } : null;

  if (!km) avisos.push('Cargá los km del recorrido.');

  return {
    km,
    tarifaFija: null,
    lineas,
    subtotalUSD,
    totalUSD,
    total,
    moneda,
    tipoCambio: tc,
    equivalente,
    minimoAplicado,
    desgloseCliente: minimoAplicado
      ? [{ id: 'minimo', etiqueta: 'Tarifa mínima', detalle: '', extra: false, usd: totalUSD }]
      : desgloseCliente(lineas, pctGeneral),
    avisos,
  };
}

/**
 * Desglose para mostrarle al cliente: el ajuste general no aparece como línea aparte,
 * se reparte proporcionalmente en cada concepto (así la suma da el total).
 * Se omiten las líneas en 0.
 */
export function desgloseCliente(lineas, pctGeneral) {
  const factor = 1 + num(pctGeneral) / 100;
  return lineas
    .filter((l) => l.id !== 'ajuste' && Math.abs(l.usd) > 1e-9)
    .map((l) => ({ id: l.id, etiqueta: l.etiqueta, detalle: l.detalle, extra: !!l.extra, usd: l.usd * factor }));
}

/**
 * Ajustes a mano sobre el total, en la moneda elegida: aumento %, redondeo ↑/↓ y precio a mano.
 * Agrega líneas internas ('aumento', 'redondeo', 'manual'), y en el desglose para el cliente
 * reparte la diferencia proporcionalmente (así la suma sigue dando el total).
 * También deja en `r.redondeo` las dos opciones de redondeo para mostrarlas en los botones.
 */
function aplicarAjustesFinales(r, viaje, config) {
  const { moneda, tipoCambio: tc } = r;
  const aUSDm = (m) => (moneda === 'ARS' ? (tc ? m / tc : 0) : m);
  const fmt = (m) => (moneda === 'ARS' ? `$ ${formatNumero(m, 0, 0)}` : `USD ${formatNumero(m, 0, 2)}`);
  const base = r.total;
  let total = base;

  const pct = num(viaje.aumentoPorcentaje);
  if (pct && total > 0) {
    const nuevo = total * (1 + pct / 100);
    r.lineas.push({ id: 'aumento', etiqueta: 'Aumento', detalle: `${fmtNum(pct)}%`, usd: aUSDm(nuevo - total) });
    total = nuevo;
  }

  const multiplo = num(moneda === 'ARS' ? config.redondeo?.multiploARS : config.redondeo?.multiploUSD);
  r.redondeo = {
    multiplo,
    arriba: total > 0 ? redondearHacia(total, multiplo, 'arriba') : 0,
    abajo: total > 0 ? redondearHacia(total, multiplo, 'abajo') : 0,
    elegido: viaje.redondeo === 'arriba' || viaje.redondeo === 'abajo' ? viaje.redondeo : '',
  };
  if (r.redondeo.elegido && total > 0) {
    const nuevo = r.redondeo[r.redondeo.elegido];
    if (Math.abs(nuevo - total) > 1e-9) {
      r.lineas.push({ id: 'redondeo', etiqueta: `Redondeo hacia ${r.redondeo.elegido}`, detalle: `a ${fmt(multiplo)}`, usd: aUSDm(nuevo - total) });
    }
    total = nuevo;
  }

  const manual = num(viaje.precioManual);
  r.precioManual = manual > 0;
  if (manual > 0) {
    r.lineas.push({ id: 'manual', etiqueta: 'Precio elegido a mano', detalle: fmt(manual), usd: aUSDm(manual - total) });
    total = manual;
  }

  if (Math.abs(total - base) < 1e-9) return;
  const totalUSDantes = r.totalUSD;
  r.total = total;
  r.totalUSD = moneda === 'ARS' ? (tc ? total / tc : r.totalUSD) : total;
  const factor = totalUSDantes > 0 ? r.totalUSD / totalUSDantes : 1;
  r.desgloseCliente = r.desgloseCliente.map((l) => ({ ...l, usd: l.usd * factor }));
  if (r.equivalente) r.equivalente = { moneda: r.equivalente.moneda, monto: desdeUSD(r.totalUSD, r.equivalente.moneda, tc) };
}

const fmtNum = (n) => formatNumero(n, 0, 2);
