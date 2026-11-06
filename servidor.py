"""Servidor local para probar la app (solo para la etapa de prueba).

Es el servidor estándar de Python, pero le pide al navegador que no guarde copias
viejas de los archivos, así cada cambio se ve al recargar (también en el celular).

Uso:  python3 servidor.py        (o doble clic en servir.command)
"""
import http.server
import socket
import socketserver
import sys

PUERTO = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


class SinCache(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".webmanifest": "application/manifest+json",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, must-revalidate")
        super().end_headers()


def ip_local():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))  # no envía nada; solo elige la interfaz de red
            return s.getsockname()[0]
    except OSError:
        return None


class Servidor(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


if __name__ == "__main__":
    ip = ip_local()
    print("\n  Presupuestos Van")
    print("  ----------------")
    print(f"  En esta compu:  http://localhost:{PUERTO}")
    if ip:
        print(f"  En el celular:  http://{ip}:{PUERTO}   (misma red Wi-Fi)")
    print(f"  Tests:          http://localhost:{PUERTO}/tests/tests.html")
    print("\n  Para cortar el servidor: Ctrl+C\n", flush=True)
    with Servidor(("0.0.0.0", PUERTO), SinCache) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n  Servidor detenido.")
