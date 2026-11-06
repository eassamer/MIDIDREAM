# ELECTRIBE MINI --- Product Spec & Development Roadmap

A personal, standalone groovebox for macOS inspired by the workflow of
the Korg Electribe, built around the Akai MPK Mini.

> **Product goal:** Make a fast, hands-on music-making app where the MPK
> Mini controls parts, patterns, sequencing, sound shaping, and live
> performance. This is an original application inspired by the Electribe
> workflow---not a clone of its proprietary software or interface
> assets.

------------------------------------------------------------------------

## 1. Product vision

ELECTRIBE MINI is a local-first desktop music instrument. It should feel
like a hardware groovebox: immediate, visual, playable, and usable
without opening a DAW.

Core experience:

1.  Choose one of eight parts.
2.  Load or create a sound for that part.
3.  Program a rhythm or melody on a 16-step grid.
4.  Mute, unmute, and perform parts from the MPK Mini.
5.  Shape the sound with knobs and effects.
6.  Arrange patterns into a song or live set.
7.  Save the project on the computer and export audio.

The interface should prioritize performance and speed over deep menus.
Important actions should be reachable from the main screen.

## 2. Target platform and technical direction

### Recommended first target: macOS desktop app

Build the application as a desktop program that can be installed and
launched like any other Mac app.

**Recommended stack**

-   **Electron** --- desktop shell and Chromium runtime. A practical
    choice for reliable Web MIDI support and a consistent browser-based
    UI.
-   **React + TypeScript + Vite** --- interface and development tooling.
-   **Tone.js / Web Audio API** --- sample playback, synthesis, effects,
    transport, and audio scheduling.
-   **Web MIDI API** --- MIDI input from the Akai MPK Mini; add MIDI
    output later if needed.
-   **Zustand** --- application and project state.
-   **IndexedDB or local project files** --- autosave and project
    persistence.
-   **CSS** --- custom hardware-inspired interface.

Keep the audio engine independent from React. UI components should send
commands to the engine and subscribe to state; they should not implement
audio scheduling themselves.

### Why Electron first?

Electron packages a Chromium-based app, which makes it a straightforward
route for reusing Web MIDI and Web Audio code. Tauri is a possible later
alternative, but its macOS WebView/MIDI support may require extra native
integration. Choose Tauri only after verifying the exact MIDI and audio
requirements in a proof of concept.

### Desktop application requirements

-   Launch from Applications / Dock.
-   Work offline after installation.
-   Detect and reconnect to the MPK Mini.
-   Store projects and user samples locally.
-   Remember the last-used audio and MIDI settings.
-   Provide a clear audio-device and MIDI-device settings screen.
-   Package a signed/notarized macOS build when preparing distribution.
-   Do not require a cloud account or paid API for normal music-making.

------------------------------------------------------------------------

## 3. Main instrument layout

### Eight parts

Start with eight independently configurable parts:

  Part   Typical role   Suggested default
  ------ -------------- ----------------------
  1      KICK           Kick sample
  2      SNARE          Snare sample
  3      CLOSED HH      Closed hi-hat
  4      OPEN HH        Open hi-hat
  5      PERC           Percussion sample
  6      BASS           Bass synth or sample
  7      SYNTH          Synth voice
  8      SAMPLE         User sample / vocal

Each part should have:

-   Name and color or visual identity.
-   Mute and solo.
-   Volume and pan.
-   Sample or instrument assignment.
-   Pitch/tuning.
-   Filter and envelope controls.
-   Effect sends.
-   Step sequence and automation data.
-   Optional choke-group assignment.

Allow the user to rename parts and change their sound type.

### Main screen

The main screen should contain:

-   Transport: Play, Stop, Record, BPM, Swing, Tap Tempo.
-   Pattern selector and pattern length.
-   Eight part selectors with mute/solo states.
-   16-step sequencer.
-   Selected-part sound controls.
-   Sample/instrument browser.
-   Master level and output meter.
-   MIDI connection indicator.
-   Clear visual playhead and active-step feedback.

