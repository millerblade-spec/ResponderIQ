'use client';

import { useEffect, useState } from 'react';
import type { MissionClock } from '@/lib/engine/missionClock';
import { FINDING_SOURCE_LABELS, type SourcedFinding } from '@/lib/opsim/clinical';
import {
  TREATMENT_CATEGORY_LABELS,
  TREATMENT_CATEGORY_ORDER,
  treatmentsByCategory,
  OXYGEN_DEVICE_OPTIONS,
  oxygenDevice,
  BVM_PEEP_OPTIONS,
  defaultPeep,
  IV_METHOD_OPTIONS,
  ivMethod,
  EZ_IO_SITE_OPTIONS,
  painProtocolFor,
  type TreatmentDef,
  type TreatmentConfig,
  type TreatmentModel,
} from '@/lib/opsim/treatment';
import {
  createTreatmentState,
  recordTreatment,
  authorizeScope,
  scopeCleared,
  reassessPatient,
  treatmentStatus,
  beginAnalysis,
  resolveAnalysis,
  beginCharge,
  deliverShock,
  beginCpr,
  reanalyze,
  type TreatmentState,
  type TreatmentDetail as TreatmentDetailValue,
} from '@/lib/opsim/treatmentMachine';
import { ScopeOfPracticeModal } from './ScopeOfPracticeModal';
import { AedPanel } from './AedPanel';
import opStyles from './OperationalSim.module.css';
import styles from './TreatmentPanel.module.css';

interface TreatmentPanelProps {
  readonly clock: MissionClock;
  readonly unlocked: boolean;
  readonly config: TreatmentConfig;
  readonly model: TreatmentModel;
  /** A live tick value from the parent, so AED's countdown/CPR timer refresh each second. */
  readonly now: number;
  /** Reports the latest treatment state up for run capture (§ Step 10). */
  readonly onStateChange?: (state: TreatmentState) => void;
}

function ConditionRow({ label, finding }: { readonly label: string; readonly finding: SourcedFinding }) {
  return (
    <div className={styles.conditionRow}>
      <span className={styles.conditionLabel}>{label}</span>
      <span>{finding.text}</span>
      <span className={styles.conditionSource}>{FINDING_SOURCE_LABELS[finding.source]}</span>
    </div>
  );
}

