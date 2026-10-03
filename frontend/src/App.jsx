import { useState, useRef, useEffect } from 'react'
import { MAGNITUDES, FORMULAS, textoFormula, calcularOhm, calcularEquivalente } from './ohm.js'
import { simular, formatear } from './simulador.js'
import { api } from './api.js'
import Acceso from './Acceso.jsx'
import {
  IconoResistencia,
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
  fuente: { nombre: 'Fuente (V)', icono: IconoFuente, ancho: 28, prefijo: 'V', unidad: 'V', valorInicial: 12 },
  interruptor: { nombre: 'Interruptor', icono: IconoInterruptor, ancho: 28, prefijo: 'S' },
  pulsador: { nombre: 'Pulsador', icono: IconoPulsador, ancho: 28, prefijo: 'P' },
  lampara: { nombre: 'Lámpara', icono: IconoLampara, ancho: 32, prefijo: 'L', unidad: 'Ω', valorInicial: 24 },
  led: { nombre: 'LED', icono: IconoLed, ancho: 32, prefijo: 'LED' },
  diodo: { nombre: 'Diodo', icono: IconoDiodo, ancho: 32, prefijo: 'D' },
  motor: { nombre: 'Motor', icono: IconoMotor, ancho: 32, prefijo: 'M', unidad: 'Ω', valorInicial: 10 },
  fusible: { nombre: 'Fusible', icono: IconoFusible, ancho: 32, prefijo: 'F', unidad: 'A', valorInicial: 1 },
  voltimetro: { nombre: 'Voltímetro', icono: IconoVoltimetro, ancho: 32, prefijo: 'VM' },
  amperimetro: { nombre: 'Amperímetro', icono: IconoAmperimetro, ancho: 32, prefijo: 'AM' }
}

function PanelComponentes() {
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
          onDragStart={(e) => onDragStart(e, c.id)}
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
      <circle cx={cable.x1} cy={cable.y1} r="6" fill={cable.color} className="extremo-cable" onMouseDown={iniciarArrastreExtremo(0)} />
      <circle cx={cable.x2} cy={cable.y2} r="6" fill={cable.color} className="extremo-cable" onMouseDown={iniciarArrastreExtremo(1)} />
    </g>
  )
}

