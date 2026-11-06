import { describe, expect, it } from 'vitest'
import { computePeaks } from './waveform'

describe('computePeaks', () => {
  it('returns min/max per bucket across channels', () => {
    const l = new Float32Array([0.1, -0.5, 0.2, 0.9])
    const r = new Float32Array([-0.2, 0.0, -0.8, 0.1])
    const p = computePeaks([l, r], 2)
    expect(Array.from(p.min)).toEqual([expect.closeTo(-0.5), expect.closeTo(-0.8)])
    expect(Array.from(p.max)).toEqual([expect.closeTo(0.1), expect.closeTo(0.9)])
  })

  it('handles empty input and more buckets than samples', () => {
    expect(computePeaks([], 4).min).toHaveLength(4)
    const p = computePeaks([new Float32Array([0.5])], 3)
    expect(Array.from(p.max)).toEqual([0.5, 0.5, 0.5])
  })
})
