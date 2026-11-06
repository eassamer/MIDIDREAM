import { PART_COUNT, type Part, type PartIndex } from '../project/types'
import { BUILTIN_SAMPLE_IDS, renderBuiltinSample } from './builtinSamples'
import type { AudioCommand, AudioEngineApi } from './commands'
import {
  DEFAULT_NOTE,
  defaultNoteFor,
  isAudible,
  midiToHz,
  semitonesToRate,
  velocityToGain,
} from './voiceMath'

/**
 * The audio engine. Owns the AudioContext and every audio node. UI and MIDI
 * code talk to it through `send()` / typed methods and never touch nodes.
 *
 * Graph:  voice -> part input -> panner -> part fader -> master gain
 *         -> limiter -> analyser -> destination
 */

export type EngineStatus = 'idle' | 'starting' | 'running' | 'suspended' | 'error'

export interface EngineStats {
  status: EngineStatus
  sampleRate: number
  /** Seconds; null when the runtime does not report it. */
  baseLatency: number | null
  outputLatency: number | null
  error: string | null
}

/** Fade used when voices are cut (mute, choke, panic) to avoid clicks. */
const CUT_FADE_S = 0.008
/** Small scheduling headroom so "now" events never land in the past. */
const LOOKAHEAD_S = 0.005
const MAX_VOICES_PER_PART = 16
const VOICE_PEAK = 0.8
const FADER_RAMP_S = 0.015

interface Voice {
  part: PartIndex
  note: number
  /** Stop the voice, honoring the release envelope, or cutting fast. */
  release: (when: number, fast: boolean) => void
  /** playing -> releasing (envelope tail) -> stopped (cut or ended). */
  state: 'playing' | 'releasing' | 'stopped'
  /** Audio time the voice starts. */
  startedAt: number
}

interface PartChannel {
  input: GainNode
  panner: StereoPannerNode
  fader: GainNode
  voices: Voice[]
}

export type ContextFactory = () => BaseAudioContext

const defaultFactory: ContextFactory = () => new AudioContext({ latencyHint: 'interactive' })

export class AudioEngine implements AudioEngineApi {
  private ctx: BaseAudioContext | null = null
  private channels: PartChannel[] = []
  private master: GainNode | null = null
  private analyser: AnalyserNode | null = null
  private meterBuffer: Float32Array<ArrayBuffer> | null = null
  private buffers = new Map<string, AudioBuffer>()
  private reversed = new WeakMap<AudioBuffer, AudioBuffer>()
  private parts: Part[] = []
  private masterVolume = 0.8
  private stats: EngineStats = {
    status: 'idle',
    sampleRate: 0,
    baseLatency: null,
    outputLatency: null,
    error: null,
  }
  private listeners = new Set<(stats: EngineStats) => void>()

  constructor(private readonly createContext: ContextFactory = defaultFactory) {}

  // ---------------------------------------------------------------- lifecycle

  /** Create the context and graph. Safe to call more than once. */
  start(): void {
    if (this.ctx) return
    this.setStats({ status: 'starting' })
    try {
      const ctx = this.createContext()
      this.ctx = ctx
      this.buildGraph(ctx)
      this.loadBuiltinSamples(ctx)
      this.applyParts()
      this.applyMasterVolume()
      ctx.onstatechange = () => this.refreshStats()
      this.refreshStats()
    } catch (err) {
      this.setStats({ status: 'error', error: err instanceof Error ? err.message : String(err) })
    }
  }

  /** Resume a suspended context (call from a user gesture). */
  async resume(): Promise<void> {
    if (!this.ctx) this.start()
    const ctx = this.ctx
    if (ctx && 'resume' in ctx && ctx.state === 'suspended') {
      await (ctx as AudioContext).resume()
    }
    this.refreshStats()
  }

  async dispose(): Promise<void> {
    this.panic()
    const ctx = this.ctx
    this.ctx = null
    this.listeners.clear()
    if (ctx && 'close' in ctx) await (ctx as AudioContext).close()
  }

  getStats(): EngineStats {
    return this.stats
  }

