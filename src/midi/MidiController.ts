import type { PreferenceStore } from '../persistence/preferences'
import { MIDI_LOG_LIMIT, type MidiLogEntry, type MidiStore } from '../state/midiStore'
import { MidiManager } from './MidiManager'
import { sanitizeKnobJobs, type KnobJob } from './knobJobs'
import {
  MAPPINGS_SCHEMA_VERSION,
  assignBinding,
  bindingFromEvent,
  clearBinding,
  getTarget,
  matchEvent,
  sanitizeMappings,
  type KnobId,
  type LearnTargetId,
  type MidiMappings,
  type StoredMappings,
} from './mapping'
import { describeEvent, isRealtime, noteName, type MidiEvent } from './messages'

export const PREF_MIDI_INPUT = 'midi.inputName'
export const PREF_MIDI_MAPPINGS = 'midi.mappings'
export const PREF_MIDI_KNOB_JOBS = 'midi.knobJobs'

/** How often batched log lines are pushed to the store (UI only, not timing-critical). */
const LOG_FLUSH_MS = 50

/**
 * Glue between the MidiManager, the MIDI store, and preferences.
 * Handles MIDI Learn and routes incoming messages to learned controls.
 */
export class MidiController {
  private pendingLog: MidiLogEntry[] = []
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private nextLogId = 1
  private savedInputName: string | null = null
  private started = false
  private controlListeners = new Set<(targets: LearnTargetId[], e: MidiEvent) => void>()

  constructor(
    private readonly store: MidiStore,
    private readonly prefs: PreferenceStore,
    readonly manager: MidiManager = new MidiManager(),
  ) {}

  async start(): Promise<void> {
    if (this.started) return
    this.started = true

    const [inputName, storedMappings, storedKnobJobs] = await Promise.all([
      this.prefs.get<string>(PREF_MIDI_INPUT),
      this.prefs.get<StoredMappings>(PREF_MIDI_MAPPINGS),
      this.prefs.get<unknown>(PREF_MIDI_KNOB_JOBS),
    ])
    this.savedInputName = typeof inputName === 'string' ? inputName : null
    this.store.setState({
      mappings: sanitizeMappings(storedMappings),
      knobJobs: sanitizeKnobJobs(storedKnobJobs),
    })

    this.manager.onChange((snapshot) => {
      this.store.setState({ snapshot })
      if (snapshot.preferredName !== this.savedInputName) {
        this.savedInputName = snapshot.preferredName
        void this.prefs.set(PREF_MIDI_INPUT, snapshot.preferredName)
      }
    })
    this.manager.onEvent((e) => this.handleEvent(e))
    await this.manager.start(this.savedInputName)
  }

  /** Subscribe to messages from learned controls (the app routes them to actions). */
  onControl(listener: (targets: LearnTargetId[], e: MidiEvent) => void): () => void {
    this.controlListeners.add(listener)
    return () => this.controlListeners.delete(listener)
  }

  selectInput(id: string | null): void {
    this.manager.selectInput(id)
  }

  beginLearn(target: LearnTargetId): void {
    this.store.setState({ learning: target })
  }

  cancelLearn(): void {
    this.store.setState({ learning: null })
  }

  clearMapping(target: LearnTargetId): void {
    this.setMappings(clearBinding(this.store.getState().mappings, target))
  }

  setKnobJob(knob: KnobId, job: KnobJob): void {
    const knobJobs = { ...this.store.getState().knobJobs, [knob]: job }
    this.store.setState({ knobJobs })
    void this.prefs.set(PREF_MIDI_KNOB_JOBS, knobJobs)
  }

  clearAllMappings(): void {
    this.setMappings({})
  }

  setShowRealtime(show: boolean): void {
    this.store.setState({ showRealtime: show })
  }

  clearLog(): void {
    this.pendingLog = []
    this.store.setState({ log: [] })
  }

  dispose(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer)
    this.manager.dispose()
  }

  /** Exposed for tests and for a future virtual keyboard: process one event. */
  handleEvent(e: MidiEvent): void {
    const state = this.store.getState()

    if (state.learning) {
      const binding = bindingFromEvent(getTarget(state.learning).kind, e)
      if (binding) {
        this.setMappings(assignBinding(state.mappings, state.learning, binding))
        this.store.setState({ learning: null })
      }
    }

    const { mappings } = this.store.getState()
    const targets = matchEvent(mappings, e)
    if (targets.length > 0) {
      const activity = { ...this.store.getState().activity }
      const values = { ...this.store.getState().values }
      const value = valueText(e)
      for (const t of targets) {
        activity[t] = (activity[t] ?? 0) + 1
        if (value !== null) values[t] = value
      }
      this.store.setState({ activity, values })
      for (const l of this.controlListeners) l(targets, e)
    }

    this.queueLog({
      id: this.nextLogId++,
      time: e.time,
      text: describeEvent(e),
      realtime: isRealtime(e),
      targets,
    })
  }

  private setMappings(mappings: MidiMappings): void {
    this.store.setState({ mappings })
    const stored: StoredMappings = { version: MAPPINGS_SCHEMA_VERSION, mappings }
    void this.prefs.set(PREF_MIDI_MAPPINGS, stored)
  }

  private queueLog(entry: MidiLogEntry): void {
    if (entry.realtime && !this.store.getState().showRealtime) return
    this.pendingLog.push(entry)
    if (this.flushTimer === null) {
      this.flushTimer = setTimeout(() => this.flushLog(), LOG_FLUSH_MS)
    }
  }

  /** Synchronously push queued log lines to the store. */
  flushLog(): void {
    this.flushTimer = null
    if (this.pendingLog.length === 0) return
    const log = [...this.pendingLog.reverse(), ...this.store.getState().log].slice(
      0,
      MIDI_LOG_LIMIT,
    )
    this.pendingLog = []
    this.store.setState({ log })
  }
}

function valueText(e: MidiEvent): string | null {
  switch (e.type) {
    case 'noteon':
      return `${noteName(e.note)} vel ${e.velocity}`
    case 'noteoff':
      return `${noteName(e.note)} off`
    case 'cc':
      return String(e.value)
    case 'pitchbend':
      return String(e.value)
    case 'program':
      return `prog ${e.program}`
    default:
      return null
  }
}
