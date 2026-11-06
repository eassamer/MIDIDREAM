import { useState } from 'react'
import { audioEngine } from '../../app/wiring'
import { runAudioSelfTest, type SelfTestResult } from '../../audio/selfTest'
import { projectStore } from '../../state/projectStore'
import { useAudioStats } from '../../state/audioStore'

const ms = (s: number | null) => (s === null ? 'n/a' : `${(s * 1000).toFixed(1)} ms`)
const db = (x: number) => (x <= 0 ? '−∞' : `${(20 * Math.log10(x)).toFixed(1)} dB`)

export function AudioSetup() {
  const stats = useAudioStats()
  const [result, setResult] = useState<SelfTestResult | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setRunning(true)
    setError(null)
    try {
      setResult(await runAudioSelfTest(projectStore.getState().project.parts))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="audio-setup">
      <section className="panel">
        <h2>Audio output</h2>
        <dl className="stats">
          <dt>Status</dt>
          <dd className={stats.status === 'running' ? 'ok' : 'warn'}>{stats.status}</dd>
          <dt>Sample rate</dt>
          <dd>{stats.sampleRate ? `${stats.sampleRate} Hz` : 'n/a'}</dd>
          <dt>Base latency</dt>
          <dd>{ms(stats.baseLatency)}</dd>
          <dt>Output latency</dt>
          <dd>{ms(stats.outputLatency)}</dd>
          <dt>Device</dt>
          <dd>System default output</dd>
        </dl>
        {stats.error && <p className="warn">{stats.error}</p>}
        {stats.status === 'suspended' && (
          <button onClick={() => void audioEngine.resume()}>Resume audio</button>
        )}
        <p className="muted">
          Latency is reported by the audio system. Output-device selection comes in a later
          milestone; change the Mac’s output in System Settings for now.
        </p>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Self-test</h2>
          <button onClick={() => void run()} disabled={running}>
            {running ? 'Running…' : 'Run self-test'}
          </button>
        </div>
        <p className="muted">
          Renders every part offline with the live engine code (silent — nothing plays) and checks
          each one makes sound without clipping.
        </p>
        {error && <p className="warn">Self-test failed: {error}</p>}
        {result && (
          <table className="selftest">
            <thead>
              <tr>
                <th>Part</th>
                <th>Peak</th>
                <th>RMS</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {result.parts.map((r) => (
                <tr key={r.part}>
                  <td>
                    {r.part + 1} {r.name}
                  </td>
                  <td>{db(r.peak)}</td>
                  <td>{db(r.rms)}</td>
                  <td className={r.ok ? 'ok' : 'warn'}>{r.ok ? 'OK' : 'FAIL'}</td>
                </tr>
              ))}
              <tr className="mix">
                <td>All parts together</td>
                <td>{db(result.mixPeak)}</td>
                <td />
                <td className={result.mixOk ? 'ok' : 'warn'}>{result.mixOk ? 'OK' : 'FAIL'}</td>
              </tr>
            </tbody>
          </table>
        )}
        {result && <p className="muted">Rendered in {result.renderMs.toFixed(0)} ms.</p>}
      </section>
    </div>
  )
}