  onStatsChange(listener: (stats: EngineStats) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** The underlying context (for offline rendering in tests/self-test). */
  get context(): BaseAudioContext | null {
    return this.ctx
  }

  // ---------------------------------------------------------------- commands

  send(command: AudioCommand): void {
    switch (command.type) {
      case 'trigger':
        this.trigger(command.part, command.velocity, command.note)
        break
      case 'release':
        this.release(command.part, command.note)
        break
      case 'panic':
        this.panic()
        break
      case 'setMasterVolume':
        this.setMasterVolume(command.volume)
        break
    }
  }

  /** Update part parameters (volume, pan, mute, solo, pitch, sound). */
  setParts(parts: Part[]): void {
    const before = this.parts
    this.parts = parts
    this.applyParts(before)
  }

  setMasterVolume(volume: number): void {
    this.masterVolume = Math.min(1, Math.max(0, volume))
    this.applyMasterVolume()
  }

  /**
   * Start a voice. `velocity` is MIDI 1..127. `note` is a MIDI note for
   * pitched parts (defaults per part); for sample parts it transposes
   * relative to C3 (60). `when` is an AudioContext time (defaults to now).
   * With `duration`, the note is released automatically after that many
   * seconds (sequencer notes); without it, it is held until `release()`.
   */
  trigger(
    partIndex: PartIndex,
    velocity: number,
    note?: number,
    when?: number,
    duration?: number,
  ): void {
    const ctx = this.ctx
    const part = this.parts[partIndex]
    const channel = this.channels[partIndex]
    if (!ctx || !part || !channel || velocity <= 0) return
    if (
      !isAudible(
        part,
        this.parts.some((p) => p.solo),
      )
    )
      return

    const t = Math.max(when ?? 0, ctx.currentTime + LOOKAHEAD_S)
    this.choke(part, t)

    const voice =
      part.sound.kind === 'synth'
        ? this.startSynthVoice(ctx, part, channel, velocity, note ?? defaultNoteFor(part), t)
        : this.startSampleVoice(ctx, part, channel, velocity, note ?? DEFAULT_NOTE, t)
    if (!voice) return

    channel.voices.push(voice)
    if (duration !== undefined) voice.release(t + Math.max(0.005, duration), false)
    // Voice stealing: drop the oldest voice when a part gets too busy.
    while (channel.voices.length > MAX_VOICES_PER_PART) {
      channel.voices.shift()!.release(t, true)
    }
  }

  /** Release held voices on a part (all of them when `note` is omitted). */
  release(partIndex: PartIndex, note?: number, when?: number): void {
    const ctx = this.ctx
    const channel = this.channels[partIndex]
    if (!ctx || !channel) return
    const t = Math.max(when ?? 0, ctx.currentTime + LOOKAHEAD_S)
    for (const v of channel.voices) {
      if (note === undefined || v.note === note) v.release(t, false)
    }
  }

  /**
   * Silence voices scheduled to start after `time` (sequencer stop). Notes
   * already sounding are left to finish.
   */
  cancelAfter(time: number): void {
    for (const channel of this.channels) {
      const pending = channel.voices.filter((v) => v.startedAt > time)
      for (const v of pending) v.release(time, true)
      channel.voices = channel.voices.filter((v) => v.startedAt <= time)
    }
  }

  /** Current audio clock time in seconds (0 before start). */
  now(): number {
    return this.ctx?.currentTime ?? 0
  }

  /**
   * Seconds between scheduling a sound at `currentTime` and hearing it.
   * Used to line the playhead up with what is audible.
   */
  outputDelay(): number {
    return (this.stats.baseLatency ?? 0) + (this.stats.outputLatency ?? 0)
  }

  /** Release every held voice on every part (e.g. MIDI device unplugged). */
  releaseAll(): void {
    for (let i = 0; i < this.channels.length; i++) this.release(i as PartIndex)
  }

  /** Stop all sound immediately. */
  panic(): void {
    const ctx = this.ctx
    if (!ctx) return
    const t = ctx.currentTime
    for (const channel of this.channels) {
      for (const v of channel.voices) v.release(t, true)
      channel.voices = []
    }
  }

  /** Number of voices currently sounding on a part (for tests/diagnostics). */
  activeVoices(partIndex: PartIndex): number {
    return this.channels[partIndex]?.voices.filter((v) => v.state === 'playing').length ?? 0
  }

  /** Peak absolute sample value at the master output right now (0..~1). */
  readPeak(): number {
    if (!this.analyser || !this.meterBuffer) return 0
    this.analyser.getFloatTimeDomainData(this.meterBuffer)
    let peak = 0
    for (const s of this.meterBuffer) peak = Math.max(peak, Math.abs(s))
    return peak
  }

  // ---------------------------------------------------------------- internals

  private buildGraph(ctx: BaseAudioContext): void {
    const master = ctx.createGain()
    // Safety limiter: transparent at normal levels, catches overs.
    const limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = -3
    limiter.knee.value = 0
    limiter.ratio.value = 20
    limiter.attack.value = 0.002
    limiter.release.value = 0.1
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    master.connect(limiter)
    limiter.connect(analyser)
    analyser.connect(ctx.destination)

    this.master = master
    this.analyser = analyser
    this.meterBuffer = new Float32Array(analyser.fftSize)

    this.channels = Array.from({ length: PART_COUNT }, () => {
      const input = ctx.createGain()
      const panner = ctx.createStereoPanner()
      const fader = ctx.createGain()
      input.connect(panner)
      panner.connect(fader)
      fader.connect(master)
      return { input, panner, fader, voices: [] }
    })
  }

  private loadBuiltinSamples(ctx: BaseAudioContext): void {
    for (const id of BUILTIN_SAMPLE_IDS) {
      const data = renderBuiltinSample(id, ctx.sampleRate)
      const buffer = ctx.createBuffer(1, data.length, ctx.sampleRate)
      buffer.getChannelData(0).set(data)
      this.buffers.set(id, buffer)
    }
  }

  private applyMasterVolume(): void {
    if (!this.ctx || !this.master) return
    this.master.gain.setTargetAtTime(this.masterVolume, this.ctx.currentTime, FADER_RAMP_S)
  }

  private applyParts(before: Part[] = []): void {
    const ctx = this.ctx
    if (!ctx) return
    const now = ctx.currentTime
    const anySolo = this.parts.some((p) => p.solo)
    const anySoloBefore = before.some((p) => p.solo)

    this.parts.forEach((part, i) => {
      const channel = this.channels[i]
      if (!channel) return
      const audible = isAudible(part, anySolo)
      channel.fader.gain.setTargetAtTime(audible ? part.volume : 0, now, FADER_RAMP_S)
      channel.panner.pan.setTargetAtTime(part.pan, now, FADER_RAMP_S)

      // Cut voices on parts that just became inaudible or changed sound type,
      // so nothing keeps ringing (or gets stuck) behind a muted fader.
      const prev = before[i]
      const wasAudible = prev ? isAudible(prev, anySoloBefore) : true
      const soundChanged = prev && prev.sound.kind !== part.sound.kind
      if ((wasAudible && !audible) || soundChanged) {
        for (const v of channel.voices) v.release(now, true)
        channel.voices = []
      }
    })
  }

  /** Cut voices of other parts sharing this part's choke group. */
  private choke(part: Part, t: number): void {
    if (part.chokeGroup === null) return
    for (const other of this.parts) {
      if (other.index === part.index || other.chokeGroup !== part.chokeGroup) continue
      const channel = this.channels[other.index]
      if (!channel) continue
      for (const v of channel.voices) v.release(t, true)
      channel.voices = []
    }
  }

  private startSampleVoice(
    ctx: BaseAudioContext,
    part: Part,
    channel: PartChannel,
    velocity: number,
    note: number,
    t: number,
  ): Voice | null {
    if (part.sound.kind !== 'sample' || !part.sound.sample) return null
    const original = this.buffers.get(part.sound.sample.id)
    if (!original) return null
    const sound = part.sound
    const buffer = sound.reverse ? this.getReversed(ctx, original) : original

    const startFrac = Math.min(sound.start, sound.end)
    const endFrac = Math.max(sound.start, sound.end)
    // Reverse plays the same region, mirrored.
    const offset = (sound.reverse ? 1 - endFrac : startFrac) * buffer.duration
    const length = Math.max(0.001, (endFrac - startFrac) * buffer.duration)

    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.playbackRate.value = semitonesToRate(part.pitchSemitones + (note - DEFAULT_NOTE))

    const env = ctx.createGain()
    const peak = velocityToGain(velocity) * VOICE_PEAK
    const { attack, release } = part.ampEnvelope
    env.gain.setValueAtTime(0, t)
    env.gain.linearRampToValueAtTime(peak, t + Math.max(0.001, attack))

    src.connect(env)
    env.connect(channel.input)

    if (sound.playMode === 'loop') {
      src.loop = true
      src.loopStart = offset
      src.loopEnd = offset + length
      src.start(t, offset)
    } else {
      src.start(t, offset, length)
    }

    const gated = sound.playMode !== 'one-shot'
    // One-shots ignore note-off; they are only cut (mute, choke, panic).
    return this.makeVoice(part.index, note, src, env, t, (fast) =>
      fast ? CUT_FADE_S : gated ? Math.max(0.005, release) : false,
    )
  }

  private startSynthVoice(
    ctx: BaseAudioContext,
    part: Part,
    channel: PartChannel,
    velocity: number,
    note: number,
    t: number,
  ): Voice | null {
    if (part.sound.kind !== 'synth') return null
    const osc = ctx.createOscillator()
    osc.type = part.sound.waveform
    osc.frequency.value = midiToHz(note + part.pitchSemitones)

    const filter = ctx.createBiquadFilter()
    filter.type = part.filter.type
    filter.frequency.value = Math.min(part.filter.cutoffHz, ctx.sampleRate / 2)
    filter.Q.value = part.filter.resonance

    const env = ctx.createGain()
    // Raw saw/square are loud; scale them down relative to drum samples.
    const peak = velocityToGain(velocity) * VOICE_PEAK * 0.5
    const { attack, decay, sustain, release } = part.ampEnvelope
    const a = Math.max(0.001, attack)
    env.gain.setValueAtTime(0, t)
    env.gain.linearRampToValueAtTime(peak, t + a)
    env.gain.setTargetAtTime(peak * sustain, t + a, Math.max(0.001, decay) / 3)

    osc.connect(filter)
    filter.connect(env)
    env.connect(channel.input)
    osc.start(t)

    return this.makeVoice(part.index, note, osc, env, t, (fast) =>
      fast ? CUT_FADE_S : Math.max(0.005, release),
    )
  }

  /**
   * Wrap a source + envelope as a Voice. `fadeFor(fast)` returns the fade
   * length for a release, or false to ignore it (one-shot note-off).
   */
  private makeVoice(
    part: PartIndex,
    note: number,
    src: AudioScheduledSourceNode,
    env: GainNode,
    startedAt: number,
    fadeFor: (fast: boolean) => number | false,
  ): Voice {
    const voice: Voice = {
      part,
      note,
      state: 'playing',
      startedAt,
      release: (when, fast) => {
        // A fast cut may shorten a slow release tail; nothing else repeats.
        if (voice.state === 'stopped' || (voice.state === 'releasing' && !fast)) return
        const fade = fadeFor(fast)
        if (fade === false) return
        const at = Math.max(when, startedAt)
        holdAt(env.gain, at)
        env.gain.linearRampToValueAtTime(0, at + fade)
        try {
          src.stop(at + fade + 0.01)
        } catch {
          // Already stopped.
        }
        voice.state = fast ? 'stopped' : 'releasing'
      },
    }
    src.onended = () => {
      voice.state = 'stopped'
      src.disconnect()
      env.disconnect()
      const channel = this.channels[part]
      if (channel) channel.voices = channel.voices.filter((v) => v !== voice)
    }
    return voice
  }

  private getReversed(ctx: BaseAudioContext, buffer: AudioBuffer): AudioBuffer {
    let rev = this.reversed.get(buffer)
    if (!rev) {
      rev = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate)
      for (let c = 0; c < buffer.numberOfChannels; c++) {
        rev.getChannelData(c).set(buffer.getChannelData(c).slice().reverse())
      }
      this.reversed.set(buffer, rev)
    }
    return rev
  }

  private refreshStats(): void {
    const ctx = this.ctx
    if (!ctx) return
    const live = ctx as Partial<AudioContext>
    this.setStats({
      status:
        ctx.state === 'running' ? 'running' : ctx.state === 'suspended' ? 'suspended' : 'idle',
      sampleRate: ctx.sampleRate,
      baseLatency: typeof live.baseLatency === 'number' ? live.baseLatency : null,
      outputLatency: typeof live.outputLatency === 'number' ? live.outputLatency : null,
      error: null,
    })
  }

  private setStats(patch: Partial<EngineStats>): void {
    this.stats = { ...this.stats, ...patch }
    for (const l of this.listeners) l(this.stats)
  }
}

/** Freeze an automated param at its value at time `t`, dropping later events. */
function holdAt(param: AudioParam, t: number): void {
  if (typeof param.cancelAndHoldAtTime === 'function') {
    param.cancelAndHoldAtTime(t)
  } else {
    param.cancelScheduledValues(t)
    param.setValueAtTime(param.value, t)
  }
}
