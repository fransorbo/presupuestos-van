import { test, igual, cerca, verdadero } from './runner.js';
import { calcular, num, parsearNumero, aUSD, cantidadPeajes, kmDelViaje, nombresTramos, redondearA, redondearHacia } from '../js/calc.js';
import { DEFAULT_CONFIG } from '../js/config.js';

// Configuración real por defecto
const def = (extra = {}) => ({ ...JSON.parse(JSON.stringify(DEFAULT_CONFIG)), ...extra });
// Configuración para probar la mecánica del cálculo: USD 5/km y sin precio mínimo
const cfg = (extra = {}) => def({ precioKmUSD: 5, precioMinimo: { monto: 0, moneda: 'ARS' }, ...extra });
const linea = (r, id) => r.lineas.find((l) => l.id === id);

// Configuración de ejemplo con todos los factores activos
const cfgCompleta = () =>
  cfg({
    precioKmUSD: 5,
    peajes: { cadaKm: 100, monto: 2000, moneda: 'ARS', redondeo: 'floor' },
    esperaPorHoraUSD: 10,
    hotelPorNocheUSD: 50,
    countryPorcentaje: 10,
    ajusteGeneralPorcentaje: 10,
  });
const viajeCompleto = () => ({
  kmTotales: '240',
  horasEspera: '2',
  estacionamiento: { monto: '5000', moneda: 'ARS' },
  noches: '1',
  chofer: 'cristian',
  esCountry: true,
  countryPorcentaje: 10,
  moneda: 'USD',
  tipoCambio: 1000,
});

test('num: acepta coma decimal, puntos de miles y descarta negativos o texto', () => {
  igual(num('12,5'), 12.5);
  igual(num('12.5'), 12.5);
  igual(num('1.150'), 1150);
  igual(num('1.250,50'), 1250.5);
  igual(num(' 300 '), 300);
  igual(num('-3'), 0);
  igual(num(''), 0);
  igual(num('abc'), 0);
  igual(num(undefined), 0);
});

test('parsearNumero distingue vacío (0) de inválido (NaN)', () => {
  igual(parsearNumero(''), 0);
  igual(parsearNumero('-2,5'), -2.5);
  igual(Number.isNaN(parsearNumero('12abc')), true);
  igual(Number.isNaN(parsearNumero('1,2,3')), true);
});

test('aUSD convierte pesos con el tipo de cambio', () => {
  igual(aUSD(5000, 'ARS', 1000), 5);
  igual(aUSD(5, 'USD', 1000), 5);
  igual(aUSD(5000, 'ARS', 0), 0);
});

test('peajes: floor y ceil de km / cada X km', () => {
  const p = { cadaKm: 100, redondeo: 'floor' };
  igual(cantidadPeajes(250, p), 2);
  igual(cantidadPeajes(250, { ...p, redondeo: 'ceil' }), 3);
  igual(cantidadPeajes(300, { ...p, redondeo: 'ceil' }), 3);
  igual(cantidadPeajes(99, p), 0);
  igual(cantidadPeajes(250, { cadaKm: 0, redondeo: 'floor' }), 0);
});

test('km por tramo se suman', () => {
  igual(kmDelViaje({ modoTramos: true, tramos: ['20', '45,5', '30'] }), 95.5);
  igual(kmDelViaje({ modoTramos: false, kmTotales: '80', tramos: ['1'] }), 80);
});

test('nombres de los tramos con y sin paradas', () => {
  igual(nombresTramos(0), ['A → B', 'B → C', 'C → D']);
  igual(nombresTramos(1), ['A → B', 'B → Parada 1', 'Parada 1 → C', 'C → D']);
});

test('valores por defecto: USD 1 por km', () => {
  igual(DEFAULT_CONFIG.precioKmUSD, 1);
  const r = calcular({ kmTotales: '120', moneda: 'ARS', tipoCambio: 1150 }, def());
  igual(r.km, 120);
  cerca(r.totalUSD, 120);
  cerca(r.total, 138000, '', 1e-6);
  igual(r.minimoAplicado, false);
});