Use a resizable layout. Keep the sequencer and transport visible during
normal use.

------------------------------------------------------------------------

## 4. MPK Mini control model

The MPK Mini is the primary performance controller.

> **MIDI-first rule (added 2026-11-06):** every music-making action must
> be reachable from the MPK through MIDI Learn. The mouse UI is a
> secondary way in and the place for visual feedback (modes, playhead,
> values). A feature is not done if it only works with the mouse.

### Pad modes

Provide switchable pad modes:

**A. Part Mute mode** - Map the eight pads to the eight parts. - Each
pad toggles its part between muted and unmuted. - Multiple parts can
remain muted at once. - Show mute state clearly in the UI. - Optional
alternate behavior: hold a modifier to solo a part.

**B. Part Select mode** - Each pad selects one of the eight parts. -
Selecting a part updates the sequencer, sound controls, and sample
browser.

**C. Step Input mode** - Pads or another selected input method can enter
notes/steps. - Support multiple active steps and clear visual feedback.

**D. Performance mode** - Trigger sounds directly. - Support
rolls/stutters and other performance actions where practical.

Do not assume the MPK Mini's pad note numbers or knob CC numbers.
Implement MIDI Learn and save the user's mappings in preferences.

### Knobs

Provide a MIDI Learn workflow:

1.  Select a parameter in the app.
2.  Click Learn.
3.  Move a physical MPK knob.
4.  Store the incoming CC and MIDI channel.
5.  Show the assigned control and allow it to be cleared or remapped.

Suggested default parameter layout after mapping:

  Knob   Suggested assignment
  ------ ----------------------
  K1     Filter cutoff
  K2     Filter resonance
  K3     Attack
  K4     Decay
  K5     Sample start
  K6     Sample end
  K7     Pitch
  K8     Effect send

These are suggestions, not hardcoded MPK assignments. Allow per-part
mappings and optional global mappings.

### Keyboard

-   Play pitched instruments and samples chromatically.
-   Support octave up/down.
-   Optional scale highlighting and scale quantization.
-   Record notes into the selected part.
-   Record note length and velocity.
-   Provide a way to choose the keyboard's target part.

### Joystick and hardware controls

If the controller exposes joystick or other controls as MIDI messages,
allow them to be MIDI-learned. Suggested uses:

-   X axis: pitch bend.
-   Y axis: modulation or filter modulation.
-   Note Repeat: retrigger/roll mode if its MIDI behavior is available.
-   Full Level: optional fixed-velocity mode if its MIDI behavior is
    available.

Detect actual messages before assigning behavior. Do not assume every
hardware feature sends a MIDI message accessible to the app.

------------------------------------------------------------------------

## 5. Sequencer and pattern system

### Step sequencer

-   16 steps per bar.
-   Four beats per bar, with 16th-note steps by default.
-   Click/tap steps to toggle them on or off.
-   Allow multiple active steps per part.
-   Per-step velocity.
-   Clear selected step or clear the part pattern.
-   Playhead follows playback accurately.
-   Support step entry while playing and recording.

### Pattern length and bars

Treat **16 steps as one bar**, not the entire pattern.

Support pattern lengths from 1 to 16 bars. The grid should let the user
navigate bars while preserving the same step-editing workflow. Make the
active bar obvious.

### Timing and groove

-   BPM and time signature.
-   Swing amount.
-   Per-step microtiming.
-   Probability per step.
-   Ratchets/retriggers per step.
-   Step accent.
-   Note length/gate.
-   Optional flam and humanize functions.

### Melodic sequencing

For pitched parts:

-   Store note pitch, velocity, and gate length per step.
-   Allow multiple notes on a step for chords, if supported by the
    chosen instrument model.
-   Provide piano-roll editing as a complementary view, not a
    replacement for the fast step grid.
-   Quantize recorded notes to the selected grid while preserving an
    optional unquantized mode.

### Pattern management

-   Multiple patterns per project.
-   Duplicate, rename, clear, and reorder patterns.
-   Pattern switching during playback.
-   Quantized pattern changes at bar or pattern boundaries.
-   Pattern chaining.
-   Song/arrangement mode to sequence patterns into a longer
    composition.

