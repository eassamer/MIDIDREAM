import { useEffect, useRef } from 'react'
import { audioEngine } from '../../app/wiring'
import { projectStore } from '../../state/projectStore'
import { useProjectStore } from '../../state/useProjectStore'

/** Master volume, output peak meter, and the stop-all-sound button. */
export function MasterSection() {
  const volume = useProjectStore((s) => s.project.masterVolume)
  const { setMasterVolume } = projectStore.getState()

  return (
    <div className="master">
      <label className="control compact" title="Master volume">
        <span className="label">Master</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setMasterVolume(Number(e.target.value))}
        />
      </label>
      <PeakMeter />
      <button className="panic" onClick={() => audioEngine.panic()} title="Stop all sound (⌘.)">
        ■ Stop sound
      </button>
    </div>
  )
}

/** Visual-only meter: polls the engine once per animation frame. */
function PeakMeter() {
  const barRef = useRef<HTMLDivElement>(null)
  const clipRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let raf = 0
    let held = 0
    let clipUntil = 0
    const tick = (now: number) => {
      const peak = audioEngine.readPeak()
      held = Math.max(peak, held * 0.92) // smooth fall-off
      const db = 20 * Math.log10(Math.max(held, 1e-5))
      const pct = Math.max(0, Math.min(100, ((db + 60) / 60) * 100))
      if (peak >= 0.99) clipUntil = now + 1000
      if (barRef.current) barRef.current.style.width = `${pct}%`
      if (clipRef.current) clipRef.current.classList.toggle('on', now < clipUntil)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="meter" title="Master output peak (−60 to 0 dBFS)">
      <div className="meter-track">
        <div ref={barRef} className="meter-bar" />
      </div>
      <div ref={clipRef} className="meter-clip" />
    </div>
  )
}