test('precio mínimo: si el total da menos de $ 90.000, se cobra el mínimo', () => {
  const r = calcular({ kmTotales: '50', moneda: 'ARS', tipoCambio: 1150 }, def()); // 50 USD = $ 57.500
  igual(r.minimoAplicado, true);
  cerca(r.total, 90000, '', 1e-6);
  cerca(r.totalUSD, 90000 / 1150);
  cerca(linea(r, 'minimo').usd, 90000 / 1150 - 50);
  igual(r.desgloseCliente.map((l) => l.etiqueta), ['Tarifa mínima']);
});

test('precio mínimo mostrado en USD', () => {
  const r = calcular({ kmTotales: '50', moneda: 'USD', tipoCambio: 1000 }, def());
  igual(r.minimoAplicado, true);
  cerca(r.total, 90);
  cerca(r.equivalente.monto, 90000, '', 1e-6);
});

test('precio mínimo: justo en el mínimo o por encima no se aplica; sin km tampoco', () => {
  igual(calcular({ kmTotales: '90', moneda: 'ARS', tipoCambio: 1000 }, def()).minimoAplicado, false); // $ 90.000 justo
  igual(calcular({ kmTotales: '', moneda: 'ARS', tipoCambio: 1000 }, def()).minimoAplicado, false);
});

test('precio mínimo se compara con el total final (con country y ajuste general)', () => {
  // 80 km = $ 80.000; con country 10% = $ 88.000 → mínimo; con 15% = $ 92.000 → no
  const v = { kmTotales: '80', moneda: 'ARS', tipoCambio: 1000, esCountry: true };
  igual(calcular({ ...v, countryPorcentaje: 10 }, def()).minimoAplicado, true);
  const r = calcular({ ...v, countryPorcentaje: 15 }, def());
  igual(r.minimoAplicado, false);
  cerca(r.total, 92000, '', 1e-6);
});

test('agencia: el presupuesto no cambia; se informa comisión del 20% y neto', () => {
  const v = { kmTotales: '200', moneda: 'ARS', tipoCambio: 1000 };
  const sin = calcular(v, def());
  const con = calcular({ ...v, porAgencia: true }, def());
  cerca(con.total, sin.total, 'mismo total');
  igual(sin.agencia, null);
  igual(con.agencia.porcentaje, 20);
  cerca(con.agencia.comisionUSD, 40);
  cerca(con.agencia.netoUSD, 160);
});

test('agencia con precio mínimo: el mínimo no cambia, la comisión sale del mínimo', () => {
  const r = calcular({ kmTotales: '50', moneda: 'ARS', tipoCambio: 1000, porAgencia: true }, def());
  cerca(r.total, 90000, '', 1e-6);
  cerca(r.agencia.comisionUSD, 18);
  cerca(r.agencia.netoUSD, 72);
});

test('tarifas fijas: hotel → Ezeiza USD 100 y hotel → Aeroparque USD 80, siempre en USD', () => {
  const extras = { kmTotales: '300', horasEspera: '3', noches: '1', esCountry: true, moneda: 'ARS', tipoCambio: 1150 };
  const c = def({ esperaPorHoraUSD: 10, hotelPorNocheUSD: 50, ajusteGeneralPorcentaje: 10 });
  const eze = calcular({ ...extras, tipoViaje: 'hotel-ezeiza' }, c);
  igual(eze.moneda, 'USD');
  igual(eze.total, 100);
  igual(eze.totalUSD, 100);
  igual(eze.equivalente, null, 'nunca en pesos');
  igual(eze.minimoAplicado, false);
  const aep = calcular({ ...extras, tipoViaje: 'hotel-aeroparque' }, c);
  igual(aep.total, 80);
  igual(aep.lineas.map((l) => l.id), ['fija']);
});

