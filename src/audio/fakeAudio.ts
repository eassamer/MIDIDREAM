/**
 * Minimal Web Audio stand-in for unit tests. Records what the engine does
 * (starts, stops, parameter values) without producing sound.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

export class FakeParam {
  value: number
  events: { type: string; value?: number; time: number }[] = []
  constructor(value = 0) {
    this.value = value
  }
  setValueAtTime(value: number, time: number) {
    this.value = value
    this.events.push({ type: 'set', value, time })
    return this
  }
  linearRampToValueAtTime(value: number, time: number) {
    this.value = value
    this.events.push({ type: 'linear', value, time })
    return this
  }
  setTargetAtTime(value: number, time: number) {
    this.value = value
    this.events.push({ type: 'target', value, time })
    return this
  }
  cancelScheduledValues(time: number) {
    this.events.push({ type: 'cancel', time })
    return this
  }
  cancelAndHoldAtTime(time: number) {
    this.events.push({ type: 'hold', time })
    return this
  }
}

class FakeNode {
  connections: unknown[] = []
  connect(n: unknown) {
    this.connections.push(n)
    return n
  }
  disconnect() {
    this.connections = []
  }
}

export class FakeSource extends FakeNode {
  startedAt: number | null = null
  stoppedAt: number | null = null
  onended: (() => void) | null = null
  start(when = 0) {
    this.startedAt = when
  }
  stop(when = 0) {
    this.stoppedAt = when
  }
  /** Simulate the source finishing. */
  end() {
    this.onended?.()
  }
}

export class FakeBufferSource extends FakeSource {
  buffer: any = null
  playbackRate = new FakeParam(1)
  loop = false
  loopStart = 0
  loopEnd = 0
  startArgs: number[] = []
  override start(...args: number[]) {
    super.start(args[0])
    this.startArgs = args
  }
}

export class FakeOscillator extends FakeSource {
  type = 'sine'
  frequency = new FakeParam(440)
  detune = new FakeParam(0)
}

export class FakeAudioContext {
  sampleRate = 48000
  currentTime = 0
  state = 'running'
  baseLatency = 0.005
  outputLatency = 0.02
  destination = new FakeNode()
  onstatechange: (() => void) | null = null
  sources: FakeSource[] = []

  createGain() {
    return Object.assign(new FakeNode(), { gain: new FakeParam(1) })
  }
  createStereoPanner() {
    return Object.assign(new FakeNode(), { pan: new FakeParam(0) })
  }
  createBiquadFilter() {
    return Object.assign(new FakeNode(), {
      type: 'lowpass',
      frequency: new FakeParam(350),
      Q: new FakeParam(1),
    })
  }
  createDynamicsCompressor() {
    return Object.assign(new FakeNode(), {
      threshold: new FakeParam(),
      knee: new FakeParam(),
      ratio: new FakeParam(),
      attack: new FakeParam(),
      release: new FakeParam(),
    })
  }
  createAnalyser() {
    return Object.assign(new FakeNode(), {
      fftSize: 2048,
      getFloatTimeDomainData: (arr: Float32Array) => arr.fill(0.25),
    })
  }
  createBuffer(channels: number, length: number, sampleRate: number) {
    const data = Array.from({ length: channels }, () => new Float32Array(length))
    return {
      numberOfChannels: channels,
      length,
      sampleRate,
      duration: length / sampleRate,
      getChannelData: (c: number) => data[c]!,
    }
  }
  createBufferSource() {
    const s = new FakeBufferSource()
    this.sources.push(s)
    return s
  }
  createOscillator() {
    const s = new FakeOscillator()
    this.sources.push(s)
    return s
  }
  previewGains: { gain: FakeParam }[] = []
  async decodeAudioData(data: ArrayBuffer) {
    // Pretend every file is 1 s of mono audio; record the size we were given.
    this.decoded.push(data.byteLength)
    return this.createBuffer(1, this.sampleRate, this.sampleRate)
  }
  decoded: number[] = []
  async resume() {
    this.state = 'running'
  }
}
