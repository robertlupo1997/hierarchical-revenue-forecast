import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AccuracyChart } from '../AccuracyChart';
import type { AccuracyDataPoint, AccuracySummary } from '../../lib/api';

const mockData: AccuracyDataPoint[] = [
  { date: '2017-07-01', actual: 850000, predicted: 830000, error: 20000, mape: 2.35 },
  { date: '2017-07-02', actual: 920000, predicted: 905000, error: 15000, mape: 1.63 },
  { date: '2017-07-03', actual: 880000, predicted: 890000, error: -10000, mape: 1.14 },
];

const mockSummaryOverpredict: AccuracySummary = {
  data_points: 15,
  mean_actual: 924000,
  mean_predicted: 950000,
  mean_error: -26000, // Negative = overpredicting
  mean_mape: 1.24,
  correlation: 0.95,
};

const mockSummaryUnderpredict: AccuracySummary = {
  data_points: 15,
  mean_actual: 924000,
  mean_predicted: 900000,
  mean_error: 24000, // Positive = underpredicting
  mean_mape: 1.24,
  correlation: 0.95,
};

const mockSummaryCalibrated: AccuracySummary = {
  data_points: 15,
  mean_actual: 924000,
  mean_predicted: 924000,
  mean_error: 0, // Zero = well calibrated
  mean_mape: 1.24,
  correlation: 0.95,
};

describe('AccuracyChart', () => {
  it('renders with default title', () => {
    render(<AccuracyChart data={mockData} summary={mockSummaryOverpredict} />);

    expect(screen.getByText('Model Accuracy')).toBeInTheDocument();
  });

  it('renders with custom title', () => {
    render(
      <AccuracyChart
        data={mockData}
        summary={mockSummaryOverpredict}
        title="Custom Accuracy Title"
      />
    );

    expect(screen.getByText('Custom Accuracy Title')).toBeInTheDocument();
  });

  it('renders subtitle text', () => {
    render(<AccuracyChart data={mockData} summary={mockSummaryOverpredict} />);

    expect(
      screen.getByText('Predicted vs actual on validation data')
    ).toBeInTheDocument();
  });

  it('displays correlation value', () => {
    render(<AccuracyChart data={mockData} summary={mockSummaryOverpredict} />);

    expect(screen.getByText('Corr:')).toBeInTheDocument();
    expect(screen.getByText('0.950')).toBeInTheDocument();
  });

  it('displays MAPE value', () => {
    render(<AccuracyChart data={mockData} summary={mockSummaryOverpredict} />);

    expect(screen.getByText('MAPE:')).toBeInTheDocument();
    expect(screen.getByText('1.24%')).toBeInTheDocument();
  });

  it('displays data points count', () => {
    render(<AccuracyChart data={mockData} summary={mockSummaryOverpredict} />);

    expect(screen.getByText('Points:')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
  });

  it('shows "Tends to overpredict" badge when mean_error is negative', () => {
    render(<AccuracyChart data={mockData} summary={mockSummaryOverpredict} />);

    // Full text on larger screens
    expect(screen.getByText('Tends to overpredict')).toBeInTheDocument();
  });

  it('shows "Tends to underpredict" badge when mean_error is positive', () => {
    render(<AccuracyChart data={mockData} summary={mockSummaryUnderpredict} />);

    expect(screen.getByText('Tends to underpredict')).toBeInTheDocument();
  });

  it('shows "Well calibrated" badge when mean_error is zero', () => {
    render(<AccuracyChart data={mockData} summary={mockSummaryCalibrated} />);

    expect(screen.getByText('Well calibrated')).toBeInTheDocument();
  });

  it('renders legend items', () => {
    render(<AccuracyChart data={mockData} summary={mockSummaryOverpredict} />);

    // Check for legend text
    expect(screen.getByText('Actual')).toBeInTheDocument();
    expect(screen.getByText('Predicted')).toBeInTheDocument();
    expect(screen.getByText('Error Band')).toBeInTheDocument();
  });

  it('renders with high correlation color class', () => {
    const highCorrSummary = { ...mockSummaryOverpredict, correlation: 0.95 };
    const { container } = render(
      <AccuracyChart data={mockData} summary={highCorrSummary} />
    );

    // Correlation >= 0.9 should have success color
    const corrElement = container.querySelector('.text-success');
    expect(corrElement).toBeInTheDocument();
  });

  it('renders with medium correlation color class', () => {
    const medCorrSummary = { ...mockSummaryOverpredict, correlation: 0.85 };
    const { container } = render(
      <AccuracyChart data={mockData} summary={medCorrSummary} />
    );

    // Correlation 0.8-0.9 should have warning color
    const corrElement = container.querySelector('.text-warning');
    expect(corrElement).toBeInTheDocument();
  });

  it('renders with low correlation color class', () => {
    const lowCorrSummary = { ...mockSummaryOverpredict, correlation: 0.7 };
    const { container } = render(
      <AccuracyChart data={mockData} summary={lowCorrSummary} />
    );

    // Correlation < 0.8 should have destructive color
    const corrElement = container.querySelector('.text-destructive');
    expect(corrElement).toBeInTheDocument();
  });

  it('renders chart container', () => {
    const { container } = render(
      <AccuracyChart data={mockData} summary={mockSummaryOverpredict} />
    );

    expect(container.querySelector('.chart-container')).toBeInTheDocument();
  });
});
