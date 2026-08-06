'use client';

import { useEffect, useRef, useState } from 'react';
import { DEFAULT_SIMULATOR_CONFIG, type SimulatorConfig } from '@/lib/engine/config';
import type { MissionClock } from '@/lib/engine/missionClock';
import {
  WINDSHIELD_CATEGORY_LABELS,
  windshieldFactor,
  SCENE_LIGHT_OPTIONS,
  BALLISTIC_PPE_OPTIONS,
  RON_SCENE_LINES,
  SAFE_TO_ENTER,
  NOT_SAFE_TO_ENTER,
  type SceneConfig,
  type WindshieldCategory,
} from '@/lib/opsim/scene';
import {
  createSceneSafetyState,
  declareSafeToEnter,
  stageForSafety,
  enterAfterStaging,
  policeArrive,
  policeSecureScene,
  chooseSceneLight,
  chooseBallistic,
  donWeatherGear,
  exitUnit,
  toggleSceneEquipment,
  confirmSceneEquipment,
  reachPatientFloor,
  noteFloorLighting,
  noteDoorOpen,
  establishPatientContact,
  clinicalUnlocked,
  preContactStatus,
  type SceneSafetyState,
} from '@/lib/opsim/sceneMachine';
import { EQUIPMENT_CATALOG } from '@/lib/opsim/equipment';
import { EquipmentPanel } from './EquipmentPanel';
import opStyles from './OperationalSim.module.css';
import styles from './SceneSafety.module.css';

interface SceneSafetyProps {
  readonly config: SceneConfig;
  readonly clock: MissionClock;
  readonly simConfig?: SimulatorConfig;
  /** Reports whether clinical actions are unlocked (windshield + safe + exit + patient contact, §19). */
  readonly onClinicalUnlockChange?: (unlocked: boolean) => void;
  /** Reports the latest scene-safety state up for run capture (§ Step 10). */
  readonly onStateChange?: (state: SceneSafetyState) => void;
  /** The crew confirmed what they're carrying in (§9) — the ids become available on scene. */
  readonly onEquipmentConfirmed?: (equipmentIds: readonly string[]) => void;
}

const CATEGORY_ORDER: readonly WindshieldCategory[] = [
  'lighting_weather',
  'road_access',
  'utility',
  'fire_hazmat',
  'behavioral_security',
];

/**
 * Scene-safety sub-flow after arrival (§15–§19): windshield assessment, staging
 * and police clearance, scene lighting, weather/ballistic PPE, and the clinical
 * lock. Police timing (15s + 10s) is scheduled on the shared mission clock; no
 * ad-hoc timers. Clinical actions stay locked until the gate is satisfied.
 */
