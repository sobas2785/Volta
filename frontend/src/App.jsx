import { useState, useRef, useEffect } from 'react'
import { MAGNITUDES, FORMULAS, textoFormula, calcularOhm, calcularEquivalente } from './ohm.js'
import { simular, formatear, verificar, textoCondicion, MEDIBLES, PASO } from './simulador.js'
import { api } from './api.js'
import Acceso from './Acceso.jsx'
import Ejercicios from './Ejercicios.jsx'
import {
  IconoResistencia,
  IconoPotenciometro,
  IconoCapacitor,
  IconoCable,
  IconoFuente,
  IconoInterruptor,
  IconoPulsador,
  IconoLampara,
  IconoLed,
  IconoDiodo,
  IconoMotor,
  IconoVoltimetro,
  IconoAmperimetro,
  IconoFusible
} from './iconos.jsx'
import isotipo from './assets/volta-isotipo.png'
import nombre from './assets/volta-nombre.png'

// Todo lo que distingue a cada tipo de componente: su símbolo, el ancho del símbolo (para ubicar
// los terminales), la letra con la que empieza su nombre y, si tiene un valor editable, su unidad y valor inicial
const CATALOGO = {
  resistencia: { nombre: 'Resistencia', icono: IconoResistencia, ancho: 40, prefijo: 'R', unidad: 'Ω', valorInicial: 100 },
  potenciometro: { nombre: 'Potenciómetro', icono: IconoPotenciometro, ancho: 40, prefijo: 'RV', unidad: 'Ω', valorInicial: 1000 },
  fuente: { nombre: 'Fuente (V)', icono: IconoFuente, ancho: 28, prefijo: 'V', unidad: 'V', valorInicial: 12 },
  interruptor: { nombre: 'Interruptor', icono: IconoInterruptor, ancho: 28, prefijo: 'S' },
  pulsador: { nombre: 'Pulsador', icono: IconoPulsador, ancho: 28, prefijo: 'P' },
  lampara: { nombre: 'Lámpara', icono: IconoLampara, ancho: 32, prefijo: 'L', unidad: 'Ω', valorInicial: 24 },
  led: { nombre: 'LED', icono: IconoLed, ancho: 32, prefijo: 'LED' },
  diodo: { nombre: 'Diodo', icono: IconoDiodo, ancho: 32, prefijo: 'D' },
  motor: { nombre: 'Motor', icono: IconoMotor, ancho: 32, prefijo: 'M', unidad: 'Ω', valorInicial: 10 },
  capacitor: { nombre: 'Capacitor', icono: IconoCapacitor, ancho: 28, prefijo: 'C', unidad: 'µF', valorInicial: 1000 },
  fusible: { nombre: 'Fusible', icono: IconoFusible, ancho: 32, prefijo: 'F', unidad: 'A', valorInicial: 1 },
  voltimetro: { nombre: 'Voltímetro', icono: IconoVoltimetro, ancho: 32, prefijo: 'VM' },
  amperimetro: { nombre: 'Amperímetro', icono: IconoAmperimetro, ancho: 32, prefijo: 'AM' }
}

const COLOR_CABLE = '#5A5555'

function PanelComponentes({ onAgregar }) {
  const vistasPrevias = useRef({})

  const componentes = [
    { id: 'cable', nombre: 'Cable', icono: <IconoCable /> },
    ...Object.entries(CATALOGO).map(([id, { nombre, icono: Icono }]) => ({ id, nombre, icono: <Icono /> }))
  ]

  const onDragStart = (e, id) => {
    e.dataTransfer.setData('text/tipo-componente', id)
    const preview = vistasPrevias.current[id]
    if (preview) {
      e.dataTransfer.setDragImage(preview, 32, 18)
    }
  }

  return (
    <aside className="panel-componentes">
      <h2>Componentes</h2>
      {componentes.map((c) => (
        <div
          key={c.id}
          className="componente-item"
          draggable
          title="Arrastralo al área de trabajo, o tocalo para agregarlo"
          onDragStart={(e) => onDragStart(e, c.id)}
          role="button"
          tabIndex={0}
          onClick={() => onAgregar(c.id)}
          onKeyDown={(e) => e.key === 'Enter' && onAgregar(c.id)}
        >
          {c.icono}
          {c.nombre}
        </div>
      ))}

      <div className="vistas-previas-drag">
        {componentes.map((c) => (
          <div
            key={c.id}
            ref={(el) => (vistasPrevias.current[c.id] = el)}
            className="vista-previa-drag"
          >
            {c.icono}
          </div>
        ))}
      </div>
    </aside>
  )
}

// Las puntas van en una capa aparte, encima de los componentes, para poder agarrarlas
// aunque estén pegadas a un terminal. La línea queda debajo, así no tapa al componente.
function PuntasCable({ cable, onMoverExtremo }) {
  const iniciarArrastreExtremo = (extremo) => (e) => {
    e.stopPropagation()
    e.preventDefault()
    onMoverExtremo(cable.id, extremo)
  }

  return (
    <g>
      <circle cx={cable.x1} cy={cable.y1} r="6" fill={cable.color} className="extremo-cable" onPointerDown={iniciarArrastreExtremo(0)} />
      <circle cx={cable.x2} cy={cable.y2} r="6" fill={cable.color} className="extremo-cable" onPointerDown={iniciarArrastreExtremo(1)} />
    </g>
  )
}

