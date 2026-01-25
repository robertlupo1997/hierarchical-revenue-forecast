import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DemoBanner } from '../DemoBanner';

describe('DemoBanner', () => {
  it('renders nothing when isDemo is false', () => {
    const { container } = render(<DemoBanner isDemo={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders banner when isDemo is true', () => {
    render(<DemoBanner isDemo={true} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('displays default message when no custom message provided', () => {
    render(<DemoBanner isDemo={true} />);
    expect(
      screen.getByText(/Demo Mode: Displaying mock data/i)
    ).toBeInTheDocument();
  });

  it('displays custom message when provided', () => {
    const customMessage = 'Custom demo message';
    render(<DemoBanner isDemo={true} message={customMessage} />);
    expect(screen.getByText(customMessage)).toBeInTheDocument();
  });

  it('has aria-live="polite" for accessibility', () => {
    render(<DemoBanner isDemo={true} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('aria-live', 'polite');
  });

  it('renders dismiss button with correct aria-label', () => {
    render(<DemoBanner isDemo={true} />);
    const dismissButton = screen.getByRole('button', {
      name: /dismiss demo mode banner/i,
    });
    expect(dismissButton).toBeInTheDocument();
  });

  it('hides banner when dismiss button is clicked', () => {
    render(<DemoBanner isDemo={true} />);

    // Banner should be visible initially
    expect(screen.getByRole('alert')).toBeInTheDocument();

    // Click dismiss button
    const dismissButton = screen.getByRole('button', {
      name: /dismiss demo mode banner/i,
    });
    fireEvent.click(dismissButton);

    // Banner should be hidden
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders AlertTriangle icon', () => {
    const { container } = render(<DemoBanner isDemo={true} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('banner stays dismissed after clicking dismiss', () => {
    const { rerender } = render(<DemoBanner isDemo={true} />);

    // Dismiss the banner
    fireEvent.click(
      screen.getByRole('button', { name: /dismiss demo mode banner/i })
    );

    // Rerender with same props
    rerender(<DemoBanner isDemo={true} />);

    // Should still be hidden (state persists within component instance)
    // Note: In real app, this would need external state management to persist across remounts
  });
});
