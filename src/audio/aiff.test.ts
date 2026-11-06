import { describe, expect, it } from 'vitest'
import { AiffError, decodeAiff, isAiff, readExtended } from './aiff'

/** 80-bit extended encoding of an integer sample rate. */
function extended(rate: number): number[] {
  const exp = Math.floor(Math.log2(rate))
  const mant = BigInt(rate) << BigInt(63 - exp)
  const out = [((exp + 16383) >> 8) & 0x7f, (exp + 16383) & 0xff]
  for (let i = 7; i >= 0; i--) out.push(Number((mant >> BigInt(i * 8)) & 0xffn))
  return out
}

const str = (s: string) => [...s].map((c) => c.charCodeAt(0))
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
const u16 = (n: number) => [(n >>> 8) & 255, n & 255]

function buildAiff(opts: {
  channels: number
  bits: number
  rate: number
  frames: number[][] // [frame][channel] raw integer or float values
  compression?: string
}): Uint8Array {
  const { channels, bits, rate, frames, compression } = opts
  const aifc = compression !== undefined
  const bps = bits / 8
  const sample = (v: number): number[] => {
    if (compression === 'fl32') {
      const b = new DataView(new ArrayBuffer(4))
      b.setFloat32(0, v)
      return [b.getUint8(0), b.getUint8(1), b.getUint8(2), b.getUint8(3)]
    }
    const be: number[] = []
    for (let i = bps - 1; i >= 0; i--) be.push((v >> (i * 8)) & 255)
    return compression === 'sowt' ? be.reverse() : be
  }
  const data = frames.flatMap((f) => f.flatMap(sample))
  const comm = [
    ...u16(channels),
    ...u32(frames.length),
    ...u16(bits),
    ...extended(rate),
    ...(aifc ? [...str(compression!), 0, 0] : []),
  ]
  const ssnd = [...u32(0), ...u32(0), ...data]
  const chunks = [
    ...str('COMM'),
    ...u32(comm.length),
    ...comm,
    ...str('SSND'),
    ...u32(ssnd.length),
    ...ssnd,
    ...(ssnd.length % 2 ? [0] : []),
  ]
  return new Uint8Array([
    ...str('FORM'),
    ...u32(chunks.length + 4),
    ...str(aifc ? 'AIFC' : 'AIFF'),
    ...chunks,
  ])
}

describe('readExtended', () => {
  it('reads common sample rates', () => {
    for (const rate of [44100, 48000, 96000, 22050]) {
      const view = new DataView(new Uint8Array(extended(rate)).buffer)
      expect(readExtended(view, 0)).toBe(rate)
    }
  })
})

describe('decodeAiff', () => {
  it('decodes 16-bit big-endian stereo', () => {
    const bytes = buildAiff({
      channels: 2,
      bits: 16,
      rate: 44100,
      frames: [
        [16384, -16384],
        [32767, 0],
      ],
    })
    expect(isAiff(bytes)).toBe(true)
    const out = decodeAiff(bytes)
    expect(out.sampleRate).toBe(44100)
    expect(out.channels).toHaveLength(2)
    expect(Array.from(out.channels[0]!)).toEqual([0.5, 32767 / 32768])
    expect(Array.from(out.channels[1]!)).toEqual([-0.5, 0])
  })

  it('decodes 24-bit and 8-bit mono', () => {
    const d24 = decodeAiff(
      buildAiff({
        channels: 1,
        bits: 24,
        rate: 48000,
        frames: [[0x400000], [-0x400000 & 0xffffff]],
      }),
    )
    expect(Array.from(d24.channels[0]!)).toEqual([0.5, -0.5])
    const d8 = decodeAiff(buildAiff({ channels: 1, bits: 8, rate: 48000, frames: [[64], [0xc0]] }))
    expect(Array.from(d8.channels[0]!)).toEqual([0.5, -0.5])
  })

  it('decodes AIFF-C little-endian (sowt) and float (fl32)', () => {
    const le = decodeAiff(
      buildAiff({ channels: 1, bits: 16, rate: 44100, frames: [[16384]], compression: 'sowt' }),
    )
    expect(le.channels[0]![0]).toBe(0.5)
    const fl = decodeAiff(
      buildAiff({ channels: 1, bits: 32, rate: 44100, frames: [[0.25]], compression: 'fl32' }),
    )
    expect(fl.channels[0]![0]).toBeCloseTo(0.25)
  })

  it('rejects non-AIFF data and unsupported compression', () => {
    expect(isAiff(new Uint8Array(str('RIFF....WAVE')))).toBe(false)
    expect(() => decodeAiff(new Uint8Array(16))).toThrow(AiffError)
    expect(() =>
      decodeAiff(
        buildAiff({ channels: 1, bits: 16, rate: 44100, frames: [[1]], compression: 'ima4' }),
      ),
    ).toThrow(/compression/)
  })
})
