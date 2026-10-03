// Verificación rápida de los cálculos. Correr con: node src/ohm.check.js
import assert from 'node:assert/strict'
import { calcularOhm, calcularEquivalente } from './ohm.js'

assert.equal(calcularOhm('V', { I: '0.5', R: '220' }).resultado, 110)
assert.equal(calcularOhm('R', { V: '9', I: '0.3' }).resultado, 30)
assert.deepEqual(calcularOhm('I', { V: '12', R: '100' }), {
  resultado: 0.12,
  nota: 'I = V / R = 12 V / 100 Ω = 0.12 A'
})
assert.deepEqual(calcularOhm('I', { V: '12', R: '' }), {})
assert.ok(calcularOhm('I', { V: '12', R: '0' }).error)
assert.ok(calcularOhm('R', { V: '12', I: '-1' }).error)

assert.deepEqual(calcularEquivalente('serie', ['100', '220']), {
  resultado: 320,
  nota: 'Req (serie) = 100 + 220 = 320 Ω'
})
assert.deepEqual(calcularEquivalente('paralelo', ['100', '220']), {
  resultado: 68.75,
  nota: 'Req (paralelo) = 1 / (1/100 + 1/220) = 68.75 Ω'
})
assert.equal(calcularEquivalente('paralelo', ['100', '100', '100']).resultado, 33.33333333)
assert.deepEqual(calcularEquivalente('serie', ['100', '']), {})
assert.ok(calcularEquivalente('paralelo', ['100', '0']).error)

console.log('Cálculos: todo OK')
