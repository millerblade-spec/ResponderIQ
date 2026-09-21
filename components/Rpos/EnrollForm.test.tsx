import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EnrollForm } from './EnrollForm';

const enrollMock = vi.fn();
const useActionStateMock = vi.fn();

vi.mock('@/lib/rpos/actions', () => ({
  enrollResponder: (...args: unknown[]) => enrollMock(...args),
}));
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return { ...actual, useActionState: (...args: unknown[]) => useActionStateMock(...args) };
});

function renderWith(state: Record<string, unknown>) {
  useActionStateMock.mockReturnValue([state, vi.fn(), false]);
  return render(<EnrollForm />);
}

describe('EnrollForm', () => {
  it('has accessible, properly associated fields', () => {
    renderWith({});
    expect(screen.getByLabelText(/responder name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/badge \/ employee id/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/what patch/i)).toBeInTheDocument();
  });

  it('offers no default patch, so a responder cannot be enrolled without one', () => {
    renderWith({});
    expect(screen.getByLabelText(/what patch/i)).toHaveValue('');
    expect(screen.getByRole('option', { name: 'EMT' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Paramedic' })).toBeInTheDocument();
  });

  it('keeps what the user typed after a rejected submission', () => {
    // React resets the form once the action completes; the echoed values are
    // what stop a slip on one field from wiping the others.
    renderWith({
      error: 'Enter the responder’s name, badge / employee ID, and patch.',
      values: { learnerName: 'Jordan Blake', badgeId: 'B-9100', certification: '' },
    });
    expect(screen.getByLabelText(/responder name/i)).toHaveValue('Jordan Blake');
    expect(screen.getByLabelText(/badge \/ employee id/i)).toHaveValue('B-9100');
    expect(screen.getByRole('alert')).toHaveTextContent(/Enter the responder/);
  });

  it('starts empty again after a successful enrollment', () => {
    renderWith({ message: 'Jordan Blake is on the program at level 1.' });
    expect(screen.getByLabelText(/responder name/i)).toHaveValue('');
    expect(screen.getByRole('status')).toHaveTextContent(/on the program/);
  });
});
