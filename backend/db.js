import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

// Base de datos SQLite: un solo archivo con las tablas de este sector del sitio.
// Con la ruta ':memory:' queda en memoria (se usa en las pruebas).
export function abrirBaseDeDatos(ruta) {
  if (ruta !== ':memory:') mkdirSync(dirname(ruta), { recursive: true })
  const db = new Database(ruta)
  db.pragma('journal_mode = WAL') // lecturas y escrituras a la vez sin bloquearse
  db.pragma('foreign_keys = ON') // respeta los REFERENCES: borrar un usuario borra sus sesiones y su trabajo

  db.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario TEXT NOT NULL UNIQUE COLLATE NOCASE,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      contrasena_hash TEXT NOT NULL,
      creado TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sesiones (
      token_hash TEXT PRIMARY KEY,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      vence INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS trabajos (
      usuario_id INTEGER PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
      circuito TEXT NOT NULL DEFAULT '[]',
      notas TEXT NOT NULL DEFAULT '',
      actualizado TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)

  // Consultas preparadas: los datos van como parámetros (?), nunca pegados dentro del texto SQL.
  // Así nadie puede meter SQL escribiéndolo en un formulario (inyección SQL).
  const sqlBuscarUsuario = db.prepare('SELECT id, usuario, email, contrasena_hash FROM usuarios WHERE usuario = ? OR email = ?')
  const sqlCrearUsuario = db.prepare('INSERT INTO usuarios (usuario, email, contrasena_hash) VALUES (?, ?, ?)')
  const sqlCrearTrabajo = db.prepare('INSERT INTO trabajos (usuario_id) VALUES (?)')
  const sqlCrearSesion = db.prepare('INSERT INTO sesiones (token_hash, usuario_id, vence) VALUES (?, ?, ?)')
  const sqlBorrarVencidas = db.prepare('DELETE FROM sesiones WHERE vence <= ?')
  const sqlBuscarSesion = db.prepare(`
    SELECT usuarios.id, usuarios.usuario, usuarios.email
    FROM sesiones JOIN usuarios ON usuarios.id = sesiones.usuario_id
    WHERE sesiones.token_hash = ? AND sesiones.vence > ?
  `)
  const sqlBorrarSesion = db.prepare('DELETE FROM sesiones WHERE token_hash = ?')
  const sqlLeerTrabajo = db.prepare('SELECT circuito, notas FROM trabajos WHERE usuario_id = ?')
  const sqlGuardarTrabajo = db.prepare("UPDATE trabajos SET circuito = ?, notas = ?, actualizado = datetime('now') WHERE usuario_id = ?")

  return {
    // Por nombre de usuario o por email, sin importar mayúsculas
    buscarUsuario: (usuarioOEmail) => sqlBuscarUsuario.get(usuarioOEmail, usuarioOEmail),

    // El usuario y su trabajo vacío se crean juntos (transacción): si algo falla, no queda nada a medias
    crearUsuario: db.transaction((usuario, email, contrasenaHash) => {
      const id = sqlCrearUsuario.run(usuario, email, contrasenaHash).lastInsertRowid
      sqlCrearTrabajo.run(id)
      return id
    }),

    crearSesion: (tokenHash, usuarioId, vence) => {
      sqlBorrarVencidas.run(Date.now())
      sqlCrearSesion.run(tokenHash, usuarioId, vence)
    },
    usuarioDeSesion: (tokenHash) => sqlBuscarSesion.get(tokenHash, Date.now()),
    cerrarSesion: (tokenHash) => sqlBorrarSesion.run(tokenHash),

    leerTrabajo: (usuarioId) => {
      const fila = sqlLeerTrabajo.get(usuarioId)
      return { circuito: JSON.parse(fila.circuito), notas: fila.notas }
    },
    guardarTrabajo: (usuarioId, circuito, notas) => sqlGuardarTrabajo.run(JSON.stringify(circuito), notas, usuarioId)
  }
}
