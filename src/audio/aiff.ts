/**
 * Minimal AIFF / AIFF-C decoder (Chromium's decodeAudioData does not read
 * AIFF). Supports uncompressed PCM 8/16/24/32-bit, big-endian ('NONE') and
 * little-endian ('sowt'), plus 32-bit float ('fl32'). Pure function.
 */

export interface DecodedAudio {
  sampleRate: number
  channels: Float32Array[]
}

export class AiffError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AiffError'
  }
}

function fourCC(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  )
}

export function isAiff(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const form = fourCC(view, 8)
  return fourCC(view, 0) === 'FORM' && (form === 'AIFF' || form === 'AIFC')
}

/** 80-bit IEEE 754 extended precision (big-endian) -> number. */
export function readExtended(view: DataView, offset: number): number {
  const expon = view.getUint16(offset) & 0x7fff
  const sign = view.getUint16(offset) & 0x8000 ? -1 : 1
  const hi = view.getUint32(offset + 2)
  const lo = view.getUint32(offset + 6)
  if (expon === 0 && hi === 0 && lo === 0) return 0
  const mantissa = hi * 2 ** 32 + lo
  return sign * mantissa * 2 ** (expon - 16383 - 63)
}

export function decodeAiff(bytes: Uint8Array): DecodedAudio {
  if (!isAiff(bytes)) throw new AiffError('Not an AIFF file')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const isAifc = fourCC(view, 8) === 'AIFC'

  let numChannels = 0
  let numFrames = 0
  let bits = 0
  let sampleRate = 0
  let compression = 'NONE'
  let dataStart = -1

  let pos = 12
  while (pos + 8 <= bytes.length) {
    const id = fourCC(view, pos)
    const size = view.getUint32(pos + 4)
    const body = pos + 8
    if (id === 'COMM') {
      numChannels = view.getUint16(body)
      numFrames = view.getUint32(body + 2)
      bits = view.getUint16(body + 6)
      sampleRate = readExtended(view, body + 8)
      if (isAifc && size >= 22) compression = fourCC(view, body + 18)
    } else if (id === 'SSND') {
      const offset = view.getUint32(body)
      dataStart = body + 8 + offset
    }
    pos = body + size + (size % 2) // chunks are padded to even length
  }

  if (!numChannels || !sampleRate) throw new AiffError('Missing COMM chunk')
  if (dataStart < 0) throw new AiffError('Missing SSND chunk')

  const little = compression === 'sowt'
  const float = compression === 'fl32' || compression === 'FL32'
  if (!little && !float && compression !== 'NONE') {
    throw new AiffError(`Unsupported AIFF-C compression "${compression}"`)
  }
  if (float && bits !== 32) throw new AiffError('Float AIFF must be 32-bit')
  if (![8, 16, 24, 32].includes(bits)) throw new AiffError(`Unsupported bit depth ${bits}`)

  const bytesPerSample = bits / 8
  const frameBytes = bytesPerSample * numChannels
  const frames = Math.min(numFrames, Math.floor((bytes.length - dataStart) / frameBytes))
  const channels = Array.from({ length: numChannels }, () => new Float32Array(frames))

  for (let f = 0; f < frames; f++) {
    for (let c = 0; c < numChannels; c++) {
      const at = dataStart + f * frameBytes + c * bytesPerSample
      let v: number
      if (float) v = view.getFloat32(at, false)
      else if (bits === 8) v = view.getInt8(at) / 128
      else if (bits === 16) v = view.getInt16(at, little) / 32768
      else if (bits === 24) {
        const b0 = view.getUint8(at)
        const b1 = view.getUint8(at + 1)
        const b2 = view.getUint8(at + 2)
        let x = little ? (b2 << 16) | (b1 << 8) | b0 : (b0 << 16) | (b1 << 8) | b2
        if (x & 0x800000) x -= 0x1000000
        v = x / 8388608
      } else v = view.getInt32(at, little) / 2147483648
      channels[c]![f] = v
    }
  }
  return { sampleRate, channels }
}
