import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'

// Tras cada despliegue, los archivos .js cambian de nombre. Si alguien tiene
// la página abierta desde antes (o el navegador cacheó el HTML viejo), un
// import dinámico puede apuntar a un archivo que ya no existe. En ese caso
// se recarga automáticamente para traer la versión actual, en vez de mostrar
// el error "Failed to fetch dynamically imported module".
window.addEventListener('vite:preloadError', () => {
  window.location.reload()
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
