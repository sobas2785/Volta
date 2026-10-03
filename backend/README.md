# Backend del Simulador de circuitos

API en Node.js (Express) con base de datos SQLite. Guarda las cuentas de los alumnos y el trabajo de
cada uno (circuito y bloc de notas).

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

- Requiere Node.js 20 a 26 (se recomienda una versión LTS vigente).
- Todo el sitio tiene que servirse por HTTPS en producción.
- Para hacer copias de seguridad alcanza con copiar el archivo de la base de datos (y los `-wal`/`-shm` si existen).

## Tablas

- `usuarios`: usuario y email únicos (sin distinguir mayúsculas) y el hash de la contraseña (scrypt, nunca la contraseña).
- `sesiones`: hash del token de cada sesión, a quién pertenece y cuándo vence (30 días).
- `trabajos`: el circuito (JSON) y las notas de cada usuario.

## API

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| POST | `/api/registro` | `{ usuario, email, contrasena }` | `{ usuario, trabajo }` + cookie de sesión |
| POST | `/api/login` | `{ usuario (o email), contrasena }` | `{ usuario, trabajo }` + cookie de sesión |
| POST | `/api/logout` | — | `{ ok: true }` |
| GET | `/api/sesion` | — | `{ usuario, trabajo }` o 401 |
| PUT | `/api/trabajo` | `{ circuito, notas }` | `{ ok: true }` |

Los errores responden `{ error: "mensaje para mostrar" }`. Después de 5 intentos de login fallidos
seguidos, esa cuenta queda bloqueada 15 minutos.
