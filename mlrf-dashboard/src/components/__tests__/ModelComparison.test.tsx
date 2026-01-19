import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ModelComparison } from '../ModelComparison';
import type { ModelMetric } from '../../lib/api';

// Sample test data
const mockModels: ModelMetric[] = [
  { model: 'LightGBM', rmsle: 0.45, mape: 15.2, rmse: 1250 },
  { model: 'XGBoost', rmsle: 0.48, mape: 16.5, rmse: 1320 },
  { model: 'ARIMA', rmsle: 0.62, mape: 22.1, rmse: 1580 },
];

const singleModel: ModelMetric[] = [
  { model: 'LightGBM', rmsle: 0.45, mape: 15.2, rmse: 1250 },
];

describe('ModelComparison', () => {
  describe('Rendering', () => {
    it('renders without crashing', () => {
      render(<ModelComparison data={mockModels} />);
      expect(screen.getByText('Model Performance')).toBeInTheDocument();
    });

    it('renders all models in the table', () => {
      render(<ModelComparison data={mockModels} />);
      // LightGBM appears in both best model section and table
      expect(screen.getAllByText('LightGBM').length).toBeGreaterThan(0);
      expect(screen.getByText('XGBoost')).toBeInTheDocument();
      expect(screen.getByText('ARIMA')).toBeInTheDocument();
    });

    it('renders metric selector dropdown', () => {
      render(<ModelComparison data={mockModels} />);
      const select = screen.getByRole('combobox');
      expect(select).toBeInTheDocument();
    });

    it('renders chart container', () => {
      render(<ModelComparison data={mockModels} />);
      // Recharts ResponsiveContainer renders with this class
      expect(document.querySelector('.recharts-responsive-container')).toBeInTheDocument();
    });

    it('renders table with all metric columns', () => {
      render(<ModelComparison data={mockModels} />);
      expect(screen.getByRole('columnheader', { name: /model/i })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /rmsle/i })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /mape/i })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /rmse/i })).toBeInTheDocument();
    });
  });

  describe('Metric Selection', () => {
    it('defaults to RMSLE metric', () => {
      render(<ModelComparison data={mockModels} />);
      const select = screen.getByRole('combobox');
      expect(select).toHaveValue('rmsle');
    });

    it('respects initialMetric prop', () => {
      render(<ModelComparison data={mockModels} initialMetric="mape" />);
      const select = screen.getByRole('combobox');
      expect(select).toHaveValue('mape');
    });

    it('changes selected metric when dropdown is changed', () => {
      render(<ModelComparison data={mockModels} />);
      const select = screen.getByRole('combobox');

      fireEvent.change(select, { target: { value: 'rmse' } });

      expect(select).toHaveValue('rmse');
    });

    it('shows correct description for RMSLE', () => {
      render(<ModelComparison data={mockModels} initialMetric="rmsle" />);
      expect(screen.getByText(/root mean squared logarithmic error/i)).toBeInTheDocument();
    });

    it('shows correct description for MAPE', () => {
      render(<ModelComparison data={mockModels} initialMetric="mape" />);
      expect(screen.getByText(/mean absolute percentage error/i)).toBeInTheDocument();
    });

    it('shows correct description for RMSE', () => {
      render(<ModelComparison data={mockModels} initialMetric="rmse" />);
      expect(screen.getByText(/root mean squared error/i)).toBeInTheDocument();
    });
  });

  describe('Best Model Highlight', () => {
    it('highlights the best model', () => {
      render(<ModelComparison data={mockModels} />);
      expect(screen.getByText('Best Model')).toBeInTheDocument();
    });

    it('shows LightGBM as best for RMSLE (lowest value)', () => {
      render(<ModelComparison data={mockModels} initialMetric="rmsle" />);
      // Best model section should contain LightGBM
      const bestModelSection = screen.getByText('Best Model').closest('div');
      expect(bestModelSection).toHaveTextContent('LightGBM');
    });

    it('shows improvement percentage compared to worst model', () => {
      render(<ModelComparison data={mockModels} initialMetric="rmsle" />);
      // LightGBM (0.45) vs ARIMA (0.62): (0.62-0.45)/0.62 = ~27.4%
      expect(screen.getByText(/% better than worst/i)).toBeInTheDocument();
    });

    it('does not show improvement for single model', () => {
      render(<ModelComparison data={singleModel} />);
      expect(screen.queryByText(/better than worst/i)).not.toBeInTheDocument();
    });
  });

  describe('Sorting', () => {
    it('sorts models by selected metric (ascending)', () => {
      render(<ModelComparison data={mockModels} initialMetric="rmsle" />);

      const table = screen.getByRole('table');
      const rows = within(table).getAllByRole('row');
      // Skip header row (index 0)
      const modelCells = rows.slice(1).map(
        (row) => within(row).getAllByRole('cell')[0].textContent
      );

      // Should be sorted: LightGBM (0.45), XGBoost (0.48), ARIMA (0.62)
      expect(modelCells[0]).toContain('LightGBM');
      expect(modelCells[1]).toContain('XGBoost');
      expect(modelCells[2]).toContain('ARIMA');
    });

    it('re-sorts when metric changes', () => {
      const customModels: ModelMetric[] = [
        { model: 'ModelA', rmsle: 0.5, mape: 10, rmse: 100 },
        { model: 'ModelB', rmsle: 0.4, mape: 20, rmse: 150 },
        { model: 'ModelC', rmsle: 0.6, mape: 15, rmse: 50 },
      ];

      render(<ModelComparison data={customModels} initialMetric="rmsle" />);

      const table = screen.getByRole('table');

      // By RMSLE: ModelB (0.4), ModelA (0.5), ModelC (0.6)
      let rows = within(table).getAllByRole('row').slice(1);
      expect(rows[0]).toHaveTextContent('ModelB');

      // Change to MAPE
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'mape' } });

      // By MAPE: ModelA (10), ModelC (15), ModelB (20)
      rows = within(table).getAllByRole('row').slice(1);
      expect(rows[0]).toHaveTextContent('ModelA');
    });
  });

  describe('Table Styling', () => {
    it('highlights selected metric column', () => {
      render(<ModelComparison data={mockModels} initialMetric="rmsle" />);

      const headers = screen.getAllByRole('columnheader');
      const rmsleHeader = headers.find((h) => h.textContent?.toLowerCase() === 'rmsle');

      expect(rmsleHeader).toHaveClass('bg-primary/10');
    });

    it('updates highlighted column when metric changes', () => {
      render(<ModelComparison data={mockModels} initialMetric="rmsle" />);

      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'mape' } });

      const headers = screen.getAllByRole('columnheader');
      const mapeHeader = headers.find((h) => h.textContent?.toLowerCase() === 'mape');
      const rmsleHeader = headers.find((h) => h.textContent?.toLowerCase() === 'rmsle');

      expect(mapeHeader).toHaveClass('bg-primary/10');
      expect(rmsleHeader).not.toHaveClass('bg-primary/10');
    });

    it('highlights best model row', () => {
      render(<ModelComparison data={mockModels} />);

      const table = screen.getByRole('table');
      const rows = within(table).getAllByRole('row').slice(1);

      // First row (best model) should have special styling
      expect(rows[0]).toHaveClass('bg-success/5');
    });
  });

  describe('Number Formatting', () => {
    it('formats metric values with 4 decimal places', () => {
      render(<ModelComparison data={mockModels} />);

      // RMSLE value 0.45 should be displayed as 0.4500
      const table = screen.getByRole('table');
      expect(table).toHaveTextContent('0.4500');
    });
  });

  describe('Award Badge', () => {
    it('shows award icon for best model in table', () => {
      const { container } = render(<ModelComparison data={mockModels} />);

      // Award icon should appear (best model highlight box + table row)
      const awardIcons = container.querySelectorAll('svg');
      // Just check that icons are present (lucide icons render as SVGs)
      expect(awardIcons.length).toBeGreaterThan(0);
    });
  });

  describe('Empty/Edge Cases', () => {
    it('handles empty data array', () => {
      render(<ModelComparison data={[]} />);
      // Should still render without crashing
      expect(screen.getByText('Model Performance')).toBeInTheDocument();
    });

    it('handles single model', () => {
      render(<ModelComparison data={singleModel} />);
      // LightGBM appears multiple times (best model section + table), so use getAllByText
      expect(screen.getAllByText('LightGBM').length).toBeGreaterThan(0);
      expect(screen.getByText('Best Model')).toBeInTheDocument();
    });
  });
});