function ComponenteCable({ cable, seleccionado, conError, corriente = 0, onMover, onSeleccionar }) {
  const onPointerDownLinea = (e) => {
    e.stopPropagation()
    if (seleccionado) {
      onMover(cable.id, e)
    } else {
      onSeleccionar()
    }
  }
  const puntas = { x1: cable.x1, y1: cable.y1, x2: cable.x2, y2: cable.y2 }

  return (
    <g onPointerDown={onPointerDownLinea}>
      <line
        {...puntas}
        stroke={cable.color}
        strokeWidth={seleccionado ? 5 : 3}
        strokeDasharray={seleccionado ? '6 4' : 'none'}
        className={conError ? 'linea-cable con-error' : 'linea-cable'}
      />
      {/* Rayitas que avanzan en el sentido de la corriente (de + a −), más rápido cuanta más circula */}
      {Math.abs(corriente) > 1e-4 && (
        <line
          {...puntas}
          className="corriente"
          style={{
            animationDuration: `${Math.min(2, Math.max(0.2, 0.1 / Math.abs(corriente)))}s`,
            animationDirection: corriente < 0 ? 'reverse' : 'normal'
          }}
        />
      )}
      {/* Franja invisible más ancha que el cable, para poder agarrarlo sin tanta puntería */}
      <line {...puntas} className="zona-toque" />
    </g>
  )
}

// Próximo nombre libre: R1, R2, R3... Sigue al número más alto, así no se repite si se borró alguno
function siguienteNombre(componentes, tipo) {
  const prefijo = CATALOGO[tipo].prefijo
  const usados = componentes
    .map((c) => c.nombre?.match(/^(\D+)(\d+)$/))
    .filter((m) => m && m[1] === prefijo)
    .map((m) => Number(m[2]))
  return prefijo + (Math.max(0, ...usados) + 1)
}

// Guarda el circuito abierto (nombre, circuito y notas) en el servidor un segundo después del último cambio
// (así no se manda un pedido en cada movimiento del mouse). Devuelve 'guardado', 'guardando' o 'error'.
function useAutoguardado(id, contenido) {
  const actual = JSON.stringify(contenido)
  const [guardado, setGuardado] = useState(actual) // lo último que el servidor confirmó
  const [fallos, setFallos] = useState(0)
  const fila = useRef(Promise.resolve())

  useEffect(() => {
    if (actual === guardado) return
    // Si el último intento falló, reintenta cada 5 segundos
    const espera = setTimeout(() => {
      // Los envíos van en fila: uno viejo que tarde en llegar nunca pisa a uno más nuevo
      fila.current = fila.current
        .then(() => api('PUT', `/api/circuitos/${id}`, actual))
        .then(() => {
          setGuardado(actual)
          setFallos(0)
        })
        .catch(() => setFallos((n) => n + 1))
    }, fallos > 0 ? 5000 : 1000)
    return () => clearTimeout(espera)
  }, [id, actual, guardado, fallos])

  // Si quedan cambios sin guardar, el navegador pregunta antes de cerrar la pestaña
  useEffect(() => {
    if (actual === guardado) return
    const avisar = (e) => e.preventDefault()
    window.addEventListener('beforeunload', avisar)
    return () => window.removeEventListener('beforeunload', avisar)
  }, [actual, guardado])

  if (fallos > 0) return 'error'
  return actual === guardado ? 'guardado' : 'guardando'
}

// Estado con historial para deshacer y rehacer. Los cambios muy seguidos (arrastrar, escribir un valor)
// cuentan como un solo paso; agregar o quitar un elemento siempre es un paso aparte.
// ponytail: agrupa por tiempo (cambios a menos de 500 ms); marcar el inicio de cada gesto si hiciera falta exactitud
function useHistorial(inicial) {
  const [h, setH] = useState({ pasado: [], presente: inicial, futuro: [] })
  const ultimoCambio = useRef(0)

  const cambiar = (nuevo) => {
    const seguido = Date.now() - ultimoCambio.current < 500
    ultimoCambio.current = Date.now()
    setH((h) => {
      const presente = typeof nuevo === 'function' ? nuevo(h.presente) : nuevo
      const mismoPaso = seguido && presente.length === h.presente.length
      return { pasado: mismoPaso ? h.pasado : [...h.pasado.slice(-99), h.presente], presente, futuro: [] }
    })
  }
  const deshacer = () => {
    ultimoCambio.current = 0
    setH((h) =>
      h.pasado.length === 0 ? h : { pasado: h.pasado.slice(0, -1), presente: h.pasado.at(-1), futuro: [h.presente, ...h.futuro] }
    )
  }
  const rehacer = () => {
    ultimoCambio.current = 0
    setH((h) =>
      h.futuro.length === 0 ? h : { pasado: [...h.pasado, h.presente], presente: h.futuro[0], futuro: h.futuro.slice(1) }
    )
  }

  return [h.presente, cambiar, { deshacer, rehacer, puedeDeshacer: h.pasado.length > 0, puedeRehacer: h.futuro.length > 0 }]
}

function obtenerTerminales(c) {
  if (c.tipo === 'cable') {
    return [
      { x: c.x1, y: c.y1 },
      { x: c.x2, y: c.y2 }
    ]
  }
  const ancho = CATALOGO[c.tipo]?.ancho || 28
  const rad = ((c.rotacion || 0) * Math.PI) / 180
  const mitad = ancho / 2
  const dx = mitad * Math.cos(rad)
  const dy = mitad * Math.sin(rad)
  return [
    { x: c.x - dx, y: c.y - dy },
    { x: c.x + dx, y: c.y + dy }
  ]
}

