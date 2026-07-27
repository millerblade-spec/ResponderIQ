import styles from './Wordmark.module.css';

interface WordmarkProps {
  /** Font size in rem. Defaults to the hero size used on the home page. */
  readonly size?: number;
  /** Extra class for layout placement (margins etc.) from the caller. */
  readonly className?: string;
}

/**
 * The approved ResponderIQ brand lockup: "RESPONDER" in white, "IQ" in
 * crimson orange (§1). The two colors come from CSS variables so the
 * exact hues live in one place (globals.css), but they are applied
 * inline here so the brand treatment is guaranteed regardless of theme
 * — RESPONDER is always white, IQ is always crimson orange.
 *
 * The lockup sits on its own dark "plate" so the white RESPONDER stays
 * legible in BOTH light and dark modes (white text on a light page
 * background would otherwise disappear). This is a logo treatment, not
 * a change to the app's operational colors.
 */
export function Wordmark({ size = 2.5, className }: WordmarkProps) {
  return (
    <span
      className={`${styles.plate} ${className ?? ''}`}
      style={{ fontSize: `${size}rem` }}
      aria-label="ResponderIQ"
    >
      <span className={styles.responder} style={{ color: 'var(--brand-responder)' }}>
        RESPONDER
      </span>
      <span className={styles.iq} style={{ color: 'var(--brand-iq)' }}>
        IQ
      </span>
    </span>
  );
}
