import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import { initAnalytics } from '../analytics/client'
import AuthGate from './AuthGate.tsx'

// Before the first render: the login gate's own events (auth screen, signup,
// magic-link login) and GameApp's first screen view are tracked from effects
// that run before any GameApp effect, and an event sent before this is lost.
initAnalytics()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate />
  </StrictMode>,
)
