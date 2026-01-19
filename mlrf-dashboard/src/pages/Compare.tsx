import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { addDays, format } from 'date-fns';
import {
  ArrowLeft,
  Calendar,
  Store,
  Package,
  Sun,
  Moon,
  RefreshCw,
  AlertCircle,
  ArrowLeftRight,
} from 'lucide-react';
import { useTheme } from '../lib/theme';
import { ComparisonChart, type ComparisonDataPoint } from '../components/ComparisonChart';
import { HorizonSelect, type ForecastHorizon } from '../components/HorizonSelect';
import { fetchSimplePrediction } from '../lib/api';
import { cn } from '../lib/utils';

// Valid product families from the dataset
const PRODUCT_FAMILIES = [
  'AUTOMOTIVE',
  'BABY CARE',
  'BEAUTY',
  'BEVERAGES',
  'BOOKS',
  'BREAD/BAKERY',
  'CELEBRATION',
  'CLEANING',
  'DAIRY',
  'DELI',
  'EGGS',
  'FROZEN FOODS',
  'GROCERY I',
  'GROCERY II',
  'HARDWARE',
  'HOME AND KITCHEN I',
  'HOME AND KITCHEN II',
  'HOME APPLIANCES',
  'HOME CARE',
  'LADIESWEAR',
  'LAWN AND GARDEN',
  'LINGERIE',
  'LIQUOR,WINE,BEER',
  'MAGAZINES',
  'MEATS',
  'PERSONAL CARE',
  'PET SUPPLIES',
  'PLAYERS AND ELECTRONICS',
  'POULTRY',
  'PREPARED FOODS',
  'PRODUCE',
  'SCHOOL AND OFFICE SUPPLIES',
  'SEAFOOD',
];

// Store numbers (1-54)
const STORE_NUMBERS = Array.from({ length: 54 }, (_, i) => i + 1);

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

function LoadingSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-3', className)}>
      <div className="skeleton h-4 w-3/4" />
      <div className="skeleton h-4 w-1/2" />
      <div className="skeleton h-64 w-full" />
    </div>
  );
}

interface StoreSelectionProps {
  label: string;
  color: string;
  selectedStore: number;
  selectedFamily: string;
  onStoreChange: (store: number) => void;
  onFamilyChange: (family: string) => void;
}

