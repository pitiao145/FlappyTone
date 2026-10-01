import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import GameApp from './GameApp.tsx'
import { applyNoiseModeFromUrl } from '../dev/noiseMode.ts'

// Dev-only noise-mode switch (docs/noise-plan.md); dead code in production.
if (import.meta.env.DEV) applyNoiseModeFromUrl()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GameApp />
  </StrictMode>,
)