------------------------------------------------------------------------

## 6. Sound engine

### Sound sources

Support these sound types:

1.  **One-shot sample** --- drums, hits, vocals, and effects.
2.  **Looping sample** --- sustained or repeating audio.
3.  **Synth voice** --- bass, lead, and simple melodic sounds.
4.  **User-imported audio** --- common formats such as WAV and AIFF; add
    other formats only after testing.

### Sample browser and editor

-   Browse built-in and user sample folders.
-   Search and filter samples.
-   Preview a sample before loading it.
-   Next/previous sample navigation.
-   Display waveform.
-   Set start and end points.
-   Reverse playback.
-   Pitch and tuning.
-   Playback mode: one-shot, gated, or loop.
-   Sample slicing as a later feature.
-   Choke groups for mutually exclusive sounds, such as open/closed
    hi-hats.
-   Normalize or trim only if the operation is clearly non-destructive
    or offers an undo path.

Keep the original audio file unchanged. Store trim, pitch, reverse, and
playback settings as project parameters.

### Per-part synthesis and shaping

For sample and synth parts, provide an appropriate subset of:

-   Volume and pan.
-   Pitch.
-   Filter type, cutoff, and resonance.
-   Amp envelope: attack, decay, sustain, release.
-   Filter envelope where appropriate.
-   LFO and modulation.
-   Drive/saturation.
-   Effect sends.

Do not show irrelevant controls for a sound type that cannot use them.

### Effects

Start with useful, lightweight effects:

-   Filter.
-   Reverb.
-   Delay.
-   Distortion/drive.
-   Chorus.
-   Compressor/limiter on the master.

Provide per-part effect sends and a master effects section. Avoid
uncontrolled feedback or excessive output levels; include sensible gain
staging.

------------------------------------------------------------------------

## 7. Recording, automation, and performance

### Recording

-   Record live pad and keyboard input into the selected part.
-   Record quantized or unquantized.
-   Record knob movement as automation.
-   Overdub without deleting existing steps.
-   Provide clear Record and Overdub states.

### Automation / motion sequencing

-   Automate selected parameters over time.
-   Record parameter movement from MIDI knobs.
-   Edit automation points.
-   Loop automation with its pattern.
-   Support per-part automation and selected global parameters.

### Performance tools

Later additions:

-   Roll/stutter.
-   Fill mode.
-   Temporary part mute groups.
-   Randomize selected steps.
-   Randomize velocity or probability.
-   Repeat last bar.
-   Pattern launch quantization.
-   Scene or song-section switching.

Performance features should be predictable and reversible. Provide an
obvious way to exit temporary modes.

------------------------------------------------------------------------

## 8. Projects, files, and export

### Project saving

A project should preserve:

-   Tempo, swing, meter, and pattern settings.
-   All patterns and their step/note data.
-   Part names and assignments.
-   Sample references and sound parameters.
-   MIDI mappings.
-   Automation.
-   Mixer and effect settings.

Use a portable project format. Prefer a project folder or archive
containing a JSON project document and any audio assets that need to
travel with it. Avoid silently embedding huge files in JSON.

### File operations

-   New, Open, Save, Save As.
-   Autosave and crash recovery.
-   Missing-sample detection with relink option.
-   Recent projects.
-   User sample library location setting.
-   Import audio by file picker and drag-and-drop.

### Audio export

-   Export the full arrangement or selected pattern.
-   WAV export first; add other formats later.
-   Choose sample rate and bit depth where supported.
-   Render offline if the engine supports deterministic offline
    rendering.
-   Show export progress and destination.
-   Avoid clipping; provide peak meter and sensible master output
    defaults.

------------------------------------------------------------------------

## 9. MIDI, audio, and reliability requirements