function ComponenteCable({ cable, seleccionado, conError, onMover, onSeleccionar }) {
  const onMouseDownLinea = (e) => {
    e.stopPropagation()
    if (seleccionado) {
      onMover(cable.id, e)
    } else {
      onSeleccionar()
    }
  }

  return (
    <line
      x1={cable.x1}
      y1={cable.y1}
      x2={cable.x2}
      y2={cable.y2}
      stroke={cable.color}
      strokeWidth={seleccionado ? 5 : 3}
      strokeDasharray={seleccionado ? '6 4' : 'none'}
      className={conError ? 'linea-cable con-error' : 'linea-cable'}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={onMouseDownLinea}
    />
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

// Guarda el circuito y las notas en el servidor un segundo después del último cambio
// (así no se manda un pedido en cada movimiento del mouse). Devuelve 'guardado', 'guardando' o 'error'.
function useAutoguardado(circuito, notas) {
  const actual = JSON.stringify({ circuito, notas })
  const [guardado, setGuardado] = useState(actual) // lo último que el servidor confirmó
  const [fallos, setFallos] = useState(0)
  const fila = useRef(Promise.resolve())

  useEffect(() => {
    if (actual === guardado) return
    // Si el último intento falló, reintenta cada 5 segundos
    const espera = setTimeout(() => {
      // Los envíos van en fila: uno viejo que tarde en llegar nunca pisa a uno más nuevo
      fila.current = fila.current
        .then(() => api('PUT', '/api/trabajo', actual))
        .then(() => {
          setGuardado(actual)
          setFallos(0)
        })
        .catch(() => setFallos((n) => n + 1))
    }, fallos > 0 ? 5000 : 1000)
    return () => clearTimeout(espera)
  }, [actual, guardado, fallos])

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

// Escucha el mouse en toda la ventana hasta que se suelta el botón
function arrastrar(mover) {
  const soltar = () => {
    window.removeEventListener('mousemove', mover)
    window.removeEventListener('mouseup', soltar)
  }
  window.addEventListener('mousemove', mover)
  window.addEventListener('mouseup', soltar)
}



// Lo que se lee debajo del componente: su valor, o la medición si es un instrumento y se está simulando
function textoEtiqueta(c, estado) {
  if (c.tipo === 'voltimetro') return estado ? formatear(estado.tension, 'V') : ''
  if (c.tipo === 'amperimetro') return estado ? formatear(estado.corriente, 'A') : ''
  const { unidad } = CATALOGO[c.tipo]
  return unidad ? `${c.valor} ${unidad}` : ''
}

function Workspace({ componentesColocados, setComponentesColocados }) {
  const [colorSeleccionado, setColorSeleccionado] = useState('#5A5555')
  const [seleccionadoId, setSeleccionadoId] = useState(null)
  const [simulando, setSimulando] = useState(false)
  const [pulsadoId, setPulsadoId] = useState(null)
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

    if (tipo === 'cable') {
      setComponentesColocados((prev) => [
        ...prev,
        { id: crypto.randomUUID(), tipo, x1: x, y1: y, x2: x + 80, y2: y, color: colorSeleccionado }
      ])
      } else {
        setComponentesColocados((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            tipo,
            x,
            y,
            valor: CATALOGO[tipo].valorInicial,
            nombre: siguienteNombre(prev, tipo),
            rotacion: 0
          }
        ])
}
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

  const borrarCircuito = () => {
    if (!window.confirm('¿Borrar todo el circuito? No se puede deshacer.')) return
    setComponentesColocados([])
    setSeleccionadoId(null)
  }

  const eliminarSeleccionado = () => {
    setComponentesColocados((prev) => prev.filter((c) => c.id !== seleccionadoId))
    setSeleccionadoId(null)
  }

  const onMouseDownComponente = (e, c) => {
    e.stopPropagation()
    // Mientras se simula, el interruptor y el pulsador se accionan con el mouse en vez de seleccionarse
    if (simulando && c.tipo === 'interruptor') return alternarInterruptor(c.id)
    if (simulando && c.tipo === 'pulsador') {
      setPulsadoId(c.id)
      window.addEventListener('mouseup', () => setPulsadoId(null), { once: true })
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
  const simulacion = simulando ? simular(armarRed(componentesColocados, pulsadoId)) : null
  // Lo que se marca en rojo: lo que forma el cortocircuito y lo que se quemó
  const resaltados = new Set(
    simulacion ? [...(simulacion.cortocircuito?.ids ?? []), ...simulacion.avisos.flatMap((a) => a.ids)] : []
  )

  return (
    <div className="workspace-columna">
      <div className="workspace-toolbar">
        <button className={`btn-simular${simulando ? ' activo' : ''}`} onClick={() => setSimulando(!simulando)}>
          {simulando ? '■ Detener' : '▶ Simular'}
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

        {seleccionado && (
          <div className="toolbar-seleccion">
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
          </div>
        )}
      </div>

      <div
        ref={contenedorRef}
        className={`workspace${simulando ? ' simulando' : ''}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        onClick={() => setSeleccionadoId(null)}
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
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => onMouseDownComponente(e, c)}
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

function PanelCalculos({ notas, setNotas }) {
  // Agrega la cuenta en una línea nueva, sin pisar lo que el alumno ya escribió
  const anotar = (nota) =>
    setNotas((n) => (n && !n.endsWith('\n') ? n + '\n' : n) + nota + '\n')

  return (
    <aside className="panel-calculos">
      <CalculadoraOhm onAnotar={anotar} />
      <CalculadoraEquivalente onAnotar={anotar} />

      <section className="bloc-notas">
        <h2>Bloc de notas</h2>
        <textarea
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          placeholder="Escribí acá tu razonamiento. Con “Anotar” se agregan los cálculos."
        />
      </section>
    </aside>
  )
}

const TEXTO_GUARDADO = {
  guardado: '✓ Guardado',
  guardando: 'Guardando…',
  error: '⚠ No se pudo guardar, reintentando…'
}

// La app con la sesión iniciada. El circuito y las notas viven acá (y no en cada panel)
// para poder guardarlos juntos en el servidor.
function Simulador({ sesion, onSalir }) {
  const [circuito, setCircuito] = useState(sesion.trabajo.circuito)
  const [notas, setNotas] = useState(sesion.trabajo.notas)
  const estadoGuardado = useAutoguardado(circuito, notas)

  const salir = async () => {
    // Guarda lo último antes de salir, por si hubo un cambio en el último segundo
    try {
      await api('PUT', '/api/trabajo', { circuito, notas })
    } catch {
      if (!window.confirm('No se pudieron guardar los últimos cambios. ¿Cerrar sesión igual?')) return
    }
    await api('POST', '/api/logout').catch(() => {})
    onSalir()
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
          <span className={`estado-guardado ${estadoGuardado}`}>{TEXTO_GUARDADO[estadoGuardado]}</span>
          <strong>{sesion.usuario}</strong>
          <button className="btn-salir" onClick={salir}>
            Cerrar sesión
          </button>
        </div>
      </header>

      <div className="app-body">
        <PanelComponentes />
        <Workspace componentesColocados={circuito} setComponentesColocados={setCircuito} />
        <PanelCalculos notas={notas} setNotas={setNotas} />
      </div>
    </div>
  )
}

function App() {
  // undefined: todavía se está preguntando al servidor; null: no hay sesión; objeto: usuario y su trabajo
  const [sesion, setSesion] = useState(undefined)

  useEffect(() => {
    api('GET', '/api/sesion').then(setSesion, () => setSesion(null))
  }, [])

  if (sesion === undefined) return <p className="cargando">Cargando…</p>
  if (sesion === null) return <Acceso onIngresar={setSesion} />
  return <Simulador sesion={sesion} onSalir={() => setSesion(null)} />
}

export default App