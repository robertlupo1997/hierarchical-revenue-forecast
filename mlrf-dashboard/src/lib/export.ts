import type { ForecastDataPoint } from '../components/ForecastChart';

export interface ExportOptions {
  data: ForecastDataPoint[];
  storeNbr: number;
  family: string;
  startDate: string;
  horizon: number;
}

/**
 * Exports forecast data to a CSV file and triggers download
 */
export function exportToCSV(options: ExportOptions): void {
  const { data, storeNbr, family, startDate, horizon } = options;

  // CSV header
  const header = 'date,actual,forecast,lower_80,upper_80,lower_95,upper_95\n';

  // CSV rows - format each data point
  const rows = data
    .map((d) => {
      const formatValue = (val: number | undefined) =>
        val !== undefined ? val.toFixed(2) : '';

      return [
        d.date,
        formatValue(d.actual),
        formatValue(d.forecast),
        formatValue(d.lower_80),
        formatValue(d.upper_80),
        formatValue(d.lower_95),
        formatValue(d.upper_95),
      ].join(',');
    })
    .join('\n');

  // Create blob and trigger download
  const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  // Generate filename: forecast_store1_grocery-i_2017-08-01_90d.csv
  const sanitizedFamily = family.toLowerCase().replace(/\s+/g, '-');
  const filename = `forecast_store${storeNbr}_${sanitizedFamily}_${startDate}_${horizon}d.csv`;

  // Create temporary anchor element and trigger download
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();

  // Cleanup
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
