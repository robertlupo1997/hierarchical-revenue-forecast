import type { ForecastDataPoint } from '../components/ForecastChart';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export type ExportFormat = 'csv' | 'excel' | 'pdf';

export interface ExportOptions {
  data: ForecastDataPoint[];
  storeNbr: number;
  family: string;
  startDate: string;
  horizon: number;
}

/**
 * Generate a filename for export based on context
 */
function generateFilename(options: ExportOptions, extension: string): string {
  const { storeNbr, family, startDate, horizon } = options;
  const sanitizedFamily = family.toLowerCase().replace(/\s+/g, '-');
  return `forecast_store${storeNbr}_${sanitizedFamily}_${startDate}_${horizon}d.${extension}`;
}

/**
 * Format a value for display in exports
 */
function formatValue(val: number | undefined): string {
  return val !== undefined ? val.toFixed(2) : '';
}

/**
 * Exports forecast data to a CSV file and triggers download
 */
export function exportToCSV(options: ExportOptions): void {
  const { data } = options;

  // CSV header
  const header = 'date,actual,forecast,lower_80,upper_80,lower_95,upper_95\n';

  // CSV rows - format each data point
  const rows = data
    .map((d) => {
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

  const filename = generateFilename(options, 'csv');

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

/**
 * Exports forecast data to an Excel file and triggers download
 */
export function exportToExcel(options: ExportOptions): void {
  const { data, storeNbr, family, startDate, horizon } = options;

  // Prepare data for Excel with headers
  const excelData = data.map((d) => ({
    Date: d.date,
    Actual: d.actual ?? '',
    Forecast: d.forecast ?? '',
    'Lower 80%': d.lower_80 ?? '',
    'Upper 80%': d.upper_80 ?? '',
    'Lower 95%': d.lower_95 ?? '',
    'Upper 95%': d.upper_95 ?? '',
  }));

  // Create workbook and worksheet
  const ws = XLSX.utils.json_to_sheet(excelData);
  const wb = XLSX.utils.book_new();

  // Set column widths
  ws['!cols'] = [
    { wch: 12 }, // Date
    { wch: 12 }, // Actual
    { wch: 12 }, // Forecast
    { wch: 12 }, // Lower 80%
    { wch: 12 }, // Upper 80%
    { wch: 12 }, // Lower 95%
    { wch: 12 }, // Upper 95%
  ];

  // Add metadata sheet
  const metadata = [
    ['MLRF Forecast Report'],
    [],
    ['Store', storeNbr],
    ['Family', family],
    ['Start Date', startDate],
    ['Horizon', `${horizon} days`],
    ['Generated', new Date().toISOString()],
  ];
  const metaWs = XLSX.utils.aoa_to_sheet(metadata);

  XLSX.utils.book_append_sheet(wb, metaWs, 'Summary');
  XLSX.utils.book_append_sheet(wb, ws, 'Forecast Data');

  const filename = generateFilename(options, 'xlsx');
  XLSX.writeFile(wb, filename);
}

/**
 * Exports forecast data to a PDF report and triggers download
 */
export function exportToPDF(options: ExportOptions): void {
  const { data, storeNbr, family, startDate, horizon } = options;

  // Create PDF document
  const doc = new jsPDF();

  // Header
  doc.setFontSize(18);
  doc.setTextColor(33, 33, 33);
  doc.text('MLRF Forecast Report', 14, 22);

  // Metadata section
  doc.setFontSize(11);
  doc.setTextColor(100, 100, 100);
  doc.text(`Store: ${storeNbr}`, 14, 35);
  doc.text(`Product Family: ${family}`, 14, 42);
  doc.text(`Start Date: ${startDate}`, 14, 49);
  doc.text(`Forecast Horizon: ${horizon} days`, 14, 56);
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 63);

  // Divider line
  doc.setDrawColor(200, 200, 200);
  doc.line(14, 68, 196, 68);

  // Summary statistics
  const forecasts = data.filter((d) => d.forecast !== undefined);
  const actuals = data.filter((d) => d.actual !== undefined);

  if (forecasts.length > 0 || actuals.length > 0) {
    doc.setFontSize(12);
    doc.setTextColor(33, 33, 33);
    doc.text('Summary Statistics', 14, 78);

    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);

    let yPos = 86;

    if (actuals.length > 0) {
      const avgActual = actuals.reduce((sum, d) => sum + (d.actual ?? 0), 0) / actuals.length;
      doc.text(`Historical Average: $${avgActual.toFixed(2)}`, 14, yPos);
      yPos += 7;
    }

    if (forecasts.length > 0) {
      const avgForecast = forecasts.reduce((sum, d) => sum + (d.forecast ?? 0), 0) / forecasts.length;
      const minForecast = Math.min(...forecasts.map((d) => d.forecast ?? Infinity));
      const maxForecast = Math.max(...forecasts.map((d) => d.forecast ?? -Infinity));

      doc.text(`Average Forecast: $${avgForecast.toFixed(2)}`, 14, yPos);
      yPos += 7;
      doc.text(`Forecast Range: $${minForecast.toFixed(2)} - $${maxForecast.toFixed(2)}`, 14, yPos);
      yPos += 7;
    }
  }

  // Forecast table
  const tableData = data.map((d) => [
    d.date,
    d.actual !== undefined ? `$${d.actual.toFixed(2)}` : '-',
    d.forecast !== undefined ? `$${d.forecast.toFixed(2)}` : '-',
    d.lower_80 !== undefined && d.upper_80 !== undefined
      ? `$${d.lower_80.toFixed(2)} - $${d.upper_80.toFixed(2)}`
      : '-',
    d.lower_95 !== undefined && d.upper_95 !== undefined
      ? `$${d.lower_95.toFixed(2)} - $${d.upper_95.toFixed(2)}`
      : '-',
  ]);

  autoTable(doc, {
    startY: 110,
    head: [['Date', 'Actual', 'Forecast', '80% CI', '95% CI']],
    body: tableData,
    theme: 'striped',
    headStyles: {
      fillColor: [59, 130, 246], // Blue
      textColor: 255,
      fontStyle: 'bold',
    },
    styles: {
      fontSize: 9,
      cellPadding: 3,
    },
    alternateRowStyles: {
      fillColor: [245, 247, 250],
    },
    columnStyles: {
      0: { cellWidth: 30 },
      1: { cellWidth: 30, halign: 'right' },
      2: { cellWidth: 30, halign: 'right' },
      3: { cellWidth: 45, halign: 'center' },
      4: { cellWidth: 45, halign: 'center' },
    },
  });

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Page ${i} of ${pageCount} | MLRF Dashboard`,
      doc.internal.pageSize.width / 2,
      doc.internal.pageSize.height - 10,
      { align: 'center' }
    );
  }

  const filename = generateFilename(options, 'pdf');
  doc.save(filename);
}

/**
 * Export data in the specified format
 */
export function exportData(options: ExportOptions, format: ExportFormat): void {
  switch (format) {
    case 'csv':
      exportToCSV(options);
      break;
    case 'excel':
      exportToExcel(options);
      break;
    case 'pdf':
      exportToPDF(options);
      break;
  }
}