const DISTANCIA_PEGADO = 14

function buscarTerminalCercano(x, y, terminales) {
  let mejor = null
  let mejorDistancia = DISTANCIA_PEGADO
  for (const t of terminales) {
    const d = Math.hypot(t.x - x, t.y - y)
    if (d < mejorDistancia) {
      mejorDistancia = d
      mejor = t
    }
  }
  return mejor
}

// Dos terminales en el mismo punto = conectados. La conexión se deduce de las posiciones
// (que el pegado deja idénticas), así nunca queda desincronizada de lo que se ve.
const TOLERANCIA = 0.5

function mismoPunto(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y) < TOLERANCIA
}

// Mueve la punta 0 (inicio) o 1 (fin) de un cable a un punto
function moverExtremo(cable, extremo, punto) {
  return extremo === 0
    ? { ...cable, x1: punto.x, y1: punto.y }
    : { ...cable, x2: punto.x, y2: punto.y }
}

// Desplaza un componente o un cable completo, sin rotarlo
function trasladar(c, dx, dy) {
  if (c.tipo === 'cable') {
    return { ...c, x1: c.x1 + dx, y1: c.y1 + dy, x2: c.x2 + dx, y2: c.y2 + dy }
  }
  return { ...c, x: c.x + dx, y: c.y + dy }
}

// Si algún terminal del elemento quedó cerca de un candidato, lo corre para que coincidan exacto
function pegarATerminal(elemento, candidatos) {
  for (const t of obtenerTerminales(elemento)) {
    const cercano = buscarTerminalCercano(t.x, t.y, candidatos)
    if (cercano) return trasladar(elemento, cercano.x - t.x, cercano.y - t.y)
  }
  return elemento
}

// Puntas de cable apoyadas sobre los terminales de un componente
function extremosPegados(comp, cables) {
  const pegados = []
  obtenerTerminales(comp).forEach((t, terminal) => {
    cables.forEach((cable) => {
      obtenerTerminales(cable).forEach((punta, extremo) => {
        if (mismoPunto(t, punta)) pegados.push({ cableId: cable.id, extremo, terminal })
      })
    })
  })
  return pegados
}

// Reemplaza el componente por su versión nueva (movida o rotada) y lleva con él las puntas pegadas
function actualizarConCables(lista, nuevo, pegados) {
  const terminales = obtenerTerminales(nuevo)
  return lista.map((c) => {
    if (c.id === nuevo.id) return nuevo
    return pegados
      .filter((p) => p.cableId === c.id)
      .reduce((cable, p) => moverExtremo(cable, p.extremo, terminales[p.terminal]), c)
  })
}

// Grafo del circuito: cada unión es un punto donde se tocan terminales,
// y cada componente (cable incluido) une su terminal 0 con su terminal 1.
// ponytail: compara todos contra todos (O(n²)), alcanza para circuitos de clase
function calcularUniones(componentes) {
  const uniones = []
  componentes.forEach((c) => {
    obtenerTerminales(c).forEach((t, terminal) => {
      const ref = { id: c.id, terminal }
      const union = uniones.find((u) => mismoPunto(u, t))
      if (union) union.terminales.push(ref)
      else uniones.push({ x: t.x, y: t.y, terminales: [ref] })
    })
  })
  return uniones
}

// Traduce el dibujo a lo que necesita el simulador: cada unión es un nodo (un número),
// y cada componente pasa con los nodos de sus dos terminales
function armarRed(componentes, pulsadoId) {
  const uniones = calcularUniones(componentes)
  const nodoDe = new Map()
  uniones.forEach((u, nodo) => u.terminales.forEach((r) => nodoDe.set(`${r.id}-${r.terminal}`, nodo)))
  return {
    cantidadNodos: uniones.length,
    elementos: componentes.map((c) => ({
      ...c,
      presionado: c.id === pulsadoId,
      nodos: [nodoDe.get(`${c.id}-0`), nodoDe.get(`${c.id}-1`)]
    }))
  }
}

// Escucha el puntero (mouse o dedo) en toda la ventana hasta que se suelta
function arrastrar(mover) {
  const soltar = () => {
    window.removeEventListener('pointermove', mover)
    window.removeEventListener('pointerup', soltar)
    window.removeEventListener('pointercancel', soltar)
  }
  window.addEventListener('pointermove', mover)
  window.addEventListener('pointerup', soltar)
  window.addEventListener('pointercancel', soltar)
}

// Componente nuevo del tipo pedido, ubicado en (x, y). `existentes` sirve para elegirle un nombre que no se repita
function crearComponente(tipo, x, y, existentes, color) {
  if (tipo === 'cable') return { id: crypto.randomUUID(), tipo, x1: x, y1: y, x2: x + 80, y2: y, color }
  return {
    id: crypto.randomUUID(),
    tipo,
    x,
    y,
    valor: CATALOGO[tipo].valorInicial,
    nombre: siguienteNombre(existentes, tipo),
    rotacion: 0
  }
}

// Lo que se lee debajo del componente: su valor, o la medición si es un instrumento y se está simulando
function textoEtiqueta(c, estado) {
  if (c.tipo === 'voltimetro') return estado ? formatear(estado.tension, 'V') : ''
  if (c.tipo === 'amperimetro') return estado ? formatear(estado.corriente, 'A') : ''
  if (c.tipo === 'potenciometro') return `${Math.round((c.posicion ?? 0.5) * 100)}% de ${c.valor} Ω`
  const { unidad } = CATALOGO[c.tipo]
  const valor = unidad ? `${c.valor} ${unidad}` : ''
  // El capacitor muestra además a cuánto se cargó
  return c.tipo === 'capacitor' && estado ? `${valor} · ${formatear(estado.tension, 'V')}` : valor
}

