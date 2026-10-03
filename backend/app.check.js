// Prueba de punta a punta del backend, con una base de datos en memoria. Correr con: npm run check
import assert from 'node:assert/strict'
import { abrirBaseDeDatos } from './db.js'
import { crearApp } from './app.js'

const db = abrirBaseDeDatos(':memory:')
const app = await crearApp(db)
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

  // Registro correcto: queda con sesión iniciada y un trabajo vacío
  let r = await pedir('POST', '/api/registro', { usuario: 'alumno1', email: 'Alumno1@Escuela.com', contrasena: 'resistencia123' })
  assert.equal(r.estado, 200)
  assert.deepEqual(r.datos, { usuario: 'alumno1', trabajo: { circuito: [], notas: '' } })
  assert.match(cookie, /^sesion=.+/)

  // No se repiten usuario (sin importar mayúsculas) ni email
  assert.equal((await pedir('POST', '/api/registro', { usuario: 'ALUMNO1', email: 'otro@b.com', contrasena: '12345678' })).estado, 409)
  assert.equal((await pedir('POST', '/api/registro', { usuario: 'alumno2', email: 'alumno1@escuela.com', contrasena: '12345678' })).estado, 409)

  // La contraseña no se guarda en texto
  const guardado = db.buscarUsuario('alumno1').contrasena_hash
  assert.match(guardado, /^scrypt:/)
  assert.ok(!guardado.includes('resistencia123'))

  // Guardar y leer el trabajo
  const trabajo = { circuito: [{ id: 'x', tipo: 'resistencia', x: 10, y: 20, valor: 100, nombre: 'R1' }], notas: 'R1 en serie' }
  assert.equal((await pedir('PUT', '/api/trabajo', trabajo)).estado, 200)
  assert.equal((await pedir('PUT', '/api/trabajo', { circuito: 'no es lista', notas: '' })).estado, 400)
  assert.deepEqual((await pedir('GET', '/api/sesion')).datos.trabajo, trabajo)

  // Cerrar sesión: la cookie vieja ya no sirve
  const cookieVieja = cookie
  await pedir('POST', '/api/logout')
  cookie = cookieVieja
  assert.equal((await pedir('GET', '/api/sesion')).estado, 401)

  // Iniciar sesión con el email y recuperar el trabajo
  assert.equal((await pedir('POST', '/api/login', { usuario: 'alumno1', contrasena: 'incorrecta' })).estado, 401)
  r = await pedir('POST', '/api/login', { usuario: 'ALUMNO1@escuela.com', contrasena: 'resistencia123' })
  assert.equal(r.estado, 200)
  assert.deepEqual(r.datos.trabajo, trabajo)

  // Un usuario que no existe responde igual que una contraseña incorrecta
  assert.deepEqual((await pedir('POST', '/api/login', { usuario: 'nadie', contrasena: 'x' })).datos, { error: 'Usuario o contraseña incorrectos.' })

  // Después de 5 intentos fallidos se bloquea, aunque la contraseña sea la correcta
  for (let i = 0; i < 5; i++) await pedir('POST', '/api/login', { usuario: 'alumno1', contrasena: 'mal' })
  assert.equal((await pedir('POST', '/api/login', { usuario: 'alumno1', contrasena: 'resistencia123' })).estado, 429)

  // JSON mal armado
  const malArmado = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{roto' })
  assert.equal(malArmado.status, 400)

  console.log('Backend: todo OK')
} finally {
  servidor.close()
}
