'use client';

import { useEffect, useRef, useState } from 'react';
import { DEFAULT_SIMULATOR_CONFIG } from '@/lib/engine/config';
import type { MissionClock } from '@/lib/engine/missionClock';
import { taskDef } from '@/lib/opsim/crew';
import type { ClinicalModel } from '@/lib/opsim/clinical';
import { FINDING_SOURCE_LABELS } from '@/lib/opsim/clinical';
import {
  DESCENT_DEVICE_OPTIONS,
  PELVIC_SUPPORT_OPTIONS,
  PAIN_MANAGEMENT_OPTIONS,
  RON_TRANSPORT_LINES,
  TRANSPORT_NARRATIVE,
  descentDevice,
} from '@/lib/opsim/transport';
import {
  createTransportState,
  chooseDevice,
  deviceDelivered,
  choosePelvicSupport,
  pelvicDelivered,
  securePatient,
  beginDescent,
  completeDescent,
  completeAlsWorkup,
  transferToStretcher,
  choosePainManagement,
  rigidDeviceUsed,
  type TransportState,
} from '@/lib/opsim/transportMachine';
import type { CrewController } from './useCrew';
import opStyles from './OperationalSim.module.css';

interface TransportOpsProps {
  readonly controller: CrewController;
  readonly clock: MissionClock;
  /** Transport decisions stay locked until patient contact unlocks clinical work. */
  readonly unlocked: boolean;
  readonly model: ClinicalModel;
  /** Reports the latest transport state up for run capture. */
  readonly onStateChange?: (state: TransportState) => void;
  /** The pain decision ends the scenario at this tier (fix #16). */
  readonly onRunComplete: (state: TransportState) => void;
}

const SECURE_SECONDS = 30;

/**
 * Packaging → descent → ALS workup → stretcher transfer → pain decision
 * (fixes #12–#16). The device choice comes from what the learner actually
 * assessed, not a fixed script; fire staff do the physical move; a rigid
 * device comes off before transport; and the binary pain decision ends the
 * scenario. Durations run on the shared mission clock.
 */