-   Select MIDI input device.
-   Connect/disconnect and reconnect safely.
-   Handle device unplug/replug.
-   Show incoming MIDI events in a diagnostic view.
-   Support MIDI Learn for notes and CCs.
-   Handle MIDI note-on and note-off correctly.
-   Respect velocity.
-   Support MIDI channels and configurable mappings.
-   Select audio output device where supported by the desktop runtime.
-   Provide master meter and a way to stop all sound immediately.
-   Handle browser/audio context suspension and resume.
-   Never use React render cycles or `setInterval` as the authoritative
    sequencer clock.
-   Schedule events against the audio clock.
-   Keep timing stable when the UI is busy.
-   Avoid stuck notes when stopping playback, changing patterns, muting
    parts, or disconnecting MIDI.

------------------------------------------------------------------------

## 10. Development roadmap

Build in milestones. Finish and verify each milestone before starting
the next. Do not implement the entire product in one giant change.

### Progress log

**Milestone 0 --- done (2026-11-06).**

- Stack: Electron 45 + electron-vite 6, React 19, TypeScript 6, Vite 8,
  Zustand 5, Vitest 5, ESLint 10 + typescript-eslint, Prettier.
- Layout: `electron/main` (window, sandboxed, context isolation),
  `electron/preload` (minimal `window.desktop` bridge), `src/project`
  (types, pure model ops, JSON serializer with invariant checks),
  `src/state` (vanilla Zustand store + React hook), `src/audio/commands.ts`
  (typed engine command contract only), `src/components` (part
  selector, 16-step grid with bar navigation and pattern length).
- An ESLint rule blocks React/UI imports from `audio`, `midi`,
  `sequencer`, `project`, and `persistence`.
- Checks: `npm run check` (typecheck, lint, 13 unit tests) and
  `npm run build` pass; built app and `npm run dev` both open the window.
- Known limitations: no sound, no MIDI, no persistence yet; the step grid
  edits in-memory data only. Not yet packaged as a `.app`.

**Milestone 1 --- implemented, awaiting hardware sign-off (2026-11-06).**

- `src/midi/messages.ts`: raw bytes to typed events (note on/off with
  velocity-0 note-off, CC, 14-bit pitch bend, program, pressure, system).
- `src/midi/MidiManager.ts`: Web MIDI access, input list, select input,
  remembers the device by name, detaches on unplug and reattaches on
  replug. Auto-picks an input named "MPK" only when no device was chosen.
- `src/midi/mapping.ts` + `MidiController.ts`: MIDI Learn for Pads 1--8,
  Knobs 1--8, Joystick X/Y, and Keyboard (channel). Bindings come only from
  received messages; a control can drive one target; pad notes win over the
  keyboard channel. Mappings and device are saved to `preferences.json` in
  the app's userData folder via IPC.
- MIDI Setup view: device selector, learn table with activity LEDs and
  last values, live monitor (clock/realtime hidden by default). Status bar
  shows connection state.
- Electron grants `midi` and `midiSysex` to the app's own pages only
  (Chromium requests `midiSysex` even for `sysex: false`); the renderer
  gets `sysexEnabled=false` and opens no outputs.
- Verified: 39 unit tests (fake MIDI device for unplug/replug), build, and
  the real app detects a connected "MPK mini 3". Pressing pads, turning
  knobs, and replugging were **not** tested on hardware yet.
- Known limitations: learned controls only light LEDs; they do not
  control parts yet (pad modes are Milestone 4, knob parameters
  Milestone 6). No per-part knob mappings yet. Running-status MIDI bytes
  are ignored.
- **Next:** Milestone 2 --- independent audio engine with eight parts,
  sample playback, one synth voice, and panic.

**Milestone 2 --- implemented (2026-11-06).**

- `src/audio/AudioEngine.ts`: plain Web Audio (no Tone.js), independent of
  React. Per part: input -> stereo panner -> fader; master gain -> safety
  limiter -> analyser. Sample voices (one-shot / gated / loop, trim,
  reverse, pitch) and a synth voice (oscillator -> filter -> ADSR).
  Velocity, mute/solo, choke groups (hats), 16-voice cap per part, fast
  fades on cut, panic, `releaseAll` on MIDI disconnect.
