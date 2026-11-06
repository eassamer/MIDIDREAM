import { useAudioStats } from '../../state/audioStore'

export function AudioIndicator({ onClick }: { onClick?: () => void }) {
  const stats = useAudioStats()
  const state = stats.status === 'running' ? 'ok' : stats.status === 'suspended' ? 'warn' : 'off'
  const text =
    stats.status === 'running'
      ? `Audio: ${stats.sampleRate / 1000} kHz`
      : stats.status === 'suspended'
        ? 'Audio suspended — click to resume'
        : `Audio: ${stats.status}`
  return (
    <button className="midi-indicator" onClick={onClick} title="Open audio setup">
      <span className={`dot ${state}`} />
      {text}
    </button>
  )
}
