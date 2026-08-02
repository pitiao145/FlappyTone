import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { Soundboard } from './dev/Soundboard.tsx'

// ?soundboard: dev clip board, opened on a phone pointed at the laptop mic.
const soundboard = new URLSearchParams(location.search).has('soundboard')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {soundboard ? <Soundboard /> : <App />}
  </StrictMode>,
)
