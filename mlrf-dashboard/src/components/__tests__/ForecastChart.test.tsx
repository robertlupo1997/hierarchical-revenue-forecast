import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ForecastChart, type ForecastDataPoint } from '../ForecastChart';

// Sample test data
const mockData: ForecastDataPoint[] = [
  { date: '2024-01-01', actual: 10000 },
  { date: '2024-01-02', actual: 12000 },
  { date: '2024-01-03', actual: 11000 },
  { date: '2024-01-04', forecast: 13000, lower_80: 11500, upper_80: 14500, lower_95: 10500, upper_95: 15500 },
  { date: '2024-01-05', forecast: 14000, lower_80: 12000, upper_80: 16000, lower_95: 11000, upper_95: 17000 },
];

const forecastOnlyData: ForecastDataPoint[] = [
  { date: '2024-01-01', forecast: 10000, lower_80: 9000, upper_80: 11000, lower_95: 8000, upper_95: 12000 },
  { date: '2024-01-02', forecast: 12000, lower_80: 11000, upper_80: 13000, lower_95: 10000, upper_95: 14000 },
];

const actualOnlyData: ForecastDataPoint[] = [
  { date: '2024-01-01', actual: 10000 },
  { date: '2024-01-02', actual: 12000 },
];

describe('ForecastChart', () => {
  describe('Rendering', () => {
    it('renders without crashing', () => {
      render(<ForecastChart data={mockData} />);
      // Recharts ResponsiveContainer renders with this class
      expect(document.querySelector('.recharts-responsive-container')).toBeInTheDocument();
    });

    it('renders with title when provided', () => {
      render(<ForecastChart data={mockData} title="Revenue Forecast" />);
      expect(screen.getByText('Revenue Forecast')).toBeInTheDocument();
    });

    it('renders legend items', () => {
      render(<ForecastChart data={mockData} />);
      expect(screen.getByText('Historical')).toBeInTheDocument();
      expect(screen.getByText('Forecast')).toBeInTheDocument();
    });

    it('renders confidence interval legend when showConfidenceIntervals is true', () => {
      render(<ForecastChart data={mockData} showConfidenceIntervals />);
      expect(screen.getByText('80% CI')).toBeInTheDocument();
      expect(screen.getByText('95% CI')).toBeInTheDocument();
    });

    it('hides confidence interval legend when showConfidenceIntervals is false', () => {
      render(<ForecastChart data={mockData} showConfidenceIntervals={false} />);
      expect(screen.queryByText('80% CI')).not.toBeInTheDocument();
      expect(screen.queryByText('95% CI')).not.toBeInTheDocument();
    });

    it('renders empty chart with no data', () => {
      render(<ForecastChart data={[]} />);
      // Recharts ResponsiveContainer still renders
      expect(document.querySelector('.recharts-responsive-container')).toBeInTheDocument();
    });
  });

  describe('Trend Badge', () => {
    it('shows upward trend when forecast is higher than actual', () => {
      render(<ForecastChart data={mockData} />);
      // mockData has increasing forecast, should show "up" trend
      const trendBadge = screen.getByText(/% up/i);
      expect(trendBadge).toBeInTheDocument();
    });

    it('shows downward trend when forecast is lower than actual', () => {
      const downwardData: ForecastDataPoint[] = [
        { date: '2024-01-01', actual: 20000 },
        { date: '2024-01-02', actual: 18000 },
        { date: '2024-01-03', forecast: 10000 },
        { date: '2024-01-04', forecast: 9000 },
      ];
      render(<ForecastChart data={downwardData} />);
      const trendBadge = screen.getByText(/% down/i);
      expect(trendBadge).toBeInTheDocument();
    });

    it('shows stable trend when forecast equals actual', () => {
      const stableData: ForecastDataPoint[] = [
        { date: '2024-01-01', actual: 10000 },
        { date: '2024-01-02', forecast: 10000 },
      ];
      render(<ForecastChart data={stableData} />);
      expect(screen.getByText('Stable')).toBeInTheDocument();
    });
  });

  describe('Export Dropdown', () => {
    it('renders export button when onExport is provided', () => {
      const onExport = vi.fn();
      render(<ForecastChart data={mockData} onExport={onExport} exportEnabled />);
      expect(screen.getByText('Export')).toBeInTheDocument();
    });

    it('does not render export button when onExport is not provided', () => {
      render(<ForecastChart data={mockData} />);
      expect(screen.queryByText('Export')).not.toBeInTheDocument();
    });

    it('export button is disabled when exportEnabled is false', () => {
      const onExport = vi.fn();
      render(<ForecastChart data={mockData} onExport={onExport} exportEnabled={false} />);
      const exportButton = screen.getByText('Export').closest('button');
      expect(exportButton).toBeDisabled();
    });

    it('export button is enabled when exportEnabled is true', () => {
      const onExport = vi.fn();
      render(<ForecastChart data={mockData} onExport={onExport} exportEnabled />);
      const exportButton = screen.getByText('Export').closest('button');
      expect(exportButton).not.toBeDisabled();
    });

    it('shows dropdown menu when export button is clicked', async () => {
      const onExport = vi.fn();
      render(<ForecastChart data={mockData} onExport={onExport} exportEnabled />);

      const exportButton = screen.getByText('Export').closest('button');
      fireEvent.click(exportButton!);

      await waitFor(() => {
        expect(screen.getByRole('menu')).toBeInTheDocument();
      });
    });

    it('shows CSV, Excel, and PDF options in dropdown', async () => {
      const onExport = vi.fn();
      render(<ForecastChart data={mockData} onExport={onExport} exportEnabled />);

      const exportButton = screen.getByText('Export').closest('button');
      fireEvent.click(exportButton!);

      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: /csv/i })).toBeInTheDocument();
        expect(screen.getByRole('menuitem', { name: /excel/i })).toBeInTheDocument();
        expect(screen.getByRole('menuitem', { name: /pdf/i })).toBeInTheDocument();
      });
    });

    it('calls onExport with correct format when option is clicked', async () => {
      const onExport = vi.fn();
      render(<ForecastChart data={mockData} onExport={onExport} exportEnabled />);

      // Open dropdown
      const exportButton = screen.getByText('Export').closest('button');
      fireEvent.click(exportButton!);

      // Click CSV option
      await waitFor(() => {
        const csvOption = screen.getByRole('menuitem', { name: /csv/i });
        fireEvent.click(csvOption);
      });

      expect(onExport).toHaveBeenCalledWith('csv');
    });

    it('closes dropdown after selecting an option', async () => {
      const onExport = vi.fn();
      render(<ForecastChart data={mockData} onExport={onExport} exportEnabled />);

      // Open dropdown
      const exportButton = screen.getByText('Export').closest('button');
      fireEvent.click(exportButton!);

      // Click CSV option
      await waitFor(() => {
        const csvOption = screen.getByRole('menuitem', { name: /csv/i });
        fireEvent.click(csvOption);
      });

      // Dropdown should be closed
      await waitFor(() => {
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      });
    });
  });

  describe('Statistics Calculation', () => {
    it('calculates average values correctly', () => {
      // This tests internal logic through rendered output
      const simpleData: ForecastDataPoint[] = [
        { date: '2024-01-01', actual: 100 },
        { date: '2024-01-02', actual: 200 },
        { date: '2024-01-03', forecast: 200 },
        { date: '2024-01-04', forecast: 300 },
      ];
      render(<ForecastChart data={simpleData} />);
      // Average actual: 150, Average forecast: 250
      // Trend: up, Percent: ~66.7%
      expect(screen.getByText(/66\.7% up/i)).toBeInTheDocument();
    });

    it('handles forecast-only data', () => {
      render(<ForecastChart data={forecastOnlyData} />);
      // With no actuals, average actual is 0, trend shows as up (forecast > 0)
      // Check that some trend badge is rendered
      expect(screen.getByText(/% up/i)).toBeInTheDocument();
    });

    it('handles actual-only data', () => {
      render(<ForecastChart data={actualOnlyData} />);
      // With no forecasts, average forecast is 0, trend should be down or stable
      expect(screen.queryByText(/% up/i)).not.toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('export button has aria-expanded attribute', () => {
      const onExport = vi.fn();
      render(<ForecastChart data={mockData} onExport={onExport} exportEnabled />);

      const exportButton = screen.getByText('Export').closest('button');
      expect(exportButton).toHaveAttribute('aria-expanded', 'false');
    });

    it('export button aria-expanded updates when opened', async () => {
      const onExport = vi.fn();
      render(<ForecastChart data={mockData} onExport={onExport} exportEnabled />);

      const exportButton = screen.getByText('Export').closest('button');
      fireEvent.click(exportButton!);

      await waitFor(() => {
        expect(exportButton).toHaveAttribute('aria-expanded', 'true');
      });
    });

    it('has accessible menu role for dropdown', async () => {
      const onExport = vi.fn();
      render(<ForecastChart data={mockData} onExport={onExport} exportEnabled />);

      const exportButton = screen.getByText('Export').closest('button');
      fireEvent.click(exportButton!);

      await waitFor(() => {
        expect(screen.getByRole('menu')).toBeInTheDocument();
      });
    });
  });
});
