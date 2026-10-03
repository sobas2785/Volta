// Símbolos de los componentes, dibujados en SVG.
// Regla para que los terminales coincidan con el dibujo: las patitas van a la altura del centro
// y llegan justo al borde izquierdo (x = 0) y derecho (x = ancho) del SVG.
// Los que reaccionan a la simulación reciben `estado` (lo que calculó el simulador para ese componente).

const ROJO = '#8B1E1E'
const GRIS = '#5A5555'
const GRIS_APAGADO = '#B5AFAF'

const girar = (rotacion = 0) => ({ transform: `rotate(${rotacion}deg)` })

export function IconoResistencia({ rotacion = 0 }) {
  return (
    <svg width="40" height="20" viewBox="0 0 40 20" style={{ transform: `rotate(${rotacion}deg)` }}>
      <line x1="0" y1="10" x2="6" y2="10" stroke="#8B1E1E" strokeWidth="2" />
      <polyline
        points="6,10 9,4 15,16 21,4 27,16 33,4 34,10"
        fill="none"
        stroke="#8B1E1E"
        strokeWidth="2"
      />
      <line x1="34" y1="10" x2="40" y2="10" stroke="#8B1E1E" strokeWidth="2" />
    </svg>
  )
}

export function IconoCable() {
  return (
    <svg width="28" height="16" viewBox="0 0 28 16">
      <line x1="0" y1="8" x2="28" y2="8" stroke="#5A5555" strokeWidth="3" />
      <circle cx="2" cy="8" r="2.5" fill="#5A5555" />
      <circle cx="26" cy="8" r="2.5" fill="#5A5555" />
    </svg>
  )
}

// Terminal izquierdo (+) en la placa larga, derecho (−) en la corta
export function IconoFuente({ rotacion = 0 }) {
  return (
    <svg width="28" height="16" viewBox="0 0 28 16" style={{ transform: `rotate(${rotacion}deg)` }}>
      <line x1="10" y1="2" x2="10" y2="14" stroke="#8B1E1E" strokeWidth="3" />
      <line x1="18" y1="4" x2="18" y2="12" stroke="#8B1E1E" strokeWidth="1.5" />
      <line x1="0" y1="8" x2="10" y2="8" stroke="#8B1E1E" strokeWidth="1.5" />
      <line x1="18" y1="8" x2="28" y2="8" stroke="#8B1E1E" strokeWidth="1.5" />
    </svg>
  )
}

export function IconoInterruptor({ rotacion = 0, cerrado = false }) {
  return (
    <svg width="28" height="16" viewBox="0 0 28 16" style={{ transform: `rotate(${rotacion}deg)` }}>
      <circle cx="4" cy="8" r="2" fill="#5A5555" />
      <circle cx="24" cy="8" r="2" fill="#5A5555" />
      <line x1="4" y1="8" x2={cerrado ? 24 : 20} y2={cerrado ? 8 : 2} stroke="#5A5555" strokeWidth="2" />
      <line x1="0" y1="8" x2="4" y2="8" stroke="#5A5555" strokeWidth="2" />
      <line x1="24" y1="8" x2="28" y2="8" stroke="#5A5555" strokeWidth="2" />
    </svg>
  )
}

// Conecta solo mientras está apretado: la barra baja hasta tocar los contactos
export function IconoPulsador({ rotacion = 0, presionado = false }) {
  const y = presionado ? 7 : 2
  return (
    <svg width="28" height="16" viewBox="0 0 28 16" style={girar(rotacion)}>
      <line x1="0" y1="8" x2="6" y2="8" stroke={GRIS} strokeWidth="2" />
      <line x1="22" y1="8" x2="28" y2="8" stroke={GRIS} strokeWidth="2" />
      <circle cx="6" cy="8" r="2" fill={GRIS} />
      <circle cx="22" cy="8" r="2" fill={GRIS} />
      <line x1="4" y1={y} x2="24" y2={y} stroke={GRIS} strokeWidth="2" />
      <line x1="14" y1={y} x2="14" y2="0" stroke={GRIS} strokeWidth="2" />
    </svg>
  )
}

export function IconoLampara({ rotacion = 0, estado }) {
  const brillo = estado?.brillo ?? 0
  const quemada = estado?.abierto
  const trazo = quemada ? GRIS_APAGADO : GRIS
  return (
    <svg
      width="32"
      height="24"
      viewBox="0 0 32 24"
      style={{ ...girar(rotacion), filter: brillo > 0.05 ? `drop-shadow(0 0 ${3 + 7 * brillo}px #FFD84D)` : undefined }}
    >
      <line x1="0" y1="12" x2="7" y2="12" stroke={GRIS} strokeWidth="2" />
      <line x1="25" y1="12" x2="32" y2="12" stroke={GRIS} strokeWidth="2" />
      <circle cx="16" cy="12" r="9" fill="#FFD84D" fillOpacity={brillo} stroke={trazo} strokeWidth="2" />
      <line x1="10" y1="6" x2="22" y2="18" stroke={trazo} strokeWidth="1.5" />
      <line x1="22" y1="6" x2="10" y2="18" stroke={trazo} strokeWidth="1.5" />
    </svg>
  )
}

