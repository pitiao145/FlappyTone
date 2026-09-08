import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import PrivacyApp from './PrivacyApp.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PrivacyApp />
  </StrictMode>,
)
