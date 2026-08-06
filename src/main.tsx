import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

/**
 * ?soundboard: dev clip board, opened on a phone pointed at the laptop mic.
 *
 * Lazily imported behind `import.meta.env.DEV`, the same shape App.tsx uses for
 * the Lab, so Rollup drops the whole subtree from a production build. Imported
 * statically it shipped to players, who could reach it by guessing a query
 * param — dev tooling reaching a player is what CLAUDE.md rule 7 forbids.
 */
const Soundboard = import.meta.env.DEV
  ? lazy(() =>
      import('./dev/Soundboard.tsx').then((m) => ({ default: m.Soundboard })),
    )
  : null

const soundboard =
  import.meta.env.DEV && new URLSearchParams(location.search).has('soundboard')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {soundboard && Soundboard ? (
      <Suspense fallback={null}>
        <Soundboard />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
)
