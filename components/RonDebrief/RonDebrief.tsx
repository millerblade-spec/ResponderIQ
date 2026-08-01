'use client';

import { useEffect, useRef, useState } from 'react';
import {
  buildRonQuestions,
  evaluateAnswer,
  ronReplyFor,
  buildClosing,
  type DebriefRunFacts,
  type RonDebriefEntry,
  type RonDebriefRecord,
} from '@/lib/debrief/ronDebrief';
import styles from './RonDebrief.module.css';

interface RonDebriefProps {
  readonly facts: DebriefRunFacts;
  /** Called once the conversation ends — the record is the run's evaluation. */
  readonly onFinish: (record: RonDebriefRecord) => void;
}

/** Minimal typing for the browser-native Web Speech API (no paid transcription — v1 by design). */
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function speechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * The AI Ron conversational debrief (replaces the old end-of-scenario debrief
 * screen for BLS-01). Voice-first: the learner talks, the browser's native
 * speech recognition transcribes, and the transcript stays editable — with a
 * typed fallback when the browser has no speech support. No score, grade, or
 * pass/fail is ever shown; the conversation itself is the record.
 *
 * KNOWN RISK to verify in real testing once built (do not pre-solve): browser
 * voice-to-text may mangle EMS-specific terms ("scoop stretcher", "pelvic
 * binder") more than ordinary words. The evaluator's accept sets include
 * ordinary-word synonyms to soften this, but it needs live-mic testing.
 */
export function RonDebrief({ facts, onFinish }: RonDebriefProps) {
  const [questions] = useState(() => buildRonQuestions(facts));
  const [index, setIndex] = useState(0);
  const [entries, setEntries] = useState<readonly RonDebriefEntry[]>([]);
  const [transcript, setTranscript] = useState('');
  const [listening, setListening] = useState(false);
  const [usedVoice, setUsedVoice] = useState(false);
  const [lastReply, setLastReply] = useState<string | null>(null);
  const [closing, setClosing] = useState<{ closingLine: string; allSound: boolean } | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finishedRef = useRef(false);

  const speechAvailable = speechRecognitionCtor() !== null;
  const question = questions[index];

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  function startListening() {
    const Ctor = speechRecognitionCtor();
    if (!Ctor || listening) return;
    const rec = new Ctor();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (event) => {
      let heard = '';
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal && result[0]) heard += `${result[0].transcript} `;
      }
      if (heard.trim()) {
        setTranscript((prev) => `${prev} ${heard}`.replace(/\s+/g, ' ').trimStart());
        setUsedVoice(true);
      }
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setListening(false);
  }

  function submitAnswer() {
    if (!question) return;
    stopListening();
    const assessment = evaluateAnswer(question, transcript);
    const reply = ronReplyFor(question, assessment);
    const entry: RonDebriefEntry = {
      questionId: question.id,
      ronLine: question.ronLine,
      answerTranscript: transcript.trim(),
      inputMode: usedVoice ? 'voice' : 'typed',
      assessment,
      ronReply: reply,
    };
    const nextEntries = [...entries, entry];
    setEntries(nextEntries);
    setLastReply(reply);
    setTranscript('');
    setUsedVoice(false);
    if (index + 1 >= questions.length) {
      setClosing(buildClosing(nextEntries, questions));
    } else {
      setIndex(index + 1);
    }
  }

  function finish() {
    if (!closing || finishedRef.current) return;
    finishedRef.current = true;
    onFinish({ entries, closingLine: closing.closingLine, allSound: closing.allSound });
  }

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>Tailboard talk</h1>
      <p className={styles.subtitle}>
        Ron wants a word before you two clear the call. Talk to him — hit the mic and answer out loud
        {speechAvailable ? '' : ' (voice isn’t available in this browser, so type instead)'}.
      </p>

      {/* The conversation so far. */}
      {entries.map((e) => (
        <div key={e.questionId} className={styles.exchange}>
          <div className={styles.ronBubble}>
            <span className={styles.speaker}>Ron</span>
            <p>“{e.ronLine}”</p>
          </div>
          <div className={styles.youBubble}>
            <span className={styles.speaker}>You</span>
            <p>{e.answerTranscript || <em>(no answer)</em>}</p>
          </div>
          <div className={styles.ronBubble}>
            <span className={styles.speaker}>Ron</span>
            <p>“{e.ronReply}”</p>
          </div>
        </div>
      ))}

      {/* The active question. */}
      {question && !closing && (
        <div className={styles.exchange}>
          <div className={styles.ronBubble}>
            <span className={styles.speaker}>Ron</span>
            <p>“{question.ronLine}”</p>
          </div>

          <div className={styles.answerArea}>
            {speechAvailable && (
              <button
                type="button"
                className={`${styles.micButton} ${listening ? styles.listening : ''}`}
                onClick={listening ? stopListening : startListening}
                aria-pressed={listening}
              >
                {listening ? '⏹ Stop listening' : '🎤 Answer out loud'}
              </button>
            )}
            <label className={styles.transcriptLabel} htmlFor="ron-answer">
              {speechAvailable ? 'Your answer (edit if the mic misheard you)' : 'Your answer'}
            </label>
            <textarea
              id="ron-answer"
              className={styles.transcript}
              value={transcript}
              placeholder={listening ? 'Listening…' : ''}
              onChange={(e) => setTranscript(e.target.value)}
            />
            <button type="button" className={styles.submit} onClick={submitAnswer} disabled={listening}>
              That’s my answer
            </button>
          </div>
        </div>
      )}

      {/* The closing — casual and warm; never a score or pass/fail. */}
      {closing && (
        <div className={styles.exchange}>
          <div className={`${styles.ronBubble} ${styles.closing}`}>
            <span className={styles.speaker}>Ron</span>
            <p>“{closing.closingLine}”</p>
          </div>
          <button type="button" className={styles.submit} onClick={finish}>
            Clear the call
          </button>
        </div>
      )}

      {lastReply && !closing && <span className={styles.srOnly} aria-live="polite">{lastReply}</span>}
    </div>
  );
}
