// Verificación rápida del simulador. Correr con: node src/simulador.check.js
import assert from 'node:assert/strict'
import { simular, formatear } from './simulador.js'

const cerca = (real, esperado, texto) =>
  assert.ok(Math.abs(real - esperado) <= Math.abs(esperado) * 0.001 + 1e-6, `${texto}: ${real} en vez de ${esperado}`)

// Los nodos son números: dos elementos con el mismo número de nodo están conectados ahí
const fuente = (nodos, valor = 12) => ({ id: 'V1', nombre: 'V1', tipo: 'fuente', valor, nodos })
const el = (id, tipo, nodos, extra = {}) => ({ id, nombre: id, tipo, nodos, ...extra })

// Ley de Ohm: 12 V sobre 100 Ω = 0.12 A
let r = simular({ cantidadNodos: 2, elementos: [fuente([0, 1]), el('R1', 'resistencia', [0, 1], { valor: 100 })] })
cerca(r.estados.R1.corriente, 0.12, 'corriente en R1')

// Serie 100 Ω + 200 Ω: el voltímetro sobre R2 marca 8 V y el amperímetro 40 mA
r = simular({
  cantidadNodos: 4,
  elementos: [
    fuente([0, 3]),
    el('AM1', 'amperimetro', [0, 1]),
    el('R1', 'resistencia', [1, 2], { valor: 100 }),
    el('R2', 'resistencia', [2, 3], { valor: 200 }),
    el('VM1', 'voltimetro', [2, 3])
  ]
})
cerca(r.estados.VM1.tension, 8, 'voltímetro')
cerca(r.estados.AM1.corriente, 0.04, 'amperímetro')

// Cortocircuito con un cable: se marca la fuente y el cable
r = simular({ cantidadNodos: 2, elementos: [fuente([0, 1]), el('C1', 'cable', [0, 1])] })
assert.deepEqual(r.cortocircuito.ids, ['V1', 'C1'])

// Amperímetro en paralelo: cortocircuito que explica que va en serie
r = simular({ cantidadNodos: 2, elementos: [fuente([0, 1]), el('AM1', 'amperimetro', [0, 1])] })
assert.match(r.cortocircuito.mensaje, /en serie/)

// Un fusible en el camino del corto se funde y evita el cortocircuito
r = simular({ cantidadNodos: 3, elementos: [fuente([0, 2]), el('F1', 'fusible', [0, 1], { valor: 1 }), el('C1', 'cable', [1, 2])] })
assert.equal(r.cortocircuito, null)
assert.equal(r.estados.F1.abierto, true)

// LED con resistencia de 470 Ω: prende y pasa (12 - 2) / 480 A
r = simular({ cantidadNodos: 3, elementos: [fuente([0, 2]), el('R1', 'resistencia', [0, 1], { valor: 470 }), el('LED1', 'led', [1, 2])] })
cerca(r.estados.LED1.corriente, 10 / 480, 'corriente del LED')
assert.equal(r.estados.LED1.brillo, 1)

// LED al revés: no conduce, y avisa que no circula corriente
r = simular({ cantidadNodos: 3, elementos: [fuente([0, 2]), el('R1', 'resistencia', [0, 1], { valor: 470 }), el('LED1', 'led', [2, 1])] })
assert.equal(r.estados.LED1.brillo, 0)
assert.match(r.avisos[0].mensaje, /No circula corriente/)

// LED sin resistencia: se quema
r = simular({ cantidadNodos: 2, elementos: [fuente([0, 1]), el('LED1', 'led', [0, 1])] })
assert.equal(r.estados.LED1.abierto, true)
assert.equal(r.avisos.length, 1)
assert.match(r.avisos[0].mensaje, /LED1 se quemó/)

// Fusible de 1 A con 2.4 A: se funde y deja de pasar corriente
r = simular({ cantidadNodos: 3, elementos: [fuente([0, 2]), el('F1', 'fusible', [0, 1], { valor: 1 }), el('R1', 'resistencia', [1, 2], { valor: 5 })] })
assert.equal(r.estados.F1.abierto, true)
cerca(r.estados.R1.corriente, 0, 'corriente con el fusible fundido')

// Interruptor abierto y cerrado
const conInterruptor = (cerrado) =>
  simular({ cantidadNodos: 3, elementos: [fuente([0, 2]), el('S1', 'interruptor', [0, 1], { cerrado }), el('L1', 'lampara', [1, 2], { valor: 24 })] })
cerca(conInterruptor(false).estados.L1.brillo, 0, 'lámpara con interruptor abierto')
cerca(conInterruptor(true).estados.L1.brillo, 1, 'lámpara con interruptor cerrado')

// Dos fuentes distintas en paralelo
r = simular({ cantidadNodos: 2, elementos: [fuente([0, 1]), { ...fuente([0, 1], 9), id: 'V2', nombre: 'V2' }] })
assert.match(r.cortocircuito.mensaje, /dos fuentes/)

assert.equal(formatear(0.0213, 'A'), '21.3 mA')
assert.equal(formatear(12, 'V'), '12 V')

console.log('Simulador: todo OK')