test('tarifa fija: el mínimo no se aplica aunque el tipo de cambio baje', () => {
  const r = calcular({ tipoViaje: 'hotel-aeroparque', moneda: 'ARS', tipoCambio: 900 }, def()); // 80 USD = $ 72.000
  igual(r.total, 80);
  igual(r.minimoAplicado, false);
});

test('tarifa fija por agencia: sigue en USD 100; comisión USD 20', () => {
  const r = calcular({ tipoViaje: 'hotel-ezeiza', porAgencia: true }, def());
  igual(r.total, 100);
  cerca(r.agencia.comisionUSD, 20);
});


test('cálculo completo en el orden documentado', () => {
  const r = calcular(viajeCompleto(), cfgCompleta());
  cerca(linea(r, 'km').usd, 1200, 'km');
  cerca(linea(r, 'peajes').usd, 4, 'peajes: 2 × $2000 / 1000');
  cerca(linea(r, 'espera').usd, 20, 'espera');
  cerca(linea(r, 'estacionamiento').usd, 5, 'estacionamiento');
  cerca(linea(r, 'hotel').usd, 50, 'hotel');
  cerca(r.subtotalUSD, 1279, 'subtotal');
  cerca(linea(r, 'country').usd, 127.9, 'country 10% sobre el subtotal');
  cerca(linea(r, 'ajuste').usd, 140.69, 'ajuste general 10%');
  cerca(r.totalUSD, 1547.59, 'total');
});

test('total en ARS y equivalente en USD', () => {
  const r = calcular({ ...viajeCompleto(), moneda: 'ARS' }, cfgCompleta());
  igual(r.moneda, 'ARS');
  cerca(r.total, 1547590, 'total ARS', 1e-4);
  igual(r.equivalente.moneda, 'USD');
  cerca(r.equivalente.monto, 1547.59);
});

test('country desactivado no suma recargo', () => {
  const r = calcular({ ...viajeCompleto(), esCountry: false }, cfgCompleta());
  cerca(linea(r, 'country').usd, 0);
  cerca(r.totalUSD, 1279 * 1.1);
});

test('el % de country del viaje pisa el de la configuración; si falta, usa el de la configuración', () => {
  const r1 = calcular({ kmTotales: 100, esCountry: true, countryPorcentaje: 8 }, cfg({ countryPorcentaje: 5 }));
  cerca(r1.totalUSD, 540);
  const r2 = calcular({ kmTotales: 100, esCountry: true }, cfg({ countryPorcentaje: 5 }));
  cerca(r2.totalUSD, 525);
});

test('ajuste de chofer: fijo + por km + % sobre km', () => {
  const c = cfg();
  c.choferes.marcelo = { nombre: 'Marcelo', fijoUSD: 10, porKmUSD: 0.5, porcentaje: 10 };
  const r = calcular({ kmTotales: 100, chofer: 'marcelo' }, c);
  cerca(linea(r, 'chofer').usd, 10 + 50 + 50);
  const r2 = calcular({ kmTotales: 100, chofer: 'cristian' }, c);
  cerca(linea(r2, 'chofer').usd, 0);
});

test('sin tipo de cambio: montos en pesos valen 0 y aparece un aviso', () => {
  const r = calcular({ kmTotales: 10, estacionamiento: { monto: 5000, moneda: 'ARS' }, tipoCambio: '' }, cfg({ tipoCambio: 0 }));
  cerca(linea(r, 'estacionamiento').usd, 0);
  verdadero(r.avisos.some((a) => a.includes('tipo de cambio')));
  igual(r.equivalente, null);
});

test('sin km: total 0 y aviso', () => {
  const r = calcular({}, cfg());
  igual(r.totalUSD, 0);
  verdadero(r.avisos.some((a) => a.includes('km')));
});

