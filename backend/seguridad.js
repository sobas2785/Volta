import { scrypt, randomBytes, timingSafeEqual, createHash } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt)

// Cuánto trabajo cuesta calcular cada hash: rápido para un login, muy lento para quien quiera
// probar millones de contraseñas. Quedan guardados dentro del hash, así se pueden subir más adelante.
const COSTO = 2 ** 15
const BLOQUE = 8
const PARALELO = 1
const MEMORIA_MAXIMA = 64 * 1024 * 1024

// La contraseña nunca se guarda: se guarda un hash con una "sal" al azar distinta para cada usuario.
// Formato: scrypt:costo:bloque:paralelo:sal:hash
export async function hashearContrasena(contrasena) {
  const sal = randomBytes(16)
  const hash = await scryptAsync(contrasena, sal, 64, { N: COSTO, r: BLOQUE, p: PARALELO, maxmem: MEMORIA_MAXIMA })
  return ['scrypt', COSTO, BLOQUE, PARALELO, sal.toString('base64'), hash.toString('base64')].join(':')
}

export async function verificarContrasena(contrasena, guardado) {
  const [algoritmo, N, r, p, sal, hash] = guardado.split(':')
  if (algoritmo !== 'scrypt') return false
  const esperado = Buffer.from(hash, 'base64')
  const calculado = await scryptAsync(contrasena, Buffer.from(sal, 'base64'), esperado.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    maxmem: MEMORIA_MAXIMA
  })
  // Compara tardando siempre lo mismo, para no dar pistas midiendo cuánto tarda la respuesta
  return timingSafeEqual(calculado, esperado)
}

// Token de sesión: 32 bytes al azar. El navegador guarda el token; la base guarda solo su hash,
// así alguien que llegue a leer la base no puede usar las sesiones de otros.
export const crearToken = () => randomBytes(32).toString('base64url')
export const hashDeToken = (token) => createHash('sha256').update(token).digest('hex')
