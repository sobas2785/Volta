// Pedido al backend. La cookie de sesión viaja sola porque la página y la API están en el mismo sitio
// (en desarrollo, Vite reenvía /api al backend: ver vite.config.js).
// Si el servidor responde con error, lanza un Error con el mensaje para mostrarle al alumno.
export async function api(metodo, ruta, cuerpo) {
  const hayCuerpo = cuerpo !== undefined
  let respuesta
  try {
    respuesta = await fetch(ruta, {
      method: metodo,
      headers: hayCuerpo ? { 'Content-Type': 'application/json' } : undefined,
      body: hayCuerpo ? (typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)) : undefined
    })
  } catch {
    throw new Error('No se pudo conectar con el servidor.')
  }

  const datos = await respuesta.json().catch(() => ({}))
  if (!respuesta.ok) throw new Error(datos.error ?? 'No se pudo conectar con el servidor.')
  return datos
}