test('redondeo hacia arriba / abajo al múltiplo', () => {
  igual(redondearA(1547590, 1000), 1548000);
  igual(redondearA(12.3, 0), 12.3);
  igual(redondearHacia(97340, 1000, 'arriba'), 98000);
  igual(redondearHacia(97340, 1000, 'abajo'), 97000);
  igual(redondearHacia(98000, 1000, 'arriba'), 98000, 'si ya es múltiplo no cambia');
  igual(redondearHacia(12.3, 0, 'arriba'), 12.3);
});

test('ajustes a mano: botones de redondeo en la moneda elegida', () => {
  const v = { kmTotales: '100.8', moneda: 'ARS', tipoCambio: 1000 }; // $ 100.800 (sobre el mínimo)
  const r = calcular(v, def());
  cerca(r.redondeo.arriba, 101000);
  cerca(r.redondeo.abajo, 100000);
  cerca(r.total, 100800, 'sin elegir no redondea', 1e-6);
  const rArriba = calcular({ ...v, redondeo: 'arriba' }, def());
  cerca(rArriba.total, 101000, '', 1e-6);
  cerca(rArriba.totalUSD, 101);
  cerca(linea(rArriba, 'redondeo').usd, 0.2);
  const rAbajo = calcular({ ...v, redondeo: 'abajo' }, def());
  cerca(rAbajo.total, 100000, '', 1e-6);
  const rUSD = calcular({ kmTotales: '100.8', moneda: 'USD', tipoCambio: 1000, redondeo: 'arriba' }, def());
  cerca(rUSD.total, 105, 'en USD redondea a 5');
  cerca(rUSD.equivalente.monto, 105000, '', 1e-6);
});

test('ajustes a mano: aumento %, después redondeo; el precio a mano reemplaza todo', () => {
  const v = { kmTotales: '100', moneda: 'ARS', tipoCambio: 1000, aumentoPorcentaje: '10' }; // $ 100.000 + 10%
  const r = calcular(v, def());
  cerca(r.total, 110000, '', 1e-6);
  cerca(linea(r, 'aumento').usd, 10);
  const rR = calcular({ ...v, aumentoPorcentaje: '7,5', redondeo: 'arriba' }, def()); // $ 107.500 → $ 108.000
  cerca(rR.total, 108000, '', 1e-6);
  const rM = calcular({ ...v, redondeo: 'abajo', precioManual: '95.000' }, def());
  cerca(rM.total, 95000, '', 1e-6);
  igual(rM.precioManual, true);
  cerca(rM.totalUSD, 95);
  // También funciona sobre el mínimo y sobre las tarifas fijas
  cerca(calcular({ kmTotales: '10', moneda: 'ARS', tipoCambio: 1000, aumentoPorcentaje: 10 }, def()).total, 99000, 'mínimo + 10%', 1e-6);
  cerca(calcular({ tipoViaje: 'hotel-ezeiza', precioManual: '120' }, def()).total, 120);
});

test('ajustes a mano: el desglose del cliente se reparte y suma el total; la agencia usa el total final', () => {
  const r = calcular({ ...viajeCompleto(), aumentoPorcentaje: 12, redondeo: 'arriba', porAgencia: true }, cfgCompleta());
  const suma = r.desgloseCliente.reduce((s, l) => s + l.usd, 0);
  cerca(suma, r.totalUSD, 'suma del desglose', 1e-6);
  verdadero(!r.desgloseCliente.some((l) => ['aumento', 'redondeo', 'manual'].includes(l.id)), 'el cliente no ve los ajustes');
  cerca(r.agencia.comisionUSD, r.totalUSD * 0.2, '', 1e-6);
});

test('desglose para el cliente: reparte el ajuste general y suma el total', () => {
  const r = calcular(viajeCompleto(), cfgCompleta());
  const suma = r.desgloseCliente.reduce((s, l) => s + l.usd, 0);
  cerca(suma, r.totalUSD, 'suma del desglose', 1e-6);
  verdadero(!r.desgloseCliente.some((l) => l.id === 'ajuste'), 'no muestra el ajuste general');
  verdadero(!r.desgloseCliente.some((l) => l.id === 'chofer'), 'omite líneas en 0');
});