export function TransportOps({
  controller,
  clock,
  unlocked,
  model,
  onStateChange,
  onRunComplete,
}: TransportOpsProps) {
  const [transport, setTransport] = useState<TransportState>(createTransportState);
  const [retrieverName, setRetrieverName] = useState<string | null>(null);
  const [securing, setSecuring] = useState(false);
  const [blocked, setBlocked] = useState('');
  const scheduledRef = useRef<number[]>([]);
  const completedRef = useRef(false);

  const onScene = controller.crew.equipmentOnScene;

  useEffect(() => {
    onStateChange?.(transport);
  }, [transport, onStateChange]);

  // Completion fires exactly once, when the pain decision lands.
  useEffect(() => {
    if (transport.stage === 'complete' && !completedRef.current) {
      completedRef.current = true;
      onRunComplete(transport);
    }
  }, [transport, onRunComplete]);

  useEffect(() => {
    const scheduled = scheduledRef.current;
    return () => scheduled.forEach((id) => clock.cancel(id));
  }, [clock]);

  /**
   * Sends a free responder back to the truck for an off-scene item (§9) and
   * schedules the arrival of the item on the shared clock — the same 45s the
   * crew task takes. The lead medic stays with the patient.
   */
  function dispatchRetrieval(equipmentId: string, onDelivered: () => void): boolean {
    const free = controller.crew.order
      .map((id) => controller.crew.responders[id])
      .filter((r) => r.onScene && r.status !== 'cleared_from_call' && (!r.assignment || r.assignment.status === 'complete'))
      .filter((r) => r.role !== 'lead_medic');
    for (const r of free) {
      if (controller.assign(r.id, `bring_${equipmentId}`) === null) {
        setRetrieverName(r.name);
        setBlocked('');
        const id = clock.after(DEFAULT_SIMULATOR_CONFIG.timing.equipmentRetrievalSeconds, () => {
          onDelivered();
          setRetrieverName(null);
        });
        scheduledRef.current.push(id);
        return true;
      }
    }
    setBlocked('Nobody is free to make the run to the truck — finish or reassign a task first.');
    return false;
  }

  function pickDevice(deviceId: string) {
    const device = descentDevice(deviceId);
    if (!device) return;
    const available = onScene.includes(device.equipmentId);
    if (
      !available &&
      !dispatchRetrieval(device.equipmentId, () => setTransport((t) => deviceDelivered(t, clock.elapsedSeconds())))
    ) {
      return;
    }
    setTransport((t) => chooseDevice(t, deviceId, { onScene: available, atSecond: clock.elapsedSeconds() }));
  }

  function pickPelvic(optionId: string) {
    const available = optionId !== 'pelvic_binder' || onScene.includes('pelvic_binder');
    if (
      !available &&
      !dispatchRetrieval('pelvic_binder', () => setTransport((t) => pelvicDelivered(t, clock.elapsedSeconds())))
    ) {
      return;
    }
    setTransport((t) => choosePelvicSupport(t, optionId, { onScene: available, atSecond: clock.elapsedSeconds() }));
  }

  function secure() {
    if (securing) return;
    setSecuring(true);
    const id = clock.after(SECURE_SECONDS, () => {
      setTransport((t) => securePatient(t, clock.elapsedSeconds()));
      setSecuring(false);
    });
    scheduledRef.current.push(id);
  }

  function moveDown() {
    const freeFire = controller.crew.order
      .map((id) => controller.crew.responders[id])
      .filter(
        (r) =>
          (r.role === 'firefighter' || r.role === 'fire_officer') &&
          r.onScene &&
          r.status !== 'cleared_from_call' &&
          (!r.assignment || r.assignment.status === 'complete'),
      )
      .slice(0, 3);
    for (const ff of freeFire) controller.assign(ff.id, 'assist_movement');
    const duration = taskDef('assist_movement')?.durationSeconds ?? 90;
    setTransport((t) => beginDescent(t, freeFire.length, clock.elapsedSeconds()));
    const id = clock.after(duration, () => setTransport((t) => completeDescent(t, clock.elapsedSeconds())));
    scheduledRef.current.push(id);
  }

  const device = transport.deviceId ? descentDevice(transport.deviceId) : undefined;
  const rigid = rigidDeviceUsed(transport);

  if (!unlocked && transport.stage === 'device_choice') {
    return (
      <section className={opStyles.panel} aria-label="Packaging and transport">
        <h2 className={opStyles.panelTitle}>Packaging &amp; transport</h2>
        <p className={opStyles.hint}>
          🔒 Locked until you have patient contact — the device choice should come from what you actually
          find.
        </p>
      </section>
    );
  }

  return (
    <section className={opStyles.panel} aria-label="Packaging and transport">
      <h2 className={opStyles.panelTitle}>Packaging &amp; transport</h2>

      {transport.stage === 'device_choice' && (
        <>
          <div className={opStyles.ron}>
            <span className={opStyles.ronName}>Partner Ron:</span>
            <span>“{RON_TRANSPORT_LINES.deviceChoice}”</span>
          </div>
          <div className={opStyles.choiceGrid} role="group" aria-label="Descent device">
            {DESCENT_DEVICE_OPTIONS.map((d) => (
              <button key={d.id} type="button" className={opStyles.choice} onClick={() => pickDevice(d.id)}>
                {d.label}
                {!onScene.includes(d.equipmentId) && (
                  <span className={opStyles.hint}> (still on Medic 3 — someone will go get it)</span>
                )}
              </button>
            ))}
          </div>
          {blocked && <p className={opStyles.hint}>{blocked}</p>}
        </>
      )}

      {(transport.stage === 'device_retrieval' || transport.stage === 'pelvic_retrieval') && (
        <p className={opStyles.instruction}>
          {retrieverName ?? 'Someone'} is walking back to Medic 3 for the{' '}
          {transport.stage === 'device_retrieval' ? (device?.label ?? 'device') : 'pelvic binder'} — about 45
          seconds there and back.
        </p>
      )}

      {transport.stage === 'pelvic_choice' && (
        <>
          <div className={opStyles.ron}>
            <span className={opStyles.ronName}>Partner Ron:</span>
            <span>“{RON_TRANSPORT_LINES.pelvicChoice}”</span>
          </div>
          <div className={opStyles.choiceGrid} role="group" aria-label="Pelvic support">
            {PELVIC_SUPPORT_OPTIONS.map((p) => (
              <button key={p.id} type="button" className={opStyles.choice} onClick={() => pickPelvic(p.id)}>
                {p.label}
              </button>
            ))}
          </div>
          {blocked && <p className={opStyles.hint}>{blocked}</p>}
        </>
      )}

      {transport.stage === 'securing' && (
        <>
          <p className={opStyles.instruction}>{TRANSPORT_NARRATIVE.securing}</p>
          {securing ? (
            <p className={opStyles.hint}>Securing him — straps and padding…</p>
          ) : (
            <button type="button" className={opStyles.primaryButton} onClick={secure}>
              Secure him to the {device?.label ?? 'device'}
            </button>
          )}
        </>
      )}

      {transport.stage === 'descending' && transport.events.some((e) => e.id === 'descent_started') && (
        <p className={opStyles.instruction}>{TRANSPORT_NARRATIVE.descent}</p>
      )}
      {transport.stage === 'descending' && !transport.events.some((e) => e.id === 'descent_started') && (
        <>
          <div className={opStyles.ron}>
            <span className={opStyles.ronName}>Partner Ron:</span>
            <span>“{RON_TRANSPORT_LINES.secured}”</span>
          </div>
          <button type="button" className={opStyles.primaryButton} onClick={moveDown}>
            Move him down — fire staff on the {device?.label ?? 'device'}
          </button>
        </>
      )}

      {transport.stage === 'als_workup' && (
        <>
          <p className={opStyles.instruction}>{TRANSPORT_NARRATIVE.alsWorkup}</p>
          <div className={opStyles.summary}>
            <span className={opStyles.summaryTag}>HR {model.vitals.hr}</span>
            <span className={opStyles.summaryTag}>RR {model.vitals.rr}</span>
            <span className={opStyles.summaryTag}>BP {model.vitals.bp}</span>
            <span className={opStyles.summaryTag}>SpO₂ {model.vitals.spo2}</span>
            <span className={opStyles.summaryTag}>Pain {model.vitals.pain}</span>
            <span className={opStyles.summaryTag}>Monitor: {model.monitorRhythm.text}</span>
          </div>
          {model.paramedicQuestions.map((q) => (
            <p key={q.key} className={opStyles.instruction}>
              <strong>{q.label}</strong> {q.finding.text}{' '}
              <span className={opStyles.hint}>({FINDING_SOURCE_LABELS[q.finding.source]})</span>
            </p>
          ))}
          <button
            type="button"
            className={opStyles.primaryButton}
            onClick={() => setTransport((t) => completeAlsWorkup(t, clock.elapsedSeconds()))}
          >
            Continue to the stretcher
          </button>
        </>
      )}

      {transport.stage === 'stretcher_transfer' && (
        <>
          <div className={opStyles.ron}>
            <span className={opStyles.ronName}>Partner Ron:</span>
            <span>“{RON_TRANSPORT_LINES.stretcher}”</span>
          </div>
          {rigid ? (
            <>
              <p className={opStyles.hint}>{TRANSPORT_NARRATIVE.boardRemovalWhy}</p>
              <div className={opStyles.choiceGrid} role="group" aria-label="Stretcher transfer">
                <button
                  type="button"
                  className={opStyles.choice}
                  onClick={() =>
                    setTransport((t) => transferToStretcher(t, { removeRigidDevice: true, atSecond: clock.elapsedSeconds() }))
                  }
                >
                  Transfer to the stretcher and remove the {device?.label ?? 'board'} first
                </button>
                <button
                  type="button"
                  className={opStyles.choice}
                  onClick={() =>
                    setTransport((t) => transferToStretcher(t, { removeRigidDevice: false, atSecond: clock.elapsedSeconds() }))
                  }
                >
                  Leave him on the {device?.label ?? 'board'} for the ride
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              className={opStyles.primaryButton}
              onClick={() => setTransport((t) => transferToStretcher(t, { atSecond: clock.elapsedSeconds() }))}
            >
              Transfer him to the stretcher
            </button>
          )}
        </>
      )}

      {transport.stage === 'pain_decision' && (
        <>
          <div className={opStyles.ron}>
            <span className={opStyles.ronName}>Partner Ron:</span>
            <span>“{RON_TRANSPORT_LINES.pain}”</span>
          </div>
          {/* Binary at this tier by design (fix #16) — dosage/route arrive with a
              future higher tier via PAIN_MANAGEMENT_OPTIONS. */}
          <div className={opStyles.choiceGrid} role="group" aria-label="Pain management">
            {PAIN_MANAGEMENT_OPTIONS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={opStyles.choice}
                onClick={() => setTransport((t) => choosePainManagement(t, p.id, clock.elapsedSeconds()))}
              >
                {p.label}
              </button>
            ))}
          </div>
        </>
      )}

      {transport.stage === 'complete' && (
        <p className={opStyles.instruction}>Loaded and rolling. Handing off to the debrief…</p>
      )}
    </section>
  );
}
