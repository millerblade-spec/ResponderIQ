'use client';

import { useCallback, useRef, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { Card } from '@/components/Card';
import { Wordmark } from '@/components/Wordmark/Wordmark';
import { bls01 } from '@/lib/scenarios/bls-01';
import { LOCAL_ADMIN_REVIEW_STORAGE_KEY } from '@/components/SimulatorPlayer/SimulatorPlayer';
import type { SceneState } from '@/lib/engine/types';
import styles from './Dashboard.module.css';

// Deliberately not a generic multi-scenario lookup: there is exactly one
// real scenario right now, and LOCAL_ADMIN_REVIEW_STORAGE_KEY is the one
// real key that exists. Generalize this only once a second scenario
// actually needs its own key, per the same discipline as engine/types.ts.

function subscribeToStorage(callback: () => void) {
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}

function getServerSnapshot(): SceneState | null {
  return null; // no localStorage during server rendering
}

/** Same read pattern as AdminReview: an external-store read of a real localStorage entry, never a fabricated stat. */
function useBls01CompletionState(): SceneState | null {
  const cacheRef = useRef<{ raw: string | null; parsed: SceneState | null }>({
    raw: undefined as unknown as string | null,
    parsed: null,
  });
  const getSnapshot = useCallback((): SceneState | null => {
    const raw = window.localStorage.getItem(LOCAL_ADMIN_REVIEW_STORAGE_KEY);
    if (raw === cacheRef.current.raw) return cacheRef.current.parsed;
    let parsed: SceneState | null = null;
    try {
      parsed = raw ? (JSON.parse(raw) as SceneState) : null;
    } catch {
      parsed = null;
    }
    cacheRef.current = { raw, parsed };
    return parsed;
  }, []);

  return useSyncExternalStore(subscribeToStorage, getSnapshot, getServerSnapshot);
}

function completionLabel(state: SceneState | null): string {
  if (!state?.completion) return 'Not yet attempted';
  const statusText =
    state.completion.status === 'transport_initiated' ? 'transport initiated' : 'unsafe extrication completed';
  return `Completed \u2014 ${statusText} at minute ${state.completion.atMinute}`;
}

export function Dashboard() {
  const bls01State = useBls01CompletionState();

  return (
    <main className={styles.wrap}>
      <Wordmark size={1.6} className={styles.brand} />
      <h1 className={styles.heading}>Dashboard</h1>
      <div className={styles.list}>
        <Link href={`/scenarios/${bls01.id}`} className={styles.link}>
          <Card>
            <h2 className={styles.title}>{bls01.title}</h2>
            <p className={styles.description}>{bls01.dispatchSummary}</p>
            <p className={styles.status}>{completionLabel(bls01State)}</p>
          </Card>
        </Link>
      </div>
      <div className={styles.footerLinks}>
        <Link href="/instructions" className={styles.settingsLink}>
          Instructions &amp; general information
        </Link>
        <Link href="/settings" className={styles.settingsLink}>
          Settings
        </Link>
      </div>
    </main>
  );
}
