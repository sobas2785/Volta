// Simulador de circuitos de corriente continua.
// Recibe la red ya armada (cada elemento con los índices de sus dos nodos) y calcula tensiones y
// corrientes con el método de nodos: en cada nodo, la suma de las corrientes que salen es 0.

// Fuentes, cables, amperímetros, fusibles e interruptores cerrados se toman como resistencias muy chicas
// en vez de ideales, así todo el circuito se resuelve con la misma cuenta.
// ponytail: agrega un error menor al 0,01% en circuitos de clase; pasar a MNA con fuentes ideales si hiciera falta exactitud
const R_CASI_CERO = 1e-4
const R_VOLTIMETRO = 1e7
// Cada nodo se une a "tierra" con una conductancia mínima: evita que un componente suelto deje la cuenta sin solución
const G_MINIMA = 1e-9

const DIODOS = {
  led: { caida: 2, resistencia: 10, corrienteNominal: 0.02, corrienteMaxima: 0.05 },
  diodo: { caida: 0.7, resistencia: 0.1, corrienteNominal: 1, corrienteMaxima: 1 }
}
const POTENCIA_LAMPARA = 6 // W: brilla al 100% con 6 W y se quema con el doble
const CORRIENTE_MOTOR = 0.5 // A: con esta corriente gira a velocidad máxima
const CORRIENTE_CORTO = 50 // A: más que esto por una fuente se toma como cortocircuito
const CORRIENTE_NULA = 1e-5 // A: menos que esto es que no circula corriente
// Segundos que avanza cada paso de la simulación cuando hay capacitores (que se cargan con el tiempo)
export const PASO = 0.05

const TIENE_RESISTENCIA = ['resistencia', 'lampara', 'motor', 'potenciometro']

const nombreDe = (el) => el.nombre || el.tipo

// La resistencia del potenciómetro depende de dónde está su cursor (posicion, de 0 a 1)
const resistenciaDe = (el) => (el.tipo === 'potenciometro' ? el.valor * (el.posicion ?? 0.5) : el.valor)

// Elementos que unen sus dos puntas sin resistencia: son los que pueden formar un cortocircuito
function conduceSinResistencia(el, abiertos) {
  if (abiertos.has(el.id)) return false
  switch (el.tipo) {
    case 'cable':
    case 'amperimetro':
    case 'fusible':
      return true
    case 'interruptor':
      return Boolean(el.cerrado)
    case 'pulsador':
      return Boolean(el.presionado)
    default:
      return TIENE_RESISTENCIA.includes(el.tipo) && resistenciaDe(el) <= 0
  }
}

// Cómo entra cada elemento en la cuenta: la corriente que lo atraviesa (del nodo 0 al 1) es
// I = g · (V0 − V1 − e), con g su conductancia (1/R) y e su "empuje" (la tensión de una fuente o
// la caída de un diodo). Devuelve null si el elemento no conduce.
function modelo(el, encendidos, abiertos, cargas) {
  if (abiertos.has(el.id)) return null
  // Capacitor: en cada paso deja pasar I = C/PASO · (tensión de ahora − tensión del paso anterior)
  if (el.tipo === 'capacitor') return el.valor > 0 ? { g: (el.valor * 1e-6) / PASO, e: cargas[el.id] ?? 0 } : null
  if (el.tipo === 'fuente') return { g: 1 / R_CASI_CERO, e: el.valor }
  if (el.tipo === 'voltimetro') return { g: 1 / R_VOLTIMETRO, e: 0 }
  if (DIODOS[el.tipo]) {
    const { resistencia, caida } = DIODOS[el.tipo]
    return encendidos.has(el.id) ? { g: 1 / resistencia, e: caida } : null
  }
  if (TIENE_RESISTENCIA.includes(el.tipo)) return { g: 1 / Math.max(resistenciaDe(el), R_CASI_CERO), e: 0 }
  return conduceSinResistencia(el, abiertos) ? { g: 1 / R_CASI_CERO, e: 0 } : null
}

// Arma el sistema de ecuaciones (una por nodo) y lo resuelve por eliminación de Gauss.
// No hace falta pivotear: la matriz tiene la diagonal más grande que el resto de cada fila.
function resolver(cantidadNodos, ramas) {
  const n = cantidadNodos
  const A = Array.from({ length: n }, (_, i) => {
    const fila = new Array(n + 1).fill(0) // la última columna es el lado derecho de la ecuación
    fila[i] = G_MINIMA
    return fila
  })

  for (const { nodos: [a, b], g, e } of ramas) {
    A[a][a] += g
    A[b][b] += g
    A[a][b] -= g
    A[b][a] -= g
    A[a][n] += g * e
    A[b][n] -= g * e
  }

  for (let col = 0; col < n; col++) {
    for (let f = col + 1; f < n; f++) {
      const k = A[f][col] / A[col][col]
      if (k === 0) continue
      for (let c = col; c <= n; c++) A[f][c] -= k * A[col][c]
    }
  }

  const v = new Array(n).fill(0)
  for (let f = n - 1; f >= 0; f--) {
    let suma = A[f][n]
    for (let c = f + 1; c < n; c++) suma -= A[f][c] * v[c]
    v[f] = suma / A[f][f]
  }
  return v
}

