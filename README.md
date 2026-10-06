# Análisis de Tendencias

Cualquier duda haz preguntas:

Sistema de Análisis de Tendencias — DIAFRA S.A. de C.V.

Contexto del proyecto

Herramienta web interna para el Departamento de Validación de una empresa farmacéutica mexicana (DIAFRA S.A. de C.V.). Permite registrar, digitalizar desde imagen, analizar estadísticamente y visualizar tendencias de parámetros críticos de calidad (CQA's) conforme a NOM-241-SSA1-2025, ISO 14644 y FEUM 13ª Edición. Referencia documental: FOR-VAL-16.

Arquitectura general

La app tiene una página principal (Home) que funciona como tablero de decisión con tarjetas navegables hacia cada módulo. Los módulos son independientes pero comparten la misma arquitectura interna.

Módulos activos:

Banco de filtros

Temperatura y Humedad Relativa

Presiones diferenciales

Sistema de agua purificada nivel 1

Módulos próximos (mostrar como deshabilitados): 5. Análisis microbiológico 6. Reporte consolidado

Stack y requerimientos técnicos

React + TypeScript + Tailwind CSS

Recharts para todas las gráficas

Anthropic API (claude-sonnet-4-20250514) para extracción de datos desde imagen de bitácora — el frontend llama directamente al endpoint /v1/messages con la imagen en base64

Persistencia con localStorage (clave por módulo + registro)

Sin backend propio — todo cliente salvo la llamada a Anthropic API

Diseño: limpio, profesional, densidad media, apto para desktop y tablet. Paleta: azul #1a56db, teal #0d9488, grises neutros. Sin modo oscuro requerido.

Datos maestros precargados

Sistemas HVAC:

EQU-PRO-16 — UMA-01 — Producción y Acondicionamiento — etapas: 35%, 65%, 95%

EQU-ALM-02 — UMA-03 — Almacén de surtido y muestreo — etapas: 35%, 65%, 95%

EQU-CMB-08 — UMA-02 — Microbiología — etapas: 35%, 85%, 99.97%

Clasificaciones ISO y límites normativos:

ISO-5:           T: 18–25°C, HR: 30–65%, ΔP ≥ 15 Pa
ISO-7 (Clase C): T: 18–25°C, HR: 30–65%, ΔP ≥ 10 Pa
ISO-8 (Clase D): T: 18–25°C, HR: 30–65%, ΔP ≥ 5 Pa
ISO-9:           T: 18–25°C, HR: 30–65%, ΔP ≥ 0 Pa

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://atdiafra.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/e8811965-31be-4790-b2f1-e21100da2f34).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
