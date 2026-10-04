<p align="center">
  <img src="frontend/public/favicon.png" width="96" alt="Logo de Volta">
</p>

# Volta

Simulador de circuitos de corriente continua para usar en clase, hecho para la
E.E.S. Técnica N°1 Esteban Echeverría.

## Qué se puede hacer

- **Armar circuitos** arrastrando componentes al área de trabajo (o tocándolos en la lista) y uniéndolos
  con cables: resistencia, potenciómetro, fuente, interruptor, pulsador, lámpara, LED, diodo, motor,
  capacitor, fusible, voltímetro y amperímetro. Se puede deshacer y rehacer (Ctrl+Z, Ctrl+Y) y borrar con Supr.
- **Simularlos**: calcula la tensión y la corriente de cada componente, muestra por dónde circula la
  corriente y avisa cuando hay un cortocircuito, cuando algo se quema o cuando un fusible se funde.
  Los capacitores se cargan y descargan con el tiempo.
- **Hacer cuentas** con la calculadora de ley de Ohm (V, I o R) y la de resistencia equivalente
  en serie y en paralelo.
- **Anotar el razonamiento** en un bloc de notas.
- **Guardar el trabajo**: cada alumno entra con su cuenta y tiene todos los circuitos que quiera;
  cada uno se guarda solo, con sus notas.
- **Resolver ejercicios**: los docentes cargan consignas con lo que tiene que cumplir el circuito
  (por ejemplo, "que en R2 caigan 8 V"), Volta las corrige sola mientras el alumno arma el circuito
  y el docente ve qué hizo cada uno.
- **Imprimir o guardar como PDF** el circuito con sus notas.
- **Usarlo en el celular o la tablet**, además de la computadora.

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

Para poder crear cuentas de docente, el backend tiene que arrancar con la variable de entorno
`CLAVE_DOCENTE`: ese es el código que se escribe al crear la cuenta (ver [backend/README.md](backend/README.md)).

## Cuentas de prueba

Para probar Volta sin registrarse, hay una cuenta de cada rol:

| Rol | Usuario | Contraseña |
|---|---|---|
| Alumno | `alumno` | `alumno123` |
| Docente | `docente` | `docente123` |

La base de datos no se sube al repositorio: en una instalación nueva estas cuentas todavía no existen
y hay que crearlas una vez desde "Crear cuenta" (la de docente, con el código de `CLAVE_DOCENTE`).

## Estructura

| Carpeta | Qué tiene |
|---|---|
| `frontend/` | La aplicación web, en React con Vite. |
| `backend/` | La API en Node.js (Express) con base de datos SQLite: cuentas, sesiones, circuitos y ejercicios. |

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