// Terminal izquierdo = ánodo, derecho = cátodo (la corriente pasa en el sentido del triángulo)
function IconoDiodoBase({ rotacion = 0, estado, esLed }) {
  const brillo = esLed ? (estado?.brillo ?? 0) : 0
  const color = estado?.abierto ? GRIS_APAGADO : esLed ? '#D62828' : GRIS
  return (
    <svg
      width="32"
      height="24"
      viewBox="0 0 32 24"
      style={{ ...girar(rotacion), filter: brillo > 0.05 ? `drop-shadow(0 0 ${2 + 6 * brillo}px #FF3B3B)` : undefined }}
    >
      <line x1="0" y1="12" x2="10" y2="12" stroke={GRIS} strokeWidth="2" />
      <line x1="21" y1="12" x2="32" y2="12" stroke={GRIS} strokeWidth="2" />
      <polygon points="10,5 10,19 21,12" fill={color} fillOpacity={esLed ? 0.25 + 0.75 * brillo : 1} stroke={color} strokeWidth="1.5" />
      <line x1="21" y1="5" x2="21" y2="19" stroke={color} strokeWidth="2" />
      {esLed && (
        <path d="M17 4 L21 0 M19 0 L21 0 L21 2 M22 6 L26 2 M24 2 L26 2 L26 4" fill="none" stroke={color} strokeWidth="1.2" />
      )}
    </svg>
  )
}

export const IconoLed = (props) => <IconoDiodoBase {...props} esLed />
export const IconoDiodo = (props) => <IconoDiodoBase {...props} esLed={false} />

// La "M" gira más rápido cuanta más corriente pasa, y al revés si la corriente cambia de sentido
export function IconoMotor({ rotacion = 0, estado }) {
  const giro = estado?.giro ?? 0
  const girando = Math.abs(giro) > 0.02
  return (
    <svg width="32" height="24" viewBox="0 0 32 24" style={girar(rotacion)}>
      <line x1="0" y1="12" x2="7" y2="12" stroke={GRIS} strokeWidth="2" />
      <line x1="25" y1="12" x2="32" y2="12" stroke={GRIS} strokeWidth="2" />
      <circle cx="16" cy="12" r="9" fill="#FFFFFF" stroke={ROJO} strokeWidth="2" />
      <g
        className={girando ? 'motor-girando' : undefined}
        style={girando ? { animationDuration: `${0.3 / Math.abs(giro)}s`, animationDirection: giro < 0 ? 'reverse' : 'normal' } : undefined}
      >
        <text x="16" y="16" textAnchor="middle" fontSize="11" fontWeight="700" fill={ROJO}>M</text>
      </g>
    </svg>
  )
}

// Voltímetro y amperímetro: el + marca el terminal izquierdo
function IconoInstrumento({ rotacion = 0, letra }) {
  return (
    <svg width="32" height="24" viewBox="0 0 32 24" style={girar(rotacion)}>
      <line x1="0" y1="12" x2="7" y2="12" stroke={GRIS} strokeWidth="2" />
      <line x1="25" y1="12" x2="32" y2="12" stroke={GRIS} strokeWidth="2" />
      <circle cx="16" cy="12" r="9" fill="#FFFFFF" stroke={GRIS} strokeWidth="2" />
      <text x="16" y="16" textAnchor="middle" fontSize="11" fontWeight="700" fill={GRIS}>{letra}</text>
      <text x="3" y="7" textAnchor="middle" fontSize="8" fill={ROJO}>+</text>
    </svg>
  )
}

export const IconoVoltimetro = (props) => <IconoInstrumento {...props} letra="V" />
export const IconoAmperimetro = (props) => <IconoInstrumento {...props} letra="A" />

export function IconoFusible({ rotacion = 0, estado }) {
  const fundido = estado?.abierto
  return (
    <svg width="32" height="24" viewBox="0 0 32 24" style={girar(rotacion)}>
      <line x1="0" y1="12" x2="7" y2="12" stroke={GRIS} strokeWidth="2" />
      <line x1="25" y1="12" x2="32" y2="12" stroke={GRIS} strokeWidth="2" />
      <rect x="7" y="7" width="18" height="10" rx="2" fill="#FFFFFF" stroke={GRIS} strokeWidth="1.5" />
      {fundido ? (
        <path d="M7 12 L13 12 M19 12 L25 12" stroke={GRIS_APAGADO} strokeWidth="1.5" />
      ) : (
        <line x1="7" y1="12" x2="25" y2="12" stroke={ROJO} strokeWidth="1.5" />
      )}
    </svg>
  )
}