// Ancho y alto (en px) que entran en una hoja A4 apaisada con los márgenes de impresión de index.css
const HOJA = { ancho: 1030, alto: 600 }

function Workspace({ componentesColocados, setComponentesColocados, historial }) {
  const [colorSeleccionado, setColorSeleccionado] = useState(COLOR_CABLE)
  const [seleccionadoId, setSeleccionadoId] = useState(null)
  const [simulando, setSimulando] = useState(false)
  const [pulsadoId, setPulsadoId] = useState(null)
  // Tensión a la que llegó cada capacitor en el paso anterior de la simulación ({ [id]: volts })
  const [cargas, setCargas] = useState({})
  const contenedorRef = useRef(null)

  const posicionMouse = (e) => {
    const rect = contenedorRef.current.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const onDrop = (e) => {
    e.preventDefault()
    const tipo = e.dataTransfer.getData('text/tipo-componente')
    if (!tipo) return

    const { x, y } = posicionMouse(e)

    setComponentesColocados((prev) => [...prev, crearComponente(tipo, x, y, prev, colorSeleccionado)])
  }

  // Todos los terminales del área de trabajo, menos los que descarte excluir(componente, indice)
  const listarTerminales = (excluir) =>
    componentesColocados.flatMap((c) => obtenerTerminales(c).filter((_, i) => !excluir(c, i)))

  const onMoverExtremo = (id, extremo) => {
    const candidatos = listarTerminales((c, i) => c.id === id && i === extremo)

    arrastrar((e) => {
      const mouse = posicionMouse(e)
      const punto = buscarTerminalCercano(mouse.x, mouse.y, candidatos) || mouse
      setComponentesColocados((prev) =>
        prev.map((c) => (c.id === id ? moverExtremo(c, extremo, punto) : c))
      )
    })
  }

  // Mueve un componente o un cable completo. Se suma cuánto se movió el mouse desde el click,
  // así el elemento no salta para centrarse en el cursor.
  const onMover = (id, eInicial) => {
    const original = componentesColocados.find((c) => c.id === id)
    const inicio = posicionMouse(eInicial)

    // Un componente se lleva los cables pegados a sus terminales; un cable completo se mueve solo.
    // Se calcula al empezar, para no "levantar" cables sueltos que el componente toque en el camino.
    const pegados = original.tipo === 'cable' ? [] : extremosPegados(original, cables)
    const esPegado = (c, i) => pegados.some((p) => p.cableId === c.id && p.extremo === i)
    const candidatos = listarTerminales((c, i) => c.id === id || esPegado(c, i))

    arrastrar((e) => {
      const mouse = posicionMouse(e)
      const movido = trasladar(original, mouse.x - inicio.x, mouse.y - inicio.y)
      const nuevo = pegarATerminal(movido, candidatos)
      setComponentesColocados((prev) => actualizarConCables(prev, nuevo, pegados))
    })
  }

  const cambiarColorSeleccionado = (color) => {
    setComponentesColocados((prev) =>
      prev.map((c) => (c.id === seleccionadoId ? { ...c, color } : c))
    )
  }
  // Al rotar, las puntas de cable pegadas siguen a los terminales
  const rotarSeleccionado = () => {
    const rotado = { ...seleccionado, rotacion: (seleccionado.rotacion + 45) % 360 }
    setComponentesColocados((prev) =>
      actualizarConCables(prev, rotado, extremosPegados(seleccionado, cables))
    )
  }

  const cambiarValorSeleccionado = (valor) => {
    setComponentesColocados((prev) =>
      prev.map((c) => (c.id === seleccionadoId ? { ...c, valor: Number(valor) || 0 } : c))
    )
  }

  const cambiarPosicionSeleccionado = (posicion) => {
    setComponentesColocados((prev) =>
      prev.map((c) => (c.id === seleccionadoId ? { ...c, posicion: Number(posicion) } : c))
    )
  }

  const cambiarNombreSeleccionado = (nombre) => {
    setComponentesColocados((prev) =>
      prev.map((c) => (c.id === seleccionadoId ? { ...c, nombre } : c))
    )
  }

  const alternarInterruptor = (id) => {
    setComponentesColocados((prev) =>
      prev.map((c) => (c.id === id ? { ...c, cerrado: !c.cerrado } : c))
    )
  }

  // No pide confirmación: se recupera con Deshacer
  const borrarCircuito = () => {
    setComponentesColocados([])
    setSeleccionadoId(null)
  }

  const eliminarSeleccionado = () => {
    setComponentesColocados((prev) => prev.filter((c) => c.id !== seleccionadoId))
    setSeleccionadoId(null)
  }

  // Al arrancar o detener la simulación, los capacitores vuelven a estar descargados
  const alternarSimulacion = () => {
    setSimulando(!simulando)
    setCargas({})
  }

  const onPointerDownComponente = (e, c) => {
    e.stopPropagation()
    // Mientras se simula, el interruptor y el pulsador se accionan con el mouse en vez de seleccionarse
    if (simulando && c.tipo === 'interruptor') return alternarInterruptor(c.id)
    if (simulando && c.tipo === 'pulsador') {
      setPulsadoId(c.id)
      window.addEventListener('pointerup', () => setPulsadoId(null), { once: true })
      return
    }
    const yaEstabaSeleccionado = c.id === seleccionadoId
    setSeleccionadoId(c.id)
    if (yaEstabaSeleccionado) onMover(c.id, e)
  }

  const cables = componentesColocados.filter((c) => c.tipo === 'cable')
  const otros = componentesColocados.filter((c) => c.tipo !== 'cable')
  const seleccionado = componentesColocados.find((c) => c.id === seleccionadoId)

  // Terminales que tocan a otro terminal (clave "id-indice"), para pintarlos como conectados
  const conectados = new Set(
    calcularUniones(componentesColocados)
      .filter((u) => u.terminales.length > 1)
      .flatMap((u) => u.terminales.map((r) => `${r.id}-${r.terminal}`))
  )

  // La simulación se recalcula en cada render: si movés un cable o cambiás un valor, se actualiza al instante.
  // ponytail: un LED quemado "se arregla" apenas se corrige el circuito; guardar los quemados en un estado si hiciera falta
  const simulacion = simulando ? simular(armarRed(componentesColocados, pulsadoId), cargas) : null
  // Lo que se marca en rojo: lo que forma el cortocircuito y lo que se quemó
  const resaltados = new Set(
    simulacion ? [...(simulacion.cortocircuito?.ids ?? []), ...simulacion.avisos.flatMap((a) => a.ids)] : []
  )

  // Con capacitores la simulación avanza en el tiempo: cada PASO se guarda la tensión a la que llegó cada uno
  useEffect(() => {
    const capacitores = componentesColocados.filter((c) => c.tipo === 'capacitor')
    if (!simulando || capacitores.length === 0) return
    const reloj = setInterval(() => {
      setCargas((prev) => {
        const { estados } = simular(armarRed(componentesColocados, pulsadoId), prev)
        return Object.fromEntries(capacitores.map((c) => [c.id, estados[c.id]?.tension ?? prev[c.id] ?? 0]))
      })
    }, PASO * 1000)
    return () => clearInterval(reloj)
  }, [simulando, componentesColocados, pulsadoId])

  // Atajos de teclado. No se usan mientras se escribe en un campo, para no pisar los del propio campo
  useEffect(() => {
    const onTecla = (e) => {
      if (e.target.closest?.('input, textarea, select')) return
      const tecla = e.key.toLowerCase()
      if ((e.ctrlKey || e.metaKey) && (tecla === 'z' || tecla === 'y')) {
        e.preventDefault()
        if (tecla === 'y' || e.shiftKey) historial.rehacer()
        else historial.deshacer()
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && seleccionado) {
        eliminarSeleccionado()
      }
    }
    window.addEventListener('keydown', onTecla)
    return () => window.removeEventListener('keydown', onTecla)
  })

  // Lo que ocupa el circuito, para que al imprimir entre completo en la hoja (ver @media print en index.css)
  const puntos = componentesColocados.flatMap(obtenerTerminales)
  const anchoCircuito = Math.max(300, ...puntos.map((p) => p.x)) + 60
  const altoCircuito = Math.max(200, ...puntos.map((p) => p.y)) + 60

  return (
    <div className="workspace-columna">
      <div className="workspace-toolbar">
        <button className={`btn-simular${simulando ? ' activo' : ''}`} onClick={alternarSimulacion}>
          {simulando ? '■ Detener' : '▶ Simular'}
        </button>

        <button className="btn-eliminar" title="Deshacer (Ctrl+Z)" disabled={!historial.puedeDeshacer} onClick={historial.deshacer}>
          ↶ Deshacer
        </button>
        <button className="btn-eliminar" title="Rehacer (Ctrl+Y)" disabled={!historial.puedeRehacer} onClick={historial.rehacer}>
          ↷ Rehacer
        </button>

        <label>
          Color del próximo cable:
          <input
            type="color"
            value={colorSeleccionado}
            onChange={(e) => setColorSeleccionado(e.target.value)}
          />
        </label>

        {componentesColocados.length > 0 && (
          <button className="btn-eliminar" onClick={borrarCircuito}>
            Borrar circuito
          </button>
        )}

        <button className="btn-eliminar" onClick={() => window.print()}>
          Imprimir / PDF
        </button>

        {/* Esta fila está siempre, aunque no haya nada elegido: así el área de trabajo no se corre al seleccionar */}
        <div className="toolbar-seleccion">
          {!seleccionado && <span className="toolbar-ayuda">Tocá un componente o un cable para editarlo</span>}
          {seleccionado && (
            <>
            {seleccionado.tipo === 'cable' ? (
              <>
                <span>Cable</span>
                <input
                  type="color"
                  value={seleccionado.color}
                  onChange={(e) => cambiarColorSeleccionado(e.target.value)}
                />
              </>
            ) : (
              <>
                <span>{CATALOGO[seleccionado.tipo].nombre}</span>
                <input
                  type="text"
                  className="campo-nombre"
                  aria-label="Nombre"
                  value={seleccionado.nombre ?? ''}
                  onChange={(e) => cambiarNombreSeleccionado(e.target.value)}
                />
              </>
            )}

            {CATALOGO[seleccionado.tipo]?.unidad && (
              <label className="campo-inline">
                <input
                  type="number"
                  step="any"
                  value={seleccionado.valor}
                  onChange={(e) => cambiarValorSeleccionado(e.target.value)}
                />
                {CATALOGO[seleccionado.tipo].unidad}
              </label>
            )}

            {seleccionado.tipo === 'potenciometro' && (
              <input
                type="range"
                aria-label="Posición del cursor"
                min="0"
                max="1"
                step="0.01"
                value={seleccionado.posicion ?? 0.5}
                onChange={(e) => cambiarPosicionSeleccionado(e.target.value)}
              />
            )}

            {seleccionado.tipo === 'interruptor' && (
              <button className="btn-eliminar" onClick={() => alternarInterruptor(seleccionado.id)}>
                {seleccionado.cerrado ? 'Abrir' : 'Cerrar'}
              </button>
            )}

            {seleccionado.tipo !== 'cable' && (
              <button className="btn-eliminar" onClick={rotarSeleccionado}>
                Rotar
              </button>
            )}

            <button className="btn-eliminar" onClick={eliminarSeleccionado}>
              Eliminar
            </button>
            </>
          )}
        </div>
      </div>

      <div
        ref={contenedorRef}
        className={`workspace${simulando ? ' simulando' : ''}`}
        style={{
          '--ancho-impresion': `${anchoCircuito}px`,
          '--alto-impresion': `${altoCircuito}px`,
          '--zoom-impresion': Math.min(1, HOJA.ancho / anchoCircuito, HOJA.alto / altoCircuito)
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        onPointerDown={() => setSeleccionadoId(null)}
      >
        {componentesColocados.length === 0 && (
          <p className="workspace-mensaje">Arrastrá un componente acá para empezar</p>
        )}

        {simulacion && (simulacion.cortocircuito || simulacion.avisos.length > 0) && (
          <div className="avisos">
            {simulacion.cortocircuito && (
              <p className="aviso aviso-error">{simulacion.cortocircuito.mensaje}</p>
            )}
            {simulacion.avisos.map((a) => (
              <p key={a.mensaje} className="aviso">{a.mensaje}</p>
            ))}
          </div>
        )}

        <svg className="capa-cables">
          {cables.map((c) => (
            <ComponenteCable
              key={c.id}
              cable={c}
              seleccionado={c.id === seleccionadoId}
              conError={resaltados.has(c.id)}
              corriente={simulacion?.estados[c.id]?.corriente}
              onMover={onMover}
              onSeleccionar={() => setSeleccionadoId(c.id)}
            />
          ))}
        </svg>

        {otros.map((c) => {
          const Icono = CATALOGO[c.tipo].icono
          const estado = simulacion?.estados[c.id]
          const clases = ['componente-colocado']
          if (c.id === seleccionadoId) clases.push('seleccionado')
          if (resaltados.has(c.id)) clases.push('con-error')

          return (
            <div
              key={c.id}
              className={clases.join(' ')}
              style={{ left: c.x, top: c.y }}
              onPointerDown={(e) => onPointerDownComponente(e, c)}
            >
              <Icono rotacion={c.rotacion} cerrado={c.cerrado} presionado={c.id === pulsadoId} estado={estado} />
              <span className="etiqueta-valor">
                {c.nombre && <strong>{c.nombre} </strong>}
                {textoEtiqueta(c, estado)}
              </span>
            </div>
          )
        })}

        {/* Va después de los componentes en el HTML, por eso se dibuja encima de ellos */}
        <svg className="capa-cables">
          {cables.map((c) => (
            <PuntasCable key={c.id} cable={c} onMoverExtremo={onMoverExtremo} />
          ))}

          {otros.map((c) =>
            obtenerTerminales(c).map((t, i) => (
            <circle
              key={`${c.id}-t${i}`}
              cx={t.x}
              cy={t.y}
              r="4"
              className={conectados.has(`${c.id}-${i}`) ? 'terminal conectado' : 'terminal'}
            />
            ))
          )}
        </svg>
      </div>
    </div>
  )
}

// Muestra el error o el resultado de un cálculo, con el botón para pasarlo al bloc de notas
function ResultadoCalculo({ calculo, etiqueta, unidad, onAnotar }) {
  if (calculo.error) return <p className="ohm-error">{calculo.error}</p>
  if (calculo.resultado === undefined) return null
  return (
    <div className="ohm-resultado">
      <span>
        {etiqueta} = <strong>{calculo.resultado} {unidad}</strong>
      </span>
      <button className="btn-eliminar" onClick={() => onAnotar(calculo.nota)}>
        Anotar
      </button>
    </div>
  )
}

function CalculadoraOhm({ onAnotar }) {
  const [incognita, setIncognita] = useState('I')
  const [valores, setValores] = useState({ V: '', I: '', R: '' })

  return (
    <section>
      <h2>Ley de Ohm</h2>

      <div className="ohm-opciones">
        {Object.keys(MAGNITUDES).map((m) => (
          <label key={m} className={incognita === m ? 'activa' : ''}>
            <input
              type="radio"
              name="incognita"
              checked={incognita === m}
              onChange={() => setIncognita(m)}
            />
            Calcular {m}
          </label>
        ))}
      </div>

      <p className="ohm-formula">{textoFormula(incognita)}</p>

      {FORMULAS[incognita].datos.map((m) => (
        <label key={m} className="ohm-campo">
          <span>{MAGNITUDES[m].nombre} ({m})</span>
          <input
            type="number"
            min="0"
            step="any"
            value={valores[m]}
            onChange={(e) => setValores({ ...valores, [m]: e.target.value })}
          />
          <span>{MAGNITUDES[m].unidad}</span>
        </label>
      ))}

      <ResultadoCalculo
        calculo={calcularOhm(incognita, valores)}
        etiqueta={incognita}
        unidad={MAGNITUDES[incognita].unidad}
        onAnotar={onAnotar}
      />
    </section>
  )
}

// El alumno decide si las resistencias están en serie o en paralelo y escribe sus valores.
// Un circuito mixto se resuelve por partes, anotando cada resultado parcial.
function CalculadoraEquivalente({ onAnotar }) {
  const [tipo, setTipo] = useState('serie')
  const [valores, setValores] = useState(['', ''])

  const cambiarValor = (i, valor) => setValores(valores.map((v, j) => (j === i ? valor : v)))
  const quitar = (i) => setValores(valores.filter((_, j) => j !== i))

  return (
    <section>
      <h2>Resistencia equivalente</h2>

      <div className="ohm-opciones">
        {['serie', 'paralelo'].map((t) => (
          <label key={t} className={tipo === t ? 'activa' : ''}>
            <input
              type="radio"
              name="tipo-equivalente"
              checked={tipo === t}
              onChange={() => setTipo(t)}
            />
            {t === 'serie' ? 'Serie' : 'Paralelo'}
          </label>
        ))}
      </div>

      <p className="ohm-formula">
        {tipo === 'serie' ? 'Req = R1 + R2 + …' : '1/Req = 1/R1 + 1/R2 + …'}
      </p>

      {valores.map((v, i) => (
        <div key={i} className="req-fila">
          <label className="ohm-campo">
            <span>R{i + 1}</span>
            <input
              type="number"
              min="0"
              step="any"
              value={v}
              onChange={(e) => cambiarValor(i, e.target.value)}
            />
            <span>Ω</span>
          </label>
          {valores.length > 2 && (
            <button className="btn-quitar" aria-label={`Quitar R${i + 1}`} onClick={() => quitar(i)}>
              ×
            </button>
          )}
        </div>
      ))}

      <button className="btn-eliminar" onClick={() => setValores([...valores, ''])}>
        + Agregar resistencia
      </button>

      <ResultadoCalculo
        calculo={calcularEquivalente(tipo, valores)}
        etiqueta="Req"
        unidad="Ω"
        onAnotar={onAnotar}
      />
    </section>
  )
}

// Corrige un circuito contra las condiciones de un ejercicio. Se mira el circuito ya estabilizado:
// los capacitores, una vez cargados, no conducen, así que se dejan afuera de la cuenta.
function corregir(ejercicio, circuito) {
  const estable = circuito.filter((c) => c.tipo !== 'capacitor')
  return verificar(ejercicio.condiciones, estable, simular(armarRed(estable)))
}

// La consigna del ejercicio que resuelve este circuito. Cada condición se corrige sola mientras se arma
function Consigna({ ejercicio, circuito }) {
  const resultados = corregir(ejercicio, circuito)
  return (
    <section className="consigna">
      <h2>Ejercicio: {ejercicio.titulo}</h2>
      <p>{ejercicio.consigna}</p>
      <ul>
        {resultados.map((r, i) => (
          <li key={i} className={r.cumple ? 'cumple' : ''}>
            {r.cumple ? '✓' : '✗'} {textoCondicion(r)}
            {!r.cumple && (
              <small>
                {' '}
                ({r.medido === null ? `no se pudo medir ${r.componente}` : `ahora: ${formatear(r.medido, MEDIBLES[r.magnitud].unidad)}`})
              </small>
            )}
          </li>
        ))}
      </ul>
      {resultados.every((r) => r.cumple) && <p className="consigna-resuelta">¡Ejercicio resuelto!</p>}
    </section>
  )
}

function PanelCalculos({ notas, setNotas, ejercicio, circuito }) {
  // Agrega la cuenta en una línea nueva, sin pisar lo que el alumno ya escribió
  const anotar = (nota) =>
    setNotas((n) => (n && !n.endsWith('\n') ? n + '\n' : n) + nota + '\n')

  return (
    <aside className="panel-calculos">
      {ejercicio && <Consigna ejercicio={ejercicio} circuito={circuito} />}
      <CalculadoraOhm onAnotar={anotar} />
      <CalculadoraEquivalente onAnotar={anotar} />

      <section className="bloc-notas">
        <h2>Bloc de notas</h2>
        <textarea
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          placeholder="Escribí acá tu razonamiento. Con “Anotar” se agregan los cálculos."
        />
        {/* El textarea solo imprime lo que entra en su recuadro: para la hoja van las notas completas */}
        <pre className="solo-impresion">{notas}</pre>
      </section>
    </aside>
  )
}

const TEXTO_GUARDADO = {
  guardado: '✓ Guardado',
  guardando: 'Guardando…',
  error: '⚠ No se pudo guardar, reintentando…'
}

// La app con la sesión iniciada y uno de los circuitos del usuario abierto (sesion.trabajo).
// El circuito y las notas viven acá (y no en cada panel) para poder guardarlos juntos en el servidor.
// Al pasar a otro circuito este componente se crea de nuevo (ver key en App): arranca con el historial vacío.
function Simulador({ sesion, setSesion }) {
  const { trabajo } = sesion
  const [circuito, setCircuito, historial] = useHistorial(trabajo.circuito)
  const [notas, setNotas] = useState(trabajo.notas)
  const [titulo, setTitulo] = useState(trabajo.nombre)
  const contenido = { nombre: titulo, circuito, notas }
  const estadoGuardado = useAutoguardado(trabajo.id, contenido)

  // La lista de circuitos, con el nombre de este al día aunque todavía no se haya guardado
  const lista = sesion.circuitos.map((c) => (c.id === trabajo.id ? { ...c, nombre: titulo } : c))

  // Agrega un componente sin arrastrarlo (con un click o un toque en la lista), escalonado para que no se tapen
  const agregar = (tipo) =>
    setCircuito((prev) => {
      const corrimiento = (prev.length % 6) * 28
      return [...prev, crearComponente(tipo, 90 + corrimiento, 70 + corrimiento, prev, COLOR_CABLE)]
    })

  // Guarda lo último antes de dejar este circuito, por si hubo un cambio en el último segundo
  const guardar = () => api('PUT', `/api/circuitos/${trabajo.id}`, contenido)

  // Deja este circuito y abre el que devuelva `obtener`: uno que ya existe, uno nuevo o una copia
  const pasarA = async (obtener) => {
    try {
      await guardar()
      const nuevo = await obtener()
      const otros = lista.filter((c) => c.id !== nuevo.id)
      setSesion({ ...sesion, trabajo: nuevo, circuitos: [{ id: nuevo.id, nombre: nuevo.nombre }, ...otros] })
    } catch (err) {
      window.alert(err.message)
    }
  }
  const abrir = (id) => pasarA(() => api('GET', `/api/circuitos/${id}`))
  const crear = (datos) => pasarA(() => api('POST', '/api/circuitos', datos))

  const renombrar = () => {
    const nuevo = window.prompt('Nombre del circuito', titulo)?.trim()
    if (nuevo) setTitulo(nuevo.slice(0, 60))
  }

  const eliminar = async () => {
    if (!window.confirm(`¿Eliminar "${titulo}"? No se puede recuperar.`)) return
    try {
      await api('DELETE', `/api/circuitos/${trabajo.id}`)
      const resto = lista.filter((c) => c.id !== trabajo.id)
      setSesion({ ...sesion, circuitos: resto, trabajo: await api('GET', `/api/circuitos/${resto[0].id}`) })
    } catch (err) {
      window.alert(err.message)
    }
  }

  const salir = async () => {
    try {
      await guardar()
    } catch {
      if (!window.confirm('No se pudieron guardar los últimos cambios. ¿Cerrar sesión igual?')) return
    }
    await api('POST', '/api/logout').catch(() => {})
    setSesion(null)
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="marca">
          <img className="marca-isotipo" src={isotipo} alt="" />
          <img className="marca-nombre" src={nombre} alt="Volta" />
        </div>
        <h1>Simulador de circuitos - E.E.S. Técnica N°1</h1>
        <div className="sesion">
          <button className="btn-salir btn-circuito" title="Mis circuitos" popoverTarget="mis-circuitos">
            {titulo}
          </button>
          <button className="btn-salir" popoverTarget="ejercicios">
            Ejercicios
          </button>
          <span className={`estado-guardado ${estadoGuardado}`}>{TEXTO_GUARDADO[estadoGuardado]}</span>
          <strong>{sesion.usuario}</strong>
          <button className="btn-salir" onClick={salir}>
            Cerrar sesión
          </button>
        </div>
      </header>

      <div className="app-body">
        <PanelComponentes onAgregar={agregar} />
        <Workspace componentesColocados={circuito} setComponentesColocados={setCircuito} historial={historial} />
        <PanelCalculos notas={notas} setNotas={setNotas} ejercicio={trabajo.ejercicio} circuito={circuito} />
      </div>

      {/* Paneles que se abren desde el encabezado. El navegador los cierra solo al tocar afuera o con Esc (popover) */}
      <div id="mis-circuitos" popover="auto" className="panel-flotante">
        <h2>Mis circuitos</h2>
        <ul className="lista-circuitos">
          {lista.map((c) => (
            <li key={c.id}>
              <button disabled={c.id === trabajo.id} onClick={() => abrir(c.id)}>
                {c.nombre}
              </button>
            </li>
          ))}
        </ul>
        <div className="panel-acciones">
          <button className="btn-simular" onClick={() => crear({ nombre: `Circuito ${lista.length + 1}` })}>
            + Nuevo
          </button>
          <button className="btn-eliminar" onClick={renombrar}>
            Renombrar
          </button>
          <button className="btn-eliminar" onClick={() => crear({ nombre: `${titulo} (copia)`.slice(0, 60), circuito, notas })}>
            Duplicar
          </button>
          <button className="btn-eliminar" disabled={lista.length < 2} onClick={eliminar}>
            Eliminar
          </button>
        </div>
      </div>

      <Ejercicios
        sesion={sesion}
        corregir={corregir}
        onResolver={(ej) => crear({ nombre: ej.titulo, ejercicioId: ej.id })}
        onAbrirCopia={(ej, entrega) =>
          crear({ nombre: `${ej.titulo} - ${entrega.usuario}`.slice(0, 60), circuito: entrega.circuito, notas: entrega.notas })
        }
      />
    </div>
  )
}

function App() {
  // undefined: todavía se está preguntando al servidor; null: no hay sesión;
  // objeto: el usuario, la lista de sus circuitos y el que tiene abierto (trabajo)
  const [sesion, setSesion] = useState(undefined)

  useEffect(() => {
    api('GET', '/api/sesion').then(setSesion, () => setSesion(null))
  }, [])

  if (sesion === undefined) return <p className="cargando">Cargando…</p>
  if (sesion === null) return <Acceso onIngresar={setSesion} />
  return <Simulador key={sesion.trabajo.id} sesion={sesion} setSesion={setSesion} />
}

export default App
