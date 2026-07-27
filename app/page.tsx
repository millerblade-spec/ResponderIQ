import { Button } from '@/components/Button';
import { Wordmark } from '@/components/Wordmark/Wordmark';
import styles from './home.module.css';

export default function HomePage() {
  return (
    <main>
      <Wordmark />
      <p className={styles.tagline}>Adaptive EMS training, built on real decisions.</p>
      <div className={styles.actions}>
        <Button href="/dashboard">Begin training</Button>
        <Button href="/instructions" variant="secondary">
          Instructions &amp; general information
        </Button>
      </div>
    </main>
  );
}
