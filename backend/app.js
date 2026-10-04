import express from 'express'
import { existsSync } from 'node:fs'
import { hashearContrasena, verificarContrasena, crearToken, hashDeToken, mismoTexto } from './seguridad.js'

const COOKIE = 'sesion'
const DURACION_SESION = 30 * 24 * 60 * 60 * 1000 // 30 días
const MAX_INTENTOS = 5
const BLOQUEO = 15 * 60 * 1000 // 15 minutos
const MAX_CIRCUITOS = 100 // por usuario
const MAGNITUDES = ['tension', 'corriente'] // lo que puede pedir un ejercicio sobre un componente

// El usuario no puede tener @, así nunca se confunde con un email al iniciar sesión
const USUARIO_VALIDO = /^[a-zA-Z0-9_.-]{3,30}$/
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const fallar = (res, estado, error) => res.status(estado).json({ error })

// Arma la aplicación con todas las rutas de la API. Recibe la base de datos ya abierta,
// así las pruebas pueden usar una base en memoria.
export async function crearApp(db, { produccion = false, carpetaFrontend, claveDocente } = {}) {
  const app = express()
  app.use(express.json({ limit: '1mb' }))

  // Hash de una contraseña que no es de nadie: se usa cuando el usuario no existe (ver /api/login)
  const hashFalso = await hashearContrasena('no-es-la-contrasena-de-nadie')

  // ponytail: los intentos fallidos viven en memoria y se borran al reiniciar; pasarlos a la base si hubiera varios servidores
  const intentosFallidos = new Map() // usuario o email -> { cantidad, desde }
  // Códigos de docente equivocados (entre todos los que prueban): frena a quien intente adivinarlo
  const codigosFallidos = { cantidad: 0, desde: 0 }

  const leerToken = (req) => {
    const par = (req.headers.cookie ?? '')
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${COOKIE}=`))
    return par ? par.slice(COOKIE.length + 1) : null
  }

  // Lo que la página necesita al entrar: quién es, la lista de sus circuitos y, completo, el último que guardó
  const datosDeSesion = (usuario) => {
    const circuitos = db.listarCircuitos(usuario.id)
    return { usuario: usuario.usuario, rol: usuario.rol, circuitos, trabajo: db.leerCircuito(usuario.id, circuitos[0].id) }
  }

  // Nombre, circuito y notas de un pedido, o null si no tienen el formato esperado
  const leerTrabajo = (cuerpo) => {
    const nombre = typeof cuerpo?.nombre === 'string' ? cuerpo.nombre.trim() : ''
    const { circuito = [], notas = '' } = cuerpo ?? {}
    if (!nombre || nombre.length > 60) return null
    if (!Array.isArray(circuito) || circuito.length > 2000 || typeof notas !== 'string' || notas.length > 100_000) return null
    return { nombre, circuito, notas }
  }

  // Crea la sesión, manda la cookie y responde con los datos para entrar
  const iniciarSesion = (res, usuario) => {
    const token = crearToken()
    db.crearSesion(hashDeToken(token), usuario.id, Date.now() + DURACION_SESION)
    // httpOnly: el JavaScript de la página no puede leer la cookie. sameSite: otros sitios no la pueden usar.
    res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: produccion, maxAge: DURACION_SESION, path: '/' })
    res.json(datosDeSesion(usuario))
  }

  // Solo deja pasar pedidos con una sesión válida, y deja los datos del usuario en req.usuario
  const requiereSesion = (req, res, next) => {
    const token = leerToken(req)
    req.usuario = token ? db.usuarioDeSesion(hashDeToken(token)) : null
    if (!req.usuario) return fallar(res, 401, 'Tenés que iniciar sesión.')
    next()
  }

  const requiereDocente = (req, res, next) => {
    if (req.usuario.rol !== 'docente') return fallar(res, 403, 'Esto es solo para docentes.')
    next()
  }

  app.post('/api/registro', async (req, res) => {
    const usuario = String(req.body?.usuario ?? '').trim()
    const email = String(req.body?.email ?? '').trim().toLowerCase()
    const contrasena = String(req.body?.contrasena ?? '')
    const codigoDocente = String(req.body?.codigoDocente ?? '')

    if (!USUARIO_VALIDO.test(usuario)) {
      return fallar(res, 400, 'El usuario tiene que tener entre 3 y 30 caracteres: letras, números, punto, guion o guion bajo.')
    }
    if (email.length > 254 || !EMAIL_VALIDO.test(email)) return fallar(res, 400, 'El email no es válido.')
    if (contrasena.length < 8 || contrasena.length > 200) {
      return fallar(res, 400, 'La contraseña tiene que tener entre 8 y 200 caracteres.')
    }
    if (db.buscarUsuario(usuario)) return fallar(res, 409, 'Ese usuario ya existe.')
    if (db.buscarUsuario(email)) return fallar(res, 409, 'Ya hay una cuenta con ese email.')

    // Con el código que reparte la escuela, la cuenta es de docente
    let rol = 'alumno'
    if (codigoDocente) {
      const ahora = Date.now()
      if (ahora - codigosFallidos.desde >= BLOQUEO) Object.assign(codigosFallidos, { cantidad: 0, desde: ahora })
      if (codigosFallidos.cantidad >= MAX_INTENTOS) {
        return fallar(res, 429, 'Demasiados códigos de docente incorrectos. Esperá 15 minutos y probá de nuevo.')
      }
      if (!claveDocente || !mismoTexto(codigoDocente, claveDocente)) {
        codigosFallidos.cantidad++
        return fallar(res, 403, 'El código de docente no es correcto.')
      }
      rol = 'docente'
    }

    let id
    try {
      id = db.crearUsuario(usuario, email, await hashearContrasena(contrasena), rol)
    } catch (err) {
      // Dos registros iguales al mismo tiempo: la base de datos frena el segundo
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') return fallar(res, 409, 'Ese usuario o email ya está registrado.')
      throw err
    }
    iniciarSesion(res, { id, usuario, rol })
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

  // Al abrir la página: si ya había una sesión, devuelve los datos para entrar
  app.get('/api/sesion', requiereSesion, (req, res) => {
    res.json(datosDeSesion(req.usuario))
  })

  app.get('/api/circuitos/:id', requiereSesion, (req, res) => {
    const trabajo = db.leerCircuito(req.usuario.id, Number(req.params.id))
    if (!trabajo) return fallar(res, 404, 'Ese circuito no existe.')
    res.json(trabajo)
  })

  // Crea un circuito: vacío, copia de otro (si llegan circuito y notas) o para resolver un ejercicio (ejercicioId)
  app.post('/api/circuitos', requiereSesion, (req, res) => {
    const trabajo = leerTrabajo(req.body)
    const ejercicioId = req.body?.ejercicioId ?? null
    if (!trabajo || (ejercicioId !== null && !Number.isInteger(ejercicioId))) {
      return fallar(res, 400, 'El circuito no tiene el formato esperado.')
    }
    if (ejercicioId !== null) {
      // Cada alumno tiene un solo circuito por ejercicio: si ya lo había empezado, se abre ese
      const empezado = db.circuitoDeEjercicio(req.usuario.id, ejercicioId)
      if (empezado) return res.json(db.leerCircuito(req.usuario.id, empezado))
      if (!db.leerEjercicio(ejercicioId)) return fallar(res, 404, 'Ese ejercicio no existe.')
    }
    if (db.listarCircuitos(req.usuario.id).length >= MAX_CIRCUITOS) {
      return fallar(res, 409, `No se pueden tener más de ${MAX_CIRCUITOS} circuitos. Eliminá alguno.`)
    }
    const id = db.crearCircuito(req.usuario.id, trabajo.nombre, trabajo.circuito, trabajo.notas, ejercicioId)
    res.json(db.leerCircuito(req.usuario.id, id))
  })

  app.put('/api/circuitos/:id', requiereSesion, (req, res) => {
    const trabajo = leerTrabajo(req.body)
    if (!trabajo) return fallar(res, 400, 'El circuito no tiene el formato esperado.')
    const guardado = db.guardarCircuito(req.usuario.id, Number(req.params.id), trabajo.nombre, trabajo.circuito, trabajo.notas)
    if (!guardado) return fallar(res, 404, 'Ese circuito no existe.')
    res.json({ ok: true })
  })

  app.delete('/api/circuitos/:id', requiereSesion, (req, res) => {
    if (db.listarCircuitos(req.usuario.id).length < 2) return fallar(res, 409, 'No se puede eliminar el único circuito.')
    if (!db.borrarCircuito(req.usuario.id, Number(req.params.id))) return fallar(res, 404, 'Ese circuito no existe.')
    res.json({ ok: true })
  })

  // Los ejercicios los ven todos; crearlos, borrarlos y ver las entregas es solo para docentes.
  // ponytail: todos los alumnos ven todos los ejercicios; agregar cursos si hiciera falta separarlos
  app.get('/api/ejercicios', requiereSesion, (req, res) => {
    res.json(db.listarEjercicios())
  })

  app.post('/api/ejercicios', requiereSesion, requiereDocente, (req, res) => {
    const titulo = String(req.body?.titulo ?? '').trim()
    const consigna = String(req.body?.consigna ?? '').trim()
    const condiciones = req.body?.condiciones
    if (!titulo || titulo.length > 60 || !consigna || consigna.length > 2000) {
      return fallar(res, 400, 'El ejercicio necesita un título (hasta 60 caracteres) y una consigna.')
    }
    // Cada condición: qué componente (por su nombre, como "R2"), qué magnitud y cuánto tiene que valer
    const valida = (c) =>
      typeof c?.componente === 'string' && c.componente.trim() && c.componente.length <= 30 &&
      MAGNITUDES.includes(c.magnitud) && Number.isFinite(c.valor)
    if (!Array.isArray(condiciones) || condiciones.length === 0 || condiciones.length > 10 || !condiciones.every(valida)) {
      return fallar(res, 400, 'Cada condición necesita el nombre de un componente, una magnitud y un valor.')
    }
    const limpias = condiciones.map(({ componente, magnitud, valor }) => ({ componente: componente.trim(), magnitud, valor }))
    res.json(db.leerEjercicio(db.crearEjercicio(req.usuario.id, titulo, consigna, limpias)))
  })

  app.delete('/api/ejercicios/:id', requiereSesion, requiereDocente, (req, res) => {
    if (!db.borrarEjercicio(req.usuario.id, Number(req.params.id))) {
      return fallar(res, 404, 'Ese ejercicio no existe o lo creó otro docente.')
    }
    res.json({ ok: true })
  })

  // El circuito de cada alumno para ese ejercicio. Si cumple o no lo calcula la página del docente con el simulador
  app.get('/api/ejercicios/:id/entregas', requiereSesion, requiereDocente, (req, res) => {
    res.json(db.listarEntregas(Number(req.params.id)))
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
