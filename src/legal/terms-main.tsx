import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import TermsApp from './TermsApp.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TermsApp />
  </StrictMode>,
)
