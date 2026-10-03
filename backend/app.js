import express from 'express'
import { existsSync } from 'node:fs'
import { hashearContrasena, verificarContrasena, crearToken, hashDeToken } from './seguridad.js'

const COOKIE = 'sesion'
const DURACION_SESION = 30 * 24 * 60 * 60 * 1000 // 30 días
const MAX_INTENTOS = 5
const BLOQUEO = 15 * 60 * 1000 // 15 minutos

// El usuario no puede tener @, así nunca se confunde con un email al iniciar sesión
const USUARIO_VALIDO = /^[a-zA-Z0-9_.-]{3,30}$/
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const fallar = (res, estado, error) => res.status(estado).json({ error })

// Arma la aplicación con todas las rutas de la API. Recibe la base de datos ya abierta,
// así las pruebas pueden usar una base en memoria.
export async function crearApp(db, { produccion = false, carpetaFrontend } = {}) {
  const app = express()
  app.use(express.json({ limit: '1mb' }))

  // Hash de una contraseña que no es de nadie: se usa cuando el usuario no existe (ver /api/login)
  const hashFalso = await hashearContrasena('no-es-la-contrasena-de-nadie')

  // ponytail: los intentos fallidos viven en memoria y se borran al reiniciar; pasarlos a la base si hubiera varios servidores
  const intentosFallidos = new Map() // usuario o email -> { cantidad, desde }

  const leerToken = (req) => {
    const par = (req.headers.cookie ?? '')
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${COOKIE}=`))
    return par ? par.slice(COOKIE.length + 1) : null
  }

  // Crea la sesión, manda la cookie y responde con el usuario y su trabajo guardado
  const iniciarSesion = (res, usuario) => {
    const token = crearToken()
    db.crearSesion(hashDeToken(token), usuario.id, Date.now() + DURACION_SESION)
    // httpOnly: el JavaScript de la página no puede leer la cookie. sameSite: otros sitios no la pueden usar.
    res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: produccion, maxAge: DURACION_SESION, path: '/' })
    res.json({ usuario: usuario.usuario, trabajo: db.leerTrabajo(usuario.id) })
  }

  // Solo deja pasar pedidos con una sesión válida, y deja los datos del usuario en req.usuario
  const requiereSesion = (req, res, next) => {
    const token = leerToken(req)
    req.usuario = token ? db.usuarioDeSesion(hashDeToken(token)) : null
    if (!req.usuario) return fallar(res, 401, 'Tenés que iniciar sesión.')
    next()
  }

  app.post('/api/registro', async (req, res) => {
    const usuario = String(req.body?.usuario ?? '').trim()
    const email = String(req.body?.email ?? '').trim().toLowerCase()
    const contrasena = String(req.body?.contrasena ?? '')

    if (!USUARIO_VALIDO.test(usuario)) {
      return fallar(res, 400, 'El usuario tiene que tener entre 3 y 30 caracteres: letras, números, punto, guion o guion bajo.')
    }
    if (email.length > 254 || !EMAIL_VALIDO.test(email)) return fallar(res, 400, 'El email no es válido.')
    if (contrasena.length < 8 || contrasena.length > 200) {
      return fallar(res, 400, 'La contraseña tiene que tener entre 8 y 200 caracteres.')
    }
    if (db.buscarUsuario(usuario)) return fallar(res, 409, 'Ese usuario ya existe.')
    if (db.buscarUsuario(email)) return fallar(res, 409, 'Ya hay una cuenta con ese email.')

    let id
    try {
      id = db.crearUsuario(usuario, email, await hashearContrasena(contrasena))
    } catch (err) {
      // Dos registros iguales al mismo tiempo: la base de datos frena el segundo
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') return fallar(res, 409, 'Ese usuario o email ya está registrado.')
      throw err
    }
    iniciarSesion(res, { id, usuario })
  })

  app.post('/api/login', async (req, res) => {
    const identificador = String(req.body?.usuario ?? '').trim().toLowerCase()
    const contrasena = String(req.body?.contrasena ?? '')
    const ahora = Date.now()

    const previos = intentosFallidos.get(identificador)
    const vigentes = previos && ahora - previos.desde < BLOQUEO ? previos : null
    if (vigentes && vigentes.cantidad >= MAX_INTENTOS) {
      return fallar(res, 429, 'Demasiados intentos fallidos. Esperá 15 minutos y probá de nuevo.')
    }

    const usuario = db.buscarUsuario(identificador)
    // Aunque el usuario no exista se verifica igual (contra un hash falso): así la respuesta tarda
    // lo mismo y no se puede averiguar qué usuarios existen midiendo tiempos
    const correcta = await verificarContrasena(contrasena, usuario?.contrasena_hash ?? hashFalso)

    if (!usuario || !correcta) {
      intentosFallidos.set(identificador, { cantidad: (vigentes?.cantidad ?? 0) + 1, desde: vigentes?.desde ?? ahora })
      if (intentosFallidos.size > 10_000) {
        for (const [clave, { desde }] of intentosFallidos) if (ahora - desde >= BLOQUEO) intentosFallidos.delete(clave)
      }
      return fallar(res, 401, 'Usuario o contraseña incorrectos.')
    }

    intentosFallidos.delete(identificador)
    iniciarSesion(res, usuario)
  })

  app.post('/api/logout', (req, res) => {
    const token = leerToken(req)
    if (token) db.cerrarSesion(hashDeToken(token))
    res.clearCookie(COOKIE, { path: '/' })
    res.json({ ok: true })
  })

  // Al abrir la página: si ya había una sesión, devuelve el usuario y su trabajo
  app.get('/api/sesion', requiereSesion, (req, res) => {
    res.json({ usuario: req.usuario.usuario, trabajo: db.leerTrabajo(req.usuario.id) })
  })

  app.put('/api/trabajo', requiereSesion, (req, res) => {
    const { circuito, notas } = req.body ?? {}
    if (!Array.isArray(circuito) || circuito.length > 2000 || typeof notas !== 'string' || notas.length > 100_000) {
      return fallar(res, 400, 'El trabajo no tiene el formato esperado.')
    }
    db.guardarTrabajo(req.usuario.id, circuito, notas)
    res.json({ ok: true })
  })

  // En producción el mismo servidor entrega la página ya compilada (npm run build en frontend)
  if (carpetaFrontend && existsSync(carpetaFrontend)) app.use(express.static(carpetaFrontend))

  // Errores: JSON mal armado, pedidos demasiado grandes o cualquier falla inesperada
  // eslint-disable-next-line no-unused-vars -- Express reconoce el manejador de errores porque tiene 4 parámetros
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return fallar(res, 400, 'Datos inválidos.')
    if (err.type === 'entity.too.large') return fallar(res, 413, 'El trabajo es demasiado grande para guardarlo.')
    console.error(err)
    fallar(res, 500, 'Error del servidor.')
  })

  return app
}
