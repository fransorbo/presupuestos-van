import { test, igual, verdadero } from './runner.js';

const esp = (t) => t.replace(/\u00a0/g, ' '); // los montos usan un espacio que no se corta
import { formatNumero, formatMoneda, formatFecha, formatHora, textoWhatsApp, textoExtras } from '../js/format.js';
import { calcular } from '../js/calc.js';
import { DEFAULT_CONFIG } from '../js/config.js';

test('formato argentino de números', () => {
  igual(formatNumero(1250, 2, 2), '1.250,00');
  igual(formatNumero(1234567.891, 2, 2), '1.234.567,89');
  igual(formatNumero(999, 0, 0), '999');
  igual(formatNumero(12.5, 0, 2), '12,5');
  igual(formatNumero(-0.001, 2, 2), '0,00');
});

test('formato de moneda: USD con 2 decimales, ARS sin decimales', () => {
  igual(esp(formatMoneda(1250, 'USD')), 'USD 1.250,00');
  verdadero(formatMoneda(1, 'ARS').includes('\u00a0'), 'usa espacio que no se corta');
  igual(esp(formatMoneda(1437500, 'ARS')), '$ 1.437.500');
  igual(esp(formatMoneda(1437499.6, 'ARS')), '$ 1.437.500');
});

test('fecha y hora', () => {
  igual(formatFecha('2026-11-20'), 'viernes 20/11/2026');
  igual(formatFecha(''), '');
  igual(formatHora('09:30'), '09:30 h');
  igual(formatHora(''), '');
});

test('extras con costo en lenguaje natural (los peajes no: siempre están incluidos)', () => {
  igual(textoExtras([{ id: 'espera', extra: true, detalle: '2 horas', usd: 20 }]), '2 horas de espera adicional');
  igual(
    textoExtras([
      { id: 'espera', extra: true, detalle: '2 horas', usd: 20 },
      { id: 'hotel', extra: true, detalle: '1 noche', usd: 50 },
      { id: 'estacionamiento', extra: true, detalle: '', usd: 5 },
      { id: 'peajes', extra: false, detalle: '2 peajes', usd: 4 },
      { id: 'espera', extra: true, detalle: '0 horas', usd: 0 },
    ]),
    '2 horas de espera adicional, 1 noche de hotel y estacionamiento'
  );
});

const C = DEFAULT_CONFIG;
const viaje = {
  origen: 'Aeroparque Jorge Newbery',
  destino: 'Nordelta',
  paradas: [],
  kmTotales: 120,
  moneda: 'USD',
  tipoCambio: 1150,
};
const mensaje = (v, c = C, incluirDesglose = false) =>
  esp(textoWhatsApp({ plantilla: c.plantillaWhatsApp, viaje: v, resultado: calcular(v, c), incluirDesglose, config: c }));

test('WhatsApp: omite líneas vacías y muestra total + equivalente', () => {
  const t = mensaje(viaje);
  verdadero(t.includes('Recorrido: Aeroparque Jorge Newbery → Nordelta'), t);
  verdadero(t.includes('*Total: USD 120,00* (≈ $ 138.000)'), t);
  verdadero(!t.includes('Fecha'), 'sin fecha no aparece la línea');
  verdadero(!t.includes('También incluye'), 'sin extras no aparece la línea');
  verdadero(!t.includes('Detalle'), 'sin desglose');
  verdadero(!/\n\n\n/.test(t), 'sin líneas en blanco repetidas');
});

test('WhatsApp: siempre informa que incluye peajes y espera', () => {
  verdadero(mensaje(viaje).includes('El precio incluye peajes y espera.'));
  verdadero(mensaje({ ...viaje, origen: 'Hotel Alvear' }).includes('El precio incluye peajes y espera.'));
});

