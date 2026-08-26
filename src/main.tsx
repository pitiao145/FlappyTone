import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import LandingApp from './LandingApp.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LandingApp />
  </StrictMode>,
)
