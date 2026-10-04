import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

// Base de datos SQLite: un solo archivo con las tablas de este sector del sitio.
// Con la ruta ':memory:' queda en memoria (se usa en las pruebas).
export function abrirBaseDeDatos(ruta) {
  if (ruta !== ':memory:') mkdirSync(dirname(ruta), { recursive: true })
  const db = new Database(ruta)
  db.pragma('journal_mode = WAL') // lecturas y escrituras a la vez sin bloquearse
  db.pragma('foreign_keys = ON') // respeta los REFERENCES: borrar un usuario borra sus sesiones y sus circuitos

  db.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario TEXT NOT NULL UNIQUE COLLATE NOCASE,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      contrasena_hash TEXT NOT NULL,
      creado TEXT NOT NULL DEFAULT (datetime('now')),
      rol TEXT NOT NULL DEFAULT 'alumno'
    );

    CREATE TABLE IF NOT EXISTS sesiones (
      token_hash TEXT PRIMARY KEY,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      vence INTEGER NOT NULL
    );

    -- Consignas que cargan los docentes. condiciones: lista (JSON) de lo que tiene que cumplir el circuito
    CREATE TABLE IF NOT EXISTS ejercicios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      docente_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      titulo TEXT NOT NULL,
      consigna TEXT NOT NULL,
      condiciones TEXT NOT NULL,
      creado TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Cada usuario tiene varios circuitos. El que resuelve un ejercicio queda unido a él (ejercicio_id)
    CREATE TABLE IF NOT EXISTS circuitos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      nombre TEXT NOT NULL,
      circuito TEXT NOT NULL DEFAULT '[]',
      notas TEXT NOT NULL DEFAULT '',
      actualizado TEXT NOT NULL DEFAULT (datetime('now')),
      ejercicio_id INTEGER REFERENCES ejercicios(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS circuitos_de_usuario ON circuitos (usuario_id);
    -- Un solo circuito por alumno para cada ejercicio
    CREATE UNIQUE INDEX IF NOT EXISTS una_entrega_por_ejercicio ON circuitos (usuario_id, ejercicio_id) WHERE ejercicio_id IS NOT NULL;
  `)

  // Bases creadas con versiones anteriores: se actualizan sin perder nada.
  // Antes no había docentes...
  if (!db.prepare("SELECT 1 FROM pragma_table_info('usuarios') WHERE name = 'rol'").get()) {
    db.exec("ALTER TABLE usuarios ADD COLUMN rol TEXT NOT NULL DEFAULT 'alumno'")
  }
  // ...y cada usuario tenía un solo trabajo (tabla trabajos), que pasa a ser su primer circuito.
  // Va en una transacción: si algo falla, la tabla vieja queda como estaba.
  if (db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'trabajos'").get()) {
    db.transaction(() => {
      db.exec(`
        INSERT INTO circuitos (usuario_id, nombre, circuito, notas, actualizado)
          SELECT usuario_id, 'Mi circuito', circuito, notas, actualizado FROM trabajos;
        DROP TABLE trabajos;
      `)
    })()
  }

  // Consultas preparadas: los datos van como parámetros (?), nunca pegados dentro del texto SQL.
  // Así nadie puede meter SQL escribiéndolo en un formulario (inyección SQL).
  const sqlBuscarUsuario = db.prepare('SELECT id, usuario, email, contrasena_hash, rol FROM usuarios WHERE usuario = ? OR email = ?')
  const sqlCrearUsuario = db.prepare('INSERT INTO usuarios (usuario, email, contrasena_hash, rol) VALUES (?, ?, ?, ?)')
  const sqlCrearSesion = db.prepare('INSERT INTO sesiones (token_hash, usuario_id, vence) VALUES (?, ?, ?)')
  const sqlBorrarVencidas = db.prepare('DELETE FROM sesiones WHERE vence <= ?')
  const sqlBuscarSesion = db.prepare(`
    SELECT usuarios.id, usuarios.usuario, usuarios.email, usuarios.rol
    FROM sesiones JOIN usuarios ON usuarios.id = sesiones.usuario_id
    WHERE sesiones.token_hash = ? AND sesiones.vence > ?
  `)
  const sqlBorrarSesion = db.prepare('DELETE FROM sesiones WHERE token_hash = ?')

  // Todas las consultas de circuitos filtran por usuario: nadie puede leer ni tocar los de otro
  const sqlListarCircuitos = db.prepare('SELECT id, nombre FROM circuitos WHERE usuario_id = ? ORDER BY actualizado DESC, id DESC')
  const sqlLeerCircuito = db.prepare(`
    SELECT c.id, c.nombre, c.circuito, c.notas, e.id AS ejercicio_id, e.titulo, e.consigna, e.condiciones
    FROM circuitos c LEFT JOIN ejercicios e ON e.id = c.ejercicio_id
    WHERE c.usuario_id = ? AND c.id = ?
  `)
  const sqlCircuitoDeEjercicio = db.prepare('SELECT id FROM circuitos WHERE usuario_id = ? AND ejercicio_id = ?')
  const sqlCrearCircuito = db.prepare('INSERT INTO circuitos (usuario_id, nombre, circuito, notas, ejercicio_id) VALUES (?, ?, ?, ?, ?)')
  const sqlGuardarCircuito = db.prepare(
    "UPDATE circuitos SET nombre = ?, circuito = ?, notas = ?, actualizado = datetime('now') WHERE usuario_id = ? AND id = ?"
  )
  const sqlBorrarCircuito = db.prepare('DELETE FROM circuitos WHERE usuario_id = ? AND id = ?')

  const sqlListarEjercicios = db.prepare(`
    SELECT e.id, e.titulo, e.consigna, e.condiciones, u.usuario AS docente
    FROM ejercicios e JOIN usuarios u ON u.id = e.docente_id
    ORDER BY e.id DESC
  `)
  const sqlLeerEjercicio = db.prepare(`
    SELECT e.id, e.titulo, e.consigna, e.condiciones, u.usuario AS docente
    FROM ejercicios e JOIN usuarios u ON u.id = e.docente_id
    WHERE e.id = ?
  `)
  const sqlCrearEjercicio = db.prepare('INSERT INTO ejercicios (docente_id, titulo, consigna, condiciones) VALUES (?, ?, ?, ?)')
  const sqlBorrarEjercicio = db.prepare('DELETE FROM ejercicios WHERE docente_id = ? AND id = ?')
  const sqlListarEntregas = db.prepare(`
    SELECT u.usuario, c.circuito, c.notas, c.actualizado
    FROM circuitos c JOIN usuarios u ON u.id = c.usuario_id
    WHERE c.ejercicio_id = ?
    ORDER BY u.usuario
  `)

  const conCondiciones = (ejercicio) => ejercicio && { ...ejercicio, condiciones: JSON.parse(ejercicio.condiciones) }

  return {
    // Por nombre de usuario o por email, sin importar mayúsculas
    buscarUsuario: (usuarioOEmail) => sqlBuscarUsuario.get(usuarioOEmail, usuarioOEmail),

    // El usuario y su primer circuito se crean juntos (transacción): si algo falla, no queda nada a medias
    crearUsuario: db.transaction((usuario, email, contrasenaHash, rol = 'alumno') => {
      const id = sqlCrearUsuario.run(usuario, email, contrasenaHash, rol).lastInsertRowid
      sqlCrearCircuito.run(id, 'Mi primer circuito', '[]', '', null)
      return id
    }),

    crearSesion: (tokenHash, usuarioId, vence) => {
      sqlBorrarVencidas.run(Date.now())
      sqlCrearSesion.run(tokenHash, usuarioId, vence)
    },
    usuarioDeSesion: (tokenHash) => sqlBuscarSesion.get(tokenHash, Date.now()),
    cerrarSesion: (tokenHash) => sqlBorrarSesion.run(tokenHash),

    // Los circuitos del usuario ({ id, nombre }), primero el que se guardó último
    listarCircuitos: (usuarioId) => sqlListarCircuitos.all(usuarioId),
    // Un circuito completo, con el ejercicio que resuelve (o null). undefined si no existe o es de otro usuario
    leerCircuito: (usuarioId, id) => {
      const fila = sqlLeerCircuito.get(usuarioId, id)
      if (!fila) return undefined
      const { ejercicio_id, titulo, consigna, condiciones, ...resto } = fila
      return {
        ...resto,
        circuito: JSON.parse(fila.circuito),
        ejercicio: ejercicio_id ? { id: ejercicio_id, titulo, consigna, condiciones: JSON.parse(condiciones) } : null
      }
    },
    circuitoDeEjercicio: (usuarioId, ejercicioId) => sqlCircuitoDeEjercicio.get(usuarioId, ejercicioId)?.id,
    crearCircuito: (usuarioId, nombre, circuito, notas, ejercicioId = null) =>
      sqlCrearCircuito.run(usuarioId, nombre, JSON.stringify(circuito), notas, ejercicioId).lastInsertRowid,
    // Estas dos devuelven false si el circuito no existe o es de otro usuario
    guardarCircuito: (usuarioId, id, nombre, circuito, notas) =>
      sqlGuardarCircuito.run(nombre, JSON.stringify(circuito), notas, usuarioId, id).changes > 0,
    borrarCircuito: (usuarioId, id) => sqlBorrarCircuito.run(usuarioId, id).changes > 0,

    listarEjercicios: () => sqlListarEjercicios.all().map(conCondiciones),
    leerEjercicio: (id) => conCondiciones(sqlLeerEjercicio.get(id)),
    crearEjercicio: (docenteId, titulo, consigna, condiciones) =>
      sqlCrearEjercicio.run(docenteId, titulo, consigna, JSON.stringify(condiciones)).lastInsertRowid,
    // Solo lo borra quien lo creó. Los circuitos que lo resolvían quedan, ya sin ejercicio
    borrarEjercicio: (docenteId, id) => sqlBorrarEjercicio.run(docenteId, id).changes > 0,
    // Lo que hizo cada alumno para un ejercicio
    listarEntregas: (ejercicioId) => sqlListarEntregas.all(ejercicioId).map((e) => ({ ...e, circuito: JSON.parse(e.circuito) })),

    cerrar: () => db.close()
  }
}
