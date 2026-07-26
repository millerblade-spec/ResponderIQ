import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Wordmark } from './Wordmark';

describe('Wordmark (§1 brand treatment)', () => {
  it('renders RESPONDER in white and IQ in crimson orange, as two distinct parts', () => {
    render(<Wordmark />);

    const responder = screen.getByText('RESPONDER');
    const iq = screen.getByText('IQ');

    // RESPONDER must be white; IQ must be crimson orange. The exact hue lives
    // in a CSS variable, but the assignment of which part gets which is fixed.
    expect(responder).toHaveStyle({ color: 'var(--brand-responder)' });
    expect(iq).toHaveStyle({ color: 'var(--brand-iq)' });
    expect(responder).not.toBe(iq);
  });

  it('exposes an accessible ResponderIQ label', () => {
    render(<Wordmark />);
    expect(screen.getByLabelText('ResponderIQ')).toBeInTheDocument();
  });
});
