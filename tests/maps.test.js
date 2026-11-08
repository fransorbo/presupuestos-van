import { test, igual, verdadero } from './runner.js';
import { urlGoogleMaps, urlWhatsApp, puntosIntermedios, esAeropuerto, expandirAlias } from '../js/maps.js';
import { DEFAULT_CONFIG } from '../js/config.js';

test('URL de Google Maps: sale de A, termina en D, con B y C como paradas', () => {
  const url = urlGoogleMaps({ puntoA: 'Chaco 2625', puntoD: 'Carpe Diem Art', origen: 'Aeroparque', destino: 'Nordelta' });
  verdadero(url.startsWith('https://www.google.com/maps/dir/?api=1'), url);
  const p = new URL(url).searchParams;
  igual(p.get('origin'), 'Chaco 2625');
  igual(p.get('destination'), 'Carpe Diem Art');
  igual(p.get('waypoints'), 'Aeroparque|Nordelta');
  igual(p.get('travelmode'), 'driving');
});

test('URL de Google Maps: sin D vuelve a A', () => {
  const p = new URL(urlGoogleMaps({ puntoA: 'A', origen: 'B' })).searchParams;
  igual(p.get('destination'), 'A');
});

test('URL de Google Maps con paradas intermedias en orden', () => {
  const url = urlGoogleMaps({ puntoA: 'A', puntoD: 'D', origen: 'B', paradas: ['P1', ' ', 'P2'], destino: 'C' });
  igual(new URL(url).searchParams.get('waypoints'), 'B|P1|P2|C');
});

test('puntos intermedios ignora vacíos', () => {
  igual(puntosIntermedios({ origen: 'B', paradas: [''], destino: '' }), ['B']);
});

test('URL de WhatsApp codifica el texto', () => {
  igual(urlWhatsApp('Hola & chau\n¡Total!'), 'https://wa.me/?text=Hola%20%26%20chau%0A%C2%A1Total!');
});

test('detecta aeropuertos en la dirección de recogida', () => {
  const p = DEFAULT_CONFIG.palabrasAeropuerto;
  verdadero(esAeropuerto('Aeroparque Jorge Newbery, CABA', p));
  verdadero(esAeropuerto('Aeropuerto Internacional Ministro Pistarini', p));
  verdadero(esAeropuerto('EZEIZA terminal A', p));
  verdadero(esAeropuerto('Terminal 1, EZE', p));
  verdadero(esAeropuerto('AEP', p));
  verdadero(!esAeropuerto('Hotel Alvear, Av. Alvear 1891, CABA', p));
  verdadero(!esAeropuerto('Ezequiel Paz 1234', p), 'Ezequiel no es EZE');
  verdadero(!esAeropuerto('', p));
});

test('atajos EZE y AEP (sin importar mayúsculas)', () => {
  igual(expandirAlias('EZE'), 'Aeropuerto Internacional Ezeiza');
  igual(expandirAlias(' eze '), 'Aeropuerto Internacional Ezeiza');
  igual(expandirAlias('Aep'), 'Aeroparque Jorge Newbery');
  igual(expandirAlias('Ezeiza centro'), 'Ezeiza centro', 'otro texto no cambia');
  igual(expandirAlias('EZE terminal A'), 'EZE terminal A', 'solo si es el atajo solo');
  igual(puntosIntermedios({ origen: 'aep', paradas: ['EZE'], destino: 'Nordelta' }), ['Aeroparque Jorge Newbery', 'Aeropuerto Internacional Ezeiza', 'Nordelta']);
  const p = new URL(urlGoogleMaps({ puntoA: 'A', puntoD: 'D', origen: 'eze', destino: 'AEP' })).searchParams;
  igual(p.get('waypoints'), 'Aeropuerto Internacional Ezeiza|Aeroparque Jorge Newbery');
  verdadero(esAeropuerto('eze', DEFAULT_CONFIG.palabrasAeropuerto));
  verdadero(esAeropuerto('AEP', DEFAULT_CONFIG.palabrasAeropuerto));
});
