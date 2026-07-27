# Audio event trace (§ Step 11)

Since a screenshot can't demonstrate sound, this is the exact playback order and
timing produced by the audio framework. It is derived from the typed manifest
(`lib/audio/manifest.ts`) and the scheduled sequences (`lib/audio/sequence.ts`),
and it is asserted by the tests in `lib/audio/audio.test.ts` — so this trace
stays true to the code.

Every asset below is a **placeholder** (synthesized tone / filtered noise, or a
silent captioned line for voice) — `replacementStatus: "placeholder"`,
`licensingStatus: "placeholder"`. None is a final licensed asset.

## Dispatch (console mount)

| t (mm:ss) | event | channel | caption (source) | note |
|-----------|-------|---------|------------------|------|
| 00:00 | `dispatch_alert` | dispatch_radio | "Dispatch alert tone" (Dispatch) | one-shot, 3000 ms |

## Fire-engine arrival sequence (scheduled on the shared mission clock)

Offsets are seconds from the moment the engine arrives. One-shot cues are keyed
so a rerender cannot replay them.

| offset | event | channel | caption (source) |
|--------|-------|---------|------------------|
| +0s | `siren_approach` | emergency_warning | "Siren approaching" (Scene Audio) |
| +2s | `siren_wind_down` | emergency_warning | "Siren winding down" (Scene Audio) |
| +3s | `air_brakes` | scene_patient | "Air brakes hiss" (Scene Audio) |
| +4s | `engine_idle` (loop) | scene_patient | "Fire engine idling" (Scene Audio) |
| +4s | `ron_engine_here` | partner_ron | "Engine’s here—here they come!" (Partner Ron) |
| +9s | `fire_officer_offer` | partner_ron | "Medic 3, what can we do to help?" (Fire Officer) |

Air brakes always precede engine idle; the fire officer's line is exactly 5 s
after Ron's line.

## Scene Dynamics (escalation-driven)

Volume tracks the existing 10s-then-5s escalation stages (no second timer):

| distraction | stage 1 vol | stage (max) vol | on manage / resolve |
|-------------|-------------|-----------------|---------------------|
| `television` | ~0.4 | ~0.9 | stopped |
| `crowd` | ~0.4 | ~0.9 | stopped |
| `traffic` | ~0.4 | ~0.9 | stopped |

## Clinical gating (audio never reveals a finding early)

| event | plays only after |
|-------|------------------|
| `monitor_startup`, `ecg_tone`, `pulse_ox_tone`, `bp_cuff`, `defib_charging`, `shock_ready`, `pacing_cue` | the **apply monitor** task completes |
| `twelve_lead_tone` | the **12-lead** task completes |
| `suction` | portable suction is on scene and in use |
| `oxygen_flow` | the airway bag is on scene |
| `iv_pump_alarm` | the IV pump is on scene |

Before those conditions, the controller **rejects** the playback request in
typed logic (`lib/audio/gating.ts`) — no sound and no caption.

## Reduced Sensory Mode

Nonessential audio (rain, wind, traffic, crowd, TV, general scene) is lowered to
~35% of its level; essential cues (dispatch, siren, defib/shock/pacing alarms,
Partner Ron) are preserved at full level. This is distinct from Mute, which
silences everything while captions still appear.
