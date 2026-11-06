import type { Part, PartIndex } from '../project/types'
import { AudioEngine } from './AudioEngine'

export interface PartTestResult {
  part: PartIndex
  name: string
  peak: number
  rms: number
  ok: boolean
}

export interface SelfTestResult {
  parts: PartTestResult[]
  /** All eight parts triggered together at full velocity. */
  mixPeak: number
  mixOk: boolean
  renderMs: number
}

const SAMPLE_RATE = 48000
const SECONDS = 1

/**
 * Renders each part offline through a separate engine instance (same code
 * path as live playback) and checks that it produces sound without clipping.
 * Does not touch the live audio output.
 */
export async function runAudioSelfTest(parts: Part[]): Promise<SelfTestResult> {
  const t0 = performance.now()
  // Test the sounds as configured, ignoring mute/solo.
  const testParts = parts.map((p) => ({ ...p, mute: false, solo: false }))

  const results: PartTestResult[] = []
  for (const part of testParts) {
    const out = await render(testParts, [part.index])
    const { peak, rms } = measure(out)
    results.push({
      part: part.index,
      name: part.name,
      peak,
      rms,
      ok: peak > 0.01 && peak <= 1,
    })
  }

  const mix = measure(
    await render(
      testParts,
      testParts.map((p) => p.index),
    ),
  )
  return {
    parts: results,
    mixPeak: mix.peak,
    mixOk: mix.peak > 0.01 && mix.peak <= 1,
    renderMs: performance.now() - t0,
  }
}

async function render(parts: Part[], trigger: PartIndex[]): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, SAMPLE_RATE * SECONDS, SAMPLE_RATE)
  const engine = new AudioEngine(() => ctx)
  engine.start()
  engine.setParts(parts)
  engine.setMasterVolume(1)
  for (const i of trigger) {
    engine.trigger(i, 127)
    engine.release(i, undefined, 0.4) // held notes (synths) end before the render does
  }
  return ctx.startRendering()
}

function measure(buffer: AudioBuffer): { peak: number; rms: number } {
  let peak = 0
  let sum = 0
  let n = 0
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    for (const s of buffer.getChannelData(c)) {
      const a = Math.abs(s)
      if (a > peak) peak = a
      sum += s * s
      n++
    }
  }
  return { peak, rms: Math.sqrt(sum / Math.max(1, n)) }
}