- `src/audio/builtinSamples.ts`: six drum/stab sounds synthesized in code
  (deterministic, normalized) and assigned to parts 1--5 and 8; parts 6--7
  are synth voices.
- `src/app/wiring.ts`: project store -> engine; learned pads trigger parts
  1--8 (performance routing), keyboard plays the selected part
  chromatically, with note-off going to the part that started the note.
- UI: per-part play pad (hold to sustain), mute + solo, volume/pan/pitch
  and waveform (synth only); master volume, peak meter with clip light,
  Stop sound button and Cmd+. ; Audio view with status, sample rate,
  latency, and an offline self-test of every part and the full mix.
- Electron autoplay policy relaxed so audio starts without a click; a
  suspended context resumes on the next click.
- Verified: 55 unit tests (fake AudioContext), build, real-app self-test
  (all parts audible, full mix peak about -0.8 dBFS, no clipping), live
  output meter moved while the MPK pads were played. Listening quality
  and latency feel were not judged by me.
- Known limitations: no output-device picker yet (uses system default);
  `outputLatency` reads 0 on this machine; no sample import yet; part
  controls do not have MIDI Learn yet (Milestone 6).
- **Next:** Milestone 3 --- 16-step sequencer with audio-clock
  scheduling, transport, BPM, and playhead.

**Milestone 3 --- implemented (2026-11-06).**

- `src/sequencer/Sequencer.ts`: lookahead scheduler. A 25 ms timer only
  wakes it; every note is placed on the AudioContext clock up to 120 ms
  ahead. Reads the pattern and BPM on every tick, so step edits and tempo
  changes apply to the next unscheduled step. Loops at the pattern length
  (1--16 bars), restarts from step 1 on Play, skips (rather than bursts)
  steps missed during a stall. Clock, pattern source, and note output are
  injected, so timing is unit-tested without audio.
- Engine: notes with a duration (gate) release themselves; `cancelAfter`
  silences notes scheduled but not yet started, so Stop never lets a
  queued note through. Stop also releases held notes.
- Playhead follows the audio clock minus reported output latency (visual
  only; it does not drive timing).
- UI: Play/Stop (Space), editable BPM (type, arrows, Shift = ±10), tap
  tempo, playhead highlight and "playing bar" indicator, velocity lane
  (drag to draw, double-click resets), step brightness by velocity,
  Clear part, Clear pattern, Double (repeat bars to double the length).
- Electron `backgroundThrottling` is off so the scheduler keeps waking
  when the window is in the background.
- Verified: 70 unit tests (exact step times, 100-bar loop with no drift,
  multi-bar length, edits and tempo changes mid-play, stop/cancel, stall
  skipping, playhead lookup); in the real app at 120 BPM the playhead
  advanced every 125.0 ms on average (expected 125 ms, about ±1 ms frame
  jitter), Stop cleared it, no console errors; no horizontal overflow at
  1280 or 960 px. Audible timing was not judged by me.
- Known limitations: swing, probability, ratchets, accent, microtiming,
  and pattern switching are Milestone 4; the grid does not auto-follow the
  playing bar; steps cannot be entered from the MPK yet.
- **Next:** Milestone 3.5 --- MIDI-first control (operate transport,
  modes, step entry, and part sound from the MPK; see below). Planned,
  not started. A first draft of the router was written then set aside on
  request so it can be built in its own milestone.

### Milestone 0 --- Project foundation

**Goal:** Establish a maintainable app structure.

Tasks: - Set up React, TypeScript, Vite, and the chosen desktop shell. -
Define folders for UI, audio engine, MIDI, project model, persistence,
and tests. - Add shared types for parts, patterns, steps, instruments,
and projects. - Add linting/formatting and basic tests. - Confirm the
app launches as a desktop window.

**Acceptance checks:** - App starts on the target Mac. - TypeScript
checks pass. - A minimal project can be created in memory. - Audio/MIDI
code is not coupled to React components.

### Milestone 1 --- MIDI connection and hardware mapping

**Goal:** Reliably detect and learn the MPK Mini's controls.

