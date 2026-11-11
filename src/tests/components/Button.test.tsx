import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from '@/ui/components/Button';

describe('Button', () => {
  it('renders children and is a button element', () => {
    render(<Button>Test</Button>);
    const button = screen.getByRole('button', { name: /test/i });
    expect(button).toBeInTheDocument();
    expect(button.tagName).toBe('BUTTON');
  });

  it('applies variant and size classes', () => {
    render(<Button variant="danger" size="lg">Danger</Button>);
    const button = screen.getByRole('button', { name: /danger/i });
    expect(button).toHaveClass('btn--danger');
    expect(button).toHaveClass('btn--lg');
  });

  it('sets aria-busy when isLoading is set', () => {
    render(<Button isLoading>Loading</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');
  });
});
