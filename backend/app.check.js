// Prueba de punta a punta del backend, con una base de datos en memoria. Correr con: npm run check
import assert from 'node:assert/strict'
import { abrirBaseDeDatos } from './db.js'
import { crearApp } from './app.js'

const db = abrirBaseDeDatos(':memory:')
const app = await crearApp(db, { claveDocente: 'codigo-de-la-escuela' })
const servidor = await new Promise((listo) => {
  const s = app.listen(0, () => listo(s))
})
const base = `http://localhost:${servidor.address().port}`

// Hace de navegador: guarda la cookie de sesión que manda el servidor y la reenvía
let cookie = ''
async function pedir(metodo, ruta, cuerpo) {
  const respuesta = await fetch(base + ruta, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', cookie },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo)
  })
  const nueva = respuesta.headers.get('set-cookie')
  if (nueva) cookie = nueva.split(';')[0]
  return { estado: respuesta.status, datos: await respuesta.json() }
}

try {
  assert.equal((await pedir('GET', '/api/sesion')).estado, 401)

  // Validaciones del registro
  assert.equal((await pedir('POST', '/api/registro', { usuario: 'alumno1', email: 'no-es-email', contrasena: '12345678' })).estado, 400)
  assert.equal((await pedir('POST', '/api/registro', { usuario: 'alumno1', email: 'a@b.com', contrasena: 'corta' })).estado, 400)
  assert.equal((await pedir('POST', '/api/registro', { usuario: 'a@', email: 'a@b.com', contrasena: '12345678' })).estado, 400)

  // Registro correcto: queda con sesión iniciada, como alumno y con un primer circuito vacío
  let r = await pedir('POST', '/api/registro', { usuario: 'alumno1', email: 'Alumno1@Escuela.com', contrasena: 'resistencia123' })
  assert.equal(r.estado, 200)
  const primero = r.datos.trabajo.id
  assert.deepEqual(r.datos, {
    usuario: 'alumno1',
    rol: 'alumno',
    circuitos: [{ id: primero, nombre: 'Mi primer circuito' }],
    trabajo: { id: primero, nombre: 'Mi primer circuito', circuito: [], notas: '', ejercicio: null }
  })
  assert.match(cookie, /^sesion=.+/)
  const cookieAlumno1 = cookie

  // No se repiten usuario (sin importar mayúsculas) ni email
  assert.equal((await pedir('POST', '/api/registro', { usuario: 'ALUMNO1', email: 'otro@b.com', contrasena: '12345678' })).estado, 409)
  assert.equal((await pedir('POST', '/api/registro', { usuario: 'alumno2', email: 'alumno1@escuela.com', contrasena: '12345678' })).estado, 409)

  // La contraseña no se guarda en texto
  const guardado = db.buscarUsuario('alumno1').contrasena_hash
  assert.match(guardado, /^scrypt:/)
  assert.ok(!guardado.includes('resistencia123'))

  // Guardar y leer un circuito
  const trabajo = { nombre: 'Serie', circuito: [{ id: 'x', tipo: 'resistencia', x: 10, y: 20, valor: 100, nombre: 'R1' }], notas: 'R1 en serie' }
  assert.equal((await pedir('PUT', `/api/circuitos/${primero}`, trabajo)).estado, 200)
  assert.equal((await pedir('PUT', `/api/circuitos/${primero}`, { nombre: 'Serie', circuito: 'no es lista', notas: '' })).estado, 400)
  assert.equal((await pedir('PUT', `/api/circuitos/${primero}`, { ...trabajo, nombre: '' })).estado, 400)
  assert.deepEqual((await pedir('GET', `/api/circuitos/${primero}`)).datos, { id: primero, ...trabajo, ejercicio: null })

  // Varios circuitos: uno nuevo vacío y una copia. El único que queda no se puede eliminar
  assert.equal((await pedir('DELETE', `/api/circuitos/${primero}`)).estado, 409)
  const segundo = (await pedir('POST', '/api/circuitos', { nombre: 'Paralelo' })).datos
  assert.deepEqual(segundo, { id: segundo.id, nombre: 'Paralelo', circuito: [], notas: '', ejercicio: null })
  const copia = (await pedir('POST', '/api/circuitos', { ...trabajo, nombre: 'Serie (copia)' })).datos
  assert.deepEqual(copia.circuito, trabajo.circuito)
  assert.equal((await pedir('GET', '/api/sesion')).datos.circuitos.length, 3)
  assert.equal((await pedir('DELETE', `/api/circuitos/${copia.id}`)).estado, 200)
  assert.equal((await pedir('GET', `/api/circuitos/${copia.id}`)).estado, 404)

  // Otro alumno no puede leer, pisar ni borrar circuitos ajenos
  await pedir('POST', '/api/registro', { usuario: 'alumno2', email: 'alumno2@escuela.com', contrasena: 'resistencia123' })
  assert.equal((await pedir('GET', `/api/circuitos/${primero}`)).estado, 404)
  assert.equal((await pedir('PUT', `/api/circuitos/${primero}`, trabajo)).estado, 404)
  await pedir('POST', '/api/circuitos', { nombre: 'Otro' })
  assert.equal((await pedir('DELETE', `/api/circuitos/${primero}`)).estado, 404)

  // Cuenta de docente: solo con el código de la escuela
  const docente = { usuario: 'profe', email: 'profe@escuela.com', contrasena: 'resistencia123' }
  assert.equal((await pedir('POST', '/api/registro', { ...docente, codigoDocente: 'adivinando' })).estado, 403)
  r = await pedir('POST', '/api/registro', { ...docente, codigoDocente: 'codigo-de-la-escuela' })
  assert.equal(r.datos.rol, 'docente')
  const cookieDocente = cookie

  // El docente carga un ejercicio; un alumno no puede
  const ejercicio = { titulo: 'Divisor', consigna: 'Que en R2 caigan 8 V', condiciones: [{ componente: ' R2 ', magnitud: 'tension', valor: 8 }] }
  assert.equal((await pedir('POST', '/api/ejercicios', { ...ejercicio, condiciones: [{ componente: 'R2', magnitud: 'brillo', valor: 1 }] })).estado, 400)
  const creado = (await pedir('POST', '/api/ejercicios', ejercicio)).datos
  assert.deepEqual(creado.condiciones, [{ componente: 'R2', magnitud: 'tension', valor: 8 }])
  cookie = cookieAlumno1
  assert.equal((await pedir('POST', '/api/ejercicios', ejercicio)).estado, 403)
  assert.equal((await pedir('GET', `/api/ejercicios/${creado.id}/entregas`)).estado, 403)
  assert.deepEqual((await pedir('GET', '/api/ejercicios')).datos, [{ ...creado, docente: 'profe' }])

  // El alumno lo empieza: se crea un circuito unido al ejercicio, y si lo vuelve a pedir se abre el mismo
  const entrega = (await pedir('POST', '/api/circuitos', { nombre: 'Divisor', ejercicioId: creado.id })).datos
  assert.deepEqual(entrega.ejercicio, { id: creado.id, titulo: 'Divisor', consigna: ejercicio.consigna, condiciones: creado.condiciones })
  assert.equal((await pedir('POST', '/api/circuitos', { nombre: 'Divisor', ejercicioId: creado.id })).datos.id, entrega.id)
  assert.equal((await pedir('POST', '/api/circuitos', { nombre: 'Nada', ejercicioId: 9999 })).estado, 404)
  await pedir('PUT', `/api/circuitos/${entrega.id}`, { ...trabajo, nombre: 'Divisor' })

  // El docente ve lo que hizo cada alumno. Si borra el ejercicio, el circuito del alumno queda, ya sin ejercicio
  cookie = cookieDocente
  r = await pedir('GET', `/api/ejercicios/${creado.id}/entregas`)
  assert.equal(r.datos.length, 1)
  assert.equal(r.datos[0].usuario, 'alumno1')
  assert.deepEqual(r.datos[0].circuito, trabajo.circuito)
  assert.equal((await pedir('DELETE', `/api/ejercicios/${creado.id}`)).estado, 200)
  cookie = cookieAlumno1
  assert.equal((await pedir('GET', `/api/circuitos/${entrega.id}`)).datos.ejercicio, null)

  // Cerrar sesión: la cookie vieja ya no sirve
  await pedir('POST', '/api/logout')
  cookie = cookieAlumno1
  assert.equal((await pedir('GET', '/api/sesion')).estado, 401)

  // Iniciar sesión con el email: se abre el último circuito guardado
  assert.equal((await pedir('POST', '/api/login', { usuario: 'alumno1', contrasena: 'incorrecta' })).estado, 401)
  r = await pedir('POST', '/api/login', { usuario: 'ALUMNO1@escuela.com', contrasena: 'resistencia123' })
  assert.equal(r.estado, 200)
  assert.equal(r.datos.trabajo.id, entrega.id)
  assert.equal(r.datos.circuitos.length, 3)

  // Un usuario que no existe responde igual que una contraseña incorrecta
  assert.deepEqual((await pedir('POST', '/api/login', { usuario: 'nadie', contrasena: 'x' })).datos, { error: 'Usuario o contraseña incorrectos.' })

  // Después de 5 intentos fallidos se bloquea, aunque la contraseña sea la correcta
  for (let i = 0; i < 5; i++) await pedir('POST', '/api/login', { usuario: 'alumno1', contrasena: 'mal' })
  assert.equal((await pedir('POST', '/api/login', { usuario: 'alumno1', contrasena: 'resistencia123' })).estado, 429)

  // JSON mal armado
  const malArmado = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{roto' })
  assert.equal(malArmado.status, 400)

  // Una base de la versión anterior (un solo trabajo por usuario, sin roles) se actualiza sin perder nada
  const vieja = new (await import('better-sqlite3')).default(':memory:')
  vieja.exec(`
    CREATE TABLE usuarios (id INTEGER PRIMARY KEY AUTOINCREMENT, usuario TEXT NOT NULL UNIQUE COLLATE NOCASE,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE, contrasena_hash TEXT NOT NULL, creado TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE trabajos (usuario_id INTEGER PRIMARY KEY REFERENCES usuarios(id), circuito TEXT NOT NULL DEFAULT '[]',
      notas TEXT NOT NULL DEFAULT '', actualizado TEXT NOT NULL DEFAULT (datetime('now')));
    INSERT INTO usuarios (usuario, email, contrasena_hash) VALUES ('viejo', 'viejo@escuela.com', 'x');
    INSERT INTO trabajos (usuario_id, circuito, notas) VALUES (1, '[{"id":"x"}]', 'mis notas');
  `)
  const rutaVieja = `${(await import('node:os')).tmpdir()}/volta-check-${process.pid}.db`
  await vieja.backup(rutaVieja)
  const migrada = abrirBaseDeDatos(rutaVieja)
  try {
    const viejo = migrada.buscarUsuario('viejo')
    assert.equal(viejo.rol, 'alumno')
    const [{ id }] = migrada.listarCircuitos(viejo.id)
    assert.deepEqual(migrada.leerCircuito(viejo.id, id), { id, nombre: 'Mi circuito', circuito: [{ id: 'x' }], notas: 'mis notas', ejercicio: null })
  } finally {
    migrada.cerrar()
    for (const sufijo of ['', '-wal', '-shm']) (await import('node:fs')).rmSync(rutaVieja + sufijo, { force: true })
  }

  console.log('Backend: todo OK')
} finally {
  servidor.close()
}