Tasks: - List available MIDI input devices. - Connect to the MPK Mini. -
Display incoming note-on, note-off, CC, pitch-bend, and other relevant
messages. - Build MIDI Learn for pads, knobs, keyboard, and joystick if
available. - Persist mappings. - Handle disconnect and reconnect.

**Acceptance checks:** - Every pad and knob can be identified from
actual messages. - Keyboard note-on/off and velocity are received
correctly. - A mapping survives app restart. - No assumed MIDI note/CC
numbers are required.

### Milestone 2 --- Audio engine and playable parts

**Goal:** Make the app produce sound reliably.

Tasks: - Create an independent audio engine. - Add eight parts and part
selection. - Implement sample playback and one basic synth voice. - Add
part volume, pan, pitch, and mute. - Add master output and
panic/stop-all-sound. - Add a simple audio test and latency check.

**Acceptance checks:** - Each part can be triggered independently. -
Multiple parts can play simultaneously. - Mute/unmute works without
stuck notes. - Audio remains stable during normal UI interaction.

### Milestone 3 --- 16-step sequencer

**Goal:** Program and play a one-bar rhythm.

Tasks: - Build the 16-step grid. - Add per-part step data. - Implement
audio-clock scheduling and transport. - Add BPM, play, stop, and visual
playhead. - Add step velocity and clear/duplicate operations.

**Acceptance checks:** - A programmed pattern loops accurately. - The
playhead stays aligned with audio. - Editing steps during playback does
not crash or corrupt the pattern. - Stopping playback clears scheduled
events safely.

### Milestone 3.5 --- MIDI-first control

**Goal:** Run everything built so far from the MPK mini 3 without
touching the mouse. Everything below is MIDI-learned; no note or CC
numbers are assumed.

Control layout (agreed 2026-11-06, "mix of both" + "keys as steps"):

  Control               Default job
  --------------------- ---------------------------------------------
  Pads, Bank A (1--8)   The 8 parts, behaviour set by pad mode
  Pad mode              Trigger (play) / Mute / Select part
  Bank B pads / keys    Function buttons (learnable, see below)
  16 step keys          In Step mode: toggle steps 1--16 of the
                        selected part on the visible bar
  Remaining keys        Play the selected part (Play mode)
  Knobs K1--K8          Each has a selectable job (see below)

Function buttons (each learnable to any pad or key): Play/Stop, Stop all
sound, Pad mode (cycle Trigger → Mute → Select), Keys mode (Play notes ↔
Step entry), Bar −, Bar +, Clear part.

Default knob jobs (changeable per knob, saved in preferences): K1 part
volume, K2 part pan, K3 part pitch, K4 none, K5 none, K6 pad mode
(three zones), K7 tempo (60--200 BPM), K8 master volume. Filter and
envelope jobs join this list in Milestone 6.

Tasks:
- Extend MIDI Learn with function buttons, a "step keys" range (learn
  the key for step 1; the next 15 keys follow), and per-knob jobs.
- Pure, unit-tested router: (learned control, message, current modes)
  -> app actions; the app executes them. Specific controls win over the
  step-key range, which wins over the keyboard channel.
- Pad modes Trigger / Mute / Select (moved here from Milestone 4).
- Keys mode Play / Step. In Step mode, key velocity becomes the step
  velocity and the step is auditioned when the sequencer is stopped.
- On-screen feedback: current pad mode and keys mode always visible;
  step numbers show which key plays them; knob job and value shown in
  the MIDI view.
- Learn table grouped as Pads, Knobs (with job selector), Buttons, Step
  keys, Joystick & keyboard.

**Acceptance checks:**
- With the mouse unplugged, the user can: start/stop, switch pad and
  keys modes, select a part, program a 1-bar beat with the keys, move
  between bars, mute parts from the pads, change tempo, part volume,
  pan and pitch from knobs, and stop all sound.
- Mappings and knob jobs survive a restart.
- No stuck notes when switching keys mode or pad mode while holding
  notes.