// Busca un camino de elementos sin resistencia entre dos nodos (búsqueda en anchura).
// Devuelve la lista de elementos del camino, o null si no hay.
function caminoSinResistencia(desde, hasta, elementos, abiertos) {
  const llegada = new Map([[desde, null]]) // nodo -> { nodo anterior, elemento por el que se llegó }
  const cola = [desde]
  while (cola.length > 0 && !llegada.has(hasta)) {
    const nodo = cola.shift()
    for (const el of elementos) {
      if (!conduceSinResistencia(el, abiertos)) continue
      const [a, b] = el.nodos
      const otro = a === nodo ? b : b === nodo ? a : null
      if (otro === null || llegada.has(otro)) continue
      llegada.set(otro, { nodo, el })
      cola.push(otro)
    }
  }
  if (!llegada.has(hasta)) return null

  const camino = []
  for (let n = hasta; llegada.get(n); n = llegada.get(n).nodo) camino.push(llegada.get(n).el)
  return camino
}

function buscarCortocircuito(fuentes, elementos, abiertos) {
  for (const fuente of fuentes) {
    const camino = caminoSinResistencia(fuente.nodos[0], fuente.nodos[1], elementos, abiertos)
    if (camino) return { fuente, camino, ids: [fuente.id, ...camino.map((el) => el.id)] }
  }
  return null
}

function mensajeCortocircuito({ fuente, camino }) {
  const amperimetro = camino.find((el) => el.tipo === 'amperimetro')
  if (amperimetro) {
    return `¡Cortocircuito! ${nombreDe(amperimetro)} quedó en paralelo con ${nombreDe(fuente)}. El amperímetro se conecta en serie.`
  }
  return `¡Cortocircuito! Los bornes de ${nombreDe(fuente)} están unidos sin ninguna resistencia en el medio. Revisá lo marcado en rojo.`
}

// Devuelve el aviso si el elemento se quema con esa tensión y corriente, o null si aguanta
function excedeLimite(el, tension, corriente) {
  if (DIODOS[el.tipo] && corriente > DIODOS[el.tipo].corrienteMaxima) {
    return `${nombreDe(el)} se quemó: le pasa demasiada corriente. Probá poniendo una resistencia en serie.`
  }
  if (el.tipo === 'lampara' && tension * corriente > 2 * POTENCIA_LAMPARA) {
    return `${nombreDe(el)} se quemó: recibe mucha más potencia de la que soporta.`
  }
  if (el.tipo === 'fusible' && Math.abs(corriente) > el.valor) {
    return `${nombreDe(el)} se fundió: pasó más corriente que su límite de ${el.valor} A.`
  }
  return null
}

