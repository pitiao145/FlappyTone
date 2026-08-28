import { useEffect, useRef, useState } from 'react'
import { drawPip, type PipState } from '../render/scene.ts'

/**
 * Dev-only export tool: renders "the Pip" large on a canvas so the design can
 * be eyeballed and grabbed as a PNG for the start screen / landing page.
 * Draws through the exact same drawPip() the game uses, so the exported art
 * never drifts from what actually ships. Not part of the build — see
 * pip-export.html and CLAUDE.md #7.
 */
export default function PipExport() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [state, setState] = useState<PipState>('flying')
  const [voiced, setVoiced] = useState(true)
  const [angle, setAngle] = useState(0)
  const [px, setPx] = useState(1600)
  const [fill, setFill] = useState(6)
  const [transparent, setTransparent] = useState(true)
  const [showHalo, setShowHalo] = useState(true)
  // The bird's visual weight (halo + body) sits to the left of the beak tip,
  // which is drawPip's anchor — so centring the anchor on the canvas leaves
  // the bird looking shifted left. This nudges the anchor right by roughly
  // the halo/body's own centre offset, as a fraction of `px`, so the whole
  // silhouette lands in the middle. Tweak per state/fill if it looks off.
  const [centerOffset, setCenterOffset] = useState(0.028)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = px * dpr
    canvas.height = px * dpr
    canvas.style.width = `${px / 2}px`
    canvas.style.height = `${px / 2}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (!transparent) {
      ctx.fillStyle = '#f7f1e3'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
    ctx.scale(dpr, dpr)
    // drawPip sizes itself as ~1.8% of the `height` it's given (see scene.ts's
    // PIP_BASE_R comment) — the same ratio it renders at in-game, where the
    // bird is meant to be small against the play field. For a mascot export we
    // want the opposite: the bird filling most of the frame. Rather than
    // fight that by inflating `height` (which would also blow up the y
    // position math), zoom evenly around the anchor point before drawing —
    // `px` controls resolution/quality, `fill` controls how big the bird
    // reads in the frame, independently.
    const cx = px / 2
    const cy = px / 2
    ctx.translate(cx, cy)
    ctx.scale(fill, fill)
    ctx.translate(-cx, -cy)
    drawPip(ctx, px, 3, cx + centerOffset * px, angle, state, voiced, 0, Infinity, showHalo)
  }, [state, voiced, angle, px, fill, transparent, showHalo, centerOffset])

  const download = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `pip-${state}-${px}.png`
      a.click()
      URL.revokeObjectURL(url)
    }, 'image/png')
  }

  return (
    <div style={{ display: 'flex', gap: 24, padding: 24, fontFamily: 'sans-serif' }}>
      <div
        style={{
          background: transparent
            ? 'repeating-conic-gradient(#ccc 0% 25%, #eee 0% 50%) 50% / 20px 20px'
            : 'none',
          border: '1px solid #ccc',
        }}
      >
        <canvas ref={canvasRef} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 220 }}>
        <h2 style={{ margin: 0 }}>Pip export</h2>
        <label>
          State
          <select value={state} onChange={(e) => setState(e.target.value as PipState)}>
            <option value="flying">flying</option>
            <option value="success">success</option>
            <option value="hurt">hurt</option>
            <option value="unheard">unheard</option>
          </select>
        </label>
        <label>
          <input type="checkbox" checked={voiced} onChange={(e) => setVoiced(e.target.checked)} />
          voiced
        </label>
        <label>
          Angle ({angle.toFixed(2)} rad)
          <input
            type="range"
            min={-0.6}
            max={0.6}
            step={0.01}
            value={angle}
            onChange={(e) => setAngle(Number(e.target.value))}
          />
        </label>
        <label>
          Fill ({fill.toFixed(1)}×)
          <input
            type="range"
            min={1}
            max={12}
            step={0.5}
            value={fill}
            onChange={(e) => setFill(Number(e.target.value))}
          />
        </label>
        <label>
          <input type="checkbox" checked={showHalo} onChange={(e) => setShowHalo(e.target.checked)} />
          halo
        </label>
        <label>
          Center offset ({(centerOffset * 100).toFixed(1)}%)
          <input
            type="range"
            min={-0.15}
            max={0.15}
            step={0.002}
            value={centerOffset}
            onChange={(e) => setCenterOffset(Number(e.target.value))}
          />
        </label>
        <label>
          Export size ({px}px)
          <input
            type="range"
            min={400}
            max={4000}
            step={100}
            value={px}
            onChange={(e) => setPx(Number(e.target.value))}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={transparent}
            onChange={(e) => setTransparent(e.target.checked)}
          />
          transparent background
        </label>
        <button onClick={download}>Download PNG</button>
      </div>
    </div>
  )
}