**Known constraints:** the MPK's octave buttons shift the notes the keys
send, so step keys must be relearned (or the octave reset) after
shifting. Absolute knobs jump the parameter to the knob position when
you switch parts (no soft takeover yet).

### Milestone 4 --- Multi-bar patterns and performance control

**Goal:** Extend the sequencer into a useful groovebox.

Tasks: - Add pattern lengths from 1 to 16 bars. - Add bar navigation. -
(Pad Mute/Select modes moved to Milestone 3.5.) - Add swing,
probability, ratchets, accent, and microtiming. - Add pattern
duplication and switching.

**Acceptance checks:** - A multi-bar pattern loops for the correct
length. - Multiple parts can be muted simultaneously from pads. - Pad
mappings are user-configurable. - Timing features behave consistently at
different tempos. - Every new feature here (swing, probability, pattern
switching, ...) has a MIDI-learnable control (MIDI-first rule).

### Milestone 5 --- Sample browser and editor

**Goal:** Make samples easy to find and shape.

Tasks: - Add sample import and browser. - Add preview and next/previous
navigation. - Display waveform and editable start/end points. - Add
reverse, pitch, one-shot, gated, and loop modes. - Add choke groups. -
Preserve original source files.

**Acceptance checks:** - User can import, preview, and assign a
sample. - Trim and playback settings save and reload. - Missing samples
are reported and can be relinked. - Editing is non-destructive.

### Milestone 6 --- Filters, envelopes, and effects

**Goal:** Give each part meaningful sound design controls.

Tasks: - Add filter cutoff/resonance and envelope controls. - Add
per-part effect sends. - Add reverb, delay, drive, and chorus. - Add
master compression/limiting and meters. - Connect knobs through MIDI
Learn.

**Acceptance checks:** - Controls update sound without audio dropouts. -
MIDI-learned knobs control the intended parameter. - Master output has
useful metering and avoids unexpected clipping.

### Milestone 7 --- Melodic sequencing and recording

**Goal:** Record bass and synth parts from the MPK keyboard.

Tasks: - Add note pitch, velocity, and gate length. - Add live recording
and overdub. - Add octave controls and optional scale quantization. -
Add piano-roll view. - Add quantize and undo for recording edits.

**Acceptance checks:** - Keyboard notes trigger the selected pitched
part. - Recorded notes play back with the expected pitch, velocity, and
duration. - Overdub preserves existing notes.

### Milestone 8 --- Automation and advanced groove tools

**Goal:** Add expressive performance and motion sequencing.

Tasks: - Record knob movement as automation. - Add editable automation
lanes. - Add LFO/modulation where appropriate. - Add roll/stutter, fill,
randomize, and humanize. - Add temporary mute groups and performance
shortcuts.

**Acceptance checks:** - Automation loops with the correct pattern. -
Recorded movement can be edited and removed. - Performance modes can be
exited safely and do not leave parameters in unexpected states.

### Milestone 9 --- Pattern chaining and song mode

**Goal:** Arrange patterns into a complete track.

Tasks: - Add pattern chain. - Add song/arrangement timeline. - Add
quantized pattern launch. - Add section labels and duplicate/reorder
operations.

**Acceptance checks:** - A saved arrangement plays from beginning to
end. - Pattern changes occur at the selected quantization boundary. -
Arrangement data survives save/reopen.

### Milestone 10 --- Project persistence and export

**Goal:** Make the app usable for real music projects.

Tasks: - Implement Save, Save As, Open, autosave, and recovery. -
Package project audio assets where required. - Add missing-sample
relinking. - Add WAV export for pattern and arrangement. - Add recent
projects and sample-library settings.

**Acceptance checks:** - A project reopens with its patterns, samples,
mappings, automation, and mixer settings intact. - A portable project
can be moved to another folder and reopened. - Exported WAV plays
correctly and has no unexpected silence or clipping.

### Milestone 11 --- Polish and macOS distribution

**Goal:** Make it feel like a finished Mac instrument.

