import { fileURLToPath } from 'node:url'
import { abrirBaseDeDatos } from './db.js'
import { crearApp } from './app.js'

// Configuración por variables de entorno, para que el sector de informática la ajuste sin tocar el código
const PUERTO = Number(process.env.PUERTO ?? 3000)
const BASE_DE_DATOS = process.env.BASE_DE_DATOS ?? fileURLToPath(new URL('./datos/circuitos.db', import.meta.url))
const PRODUCCION = process.env.NODE_ENV === 'production'
const CARPETA_FRONTEND = fileURLToPath(new URL('../frontend/dist', import.meta.url))

const db = abrirBaseDeDatos(BASE_DE_DATOS)
const app = await crearApp(db, { produccion: PRODUCCION, carpetaFrontend: CARPETA_FRONTEND })

app.listen(PUERTO, () => {
  console.log(`Backend escuchando en http://localhost:${PUERTO}`)
  console.log(`Base de datos: ${BASE_DE_DATOS}`)
})
