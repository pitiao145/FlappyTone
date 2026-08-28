import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../ui/tokens.css'
import PipExport from './PipExport.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PipExport />
  </StrictMode>,
)
