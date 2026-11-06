#!/bin/bash
# Levanta la app en http://localhost:8000 y muestra la dirección para abrirla desde el celular.
# Uso: doble clic en este archivo (macOS) o, en la terminal:  ./servir.command
cd "$(dirname "$0")"
exec python3 servidor.py 8000
