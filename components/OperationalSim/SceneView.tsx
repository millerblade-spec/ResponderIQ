'use client';

/**
 * A structured operational view of the incident, assembled entirely from live
 * state (scene-safety machine, crew machine, scene-dynamics machine) and the
 * scenario's scene config. No fake or hardcoded scene data, no artwork — just
 * operational cards, icons, and status markers grouped spatially so the learner
 * can read the scene at a glance.
 */
import type { SceneConfig } from '@/lib/opsim/scene';
import { windshieldFactor } from '@/lib/opsim/scene';
import type { SceneSafetyState } from '@/lib/opsim/sceneMachine';
import type { CrewState } from '@/lib/opsim/crewMachine';
import type { DynamicsState } from '@/lib/opsim/dynamicsMachine';
import { distractionType } from '@/lib/opsim/dynamics';
import { responderStatusLabel } from './consoleData';
import styles from './Console.module.css';

interface SceneViewProps {
  readonly sceneConfig: SceneConfig;
  readonly sceneState?: SceneSafetyState;
  readonly crew: CrewState;
  readonly dynamics?: DynamicsState;
}

const DISTRACTION_ICON: Record<string, string> = {
  family: '👪',
  tv: '📺',
  bystander: '👥',
  patient_behavior: '🧑',
  traffic: '🚗',
  crowd: '👥',
  animal: '🐕',
  fire_awaiting: '🚒',
};

export function SceneView({ sceneConfig, sceneState, crew, dynamics }: SceneViewProps) {
  const contact = sceneState?.patientContact === 'established';

  const hazardIds = Array.from(
    new Set([...(sceneConfig.presentFactorIds ?? []), ...(sceneState?.revealedFactorIds ?? [])]),
  );

  const onSceneResponders = crew.order.map((id) => crew.responders[id]).filter((r) => r && r.onScene);
  const arrivedApparatus = Object.values(crew.apparatus).filter((a) => a.arrived);

  const activeSocial = dynamics
    ? dynamics.order.map((id) => dynamics.issues[id]).filter((i) => i && !i.resolved && i.type !== 'fire_awaiting')
    : [];

  const conditions: string[] = [];
  if (sceneConfig.lowVisibility) conditions.push(sceneState?.sceneLights.on ? 'Low visibility — scene lights on' : 'Low visibility');
  if (sceneConfig.nearRoadway) conditions.push('Near roadway');
  if (sceneConfig.weatherRequiresGear) conditions.push(sceneState?.weather.geared ? 'Adverse weather — geared up' : 'Adverse weather');
  if (sceneConfig.securityThreat) conditions.push('Reported security threat');

  const police = sceneState?.staging.sceneSecured
    ? 'Scene secured'
    : sceneState?.staging.policeArrived
      ? 'On scene'
      : sceneConfig.dispatchStaging || sceneConfig.securityThreat
        ? 'Requested / staging'
        : null;

  return (
    <div aria-label="Scene view">
      <div className={styles.sceneGroup}>
        <div className={styles.sceneGroupTitle}>Patient</div>
        <div className={styles.entities}>
          <div className={`${styles.entity} ${contact ? styles.entitySafe : ''}`}>
            <span className={styles.entityIcon} aria-hidden="true">🧑</span>
            <span>
              <span className={styles.entityLabel}>Patient</span>
              <span className={styles.entityMeta}>
                {contact ? 'Contact established' : 'Not yet contacted'}
              </span>
            </span>
          </div>
        </div>
      </div>

      <div className={styles.sceneGroup}>
        <div className={styles.sceneGroupTitle}>Crew on scene</div>
        <div className={styles.entities}>
          {onSceneResponders.map((r) => (
            <div key={r.id} className={styles.entity}>
              <span className={styles.entityIcon} aria-hidden="true">
                {r.id.includes('officer') ? '🎓' : r.id.startsWith('engine') ? '🧑‍🚒' : '🚑'}
              </span>
              <span>
                <span className={styles.entityLabel}>{r.name}</span>
                <span className={styles.entityMeta}>{responderStatusLabel(r.status)}</span>
              </span>
            </div>
          ))}
          {arrivedApparatus.map((a) => (
            <div key={a.id} className={styles.entity}>
              <span className={styles.entityIcon} aria-hidden="true">🚒</span>
              <span>
                <span className={styles.entityLabel}>{a.name}</span>
                <span className={styles.entityMeta}>{a.cleared ? 'Cleared from call' : 'On scene'}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {(hazardIds.length > 0 || conditions.length > 0 || police) && (
        <div className={styles.sceneGroup}>
          <div className={styles.sceneGroupTitle}>Scene &amp; hazards</div>
          <div className={styles.entities}>
            {hazardIds.map((id) => (
              <div key={id} className={`${styles.entity} ${styles.entityHazard}`}>
                <span className={styles.entityIcon} aria-hidden="true">⚠️</span>
                <span>
                  <span className={styles.entityLabel}>{windshieldFactor(id)?.label ?? id}</span>
                  <span className={styles.entityMeta}>Hazard</span>
                </span>
              </div>
            ))}
            {conditions.map((c) => (
              <div key={c} className={styles.entity}>
                <span className={styles.entityIcon} aria-hidden="true">🌫️</span>
                <span>
                  <span className={styles.entityLabel}>{c}</span>
                  <span className={styles.entityMeta}>Condition</span>
                </span>
              </div>
            ))}
            {police && (
              <div className={styles.entity}>
                <span className={styles.entityIcon} aria-hidden="true">🚓</span>
                <span>
                  <span className={styles.entityLabel}>Police</span>
                  <span className={styles.entityMeta}>{police}</span>
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {activeSocial.length > 0 && (
        <div className={styles.sceneGroup}>
          <div className={styles.sceneGroupTitle}>Scene dynamics</div>
          <div className={styles.entities}>
            {activeSocial.map((issue) => (
              <div key={issue.id} className={`${styles.entity} ${styles.entityBehavioral}`}>
                <span className={styles.entityIcon} aria-hidden="true">
                  {DISTRACTION_ICON[issue.type] ?? '❗'}
                </span>
                <span>
                  <span className={styles.entityLabel}>{distractionType(issue.type)?.label ?? 'Distraction'}</span>
                  <span className={styles.entityMeta}>
                    {issue.managed ? 'Being managed' : issue.stageIndex > 0 ? 'Escalating' : 'Present'}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
