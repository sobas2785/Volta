<p align="center">
  <img src="frontend/public/favicon.png" width="96" alt="Logo de Volta">
</p>

# Volta

Simulador de circuitos de corriente continua para usar en clase, hecho para la
E.E.S. Técnica N°1 Esteban Echeverría.

## Qué se puede hacer

- **Armar circuitos** arrastrando componentes al área de trabajo y uniéndolos con cables: resistencia,
  fuente, interruptor, pulsador, lámpara, LED, diodo, motor, fusible, voltímetro y amperímetro.
- **Simularlos**: calcula la tensión y la corriente de cada componente, y avisa cuando hay un
  cortocircuito, cuando algo se quema o cuando un fusible se funde.
- **Hacer cuentas** con la calculadora de ley de Ohm (V, I o R) y la de resistencia equivalente
  en serie y en paralelo.
- **Anotar el razonamiento** en un bloc de notas.
- **Guardar el trabajo**: cada alumno entra con su cuenta y su circuito y sus notas se guardan solos.

## Cómo correrlo

Requiere Node.js 20 a 26. Hacen falta dos terminales, una para cada parte.

Backend:

```bash
cd backend
npm install
npm run dev
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Después abrir <http://localhost:5173>. En desarrollo, Vite reenvía los pedidos a `/api` al backend
(puerto 3000).

## Estructura

| Carpeta | Qué tiene |
|---|---|
| `frontend/` | La aplicación web, en React con Vite. |
| `backend/` | La API en Node.js (Express) con base de datos SQLite: cuentas, sesiones y trabajo guardado. |

La API, las tablas y los pasos para publicarlo están en [backend/README.md](backend/README.md).

## Pruebas

```bash
cd backend
npm run check
```

```bash
cd frontend
node src/ohm.check.js
node src/simulador.check.js
```
