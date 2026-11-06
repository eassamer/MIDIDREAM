/** Min/max peaks per bucket for drawing a waveform (mono mix of all channels). */
export interface Peaks {
  min: Float32Array
  max: Float32Array
}

export function computePeaks(channels: ArrayLike<number>[], buckets: number): Peaks {
  const min = new Float32Array(buckets)
  const max = new Float32Array(buckets)
  const length = channels[0]?.length ?? 0
  if (!length || buckets <= 0) return { min, max }
  for (let b = 0; b < buckets; b++) {
    const from = Math.floor((b / buckets) * length)
    const to = Math.max(from + 1, Math.floor(((b + 1) / buckets) * length))
    let lo = 0
    let hi = 0
    for (let i = from; i < to && i < length; i++) {
      for (const ch of channels) {
        const v = ch[i]!
        if (v < lo) lo = v
        if (v > hi) hi = v
      }
    }
    min[b] = lo
    max[b] = hi
  }
  return { min, max }
}
