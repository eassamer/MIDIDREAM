import { PART_COUNT, STEPS_PER_BAR, type PartIndex, type Pattern } from '../project/types'

/**
 * Step sequencer using the "lookahead" pattern: a coarse timer wakes the
 * scheduler every few milliseconds, and the scheduler places every note that
 * falls inside the next `lookahead` seconds at an exact *audio clock* time.
 * The timer only decides when we look ahead; it never decides when notes play.
 *
 * Independent of React and of Web Audio: time, pattern data, and note output
 * are injected, so the timing logic is unit-testable.
 */

export interface SequencerClock {
  /** Audio clock in seconds (AudioContext.currentTime). */
  now(): number
}

export interface NoteSink {
  /** Play a note at audio time `when`, held for `duration` seconds. */
  playNote(
    part: PartIndex,
    velocity: number,
    note: number | undefined,
    when: number,
    duration: number,
  ): void
  /** Silence notes scheduled to start after `time` (used on stop). */
  cancelAfter(time: number): void
  /** Release held notes (used on stop). */
  releaseAll(): void
}

export interface SequencerSource {
  /** Read on every tick, so edits during playback apply immediately. */
  getPattern(): Pattern
  getBpm(): number
}

export interface SequencerTimer {
  set(fn: () => void, ms: number): unknown
  clear(handle: unknown): void
}

export interface SequencerOptions {
  /** How far ahead notes are scheduled, seconds. */
  lookahead?: number
  /** How often the scheduler wakes up, ms. */
  interval?: number
  /** Delay between pressing Play and the first step, seconds. */
  startDelay?: number
  timer?: SequencerTimer
}

/** Duration of one 16th-note step in seconds. */
export function stepDuration(bpm: number): number {
  return 60 / bpm / (STEPS_PER_BAR / 4)
}

export interface ScheduledStep {
  /** Index within the pattern, 0..length-1. */
  step: number
  /** Audio time the step starts. */
  time: number
}

const defaultTimer: SequencerTimer = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
}

/** How many recent steps are kept for playhead lookup. */
const HISTORY = 64

export class Sequencer {
  private readonly lookahead: number
  private readonly interval: number
  private readonly startDelay: number
  private readonly timer: SequencerTimer

  private playing = false
  private handle: unknown = null
  /** Absolute step counter since Play (not wrapped). */
  private stepCounter = 0
  private nextStepTime = 0
  private history: ScheduledStep[] = []
  private listeners = new Set<(playing: boolean) => void>()
  /** Steps dropped because the scheduler woke up too late (diagnostics). */
  skippedSteps = 0

  constructor(
    private readonly clock: SequencerClock,
    private readonly source: SequencerSource,
    private readonly sink: NoteSink,
    options: SequencerOptions = {},
  ) {
    this.lookahead = options.lookahead ?? 0.12
    this.interval = options.interval ?? 25
    this.startDelay = options.startDelay ?? 0.05
    this.timer = options.timer ?? defaultTimer
  }

  get isPlaying(): boolean {
    return this.playing
  }

  onPlayingChange(listener: (playing: boolean) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Start from step 1 of the pattern. */
  start(): void {
    if (this.playing) return
    this.playing = true
    this.stepCounter = 0
    this.skippedSteps = 0
    this.history = []
    this.nextStepTime = this.clock.now() + this.startDelay
    this.emit()
    this.loop()
  }

  /** Stop and silence anything not yet played. */
  stop(): void {
    if (!this.playing) return
    this.playing = false
    if (this.handle !== null) this.timer.clear(this.handle)
    this.handle = null
    const now = this.clock.now()
    this.sink.cancelAfter(now)
    this.sink.releaseAll()
    this.history = []
    this.emit()
  }

  toggle(): void {
    if (this.playing) this.stop()
    else this.start()
  }

  /**
   * Schedule every step that starts before now + lookahead. Called by the
   * internal timer; exposed for tests.
   */
  tick(): void {
    if (!this.playing) return
    const now = this.clock.now()
    const pattern = this.source.getPattern()
    const length = pattern.lengthBars * STEPS_PER_BAR

    // If the scheduler was starved (e.g. the machine stalled), skip the missed
    // steps instead of firing them all at once, and stay on the grid.
    while (this.nextStepTime < now - 0.05) {
      this.advance()
      this.skippedSteps++
    }

    while (this.nextStepTime < now + this.lookahead) {
      const step = this.stepCounter % length
      this.scheduleStep(pattern, step, this.nextStepTime)
      this.history.push({ step, time: this.nextStepTime })
      if (this.history.length > HISTORY) this.history.shift()
      this.advance()
    }
  }

  /** The step sounding at audio time `time` (for the playhead), or null. */
  stepAt(time: number): ScheduledStep | null {
    for (let i = this.history.length - 1; i >= 0; i--) {
      const entry = this.history[i]!
      if (entry.time <= time) return entry
    }
    return null
  }

  dispose(): void {
    this.stop()
    this.listeners.clear()
  }

  private advance(): void {
    // Read BPM per step so tempo changes take effect on the next step.
    this.nextStepTime += stepDuration(this.source.getBpm())
    this.stepCounter++
  }

  private scheduleStep(pattern: Pattern, step: number, time: number): void {
    const dur = stepDuration(this.source.getBpm())
    for (let p = 0; p < PART_COUNT; p++) {
      const s = pattern.tracks[p]?.steps[step]
      if (!s?.active) continue
      const velocity = Math.max(1, Math.round(s.velocity * 127))
      const duration = Math.max(0.01, dur * s.gate)
      const notes = s.notes.length > 0 ? s.notes : [undefined]
      for (const note of notes) this.sink.playNote(p as PartIndex, velocity, note, time, duration)
    }
  }

  private loop = (): void => {
    if (!this.playing) return
    this.tick()
    this.handle = this.timer.set(this.loop, this.interval)
  }

  private emit(): void {
    for (const l of this.listeners) l(this.playing)
  }
}
