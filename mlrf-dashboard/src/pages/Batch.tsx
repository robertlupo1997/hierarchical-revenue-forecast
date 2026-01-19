import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  FileSpreadsheet,
  Sun,
  Moon,
  AlertCircle,
  Info,
  CheckCircle,
} from 'lucide-react';
import { useTheme } from '../lib/theme';
import { BatchUpload, type BatchResultRow } from '../components/BatchUpload';
import { cn } from '../lib/utils';

function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <button
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className={cn(
        'relative flex h-9 w-9 items-center justify-center rounded-lg',
        'bg-secondary text-secondary-foreground',
        'transition-all duration-200',
        'hover:bg-secondary/80 hover:scale-105',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      )}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
    </button>
  );
}

export function Batch() {
  const [completedResults, setCompletedResults] = useState<BatchResultRow[] | null>(null);

  const handleUploadComplete = (results: BatchResultRow[]) => {
    setCompletedResults(results);
  };

  const successCount = completedResults?.filter(r => r.status === 'success').length ?? 0;
  const totalCount = completedResults?.length ?? 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Subtle gradient background */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-1/2 -right-1/2 h-full w-full rounded-full bg-gradient-to-b from-primary/5 to-transparent blur-3xl" />
        <div className="absolute -bottom-1/2 -left-1/2 h-full w-full rounded-full bg-gradient-to-t from-accent/5 to-transparent blur-3xl" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          {/* Desktop layout */}
          <div className="hidden md:flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link
                to="/"
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-lg',
                  'bg-secondary text-secondary-foreground',
                  'transition-all duration-200',
                  'hover:bg-secondary/80'
                )}
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent">
                <FileSpreadsheet className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-foreground">
                  Batch Predictions
                </h1>
                <p className="text-sm text-muted-foreground">
                  Upload CSV for bulk forecast generation
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Success indicator */}
              {completedResults && (
                <div className="flex items-center gap-2 rounded-lg bg-green-500/10 px-3 py-1.5">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span className="text-sm font-medium text-green-600 dark:text-green-400">
                    {successCount} / {totalCount} completed
                  </span>
                </div>
              )}

              {/* Theme toggle */}
              <ThemeToggle />
            </div>
          </div>

          {/* Mobile layout */}
          <div className="md:hidden space-y-3">
            {/* Title row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Link
                  to="/"
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-lg',
                    'bg-secondary text-secondary-foreground',
                    'transition-all duration-200',
                    'hover:bg-secondary/80'
                  )}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Link>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent">
                  <FileSpreadsheet className="h-4 w-4 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold tracking-tight text-foreground">
                    Batch
                  </h1>
                  <p className="text-xs text-muted-foreground">
                    Bulk predictions
                  </p>
                </div>
              </div>
              <ThemeToggle />
            </div>

            {/* Status bar */}
            {completedResults && (
              <div className="flex items-center gap-2 rounded-lg bg-green-500/10 px-3 py-1.5">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-sm font-medium text-green-600 dark:text-green-400">
                  {successCount} / {totalCount} completed
                </span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Info Banner */}
        <div className="mb-8 rounded-lg border border-border bg-card p-4 animate-fade-in-up">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div className="space-y-2">
              <h3 className="font-medium text-foreground">How Batch Predictions Work</h3>
              <p className="text-sm text-muted-foreground">
                Upload a CSV file with multiple prediction requests. Each row specifies a store,
                product family, date, and forecast horizon. The system will process all requests
                and return predictions with confidence intervals.
              </p>
              <div className="flex flex-wrap gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-primary" />
                  <span className="text-muted-foreground">Max 100 predictions per batch</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-primary" />
                  <span className="text-muted-foreground">Horizons: 15, 30, 60, 90 days</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-primary" />
                  <span className="text-muted-foreground">54 stores, 33 families</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Upload Section */}
        <div className="card p-6 animate-fade-in-up animation-delay-100">
          <BatchUpload onUploadComplete={handleUploadComplete} />
        </div>

        {/* CSV Format Guide */}
        <div className="mt-8 card p-5 animate-fade-in-up animation-delay-200">
          <h3 className="text-sm font-semibold text-foreground">CSV Format Requirements</h3>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-2 text-left font-medium text-foreground">Column</th>
                  <th className="px-4 py-2 text-left font-medium text-foreground">Type</th>
                  <th className="px-4 py-2 text-left font-medium text-foreground">Description</th>
                  <th className="px-4 py-2 text-left font-medium text-foreground">Example</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="px-4 py-2 font-mono text-primary">store_nbr</td>
                  <td className="px-4 py-2 text-muted-foreground">Integer</td>
                  <td className="px-4 py-2 text-muted-foreground">Store number (1-54)</td>
                  <td className="px-4 py-2 font-mono text-foreground">1</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 font-mono text-primary">family</td>
                  <td className="px-4 py-2 text-muted-foreground">String</td>
                  <td className="px-4 py-2 text-muted-foreground">Product family name</td>
                  <td className="px-4 py-2 font-mono text-foreground">GROCERY I</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 font-mono text-primary">date</td>
                  <td className="px-4 py-2 text-muted-foreground">Date</td>
                  <td className="px-4 py-2 text-muted-foreground">Forecast start date (YYYY-MM-DD)</td>
                  <td className="px-4 py-2 font-mono text-foreground">2017-08-01</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 font-mono text-primary">horizon</td>
                  <td className="px-4 py-2 text-muted-foreground">Integer</td>
                  <td className="px-4 py-2 text-muted-foreground">Forecast horizon (15, 30, 60, 90)</td>
                  <td className="px-4 py-2 font-mono text-foreground">90</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Tips */}
        <div className="mt-8 card p-5 animate-fade-in-up animation-delay-300">
          <h3 className="text-sm font-semibold text-foreground">Tips for Batch Processing</h3>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
              Use the sample CSV download to see the correct format
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
              Family names are case-insensitive but must match exactly (e.g., "GROCERY I", not "GROCERY")
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
              For large batches, predictions are processed in parallel for faster results
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
              Download results as CSV or Excel for further analysis
            </li>
          </ul>
        </div>

        {/* API Unavailable Warning */}
        <div className="mt-8 rounded-lg border border-warning/50 bg-warning/10 p-4 animate-fade-in-up animation-delay-400">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-warning mt-0.5 shrink-0" />
            <div>
              <h4 className="font-medium text-warning">Note</h4>
              <p className="mt-1 text-sm text-warning/90">
                Batch predictions require a running API server. If the API is unavailable,
                predictions will fail with an error message. Check your API connection
                if you see connection errors.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 bg-card/50 py-6 mt-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <p className="text-sm text-muted-foreground">
              MLRF Dashboard v0.1.0
            </p>
            <Link
              to="/"
              className={cn(
                'text-sm text-primary transition-colors',
                'hover:text-primary/80'
              )}
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