function StoreSelection({
  label,
  color,
  selectedStore,
  selectedFamily,
  onStoreChange,
  onFamilyChange,
}: StoreSelectionProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className={cn('h-3 w-3 rounded-full', color)} />
        <span className="text-sm font-medium text-foreground">{label}</span>
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
          <Store className="h-4 w-4 text-muted-foreground" />
          <select
            value={selectedStore}
            onChange={(e) => onStoreChange(parseInt(e.target.value, 10))}
            className="flex-1 bg-transparent text-sm focus:outline-none"
          >
            {STORE_NUMBERS.map((num) => (
              <option key={num} value={num}>
                Store {num}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
          <Package className="h-4 w-4 text-muted-foreground" />
          <select
            value={selectedFamily}
            onChange={(e) => onFamilyChange(e.target.value)}
            className="flex-1 bg-transparent text-sm focus:outline-none"
          >
            {PRODUCT_FAMILIES.map((family) => (
              <option key={family} value={family}>
                {family}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

export function Compare() {
  // Store A selection
  const [storeANumber, setStoreANumber] = useState(1);
  const [storeAFamily, setStoreAFamily] = useState('GROCERY I');

  // Store B selection
  const [storeBNumber, setStoreBNumber] = useState(2);
  const [storeBFamily, setStoreBFamily] = useState('GROCERY I');

  // Date and horizon
  const [selectedDate, setSelectedDate] = useState('2017-08-01');
  const [horizon, setHorizon] = useState<ForecastHorizon>(90);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Swap stores function
  const handleSwapStores = () => {
    const tempStore = storeANumber;
    const tempFamily = storeAFamily;
    setStoreANumber(storeBNumber);
    setStoreAFamily(storeBFamily);
    setStoreBNumber(tempStore);
    setStoreBFamily(tempFamily);
  };

  // Generate comparison labels
  const storeALabel = `Store ${storeANumber} - ${storeAFamily}`;
  const storeBLabel = `Store ${storeBNumber} - ${storeBFamily}`;

  // Fetch comparison data
  const {
    data: comparisonData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['comparison', storeANumber, storeAFamily, storeBNumber, storeBFamily, selectedDate, horizon],
    queryFn: async (): Promise<ComparisonDataPoint[]> => {
      const start = new Date(selectedDate);
      const points: ComparisonDataPoint[] = [];

      // Generate forecast points at weekly intervals
      const intervalDays = 7;
      const numPoints = Math.ceil(horizon / intervalDays);

      const forecastDates: Date[] = [];
      for (let i = 0; i < numPoints; i++) {
        forecastDates.push(addDays(start, i * intervalDays));
      }

      // Fetch predictions for both stores in parallel
      const [storeAResults, storeBResults] = await Promise.all([
        Promise.all(
          forecastDates.map(async (date) => {
            const dateStr = format(date, 'yyyy-MM-dd');
            try {
              const response = await fetchSimplePrediction(
                storeANumber,
                storeAFamily,
                dateStr,
                horizon
              );
              return {
                date: dateStr,
                prediction: response.prediction,
                lower_80: response.lower_80,
                upper_80: response.upper_80,
                success: true,
              };
            } catch {
              return { date: dateStr, prediction: null, lower_80: null, upper_80: null, success: false };
            }
          })
        ),
        Promise.all(
          forecastDates.map(async (date) => {
            const dateStr = format(date, 'yyyy-MM-dd');
            try {
              const response = await fetchSimplePrediction(
                storeBNumber,
                storeBFamily,
                dateStr,
                horizon
              );
              return {
                date: dateStr,
                prediction: response.prediction,
                lower_80: response.lower_80,
                upper_80: response.upper_80,
                success: true,
              };
            } catch {
              return { date: dateStr, prediction: null, lower_80: null, upper_80: null, success: false };
            }
          })
        ),
      ]);

      // Combine results into comparison data points
      for (let i = 0; i < forecastDates.length; i++) {
        const dateStr = format(forecastDates[i], 'yyyy-MM-dd');
        const storeAData = storeAResults[i];
        const storeBData = storeBResults[i];

        const point: ComparisonDataPoint = { date: dateStr };

        if (storeAData.success && storeAData.prediction !== null) {
          point.storeA = storeAData.prediction;
          if (storeAData.lower_80 !== null) point.storeALower80 = storeAData.lower_80;
          if (storeAData.upper_80 !== null) point.storeAUpper80 = storeAData.upper_80;
        }

        if (storeBData.success && storeBData.prediction !== null) {
          point.storeB = storeBData.prediction;
          if (storeBData.lower_80 !== null) point.storeBLower80 = storeBData.lower_80;
          if (storeBData.upper_80 !== null) point.storeBUpper80 = storeBData.upper_80;
        }

        points.push(point);
      }

      return points.sort((a, b) => a.date.localeCompare(b.date));
    },
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });

  // Generate mock data when API is unavailable
  const mockComparisonData = useMemo((): ComparisonDataPoint[] => {
    const start = new Date(selectedDate);
    const points: ComparisonDataPoint[] = [];
    const intervalDays = 7;
    const numPoints = Math.ceil(horizon / intervalDays);

    for (let i = 0; i < numPoints; i++) {
      const date = addDays(start, i * intervalDays);
      const dateStr = format(date, 'yyyy-MM-dd');
      const baseA = 45000 + Math.sin(i * 0.5) * 5000;
      const baseB = 38000 + Math.cos(i * 0.7) * 4000;

      points.push({
        date: dateStr,
        storeA: baseA + (Math.random() - 0.5) * 3000,
        storeB: baseB + (Math.random() - 0.5) * 2500,
        storeALower80: baseA * 0.9,
        storeAUpper80: baseA * 1.1,
        storeBLower80: baseB * 0.9,
        storeBUpper80: baseB * 1.1,
      });
    }

    return points;
  }, [selectedDate, horizon]);

  const displayData = comparisonData && comparisonData.length > 0 && comparisonData.some(p => p.storeA || p.storeB)
    ? comparisonData
    : mockComparisonData;

  const isUsingMockData = !comparisonData || comparisonData.length === 0 || !comparisonData.some(p => p.storeA || p.storeB);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setTimeout(() => setIsRefreshing(false), 500);
  };

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
          <div className="flex items-center justify-between">
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
                <ArrowLeftRight className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-foreground">
                  Store Comparison
                </h1>
                <p className="text-sm text-muted-foreground">
                  Compare forecasts between stores and families
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Date selector */}
              <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  min="2013-01-01"
                  max="2017-08-15"
                  className="bg-transparent text-sm focus:outline-none"
                />
              </div>

              {/* Horizon selector */}
              <HorizonSelect value={horizon} onChange={setHorizon} />

              {/* Refresh button */}
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className={cn(
                  'flex h-9 items-center gap-2 rounded-lg px-3',
                  'bg-secondary text-secondary-foreground',
                  'transition-all duration-200',
                  'hover:bg-secondary/80',
                  'disabled:opacity-50'
                )}
              >
                <RefreshCw
                  className={cn('h-4 w-4', isRefreshing && 'animate-spin')}
                />
                <span className="text-sm font-medium">Refresh</span>
              </button>

              {/* Theme toggle */}
              <ThemeToggle />
            </div>
          </div>

          {/* Mock data warning */}
          {isUsingMockData && (
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-warning/10 px-4 py-2.5 text-sm text-warning">
              <AlertCircle className="h-4 w-4" />
              <span>Using demo data. Connect the API server for live data.</span>
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Store Selection Row */}
        <div className="mb-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {/* Store A Selection */}
          <div className="card p-5 animate-fade-in-up">
            <StoreSelection
              label="Store A"
              color="bg-primary"
              selectedStore={storeANumber}
              selectedFamily={storeAFamily}
              onStoreChange={setStoreANumber}
              onFamilyChange={setStoreAFamily}
            />
          </div>

          {/* Swap Button */}
          <div className="hidden lg:flex items-center justify-center">
            <button
              onClick={handleSwapStores}
              className={cn(
                'flex h-12 w-12 items-center justify-center rounded-full',
                'bg-secondary text-secondary-foreground',
                'transition-all duration-200',
                'hover:bg-secondary/80 hover:scale-110',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
              )}
              title="Swap stores"
            >
              <ArrowLeftRight className="h-5 w-5" />
            </button>
          </div>

          {/* Mobile Swap Button */}
          <div className="flex lg:hidden items-center justify-center sm:col-span-2">
            <button
              onClick={handleSwapStores}
              className={cn(
                'flex items-center gap-2 rounded-lg px-4 py-2',
                'bg-secondary text-secondary-foreground',
                'transition-all duration-200',
                'hover:bg-secondary/80'
              )}
            >
              <ArrowLeftRight className="h-4 w-4" />
              <span className="text-sm font-medium">Swap Stores</span>
            </button>
          </div>

          {/* Store B Selection */}
          <div className="card p-5 animate-fade-in-up animation-delay-100">
            <StoreSelection
              label="Store B"
              color="bg-accent"
              selectedStore={storeBNumber}
              selectedFamily={storeBFamily}
              onStoreChange={setStoreBNumber}
              onFamilyChange={setStoreBFamily}
            />
          </div>
        </div>

        {/* Comparison Chart */}
        <div className="card p-6 animate-fade-in-up animation-delay-200">
          {isLoading ? (
            <LoadingSkeleton className="h-[450px]" />
          ) : error ? (
            <div className="flex h-[450px] flex-col items-center justify-center rounded-lg border border-dashed border-border p-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                <AlertCircle className="h-6 w-6 text-destructive" />
              </div>
              <p className="mt-4 font-medium text-foreground">
                Failed to load comparison data
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Please check your connection and try again
              </p>
              <button
                onClick={() => refetch()}
                className={cn(
                  'mt-4 flex items-center gap-2 rounded-lg px-4 py-2',
                  'bg-primary text-primary-foreground',
                  'transition-all duration-200',
                  'hover:bg-primary/90'
                )}
              >
                <RefreshCw className="h-4 w-4" />
                <span>Retry</span>
              </button>
            </div>
          ) : (
            <ComparisonChart
              data={displayData}
              storeALabel={storeALabel}
              storeBLabel={storeBLabel}
              title="Forecast Comparison"
              showConfidenceIntervals={false}
            />
          )}
        </div>

        {/* Quick Tips */}
        <div className="mt-8 card p-5 animate-fade-in-up animation-delay-300">
          <h3 className="text-sm font-semibold text-foreground">Tips for Comparison</h3>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
              Compare the same product family across different stores to identify regional trends
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
              Compare different product families within the same store to optimize product mix
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
              Use the swap button to quickly reverse the comparison direction
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
              Adjust the forecast horizon to analyze short-term vs long-term differences
            </li>
          </ul>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 bg-card/50 py-6">
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
