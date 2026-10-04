import { useState, useEffect } from 'react'
import { api } from './api.js'
import { MEDIBLES, textoCondicion } from './simulador.js'

const CONDICION_VACIA = { componente: '', magnitud: 'tension', valor: '' }

// Formulario del docente para cargar un ejercicio: la consigna y lo que tiene que cumplir el circuito
function NuevoEjercicio({ onCreado }) {
  const [titulo, setTitulo] = useState('')
  const [consigna, setConsigna] = useState('')
  const [condiciones, setCondiciones] = useState([CONDICION_VACIA])
  const [error, setError] = useState('')

  const cambiar = (i, cambios) => setCondiciones(condiciones.map((c, j) => (j === i ? { ...c, ...cambios } : c)))

  const enviar = async (e) => {
    e.preventDefault()
    try {
      await api('POST', '/api/ejercicios', {
        titulo,
        consigna,
        condiciones: condiciones.map((c) => ({ ...c, valor: Number(c.valor) }))
      })
      setTitulo('')
      setConsigna('')
      setCondiciones([CONDICION_VACIA])
      setError('')
      onCreado()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <form className="nuevo-ejercicio" onSubmit={enviar}>
      <h2>Nuevo ejercicio</h2>
      <input aria-label="Título" placeholder="Título" required maxLength={60} value={titulo} onChange={(e) => setTitulo(e.target.value)} />
      <textarea
        aria-label="Consigna"
        placeholder="Consigna: qué tiene que armar el alumno"
        required
        maxLength={2000}
        value={consigna}
        onChange={(e) => setConsigna(e.target.value)}
      />

      <p className="toolbar-ayuda">
        Se da por resuelto cuando el circuito cumple todo esto (con un 5% de margen). El componente se busca por su nombre.
      </p>
      {condiciones.map((c, i) => (
        <div key={i} className="condicion">
          <input
            aria-label="Componente"
            placeholder="Componente (R2)"
            required
            maxLength={30}
            value={c.componente}
            onChange={(e) => cambiar(i, { componente: e.target.value })}
          />
          <select aria-label="Magnitud" value={c.magnitud} onChange={(e) => cambiar(i, { magnitud: e.target.value })}>
            {Object.entries(MEDIBLES).map(([id, m]) => (
              <option key={id} value={id}>
                {m.nombre}
              </option>
            ))}
          </select>
          <input
            aria-label="Valor"
            type="number"
            step="any"
            required
            value={c.valor}
            onChange={(e) => cambiar(i, { valor: e.target.value })}
          />
          <span>{MEDIBLES[c.magnitud].unidad}</span>
          {condiciones.length > 1 && (
            <button
              type="button"
              className="btn-quitar"
              aria-label="Quitar condición"
              onClick={() => setCondiciones(condiciones.filter((_, j) => j !== i))}
            >
              ×
            </button>
          )}
        </div>
      ))}

      {error && (
        <p className="ohm-error" role="alert">
          {error}
        </p>
      )}

      <div className="panel-acciones">
        <button type="button" className="btn-eliminar" onClick={() => setCondiciones([...condiciones, CONDICION_VACIA])}>
          + Agregar condición
        </button>
        <button type="submit" className="btn-simular">
          Crear ejercicio
        </button>
      </div>
    </form>
  )
}

// Lo que hizo cada alumno en un ejercicio. Si está resuelto se calcula acá, simulando el circuito que guardó
function Entregas({ ejercicio, corregir, onAbrirCopia, onVolver }) {
  const [entregas, setEntregas] = useState(null) // null: todavía cargando

  useEffect(() => {
    api('GET', `/api/ejercicios/${ejercicio.id}/entregas`).then(setEntregas, () => setEntregas([]))
  }, [ejercicio.id])

  return (
    <>
      <h2>Entregas de “{ejercicio.titulo}”</h2>
      {entregas === null && <p>Cargando…</p>}
      {entregas?.length === 0 && <p className="toolbar-ayuda">Todavía ningún alumno empezó este ejercicio.</p>}
      {entregas?.length > 0 && (
        <table className="tabla-entregas">
          <thead>
            <tr>
              <th>Alumno</th>
              <th>Resultado</th>
              <th>Última vez</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {entregas.map((entrega) => {
              const resultados = corregir(ejercicio, entrega.circuito)
              const cumplidas = resultados.filter((r) => r.cumple).length
              return (
                <tr key={entrega.usuario}>
                  <td>{entrega.usuario}</td>
                  {cumplidas === resultados.length ? (
                    <td className="resuelto">✓ Resuelto</td>
                  ) : (
                    <td>
                      ✗ Cumple {cumplidas} de {resultados.length}
                    </td>
                  )}
                  {/* La base guarda la fecha en hora universal (UTC) */}
                  <td>{new Date(entrega.actualizado.replace(' ', 'T') + 'Z').toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td>
                    <button className="btn-eliminar" onClick={() => onAbrirCopia(ejercicio, entrega)}>
                      Abrir copia
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      <div className="panel-acciones">
        <button className="btn-eliminar" onClick={onVolver}>
          ← Volver a los ejercicios
        </button>
      </div>
    </>
  )
}

// Panel de ejercicios. Todos los ven y los pueden resolver; los docentes además los cargan,
// los eliminan y miran lo que hizo cada alumno.
export default function Ejercicios({ sesion, corregir, onResolver, onAbrirCopia }) {
  const [lista, setLista] = useState(null) // null: todavía cargando
  const [viendo, setViendo] = useState(null) // el ejercicio del que se están mirando las entregas
  const esDocente = sesion.rol === 'docente'

  const cargar = () => api('GET', '/api/ejercicios').then(setLista, () => setLista([]))

  const eliminar = async (ejercicio) => {
    if (!window.confirm(`¿Eliminar el ejercicio "${ejercicio.titulo}"? Los circuitos de los alumnos no se borran.`)) return
    await api('DELETE', `/api/ejercicios/${ejercicio.id}`).catch((err) => window.alert(err.message))
    cargar()
  }

  return (
    // Se vuelven a pedir cada vez que se abre el panel, así aparecen los que se cargaron mientras tanto
    <div id="ejercicios" popover="auto" className="panel-flotante" onToggle={(e) => e.newState === 'open' && cargar()}>
      {viendo ? (
        <Entregas ejercicio={viendo} corregir={corregir} onAbrirCopia={onAbrirCopia} onVolver={() => setViendo(null)} />
      ) : (
        <>
          <h2>Ejercicios</h2>
          {lista === null && <p>Cargando…</p>}
          {lista?.length === 0 && <p className="toolbar-ayuda">Todavía no hay ejercicios cargados.</p>}
          {lista?.map((ej) => (
            <article key={ej.id} className="ejercicio">
              <h3>
                {ej.titulo} <small>· {ej.docente}</small>
              </h3>
              <p>{ej.consigna}</p>
              <ul>
                {ej.condiciones.map((c, i) => (
                  <li key={i}>{textoCondicion(c)}</li>
                ))}
              </ul>
              <div className="panel-acciones">
                <button className="btn-simular" onClick={() => onResolver(ej)}>
                  Resolver
                </button>
                {esDocente && (
                  <button className="btn-eliminar" onClick={() => setViendo(ej)}>
                    Ver entregas
                  </button>
                )}
                {esDocente && ej.docente === sesion.usuario && (
                  <button className="btn-eliminar" onClick={() => eliminar(ej)}>
                    Eliminar
                  </button>
                )}
              </div>
            </article>
          ))}
          {esDocente && <NuevoEjercicio onCreado={cargar} />}
        </>
      )}
    </div>
  )
}
