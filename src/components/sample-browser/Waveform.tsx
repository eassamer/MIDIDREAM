import { useEffect, useRef, useState } from 'react'
import { audioEngine } from '../../app/wiring'
import { computePeaks } from '../../audio/waveform'
import { useSamples } from '../../state/sampleStore'

interface Props {
  sampleId: string
  start: number
  end: number
  reverse: boolean
  color: string
  onChange: (patch: { start?: number; end?: number }) => void
}

const HANDLE_PX = 10

/**
 * Waveform with draggable start/end handles. Positions are fractions of the
 * original file; the file itself is never changed. Double-click resets.
 */
export function Waveform({ sampleId, start, end, reverse, color, onChange }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [width, setWidth] = useState(600)
  const drag = useRef<'start' | 'end' | null>(null)
  // Re-read the data once loading finishes.
  const ready = useSamples((s) => s.status[sampleId]?.state ?? 'ready')
  const height = 140

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(100, entry!.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)

    const data = audioEngine.getSampleData(sampleId)
    const mid = height / 2
    if (!data) {
      ctx.fillStyle = '#8a8a96'
      ctx.font = '13px -apple-system, sans-serif'
      ctx.fillText(ready === 'loading' ? 'Loading…' : 'No audio loaded', 12, mid)
      return
    }
    const peaks = computePeaks(data.channels, Math.round(width))
    for (let x = 0; x < peaks.min.length; x++) {
      const frac = x / peaks.min.length
      ctx.fillStyle = frac >= start && frac <= end ? color : '#4a4a55'
      const top = mid - peaks.max[x]! * mid * 0.95
      const bottom = mid - peaks.min[x]! * mid * 0.95
      ctx.fillRect(x, top, 1, Math.max(1, bottom - top))
    }
    // Dim outside the region and draw the handles.
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    ctx.fillRect(0, 0, start * width, height)
    ctx.fillRect(end * width, 0, width - end * width, height)
    for (const [pos, label] of [
      [start, reverse ? 'E' : 'S'],
      [end, reverse ? 'S' : 'E'],
    ] as const) {
      const x = Math.round(pos * width)
      // Keep the label tab fully inside the canvas at the edges.
      const tab = Math.min(width - 14, Math.max(0, x - 7))
      ctx.fillStyle = '#fff'
      ctx.fillRect(Math.min(width - 2, Math.max(0, x - 1)), 0, 2, height)
      ctx.fillRect(tab, 0, 14, 14)
      ctx.fillStyle = '#111'
      ctx.font = 'bold 10px -apple-system, sans-serif'
      ctx.fillText(label, tab + 4, 11)
    }
  }, [sampleId, start, end, reverse, color, width, ready])

  const fracAt = (clientX: number) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  }

  return (
    <div ref={wrapRef} className="waveform">
      <canvas
        ref={canvasRef}
        style={{ width, height }}
        aria-label="Sample waveform: drag the start and end handles"
        onPointerDown={(e) => {
          const f = fracAt(e.clientX)
          const px = (f: number) => f * width
          const toStart = Math.abs(px(f) - px(start))
          const toEnd = Math.abs(px(f) - px(end))
          drag.current = toStart <= toEnd ? 'start' : 'end'
          if (Math.min(toStart, toEnd) > HANDLE_PX) onChange({ [drag.current]: f })
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          if (drag.current) onChange({ [drag.current]: fracAt(e.clientX) })
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onDoubleClick={() => onChange({ start: 0, end: 1 })}
      />
    </div>
  )
}
