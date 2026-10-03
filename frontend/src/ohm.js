export const MAGNITUDES = {
  V: { nombre: 'Tensión', unidad: 'V' },
  I: { nombre: 'Corriente', unidad: 'A' },
  R: { nombre: 'Resistencia', unidad: 'Ω' }
}

// Para cada incógnita: qué datos necesita (el que divide va segundo), la operación y la cuenta
export const FORMULAS = {
  V: { datos: ['I', 'R'], operador: '×', calcular: (I, R) => I * R },
  I: { datos: ['V', 'R'], operador: '/', calcular: (V, R) => V / R },
  R: { datos: ['V', 'I'], operador: '/', calcular: (V, I) => V / I }
}

export function textoFormula(incognita) {
  const { datos, operador } = FORMULAS[incognita]
  return `${incognita} = ${datos[0]} ${operador} ${datos[1]}`
}

// toPrecision borra el "ruido" de los decimales de la compu (9 / 0.3 = 30.000000000000004)
const redondear = (n) => parseFloat(n.toPrecision(10))

// Devuelve { resultado, nota } o { error }. Si falta algún dato devuelve {}: todavía no hay nada que mostrar.
// La nota es la cuenta escrita completa, para pasarla al bloc de notas.
export function calcularOhm(incognita, valores) {
  const { datos, operador, calcular } = FORMULAS[incognita]
  if (datos.some((m) => valores[m] === '')) return {}

  const [a, b] = datos.map((m) => Number(valores[m]))
  if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0) {
    return { error: 'Los valores tienen que ser números positivos' }
  }
  if (incognita !== 'V' && b === 0) {
    return { error: `${MAGNITUDES[datos[1]].nombre} no puede ser 0: no se puede dividir por cero` }
  }

  const resultado = redondear(calcular(a, b))
  const [ua, ub, ur] = [datos[0], datos[1], incognita].map((m) => MAGNITUDES[m].unidad)
  return {
    resultado,
    nota: `${textoFormula(incognita)} = ${a} ${ua} ${operador} ${b} ${ub} = ${resultado} ${ur}`
  }
}

// Resistencia equivalente de varias resistencias en serie o en paralelo. Mismo formato de respuesta.
export function calcularEquivalente(tipo, valores) {
  if (valores.some((v) => v === '')) return {}

  const rs = valores.map(Number)
  if (rs.some((r) => !Number.isFinite(r) || r <= 0)) {
    return { error: 'Las resistencias tienen que ser mayores a 0' }
  }

  if (tipo === 'serie') {
    const resultado = redondear(rs.reduce((suma, r) => suma + r, 0))
    return { resultado, nota: `Req (serie) = ${rs.join(' + ')} = ${resultado} Ω` }
  }
  const resultado = redondear(1 / rs.reduce((suma, r) => suma + 1 / r, 0))
  const inversos = rs.map((r) => `1/${r}`).join(' + ')
  return { resultado, nota: `Req (paralelo) = 1 / (${inversos}) = ${resultado} Ω` }
}
