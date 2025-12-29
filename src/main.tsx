import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'

const loadCss = () => import('./index.css')

// Kick CSS loading as soon as the first frame can be scheduled to avoid idle delays.
if (typeof requestAnimationFrame === 'function') {
  requestAnimationFrame(() => loadCss())
} else {
  setTimeout(loadCss, 0)
}

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
)
