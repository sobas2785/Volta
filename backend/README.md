# Backend del Simulador de circuitos

API en Node.js (Express) con base de datos SQLite. Guarda las cuentas de alumnos y docentes, los circuitos
de cada uno (con su bloc de notas) y los ejercicios que cargan los docentes.

## Comandos

```bash
npm install      # instala dependencias (una vez)
npm run dev      # desarrollo: se reinicia solo al guardar cambios
npm start        # producción
npm run check    # prueba de punta a punta con una base en memoria
```

En desarrollo, correr también `npm run dev` en `frontend/`: Vite reenvía `/api` a este servidor.

## Para publicar (sector de informática)

1. `npm run build` en `frontend/` genera `frontend/dist`, que este servidor entrega en `/`.
2. En `backend/`: `npm install` y `npm start` con estas variables de entorno:

| Variable | Para qué | Valor por defecto |
|---|---|---|
| `PUERTO` | Puerto donde escucha | `3000` |
| `BASE_DE_DATOS` | Ruta del archivo SQLite de este sector | `backend/datos/circuitos.db` |
| `NODE_ENV` | Con `production` la cookie de sesión exige HTTPS | (vacío) |
| `CLAVE_DOCENTE` | Código que escriben los docentes al crear su cuenta. Conviene que sea largo | (vacío: no se pueden crear cuentas de docente) |

- Requiere Node.js 20 a 26 (se recomienda una versión LTS vigente).
- Todo el sitio tiene que servirse por HTTPS en producción.
- Para hacer copias de seguridad alcanza con copiar el archivo de la base de datos (y los `-wal`/`-shm` si existen).
- Una base creada con una versión anterior se actualiza sola al arrancar, sin perder datos.

## Tablas

- `usuarios`: usuario y email únicos (sin distinguir mayúsculas), el hash de la contraseña (scrypt, nunca la contraseña) y el rol (`alumno` o `docente`).
- `sesiones`: hash del token de cada sesión, a quién pertenece y cuándo vence (30 días).
- `circuitos`: los circuitos de cada usuario: nombre, circuito (JSON), notas y, si resuelve un ejercicio, cuál.
- `ejercicios`: lo que cargan los docentes: título, consigna y condiciones (JSON) que tiene que cumplir el circuito.

## API

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| POST | `/api/registro` | `{ usuario, email, contrasena, codigoDocente? }` | sesión + cookie de sesión |
| POST | `/api/login` | `{ usuario (o email), contrasena }` | sesión + cookie de sesión |
| POST | `/api/logout` | — | `{ ok: true }` |
| GET | `/api/sesion` | — | sesión, o 401 |
| GET | `/api/circuitos/:id` | — | circuito |
| POST | `/api/circuitos` | `{ nombre, circuito?, notas?, ejercicioId? }` | el circuito creado (o el que ya había para ese ejercicio) |
| PUT | `/api/circuitos/:id` | `{ nombre, circuito, notas }` | `{ ok: true }` |
| DELETE | `/api/circuitos/:id` | — | `{ ok: true }` (el único que queda no se puede eliminar) |
| GET | `/api/ejercicios` | — | `[{ id, titulo, consigna, condiciones, docente }]` |
| POST | `/api/ejercicios` (docente) | `{ titulo, consigna, condiciones }` | el ejercicio creado |
| DELETE | `/api/ejercicios/:id` (el docente que lo creó) | — | `{ ok: true }` |
| GET | `/api/ejercicios/:id/entregas` (docente) | — | `[{ usuario, circuito, notas, actualizado }]` |

- sesión: `{ usuario, rol, circuitos: [{ id, nombre }], trabajo }`, donde `trabajo` es el último circuito que se guardó.
- circuito: `{ id, nombre, circuito, notas, ejercicio }`, con `ejercicio` en `null` si no resuelve ninguno.
- condiciones: `[{ componente, magnitud, valor }]`, con el nombre del componente (`"R2"`), `magnitud` en
  `"tension"` (V) o `"corriente"` (A) y el valor que tiene que medir. Si el circuito las cumple lo calcula
  la página con el simulador, tanto para el alumno como para el docente que mira las entregas.

Los errores responden `{ error: "mensaje para mostrar" }`. Después de 5 intentos de login fallidos
seguidos, esa cuenta queda bloqueada 15 minutos; lo mismo pasa con los códigos de docente equivocados.