// Resultado: { cortocircuito: { mensaje, ids } | null, avisos: [{ mensaje, ids }], estados: { [id]: {...} } }
// Cada estado tiene tension, corriente y abierto (quemado o fundido); lámparas y LEDs suman brillo (0 a 1)
// y los motores giro (-1 a 1). Los ids sirven para marcar en rojo dónde está el problema.
// cargas: la tensión que tenía cada capacitor en el paso anterior ({ [id]: volts }); sin cargas arrancan descargados.
// Para avanzar en el tiempo, se vuelve a llamar pasando la tensión de cada capacitor que devolvió el paso anterior.
export function simular({ cantidadNodos, elementos }, cargas = {}) {
  const fuentes = elementos.filter((el) => el.tipo === 'fuente')
  if (fuentes.length === 0) {
    return { cortocircuito: null, avisos: [{ mensaje: 'Agregá una fuente para simular el circuito.', ids: [] }], estados: {} }
  }

  const abiertos = new Set() // quemados o fundidos
  const encendidos = new Set() // LEDs y diodos que están conduciendo
  const avisos = []

  // Cada vuelta resuelve el circuito; si un diodo cambia de estado o algo se quema, se vuelve a resolver
  // ponytail: tope de 100 vueltas por si algún circuito raro nunca se estabiliza
  for (let vuelta = 0; vuelta < 100; vuelta++) {
    const corto = buscarCortocircuito(fuentes, elementos, abiertos)
    if (corto) {
      const fusible = corto.camino.find((el) => el.tipo === 'fusible')
      if (!fusible) return { cortocircuito: { mensaje: mensajeCortocircuito(corto), ids: corto.ids }, avisos, estados: {} }
      abiertos.add(fusible.id)
      avisos.push({ mensaje: `${nombreDe(fusible)} se fundió por un cortocircuito y protegió el circuito.`, ids: corto.ids })
      continue
    }

    const conModelo = elementos.map((el) => ({ el, rama: modelo(el, encendidos, abiertos, cargas) }))
    const ramas = conModelo.filter((x) => x.rama).map(({ el, rama }) => ({ nodos: el.nodos, ...rama }))
    const v = resolver(cantidadNodos, ramas)

    const estados = {}
    for (const { el, rama } of conModelo) {
      const tension = v[el.nodos[0]] - v[el.nodos[1]]
      const corriente = rama ? rama.g * (tension - rama.e) : 0
      estados[el.id] = { tension, corriente, abierto: abiertos.has(el.id) }
    }

    let cambio = false
    for (const el of elementos) {
      if (!DIODOS[el.tipo] || abiertos.has(el.id)) continue
      const { tension, corriente } = estados[el.id]
      if (encendidos.has(el.id) && corriente < 0) {
        encendidos.delete(el.id)
        cambio = true
      } else if (!encendidos.has(el.id) && tension > DIODOS[el.tipo].caida) {
        encendidos.add(el.id)
        cambio = true
      }
    }
    if (cambio) continue

    for (const el of elementos) {
      if (abiertos.has(el.id)) continue
      const aviso = excedeLimite(el, estados[el.id].tension, estados[el.id].corriente)
      if (aviso) {
        abiertos.add(el.id)
        avisos.push({ mensaje: aviso, ids: [el.id] })
        cambio = true
      }
    }
    if (cambio) continue

    const sobrecargadas = fuentes.filter((f) => Math.abs(estados[f.id].corriente) > CORRIENTE_CORTO)
    if (sobrecargadas.length > 0) {
      const nombres = sobrecargadas.map(nombreDe).join(' y ')
      return {
        cortocircuito: {
          mensaje: `¡Cortocircuito! Circula una corriente enorme por ${nombres}. ¿Hay dos fuentes distintas en paralelo?`,
          ids: sobrecargadas.map((f) => f.id)
        },
        avisos,
        estados: {}
      }
    }

    // Si algo se quemó o se fundió, ese aviso ya explica por qué no circula corriente.
    // Con capacitores tampoco se avisa: es normal que la corriente se corte cuando terminan de cargarse.
    const hayCapacitores = elementos.some((el) => el.tipo === 'capacitor')
    if (abiertos.size === 0 && !hayCapacitores && fuentes.every((f) => Math.abs(estados[f.id].corriente) < CORRIENTE_NULA)) {
      avisos.push({ mensaje: 'No circula corriente: el circuito está abierto en algún punto.', ids: [] })
    }

    for (const el of elementos) {
      const estado = estados[el.id]
      if (el.tipo === 'lampara') estado.brillo = Math.min(1, (estado.tension * estado.corriente) / POTENCIA_LAMPARA)
      if (el.tipo === 'led') estado.brillo = Math.min(1, Math.max(0, estado.corriente) / DIODOS.led.corrienteNominal)
      if (el.tipo === 'motor') estado.giro = Math.max(-1, Math.min(1, estado.corriente / CORRIENTE_MOTOR))
    }
    return { cortocircuito: null, avisos, estados }
  }

  avisos.push({ mensaje: 'El circuito no se pudo simular: no llega a estabilizarse.', ids: [] })
  return { cortocircuito: null, avisos, estados: {} }
}

// Número con prefijo, para mostrar mediciones: 0.0213 A -> "21.3 mA"
export function formatear(numero, unidad) {
  const abs = Math.abs(numero)
  if (abs < 1e-9) return `0 ${unidad}`
  const [factor, prefijo] = abs >= 1e3 ? [1e-3, 'k'] : abs >= 1 ? [1, ''] : abs >= 1e-3 ? [1e3, 'm'] : [1e6, 'µ']
  return `${parseFloat((numero * factor).toPrecision(3))} ${prefijo}${unidad}`
}

// Lo que un ejercicio puede pedir sobre un componente
export const MEDIBLES = {
  tension: { nombre: 'Tensión', unidad: 'V' },
  corriente: { nombre: 'Corriente', unidad: 'A' }
}

// "Tensión en R2 = 8 V"
export const textoCondicion = ({ componente, magnitud, valor }) =>
  `${MEDIBLES[magnitud].nombre} en ${componente} = ${formatear(valor, MEDIBLES[magnitud].unidad)}`

// Corrección de un ejercicio: para cada condición ({ componente, magnitud, valor }) busca el componente por su
// nombre y compara lo que dio la simulación con lo pedido, sin importar el signo (para qué lado quedó conectado).
// Devuelve las condiciones con lo medido (null si no se pudo medir) y si se cumple.
// ponytail: tolerancia fija del 5%; que la elija el docente si hiciera falta
export function verificar(condiciones, elementos, { estados }) {
  return condiciones.map((c) => {
    const el = elementos.find((e) => e.nombre?.trim().toLowerCase() === c.componente.toLowerCase())
    const medido = el && estados[el.id] ? Math.abs(estados[el.id][c.magnitud]) : null
    const pedido = Math.abs(c.valor)
    return { ...c, medido, cumple: medido !== null && Math.abs(medido - pedido) <= pedido * 0.05 + 1e-9 }
  })
}