Tasks: - Refine keyboard navigation and shortcuts. - Add settings and
first-run setup. - Add crash/error reporting locally without sending
private project data. - Test different screen sizes and audio devices. -
Test long playback sessions and device disconnects. - Create macOS app
packaging, signing, and notarization workflow.

**Acceptance checks:** - App launches from Applications. - MIDI and
audio devices can be selected and recovered after reconnect. - Core
workflows work offline. - No critical bugs remain in the main
music-making path.

------------------------------------------------------------------------

## 11. Suggested application architecture

Keep the code organized around independent domains:

``` text
src/
  app/
    App.tsx
    routes/
  components/
    transport/
    sequencer/
    parts/
    mixer/
    sample-browser/
    settings/
  audio/
    AudioEngine.ts
    Transport.ts
    PartChannel.ts
    SamplePlayer.ts
    SynthVoice.ts
    EffectsRack.ts
    Scheduler.ts
  midi/
    MidiManager.ts
    MidiLearn.ts
    MidiMappingStore.ts
  sequencer/
    Pattern.ts
    Step.ts
    SequencerEngine.ts
    Groove.ts
  project/
    ProjectModel.ts
    ProjectSerializer.ts
    ProjectManager.ts
  persistence/
    Autosave.ts
    SampleLibrary.ts
  state/
    useAppStore.ts
    useProjectStore.ts
  styles/
```

The exact structure can evolve. Keep boundaries clear:

-   **UI:** displays state and sends user intent.
-   **MIDI layer:** translates hardware messages into app actions.
-   **Sequencer engine:** owns pattern timing and event generation.
-   **Audio engine:** schedules and plays sound.
-   **Project layer:** defines and serializes project data.
-   **Persistence:** stores project files and user preferences.

Use a typed command/event boundary between the UI and audio engine. Do
not let UI components manipulate low-level audio nodes directly.

------------------------------------------------------------------------

## 12. Working with Claude Code

Use Claude Code as an implementation partner, but keep each task small
and verifiable.

For every milestone:

1.  Ask Claude Code to inspect the existing repository before changing
    anything.
2.  Ask it to propose a short implementation plan and list files it
    expects to modify.
3.  Implement one vertical slice at a time.
4.  Require TypeScript checks, tests, and a manual test checklist.
5.  Review the diff before accepting changes.
6.  Commit a working milestone to Git.
7.  Update this roadmap with completed work, known issues, and the next
    milestone.

### Reusable Claude Code instruction

``` text
Read the ELECTRIBE MINI product specification and roadmap first.

Before coding:
- Inspect the existing project and report its current architecture and progress.
- Identify the smallest useful next task in the current milestone.
- Propose the files to create or modify and explain the approach.
- Do not rewrite working systems or expand scope without asking.

While coding:
- Keep the audio engine independent from React.
- Use audio-clock scheduling for sequencer timing.
- Do not assume MIDI note or CC assignments; use detected messages and MIDI Learn.
- Keep project data typed and serializable.
- Do not add paid services or dependencies without approval.
- Do not create fake controls or claim unimplemented features work.

After coding:
- Run the relevant tests, type checks, and build.
- Fix errors introduced by the change.
- Give exact manual test steps for the MPK Mini and audio behavior.
- Summarize changed files, known limitations, and the next smallest task.
- Do not claim hardware testing unless it was actually performed.
```

### Important development rule

Do not ask the coding agent to build every milestone in one prompt. Give
it one milestone and one small deliverable at a time. Audio timing, MIDI
behavior, sample handling, and project persistence each need real
testing.

------------------------------------------------------------------------

## 13. Definition of a successful first release

The first usable release should do these things reliably:

-   Launch as a standalone macOS application.
-   Connect to the Akai MPK Mini.
-   Let the user MIDI-learn pads and knobs.
-   Trigger eight independent parts.
-   Mute and select parts from the pads.
-   Program and loop multi-bar 16th-note patterns.
-   Play samples and a basic synth.
-   Shape parts with filters and essential effects.
-   Save and reopen projects locally.
-   Export a WAV file.

Everything else can follow as later milestones. A stable, playable core
is more valuable than a large interface full of unfinished controls.