export function SceneSafety({
  config,
  clock,
  simConfig = DEFAULT_SIMULATOR_CONFIG,
  onClinicalUnlockChange,
  onStateChange,
  onEquipmentConfirmed,
}: SceneSafetyProps) {
  const [state, setState] = useState(() => createSceneSafetyState(config));
  const policeScheduledRef = useRef(false);
  const secureScheduledRef = useRef(false);
  const scheduledRef = useRef<number[]>([]);

  // Report the clinical-lock state up so the clinical panel can gate on it (§19).
  useEffect(() => {
    onClinicalUnlockChange?.(clinicalUnlocked(state));
    onStateChange?.(state);
  }, [state, onClinicalUnlockChange, onStateChange]);

  // Police arrive 15s after staging on a security scene (§16).
  useEffect(() => {
    if (!state.staging.staged || !config.securityThreat || policeScheduledRef.current) return;
    policeScheduledRef.current = true;
    const id = clock.after(simConfig.timing.policeArrivalSeconds, () => setState(policeArrive));
    scheduledRef.current.push(id);
  }, [state.staging.staged, config.securityThreat, clock, simConfig]);

  // Police secure the scene 10s after arriving (§16).
  useEffect(() => {
    if (!state.staging.policeArrived || secureScheduledRef.current) return;
    secureScheduledRef.current = true;
    const id = clock.after(simConfig.timing.policeSceneSecurementSeconds, () => setState(policeSecureScene));
    scheduledRef.current.push(id);
  }, [state.staging.policeArrived, clock, simConfig]);

  useEffect(() => {
    const scheduled = scheduledRef.current;
    return () => scheduled.forEach((id) => clock.cancel(id));
  }, [clock]);

  const presentIds = [...config.presentFactorIds, ...state.revealedFactorIds];
  const status = preContactStatus(state);
  const unlocked = clinicalUnlocked(state);

  return (
    <div className={opStyles.wrap}>
      {/* Windshield */}
      {state.stage === 'windshield' && (
        <>
          <div className={opStyles.ron}>
            <span className={opStyles.ronName}>Partner Ron:</span>
            <span>“{RON_SCENE_LINES.windshield}”</span>
          </div>

          <section className={opStyles.panel} aria-labelledby="windshield-title">
            <h2 id="windshield-title" className={opStyles.panelTitle}>
              Windshield assessment — from inside Medic 3
            </h2>
            {CATEGORY_ORDER.map((cat) => {
              const factors = presentIds
                .map((id) => windshieldFactor(id))
                .filter((f): f is NonNullable<typeof f> => !!f && f.category === cat);
              if (factors.length === 0) return null;
              return (
                <div key={cat} className={styles.factorCategory}>
                  <div className={styles.factorCategoryTitle}>{WINDSHIELD_CATEGORY_LABELS[cat]}</div>
                  <div className={styles.factorList}>
                    {factors.map((f) => {
                      const revealed = state.revealedFactorIds.includes(f.id);
                      return (
                        <span
                          key={f.id}
                          className={`${styles.factor} ${cat === 'behavioral_security' ? styles.security : ''} ${revealed ? styles.revealed : ''}`}
                        >
                          <span className={styles.factorIcon} aria-hidden="true">
                            {cat === 'behavioral_security' ? '■' : revealed ? '●' : '▶'}
                          </span>
                          {f.label}
                          {revealed && ' (revealed by lights)'}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </section>

          {config.weatherRequiresGear && !state.weather.geared && (
            <div className={opStyles.panel}>
              <div className={opStyles.ron}>
                <span className={opStyles.ronName}>Partner Ron:</span>
                <span>“{RON_SCENE_LINES.weatherGear}”</span>
              </div>
              <button type="button" className={opStyles.primaryButton} onClick={() => setState(donWeatherGear)}>
                Put on weather gear
              </button>
            </div>
          )}

          {state.sceneLights.promptRequired && !state.sceneLights.choice && (
            <section className={opStyles.panel} aria-label="Scene lighting">
              <div className={opStyles.ron}>
                <span className={opStyles.ronName}>Partner Ron:</span>
                {/* Rain gets the rain line; plain darkness gets the "do you think
                    we need to add scene lights?" prompt (fix #5 — yes is right). */}
                <span>“{config.weatherRequiresGear ? RON_SCENE_LINES.sceneLightsRain : RON_SCENE_LINES.sceneLightsDark}”</span>
              </div>
              <div className={styles.actionRow}>
                {SCENE_LIGHT_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={opStyles.iconButton}
                    style={{ width: 'auto', padding: '0.55rem 1rem' }}
                    onClick={() => setState((s) => chooseSceneLight(s, opt.id, config))}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </section>
          )}

          <div className={styles.actionRow}>
            <button
              type="button"
              className={opStyles.primaryButton}
              disabled={config.dispatchStaging}
              onClick={() => setState((s) => declareSafeToEnter(s, config))}
            >
              {SAFE_TO_ENTER}
            </button>
            <button type="button" className={styles.dangerButton} onClick={() => setState(stageForSafety)}>
              {NOT_SAFE_TO_ENTER}
            </button>
          </div>
        </>
      )}

      {/* Staging */}
      {state.stage === 'staging' && (
        <section className={opStyles.panel} aria-label="Staging">
          <h2 className={opStyles.panelTitle}>Staged{config.dispatchStaging ? ' for law enforcement' : ''}</h2>

          {config.securityThreat && (
            <ol className={styles.timeline}>
              <li className={`${styles.timelineRow} ${styles.done}`}>
                <span className={styles.timelineDot} aria-hidden="true" />
                Staged — waiting for law enforcement
              </li>
              <li className={`${styles.timelineRow} ${state.staging.policeArrived ? styles.done : styles.pending}`}>
                <span className={styles.timelineDot} aria-hidden="true" />
                {state.staging.policeArrived ? 'Police on scene' : 'Police responding…'}
              </li>
              <li className={`${styles.timelineRow} ${state.staging.sceneSecured ? styles.done : styles.pending}`}>
                <span className={styles.timelineDot} aria-hidden="true" />
                {state.staging.sceneSecured ? 'Scene secured' : 'Securing scene…'}
              </li>
            </ol>
          )}

          {config.securityThreat && !state.ballistic.choice && (
            <div>
              <div className={opStyles.ron}>
                <span className={opStyles.ronName}>Partner Ron:</span>
                <span>“{RON_SCENE_LINES.ballistic}”</span>
              </div>
              <div className={styles.actionRow}>
                {BALLISTIC_PPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={opStyles.iconButton}
                    style={{ width: 'auto', padding: '0.55rem 1rem' }}
                    onClick={() => setState((s) => chooseBallistic(s, opt.id))}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className={opStyles.hint}>Ballistic protection does not make an unsecured scene safe.</p>
            </div>
          )}

          {!config.dispatchStaging && (
            <div className={styles.actionRow}>
              <button
                type="button"
                className={opStyles.primaryButton}
                onClick={() => setState((s) => enterAfterStaging(s, config))}
              >
                Scene looks clear — {SAFE_TO_ENTER}
              </button>
            </div>
          )}
        </section>
      )}

      {/* Cleared to enter */}
      {state.stage === 'safe_to_enter' && (
        <section className={opStyles.panel}>
          <div className={styles.clearance} role="status">
            <span aria-hidden="true">✓</span>
            {config.securityThreat ? `“${RON_SCENE_LINES.clearedToEnter}” — ` : ''}
            {SAFE_TO_ENTER}
          </div>
          <div className={styles.actionRow}>
            <button type="button" className={opStyles.primaryButton} onClick={() => setState(exitUnit)}>
              Exit Medic 3
            </button>
          </div>
        </section>
      )}

      {/* Equipment (§9, fix #6): asked as the crew steps out — inline so the
          mission clock stays visible above. */}
      {state.stage === 'equipment' && (
        <EquipmentPanel
          catalog={EQUIPMENT_CATALOG}
          selected={state.equipment.selected}
          onToggle={(id) => setState((s) => toggleSceneEquipment(s, id))}
          onConfirm={() => {
            onEquipmentConfirmed?.(state.equipment.selected);
            setState(confirmSceneEquipment);
          }}
          variant="inline"
        />
      )}

      {state.stage === 'exited' && (
        <section className={opStyles.panel}>
          <p className={opStyles.instruction}>
            Out of the unit with your gear. A man in his 30s meets you at the base of the stairs — the
            patient’s son. “He’s upstairs. Door’s open — I came down to get you.”
          </p>
          <div className={styles.actionRow}>
            <button type="button" className={opStyles.primaryButton} onClick={() => setState(reachPatientFloor)}>
              Head up the stairs
            </button>
          </div>
        </section>
      )}

      {/* Floor arrival (fixes #9, #10): the quick read before entering — lighting
          and the open apartment door, which the son's story explains. */}
      {state.stage === 'floor_arrival' && (
        <section className={opStyles.panel} aria-label="Floor arrival">
          <div className={opStyles.ron}>
            <span className={opStyles.ronName}>Partner Ron:</span>
            <span>“{RON_SCENE_LINES.floorArrival}”</span>
          </div>
          <p className={opStyles.instruction}>
            Top of the stairs. An apartment door at the end of the hall stands open; a television is going
            inside it.
          </p>
          <div className={styles.actionRow}>
            <button
              type="button"
              className={opStyles.iconButton}
              style={{ width: 'auto', padding: '0.55rem 1rem' }}
              aria-pressed={state.floor.lightingNoted}
              onClick={() => setState(noteFloorLighting)}
            >
              {state.floor.lightingNoted ? '✓ Lighting checked' : 'Check the hallway lighting'}
            </button>
            <button
              type="button"
              className={opStyles.iconButton}
              style={{ width: 'auto', padding: '0.55rem 1rem' }}
              aria-pressed={state.floor.doorNoted}
              onClick={() => setState(noteDoorOpen)}
            >
              {state.floor.doorNoted ? '✓ Open door noted' : 'Note the open door'}
            </button>
          </div>
          {state.floor.lightingNoted && (
            <p className={opStyles.hint}>
              The hallway fixture works but it’s dim — watch your footing on the way back down with a loaded
              device.
            </p>
          )}
          {state.floor.doorNoted && (
            <p className={opStyles.hint}>
              The door is open because the son came down to meet you and didn’t shut it behind him. That’s
              the patient’s own TV going inside — it’s been on since before he fell.
            </p>
          )}
          <div className={styles.actionRow}>
            <button type="button" className={opStyles.primaryButton} onClick={() => setState(establishPatientContact)}>
              Enter the apartment — make patient contact
            </button>
          </div>
        </section>
      )}

      {/* Clinical status + lock (always shown) */}
      <section className={opStyles.panel} aria-label="Patient status">
        <h2 className={opStyles.panelTitle}>Patient status</h2>
        <div className={styles.statusGrid}>
          {Object.entries(status).map(([key, value]) => (
            <div key={key} className={styles.statusItem}>
              <span>{key}</span>
              <span
                className={`${styles.statusValue} ${value === 'Unknown' || value === 'Not established' ? styles.statusUnknown : styles.statusKnown}`}
              >
                {value}
              </span>
            </div>
          ))}
        </div>
        <div className={styles.lockNote}>
          {unlocked ? (
            <span className={styles.statusKnown}>
              ✓ Patient contact established — clinical assessment is now available.
            </span>
          ) : (
            <span>
              🔒 Clinical assessment stays locked until the scene is safe, you exit Medic 3, and patient
              contact is established.
            </span>
          )}
        </div>
      </section>
    </div>
  );
}
