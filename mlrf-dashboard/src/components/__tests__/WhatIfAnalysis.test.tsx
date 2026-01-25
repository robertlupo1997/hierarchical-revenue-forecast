import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WhatIfAnalysis } from '../WhatIfAnalysis';

// Mock the API
vi.mock('../../lib/api', () => ({
  fetchWhatIf: vi.fn(),
}));

import { fetchWhatIf } from '../../lib/api';

const mockFetchWhatIf = vi.mocked(fetchWhatIf);

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

const defaultProps = {
  storeNbr: 1,
  family: 'GROCERY I',
  date: '2017-08-01',
  horizon: 30,
};

describe('WhatIfAnalysis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders header with title', () => {
    renderWithQueryClient(<WhatIfAnalysis {...defaultProps} />);

    expect(screen.getByText('What-If Analysis')).toBeInTheDocument();
  });

  it('renders subtitle', () => {
    renderWithQueryClient(<WhatIfAnalysis {...defaultProps} />);

    expect(
      screen.getByText('Explore how changes affect predictions')
    ).toBeInTheDocument();
  });

  it('renders Oil Price slider', () => {
    renderWithQueryClient(<WhatIfAnalysis {...defaultProps} />);

    expect(screen.getByText('Oil Price')).toBeInTheDocument();
  });

  it('renders Promotion toggle buttons', () => {
    renderWithQueryClient(<WhatIfAnalysis {...defaultProps} />);

    expect(screen.getByText('Promotion')).toBeInTheDocument();
    // Binary toggle has Yes/No buttons
    const noButtons = screen.getAllByRole('button', { name: 'No' });
    const yesButtons = screen.getAllByRole('button', { name: 'Yes' });
    expect(noButtons.length).toBeGreaterThan(0);
    expect(yesButtons.length).toBeGreaterThan(0);
  });

  it('renders Day of Week selector', () => {
    renderWithQueryClient(<WhatIfAnalysis {...defaultProps} />);

    expect(screen.getByText('Day of Week')).toBeInTheDocument();
    // Day buttons: S M T W T F S
    expect(screen.getAllByRole('button', { name: 'S' }).length).toBe(2); // Sun and Sat
    expect(screen.getByRole('button', { name: 'M' })).toBeInTheDocument();
  });

  it('renders Reset button', () => {
    renderWithQueryClient(<WhatIfAnalysis {...defaultProps} />);

    expect(screen.getByRole('button', { name: /reset/i })).toBeInTheDocument();
  });

  it('renders Analyze Impact button', () => {
    renderWithQueryClient(<WhatIfAnalysis {...defaultProps} />);

    expect(
      screen.getByRole('button', { name: /analyze impact/i })
    ).toBeInTheDocument();
  });

  it('Reset button is disabled when no changes made', () => {
    renderWithQueryClient(<WhatIfAnalysis {...defaultProps} />);

    const resetButton = screen.getByRole('button', { name: /reset/i });
    expect(resetButton).toBeDisabled();
  });

  it('enables Reset button after making changes', () => {
    renderWithQueryClient(<WhatIfAnalysis {...defaultProps} />);

    // Click "Yes" on promotion toggle
    const yesButtons = screen.getAllByRole('button', { name: 'Yes' });
    fireEvent.click(yesButtons[0]);

    const resetButton = screen.getByRole('button', { name: /reset/i });
    expect(resetButton).not.toBeDisabled();
  });

  it('changes promotion toggle when Yes is clicked', () => {
    renderWithQueryClient(<WhatIfAnalysis {...defaultProps} />);

    const yesButtons = screen.getAllByRole('button', { name: 'Yes' });
    fireEvent.click(yesButtons[0]);

    // The "Yes" button should now have primary styling
    expect(yesButtons[0]).toHaveClass('bg-primary');
  });

  it('changes day of week when a day button is clicked', () => {
    renderWithQueryClient(<WhatIfAnalysis {...defaultProps} />);

    const mondayButton = screen.getByRole('button', { name: 'M' });
    fireEvent.click(mondayButton);

    expect(mondayButton).toHaveClass('bg-primary');
  });

  it('calls fetchWhatIf when Analyze Impact is clicked', async () => {
    mockFetchWhatIf.mockResolvedValueOnce({
      original: 1000,
      adjusted: 1100,
      delta: 100,
      delta_pct: 10,
      latency_ms: 5,
      applied: {},
    });

    renderWithQueryClient(<WhatIfAnalysis {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: /analyze impact/i }));

    await waitFor(() => {
      expect(mockFetchWhatIf).toHaveBeenCalledTimes(1);
    });
  });

  it('displays results after successful analysis', async () => {
    mockFetchWhatIf.mockResolvedValueOnce({
      original: 1000,
      adjusted: 1100,
      delta: 100,
      delta_pct: 10,
      latency_ms: 5.5,
      applied: {},
    });

    renderWithQueryClient(<WhatIfAnalysis {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: /analyze impact/i }));

    await waitFor(() => {
      expect(screen.getByText('Baseline')).toBeInTheDocument();
      expect(screen.getByText('Adjusted')).toBeInTheDocument();
      expect(screen.getByText('Impact')).toBeInTheDocument();
    });
  });

  it('displays latency in results', async () => {
    mockFetchWhatIf.mockResolvedValueOnce({
      original: 1000,
      adjusted: 1100,
      delta: 100,
      delta_pct: 10,
      latency_ms: 5.5,
      applied: {},
    });

    renderWithQueryClient(<WhatIfAnalysis {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: /analyze impact/i }));

    await waitFor(() => {
      expect(screen.getByText(/computed in 5.5ms/i)).toBeInTheDocument();
    });
  });

  it('displays error message when API fails', async () => {
    mockFetchWhatIf.mockRejectedValueOnce(new Error('API Error'));

    renderWithQueryClient(<WhatIfAnalysis {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: /analyze impact/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/analysis unavailable/i)
      ).toBeInTheDocument();
    });
  });

  it('shows loading state while analyzing', async () => {
    // Make the mock hang to simulate loading
    let resolvePromise: ((value: {
      original: number;
      adjusted: number;
      delta: number;
      delta_pct: number;
      latency_ms: number;
      applied: Record<string, number>;
    }) => void) | undefined;

    mockFetchWhatIf.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePromise = resolve;
        })
    );

    renderWithQueryClient(<WhatIfAnalysis {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: /analyze impact/i }));

    // Wait for loading state to appear
    await waitFor(() => {
      const button = screen.getByRole('button', { name: /analyzing/i });
      expect(button).toBeInTheDocument();
    });

    // Clean up by resolving the promise
    if (resolvePromise) {
      resolvePromise({
        original: 1000,
        adjusted: 1100,
        delta: 100,
        delta_pct: 10,
        latency_ms: 5,
        applied: {},
      });
    }
  });

  it('displays positive delta with success color', async () => {
    mockFetchWhatIf.mockResolvedValueOnce({
      original: 1000,
      adjusted: 1100,
      delta: 100,
      delta_pct: 10,
      latency_ms: 5,
      applied: {},
    });

    const { container } = renderWithQueryClient(
      <WhatIfAnalysis {...defaultProps} />
    );

    fireEvent.click(screen.getByRole('button', { name: /analyze impact/i }));

    await waitFor(() => {
      const successElements = container.querySelectorAll('.text-success');
      expect(successElements.length).toBeGreaterThan(0);
    });
  });

  it('displays negative delta with destructive color', async () => {
    mockFetchWhatIf.mockResolvedValueOnce({
      original: 1000,
      adjusted: 900,
      delta: -100,
      delta_pct: -10,
      latency_ms: 5,
      applied: {},
    });

    const { container } = renderWithQueryClient(
      <WhatIfAnalysis {...defaultProps} />
    );

    fireEvent.click(screen.getByRole('button', { name: /analyze impact/i }));

    await waitFor(() => {
      const destructiveElements = container.querySelectorAll('.text-destructive');
      expect(destructiveElements.length).toBeGreaterThan(0);
    });
  });
});