function OxygenPicker({
  record,
  model,
}: {
  readonly record: (detail: TreatmentDetailValue) => void;
  readonly model: TreatmentModel;
}) {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [flow, setFlow] = useState<number | null>(null);
  const [peep, setPeep] = useState<0 | 5 | 8 | null>(null);

  const device = deviceId ? oxygenDevice(deviceId) : undefined;

  function pick(id: string) {
    const d = oxygenDevice(id);
    if (!d) return;
    setDeviceId(id);
    setFlow(null);
    setPeep(null);
    if (!d.available) return; // shows the future-update note; records nothing (§5: Ventilator)
    if (d.flow) {
      setFlow(d.flow.defaultLpm);
      return;
    }
    if (id === 'bvm') {
      setPeep(defaultPeep(model.patientInArrest));
      return;
    }
    // CPAP / BiPAP have no v1 settings — record immediately.
    record({ kind: 'oxygen', deviceId: id });
  }

  return (
    <div className={styles.subFlow}>
      <div className={opStyles.choiceGrid} role="group" aria-label="Oxygen delivery">
        {OXYGEN_DEVICE_OPTIONS.map((d) => (
          <button
            key={d.id}
            type="button"
            className={opStyles.choice}
            aria-pressed={deviceId === d.id}
            onClick={() => pick(d.id)}
          >
            {d.label}
          </button>
        ))}
      </div>

      {device && !device.available && (
        <p className={opStyles.hint}>Ventilator management will be available in a future update.</p>
      )}

      {device?.flow && flow != null && (
        <div className={styles.settingRow}>
          <label className={styles.settingLabel} htmlFor="o2-flow">
            Flow rate (L/min) — {device.flow.minLpm}–{device.flow.maxLpm}
          </label>
          <input
            id="o2-flow"
            type="number"
            className={styles.numberInput}
            min={device.flow.minLpm}
            max={device.flow.maxLpm}
            value={flow}
            onChange={(e) => setFlow(Number(e.target.value))}
          />
          <button
            type="button"
            className={opStyles.primaryButton}
            onClick={() => record({ kind: 'oxygen', deviceId: device.id, flowRateLpm: flow })}
          >
            Confirm
          </button>
        </div>
      )}

      {deviceId === 'bvm' && peep != null && (
        <div className={styles.settingRow}>
          <span className={styles.settingLabel}>PEEP</span>
          <div className={opStyles.choiceGrid} role="group" aria-label="PEEP">
            {BVM_PEEP_OPTIONS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={opStyles.choice}
                aria-pressed={peep === p.id}
                onClick={() => setPeep(p.id)}
              >
                {p.label}
                <span className={opStyles.hint}> — {p.hint}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className={opStyles.primaryButton}
            onClick={() => record({ kind: 'oxygen', deviceId: 'bvm', peep: peep ?? undefined })}
          >
            Confirm
          </button>
        </div>
      )}
    </div>
  );
}

function IvAccessPicker({ record }: { readonly record: (detail: TreatmentDetailValue) => void }) {
  const [method, setMethod] = useState<'peripheral_iv' | 'ez_io' | null>(null);
  const [site, setSite] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);

  const m = method ? ivMethod(method) : undefined;

  function attempt() {
    if (!method) return;
    // Simple success model for now (§6) — every attempt succeeds in v1; the
    // `success` field already exists so a real model can slot in later
    // without a schema change.
    record({ kind: 'iv_access', method, site: site ?? undefined, success: true });
    setAttempted(true);
  }

  return (
    <div className={styles.subFlow}>
      <div className={opStyles.choiceGrid} role="group" aria-label="Access method">
        {IV_METHOD_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={opStyles.choice}
            aria-pressed={method === opt.id}
            onClick={() => {
              setMethod(opt.id);
              setSite(null);
              setAttempted(false);
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {m?.needsSite && !site && (
        <div className={opStyles.choiceGrid} role="group" aria-label="EZ-IO site">
          {EZ_IO_SITE_OPTIONS.map((s) => (
            <button key={s.id} type="button" className={opStyles.choice} onClick={() => setSite(s.id)}>
              {s.label}
            </button>
          ))}
        </div>
      )}

      {method && (!m?.needsSite || site) && !attempted && (
        <div className={styles.settingRow}>
          <p className={opStyles.hint}>Simple success model for now (§6).</p>
          <button type="button" className={opStyles.primaryButton} onClick={attempt}>
            Attempt access
          </button>
        </div>
      )}

      {attempted && <p className={styles.doneTag}>✓ Access established.</p>}
    </div>
  );
}

function InfusionControl({
  def,
  record,
}: {
  readonly def: TreatmentDef;
  readonly record: (detail: TreatmentDetailValue) => void;
}) {
  const isVolumeBased = def.id === 'iv_fluids' || def.id === 'blood';
  const [rate, setRate] = useState(0);
  const max = isVolumeBased ? 999 : 20;
  const step = isVolumeBased ? 25 : 0.5;

  return (
    <div className={styles.subFlow}>
      <div className={styles.settingRow}>
        <label className={styles.settingLabel} htmlFor={`rate-${def.id}`}>
          Rate {isVolumeBased ? '(mL/hr)' : '(mcg/min)'}
        </label>
        <input
          id={`rate-${def.id}`}
          type="range"
          min={0}
          max={max}
          step={step}
          value={rate}
          onChange={(e) => setRate(Number(e.target.value))}
          className={styles.slider}
        />
        <span className={styles.rateValue}>{rate}</span>
      </div>
      <p className={opStyles.hint}>No dosage calculations yet (§7) — this records the selected rate only.</p>
      <button type="button" className={opStyles.primaryButton} onClick={() => record({ kind: 'infusion', rate })}>
        Confirm
      </button>
    </div>
  );
}

function PainProtocolDisplay({
  def,
  model,
  record,
}: {
  readonly def: TreatmentDef;
  readonly model: TreatmentModel;
  readonly record: (detail: TreatmentDetailValue) => void;
}) {
  const protocol = painProtocolFor(model, def.id);
  return (
    <div className={styles.subFlow}>
      <p className={opStyles.instruction}>
        Recommended protocol dose: <strong>{protocol?.recommendedDose ?? 'Not defined for this scenario.'}</strong>
      </p>
      <p className={opStyles.hint}>No dosage math yet (§8).</p>
      <button type="button" className={opStyles.primaryButton} onClick={() => record({ kind: 'pain_med' })}>
        Give {def.label}
      </button>
    </div>
  );
}

/**
 * The Treatment tab (Treatment Engine v1). Category sections are built
 * entirely from TREATMENT_CATALOG filtered by `config.enabledTreatmentIds` —
 * there is no hardcoded per-treatment list here, so a future scenario's
 * config genuinely changes what renders. Reassess Patient is a persistent
 * action available any time once `unlocked`, independent of any specific
 * treatment.
 */
export function TreatmentPanel({ clock, unlocked, config, model, now, onStateChange }: TreatmentPanelProps) {
  const [treatment, setTreatment] = useState<TreatmentState>(createTreatmentState);
  const [scopePrompt, setScopePrompt] = useState<TreatmentDef | null>(null);
  const [openTreatmentId, setOpenTreatmentId] = useState<string | null>(null);

  useEffect(() => {
    onStateChange?.(treatment);
  }, [treatment, onStateChange]);

  function open(def: TreatmentDef) {
    if (!scopeCleared(treatment, config, def.id)) {
      setScopePrompt(def);
      return;
    }
    setOpenTreatmentId((cur) => (cur === def.id ? null : def.id));
  }

  function authorize() {
    if (!scopePrompt) return;
    setTreatment((s) => authorizeScope(s, scopePrompt.id, clock.elapsedSeconds()));
    setOpenTreatmentId(scopePrompt.id);
    setScopePrompt(null);
  }

  function decline() {
    // Returns to the Treatment menu — no penalty, no note, no judgment (§4).
    setScopePrompt(null);
  }

  function record(id: string, detail: TreatmentDetailValue) {
    setTreatment((s) => recordTreatment(s, id, detail, clock.elapsedSeconds()));
  }

  if (!unlocked) {
    return (
      <section className={opStyles.panel} aria-label="Treatment">
        <h2 className={opStyles.panelTitle}>Treatment</h2>
        <p className={styles.lockedNote}>
          🔒 Treatment stays locked until the scene is safe, you exit Medic 3, and patient contact is established.
        </p>
      </section>
    );
  }

  const r = model.reassessment;

  return (
    <section className={opStyles.panel} aria-label="Treatment">
      <h2 className={opStyles.panelTitle}>Treatment</h2>

      {/* Reassess Patient (§2) — persistent, available any time once unlocked. */}
      <div className={styles.reassessCard}>
        <div className={styles.reassessHeader}>
          <span className={styles.reassessTitle}>Current condition</span>
          <button
            type="button"
            className={opStyles.primaryButton}
            onClick={() => setTreatment((s) => reassessPatient(s, clock.elapsedSeconds()))}
          >
            Reassess Patient
          </button>
        </div>
        {treatment.reassessCount === 0 ? (
          <p className={opStyles.hint}>Not yet reassessed.</p>
        ) : (
          <>
            <div className={styles.conditionGrid}>
              <ConditionRow label="Airway" finding={r.airway} />
              <ConditionRow label="Breathing" finding={r.breathing} />
              <ConditionRow label="Circulation" finding={r.circulation} />
              <ConditionRow label="Mental status" finding={r.mentalStatus} />
              <ConditionRow label="Pain" finding={r.pain} />
              <ConditionRow label="Vital signs" finding={r.vitals} />
            </div>
            <p className={opStyles.hint}>
              Reassessed {treatment.reassessCount} time{treatment.reassessCount === 1 ? '' : 's'}, last at{' '}
              {formatSeconds(treatment.lastReassessedAtSecond ?? 0)}.
            </p>
          </>
        )}
      </div>

      {TREATMENT_CATEGORY_ORDER.map((category) => {
        const items = treatmentsByCategory(category, config.enabledTreatmentIds);
        if (items.length === 0) return null;
        return (
          <div key={category} className={styles.category}>
            <h3 className={styles.categoryTitle}>{TREATMENT_CATEGORY_LABELS[category]}</h3>
            <div className={styles.treatmentGrid}>
              {items.map((def) => {
                const status = treatmentStatus(treatment, def.id);
                const cleared = scopeCleared(treatment, config, def.id);
                return (
                  <div key={def.id} className={styles.treatmentCard}>
                    <button
                      type="button"
                      className={`${styles.treatmentButton} ${status === 'complete' ? styles.treatmentDone : ''}`}
                      aria-expanded={openTreatmentId === def.id}
                      onClick={() => open(def)}
                    >
                      <span>{def.label}</span>
                      {def.scope === 'paramedic' && !cleared && <span className={styles.scopeTag}>Paramedic</span>}
                      {status === 'complete' && <span className={styles.doneTag}>✓ Given</span>}
                    </button>

                    {openTreatmentId === def.id && (
                      <div className={styles.treatmentDetail}>
                        {def.kind === 'device_select' && (
                          <OxygenPicker record={(d) => record(def.id, d)} model={model} />
                        )}
                        {def.kind === 'iv_access' && <IvAccessPicker record={(d) => record(def.id, d)} />}
                        {def.kind === 'infusion' && <InfusionControl def={def} record={(d) => record(def.id, d)} />}
                        {def.kind === 'protocol_display' && (
                          <PainProtocolDisplay def={def} model={model} record={(d) => record(def.id, d)} />
                        )}
                        {def.kind === 'aed_cycle' && (
                          <AedPanel
                            aed={treatment.aed}
                            model={model}
                            clock={clock}
                            now={now}
                            onBeginAnalysis={() => setTreatment((s) => beginAnalysis(s, clock.elapsedSeconds()))}
                            onResolveAnalysis={(shockAdvised) =>
                              setTreatment((s) => resolveAnalysis(s, shockAdvised, clock.elapsedSeconds()))
                            }
                            onBeginCharge={() => setTreatment((s) => beginCharge(s, clock.elapsedSeconds()))}
                            onDeliverShock={() => setTreatment((s) => deliverShock(s, clock.elapsedSeconds()))}
                            onBeginCpr={() => setTreatment((s) => beginCpr(s, clock.elapsedSeconds()))}
                            onReanalyze={() => setTreatment((s) => reanalyze(s, clock.elapsedSeconds()))}
                          />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {scopePrompt && (
        <ScopeOfPracticeModal treatmentLabel={scopePrompt.label} onAuthorize={authorize} onDecline={decline} />
      )}
    </section>
  );
}

function formatSeconds(total: number): string {
  const mm = Math.floor(total / 60)
    .toString()
    .padStart(2, '0');
  const ss = (total % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}
