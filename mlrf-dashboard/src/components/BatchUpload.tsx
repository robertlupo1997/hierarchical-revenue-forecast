import { useState, useCallback, useRef } from 'react';
import {
  Upload,
  FileText,
  Download,
  AlertCircle,
  CheckCircle,
  XCircle,
  Loader2,
  X,
  FileDown,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { apiClient, type PredictResponse } from '../lib/api';
import * as XLSX from 'xlsx';

export interface BatchPredictionRow {
  store_nbr: number;
  family: string;
  date: string;
  horizon: number;
}

export interface BatchResultRow extends BatchPredictionRow {
  prediction?: number;
  lower_80?: number;
  upper_80?: number;
  lower_95?: number;
  upper_95?: number;
  error?: string;
  status: 'pending' | 'processing' | 'success' | 'error';
}

interface BatchUploadProps {
  onUploadComplete?: (results: BatchResultRow[]) => void;
}

// Valid product families
const VALID_FAMILIES = new Set([
  'AUTOMOTIVE', 'BABY CARE', 'BEAUTY', 'BEVERAGES', 'BOOKS', 'BREAD/BAKERY',
  'CELEBRATION', 'CLEANING', 'DAIRY', 'DELI', 'EGGS', 'FROZEN FOODS',
  'GROCERY I', 'GROCERY II', 'HARDWARE', 'HOME AND KITCHEN I', 'HOME AND KITCHEN II',
  'HOME APPLIANCES', 'HOME CARE', 'LADIESWEAR', 'LAWN AND GARDEN', 'LINGERIE',
  'LIQUOR,WINE,BEER', 'MAGAZINES', 'MEATS', 'PERSONAL CARE', 'PET SUPPLIES',
  'PLAYERS AND ELECTRONICS', 'POULTRY', 'PREPARED FOODS', 'PRODUCE',
  'SCHOOL AND OFFICE SUPPLIES', 'SEAFOOD',
]);

const VALID_HORIZONS = new Set([15, 30, 60, 90]);

function validateRow(row: Partial<BatchPredictionRow>, rowIndex: number): string | null {
  if (!row.store_nbr || typeof row.store_nbr !== 'number' || row.store_nbr < 1 || row.store_nbr > 54) {
    return `Row ${rowIndex + 1}: Invalid store number (must be 1-54)`;
  }
  if (!row.family || !VALID_FAMILIES.has(row.family.toUpperCase())) {
    return `Row ${rowIndex + 1}: Invalid family "${row.family}"`;
  }
  if (!row.date || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) {
    return `Row ${rowIndex + 1}: Invalid date format (expected YYYY-MM-DD)`;
  }
  if (!row.horizon || !VALID_HORIZONS.has(row.horizon)) {
    return `Row ${rowIndex + 1}: Invalid horizon (must be 15, 30, 60, or 90)`;
  }
  return null;
}

function parseCSV(text: string): { rows: BatchPredictionRow[]; errors: string[] } {
  const lines = text.trim().split('\n');
  if (lines.length < 2) {
    return { rows: [], errors: ['CSV must have a header row and at least one data row'] };
  }

  const header = lines[0].toLowerCase().split(',').map(h => h.trim());
  const requiredColumns = ['store_nbr', 'family', 'date', 'horizon'];
  const missingColumns = requiredColumns.filter(col => !header.includes(col));

  if (missingColumns.length > 0) {
    return { rows: [], errors: [`Missing required columns: ${missingColumns.join(', ')}`] };
  }

  const colIndex = {
    store_nbr: header.indexOf('store_nbr'),
    family: header.indexOf('family'),
    date: header.indexOf('date'),
    horizon: header.indexOf('horizon'),
  };

  const rows: BatchPredictionRow[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = line.split(',').map(v => v.trim());

    const row: Partial<BatchPredictionRow> = {
      store_nbr: parseInt(values[colIndex.store_nbr], 10),
      family: values[colIndex.family]?.toUpperCase(),
      date: values[colIndex.date],
      horizon: parseInt(values[colIndex.horizon], 10),
    };

    const error = validateRow(row, i - 1);
    if (error) {
      errors.push(error);
    } else {
      rows.push(row as BatchPredictionRow);
    }
  }

  return { rows, errors };
}

export function BatchUpload({ onUploadComplete }: BatchUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [rows, setRows] = useState<BatchResultRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && (droppedFile.name.endsWith('.csv') || droppedFile.type === 'text/csv')) {
      handleFileSelect(droppedFile);
    } else {
      setParseErrors(['Please upload a CSV file']);
    }
  }, []);

  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile);
    setParseErrors([]);
    setRows([]);

    try {
      const text = await selectedFile.text();
      const { rows: parsedRows, errors } = parseCSV(text);

      if (errors.length > 0) {
        setParseErrors(errors.slice(0, 10)); // Show first 10 errors
        if (errors.length > 10) {
          setParseErrors(prev => [...prev, `... and ${errors.length - 10} more errors`]);
        }
      }

      if (parsedRows.length > 0) {
        if (parsedRows.length > 100) {
          setParseErrors(prev => [...prev, 'Warning: Maximum 100 predictions per batch. First 100 rows will be processed.']);
        }
        const limitedRows = parsedRows.slice(0, 100);
        setRows(limitedRows.map(r => ({ ...r, status: 'pending' as const })));
      }
    } catch (err) {
      setParseErrors(['Failed to read file']);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      handleFileSelect(selectedFile);
    }
  };

  const handleReset = () => {
    setFile(null);
    setParseErrors([]);
    setRows([]);
    setProgress({ current: 0, total: 0 });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleProcess = async () => {
    if (rows.length === 0 || isProcessing) return;

    setIsProcessing(true);
    setProgress({ current: 0, total: rows.length });

    const updatedRows = [...rows];

    // Process in batches of 10 for better UX
    const batchSize = 10;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async (row, batchIndex) => {
          const rowIndex = i + batchIndex;
          updatedRows[rowIndex] = { ...updatedRows[rowIndex], status: 'processing' };
          setRows([...updatedRows]);

          try {
            const response: PredictResponse = await apiClient.predictSimple({
              store_nbr: row.store_nbr,
              family: row.family,
              date: row.date,
              horizon: row.horizon,
            });

            updatedRows[rowIndex] = {
              ...updatedRows[rowIndex],
              prediction: response.prediction,
              lower_80: response.lower_80,
              upper_80: response.upper_80,
              lower_95: response.lower_95,
              upper_95: response.upper_95,
              status: 'success',
            };
          } catch (err) {
            updatedRows[rowIndex] = {
              ...updatedRows[rowIndex],
              error: err instanceof Error ? err.message : 'Prediction failed',
              status: 'error',
            };
          }
        })
      );

      setProgress({ current: Math.min(i + batchSize, rows.length), total: rows.length });
      setRows([...updatedRows]);
    }

    setIsProcessing(false);
    onUploadComplete?.(updatedRows);
  };

  const handleDownloadResults = (format: 'csv' | 'excel') => {
    const successRows = rows.filter(r => r.status === 'success');

    if (format === 'csv') {
      const header = 'store_nbr,family,date,horizon,prediction,lower_80,upper_80,lower_95,upper_95\n';
      const csvRows = successRows.map(r =>
        [r.store_nbr, r.family, r.date, r.horizon, r.prediction?.toFixed(2),
         r.lower_80?.toFixed(2), r.upper_80?.toFixed(2),
         r.lower_95?.toFixed(2), r.upper_95?.toFixed(2)].join(',')
      ).join('\n');

      const blob = new Blob([header + csvRows], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `batch_predictions_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const excelData = successRows.map(r => ({
        'Store #': r.store_nbr,
        'Family': r.family,
        'Date': r.date,
        'Horizon': r.horizon,
        'Prediction': r.prediction,
        'Lower 80%': r.lower_80,
        'Upper 80%': r.upper_80,
        'Lower 95%': r.lower_95,
        'Upper 95%': r.upper_95,
      }));

      const ws = XLSX.utils.json_to_sheet(excelData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Predictions');
      XLSX.writeFile(wb, `batch_predictions_${new Date().toISOString().slice(0, 10)}.xlsx`);
    }
  };

  const downloadSampleCSV = () => {
    const sample = `store_nbr,family,date,horizon
1,GROCERY I,2017-08-01,90
2,BEVERAGES,2017-08-01,60
3,CLEANING,2017-08-15,30
4,DAIRY,2017-08-01,15
5,PRODUCE,2017-08-01,90`;

    const blob = new Blob([sample], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'batch_predictions_sample.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const successCount = rows.filter(r => r.status === 'success').length;
  const errorCount = rows.filter(r => r.status === 'error').length;
  const pendingCount = rows.filter(r => r.status === 'pending' || r.status === 'processing').length;

  return (
    <div className="space-y-6">
      {/* Upload Zone */}
      {rows.length === 0 && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            'relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 sm:p-12 cursor-pointer transition-all duration-200',
            isDragging
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-primary/50 hover:bg-accent/50'
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileInputChange}
            className="hidden"
          />

          <div className={cn(
            'flex h-16 w-16 items-center justify-center rounded-full transition-all duration-200',
            isDragging ? 'bg-primary/10' : 'bg-secondary'
          )}>
            <Upload className={cn(
              'h-8 w-8 transition-colors',
              isDragging ? 'text-primary' : 'text-muted-foreground'
            )} />
          </div>

          <h3 className="mt-4 text-lg font-semibold text-foreground">
            {isDragging ? 'Drop your CSV here' : 'Upload CSV File'}
          </h3>
          <p className="mt-2 text-sm text-muted-foreground text-center max-w-md">
            Drag and drop a CSV file, or click to browse. Required columns: store_nbr, family, date, horizon
          </p>

          <button
            onClick={(e) => {
              e.stopPropagation();
              downloadSampleCSV();
            }}
            className={cn(
              'mt-4 flex items-center gap-2 rounded-lg px-4 py-2',
              'bg-secondary text-secondary-foreground text-sm',
              'transition-all duration-200',
              'hover:bg-secondary/80'
            )}
          >
            <FileDown className="h-4 w-4" />
            Download Sample CSV
          </button>
        </div>
      )}

      {/* Parse Errors */}
      {parseErrors.length > 0 && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <h4 className="font-medium text-destructive">Validation Errors</h4>
          </div>
          <ul className="mt-2 space-y-1 text-sm text-destructive/90">
            {parseErrors.map((error, i) => (
              <li key={i}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      {/* File Info & Actions */}
      {file && rows.length > 0 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-medium text-foreground">{file.name}</p>
              <p className="text-sm text-muted-foreground">
                {rows.length} prediction{rows.length !== 1 ? 's' : ''} to process
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handleReset}
              disabled={isProcessing}
              className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-2',
                'border border-border bg-card text-foreground text-sm',
                'transition-all duration-200',
                'hover:bg-secondary disabled:opacity-50'
              )}
            >
              <X className="h-4 w-4" />
              <span className="hidden sm:inline">Clear</span>
            </button>

            {pendingCount > 0 && (
              <button
                onClick={handleProcess}
                disabled={isProcessing}
                className={cn(
                  'flex-1 sm:flex-none flex items-center justify-center gap-2 rounded-lg px-4 py-2',
                  'bg-primary text-primary-foreground text-sm font-medium',
                  'transition-all duration-200',
                  'hover:bg-primary/90 disabled:opacity-50'
                )}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    Process Batch
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Progress Bar */}
      {isProcessing && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Processing predictions...</span>
            <span className="font-medium text-foreground">
              {progress.current} / {progress.total}
            </span>
          </div>
          <div className="h-2 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300 ease-out"
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Results Summary */}
      {rows.length > 0 && !isProcessing && successCount + errorCount > 0 && (
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <span className="text-sm text-foreground">{successCount} successful</span>
          </div>
          {errorCount > 0 && (
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-destructive" />
              <span className="text-sm text-foreground">{errorCount} failed</span>
            </div>
          )}

          {successCount > 0 && (
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={() => handleDownloadResults('csv')}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2',
                  'bg-secondary text-secondary-foreground text-sm',
                  'transition-all duration-200',
                  'hover:bg-secondary/80'
                )}
              >
                <Download className="h-4 w-4" />
                CSV
              </button>
              <button
                onClick={() => handleDownloadResults('excel')}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2',
                  'bg-secondary text-secondary-foreground text-sm',
                  'transition-all duration-200',
                  'hover:bg-secondary/80'
                )}
              >
                <Download className="h-4 w-4" />
                Excel
              </button>
            </div>
          )}
        </div>
      )}

      {/* Results Table */}
      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-foreground">Status</th>
                <th className="px-4 py-3 text-left font-medium text-foreground">Store</th>
                <th className="px-4 py-3 text-left font-medium text-foreground">Family</th>
                <th className="px-4 py-3 text-left font-medium text-foreground">Date</th>
                <th className="px-4 py-3 text-left font-medium text-foreground">Horizon</th>
                <th className="px-4 py-3 text-right font-medium text-foreground">Prediction</th>
                <th className="px-4 py-3 text-right font-medium text-foreground">80% CI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row, index) => (
                <tr key={index} className="hover:bg-accent/50 transition-colors">
                  <td className="px-4 py-3">
                    {row.status === 'pending' && (
                      <span className="text-muted-foreground">Pending</span>
                    )}
                    {row.status === 'processing' && (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    )}
                    {row.status === 'success' && (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    )}
                    {row.status === 'error' && (
                      <div className="flex items-center gap-1" title={row.error}>
                        <XCircle className="h-4 w-4 text-destructive" />
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-foreground">{row.store_nbr}</td>
                  <td className="px-4 py-3 text-foreground">{row.family}</td>
                  <td className="px-4 py-3 text-foreground">{row.date}</td>
                  <td className="px-4 py-3 text-foreground">{row.horizon}d</td>
                  <td className="px-4 py-3 text-right font-medium text-foreground">
                    {row.prediction !== undefined
                      ? `$${row.prediction.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : row.error
                      ? <span className="text-destructive text-xs">{row.error}</span>
                      : '-'}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {row.lower_80 !== undefined && row.upper_80 !== undefined
                      ? `$${row.lower_80.toLocaleString(undefined, { maximumFractionDigits: 0 })} - $${row.upper_80.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                      : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