test('WhatsApp: recogida en aeropuerto → espera de 1 hora desde el aterrizaje', () => {
  const t1 = mensaje(viaje);
  verdadero(t1.includes('1 hora desde que aterriza el vuelo, al que le hacemos seguimiento'), t1);
  verdadero(!t1.includes('15 minutos'));
  verdadero(mensaje({ ...viaje, origen: 'Aeropuerto Ministro Pistarini, Ezeiza' }).includes('1 hora desde que aterriza'));
});

test('WhatsApp: recogida en otro lugar → espera de 15 minutos', () => {
  const t = mensaje({ ...viaje, origen: 'Hotel Alvear, CABA', destino: 'Aeroparque' });
  verdadero(t.includes('La espera es de 15 minutos.'), t);
  verdadero(!t.includes('aterriza'), 'que el destino sea un aeropuerto no cuenta');
});

test('WhatsApp: con fecha, pasajeros, paradas, extras y desglose en ARS', () => {
  const c = { ...C, esperaPorHoraUSD: 10 };
  const v = { ...viaje, paradas: ['Obelisco'], fecha: '2026-11-20', hora: '08:00', pasajeros: '6', horasEspera: 2, moneda: 'ARS' };
  const t = mensaje(v, c, true);
  verdadero(t.includes('Aeroparque Jorge Newbery → Obelisco → Nordelta'), t);
  verdadero(t.includes('Fecha: viernes 20/11/2026'), t);
  verdadero(t.includes('Hora: 08:00 h'), t);
  verdadero(t.includes('Pasajeros: 6'), t);
  verdadero(t.includes('También incluye: 2 horas de espera adicional'), t);
  verdadero(t.includes('• Recorrido (120 km): $ 138.000'), t);
  verdadero(t.includes('• Espera adicional (2 horas): $ 23.000'), t);
  verdadero(t.includes('*Total: $ 161.000* (≈ USD 140,00)'), t);
});

test('WhatsApp: precio mínimo', () => {
  const t = mensaje({ ...viaje, kmTotales: 40, moneda: 'ARS' }, C, true);
  verdadero(t.includes('• Tarifa mínima: $ 90.000'), t);
  verdadero(t.includes('*Total: $ 90.000*'), t);
});

test('WhatsApp: tarifa fija en USD, sin pesos, con el aeropuerto como destino', () => {
  const v = { origen: 'Hotel Alvear, CABA', destino: '', tipoViaje: 'hotel-ezeiza', moneda: 'ARS', tipoCambio: 1150 };
  const t = mensaje(v, C, true);
  verdadero(t.includes('Recorrido: Hotel Alvear, CABA → Aeropuerto Internacional Ministro Pistarini (Ezeiza)'), t);
  verdadero(t.includes('*Total: USD 100,00*'), t);
  verdadero(!t.includes('$'), 'nunca en pesos');
  verdadero(t.includes('15 minutos'), 'la recogida es en el hotel');
});

test('WhatsApp: el viaje por agencia no cambia el mensaje ni menciona la comisión', () => {
  const t = mensaje({ ...viaje, porAgencia: true }, C, true);
  igual(t, mensaje(viaje, C, true));
  verdadero(!/agencia|comisi/i.test(t));
});

test('WhatsApp: variables desconocidas quedan como están', () => {
  const resultado = calcular(viaje, C);
  const t = esp(textoWhatsApp({ plantilla: 'Hola {nombre}, total {total}', viaje, resultado, incluirDesglose: false }));
  igual(t, 'Hola {nombre}, total USD 120,00');
});

test('WhatsApp: los atajos EZE y AEP se muestran con el nombre completo', () => {
  const t = mensaje({ ...viaje, origen: 'eze', paradas: ['Obelisco'], destino: 'AEP' });
  verdadero(t.includes('Recorrido: Aeropuerto Internacional Ezeiza → Obelisco → Aeroparque Jorge Newbery'), t);
  verdadero(t.includes('1 hora desde que aterriza'), 'EZE cuenta como aeropuerto');
});
