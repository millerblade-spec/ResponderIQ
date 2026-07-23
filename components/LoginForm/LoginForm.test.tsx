import { describe, it, expect, vi } from 'vitest';
import { act } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LoginForm } from './LoginForm';

const loginMock = vi.fn();

vi.mock('@/app/admin/login/actions', () => ({
  login: (...args: unknown[]) => loginMock(...args),
}));

describe('LoginForm', () => {
  it('has accessible, properly associated labels for both fields', () => {
    render(<LoginForm />);
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toHaveAttribute('type', 'password');
  });

  it('does not render a hidden next field when no next is given', () => {
    const { container } = render(<LoginForm />);
    expect(container.querySelector('input[name="next"]')).toBeNull();
  });

  it('includes the next value as a hidden field when provided', () => {
    const { container } = render(<LoginForm next="/admin/scenarios/bls-01" />);
    const hidden = container.querySelector('input[name="next"]');
    expect(hidden).toHaveAttribute('type', 'hidden');
    expect(hidden).toHaveValue('/admin/scenarios/bls-01');
  });

  it('shows a generic error message returned by the action, without saying which field was wrong', async () => {
    loginMock.mockResolvedValue({ error: 'Incorrect username or password.' });
    render(<LoginForm />);

    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Incorrect username or password.');
    });
  });

  it('disables the submit button and shows a pending label while submitting', async () => {
    let resolveLogin: (value: { error?: string }) => void = () => {};
    loginMock.mockReturnValue(
      new Promise((resolve) => {
        resolveLogin = resolve;
      }),
    );

    render(<LoginForm />);
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole('button')).toBeDisabled();
      expect(screen.getByRole('button')).toHaveTextContent(/signing in/i);
    });

    resolveLogin({});
    await act(async () => {});
  });
});
