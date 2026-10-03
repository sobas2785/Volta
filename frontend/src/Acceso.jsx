import { useState } from 'react'
import { api } from './api.js'
import isotipo from './assets/volta-isotipo.png'
import nombre from './assets/volta-nombre.png'

// Pantalla para iniciar sesión o crear una cuenta. Cuando sale bien, le pasa a la app
// lo que devuelve el servidor: el usuario y su trabajo guardado.
export default function Acceso({ onIngresar }) {
  const [modo, setModo] = useState('login')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const esRegistro = modo === 'registro'

  const enviar = async (e) => {
    e.preventDefault()
    // Lee todos los campos del formulario por su "name": { usuario, email, contrasena }
    const datos = Object.fromEntries(new FormData(e.currentTarget))
    setEnviando(true)
    setError('')
    try {
      onIngresar(await api('POST', esRegistro ? '/api/registro' : '/api/login', datos))
    } catch (err) {
      setError(err.message)
      setEnviando(false)
    }
  }

  const cambiarModo = (nuevo) => {
    setModo(nuevo)
    setError('')
  }

  return (
    <main className="acceso">
      <form className="acceso-tarjeta" onSubmit={enviar}>
        <div className="acceso-marca">
          <img className="marca-isotipo" src={isotipo} alt="" />
          <img className="marca-nombre" src={nombre} alt="Volta" />
        </div>
        <h1>Simulador de circuitos</h1>
        <p className="acceso-escuela">E.E.S. Técnica N°1 Esteban Echeverría</p>

        <div className="acceso-modos">
          <button type="button" className={esRegistro ? '' : 'activa'} onClick={() => cambiarModo('login')}>
            Iniciar sesión
          </button>
          <button type="button" className={esRegistro ? 'activa' : ''} onClick={() => cambiarModo('registro')}>
            Crear cuenta
          </button>
        </div>

        <label className="acceso-campo">
          {esRegistro ? 'Usuario' : 'Usuario o email'}
          <input name="usuario" required maxLength={254} autoComplete="username" />
        </label>

        {esRegistro && (
          <label className="acceso-campo">
            Email
            <input name="email" type="email" required maxLength={254} autoComplete="email" />
          </label>
        )}

        <label className="acceso-campo">
          Contraseña
          <input
            name="contrasena"
            type="password"
            required
            minLength={esRegistro ? 8 : undefined}
            maxLength={200}
            autoComplete={esRegistro ? 'new-password' : 'current-password'}
          />
        </label>
        {esRegistro && <p className="acceso-ayuda">Mínimo 8 caracteres.</p>}

        {error && (
          <p className="ohm-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn-simular acceso-enviar" disabled={enviando}>
          {enviando ? 'Un momento…' : esRegistro ? 'Crear cuenta' : 'Entrar'}
        </button>
      </form>
    </main>
  )
}
