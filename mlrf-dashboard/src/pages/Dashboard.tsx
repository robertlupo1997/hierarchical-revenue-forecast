import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Calendar,
  ExternalLink,
  RefreshCw,
  Sun,
  Moon,
  TrendingUp,
  BarChart3,
  GitBranch,
  Sparkles,
  AlertCircle,
  ArrowLeftRight,
  FileSpreadsheet,
} from 'lucide-react';
import { useTheme } from '../lib/theme';
import { ShapWaterfall } from '../components/ShapWaterfall';
import { HierarchyDrilldown } from '../components/HierarchyDrilldown';
import { ModelComparison } from '../components/ModelComparison';
import { ForecastChart, type ForecastDataPoint } from '../components/ForecastChart';
import { AccuracyChart } from '../components/AccuracyChart';
import { WhatIfAnalysis } from '../components/WhatIfAnalysis';
import { HorizonSelect, type ForecastHorizon } from '../components/HorizonSelect';
import { useForecastData } from '../hooks/useForecastData';
import {
  fetchExplanation,
  fetchHierarchy,
  fetchMetrics,
  fetchAccuracy,
  type HierarchyNode,
  type ModelMetric,
  type AccuracyDataPoint,
  type AccuracySummary,
} from '../lib/api';
import { cn } from '../lib/utils';
import { exportData, type ExportFormat } from '../lib/export';
import {
  ChartSkeleton,
  WaterfallSkeleton,
  HierarchySkeleton,
  ModelComparisonSkeleton,
} from '../components/Skeleton';

// Mock data for initial development (used when API is unavailable)
const mockModels: ModelMetric[] = [
  { model: 'LightGBM + MinTrace', rmsle: 0.42, mape: 0.15, rmse: 1250 },
  { model: 'AutoARIMA + BottomUp', rmsle: 0.48, mape: 0.18, rmse: 1450 },
  { model: 'ETS + TopDown', rmsle: 0.51, mape: 0.21, rmse: 1580 },
  { model: 'SeasonalNaive', rmsle: 0.65, mape: 0.28, rmse: 2100 },
];

const mockHierarchy: HierarchyNode = {
  id: 'total',
  name: 'Total',
  level: 'total',
  prediction: 5250000,
  trend_percent: 12.3,
  children: [
    {
      id: 'store_1',
      name: 'Store 1',
      level: 'store',
      prediction: 125000,
      children: [
        { id: '1_GROCERY I', name: 'GROCERY I', level: 'family', prediction: 45000 },
        { id: '1_BEVERAGES', name: 'BEVERAGES', level: 'family', prediction: 32000 },
        { id: '1_CLEANING', name: 'CLEANING', level: 'family', prediction: 18000 },
        { id: '1_DAIRY', name: 'DAIRY', level: 'family', prediction: 15000 },
        { id: '1_OTHER', name: 'Other Families', level: 'family', prediction: 15000 },
      ],
    },
    {
      id: 'store_2',
      name: 'Store 2',
      level: 'store',
      prediction: 98000,
      children: [
        { id: '2_GROCERY I', name: 'GROCERY I', level: 'family', prediction: 38000 },
        { id: '2_BEVERAGES', name: 'BEVERAGES', level: 'family', prediction: 28000 },
      ],
    },
    {
      id: 'store_3',
      name: 'Store 3',
      level: 'store',
      prediction: 112000,
    },
    {
      id: 'other_stores',
      name: 'Other Stores (51)',
      level: 'store',
      prediction: 4915000,
    },
  ],
};

const mockForecastData: ForecastDataPoint[] = [
  { date: '2017-07-01', actual: 42000 },
  { date: '2017-07-08', actual: 45000 },
  { date: '2017-07-15', actual: 43500 },
  { date: '2017-07-22', actual: 47000 },
  { date: '2017-07-29', actual: 46000 },
  { date: '2017-08-05', actual: 48500 },
  { date: '2017-08-12', actual: 47500 },
  { date: '2017-08-19', forecast: 49000, lower_80: 46000, upper_80: 52000, lower_95: 44000, upper_95: 54000 },
  { date: '2017-08-26', forecast: 50500, lower_80: 47000, upper_80: 54000, lower_95: 45000, upper_95: 56000 },
  { date: '2017-09-02', forecast: 51000, lower_80: 47500, upper_80: 54500, lower_95: 45500, upper_95: 56500 },
  { date: '2017-09-09', forecast: 52000, lower_80: 48000, upper_80: 56000, lower_95: 46000, upper_95: 58000 },
  { date: '2017-09-16', forecast: 51500, lower_80: 47000, upper_80: 56000, lower_95: 45000, upper_95: 58000 },
];

const mockAccuracyData: AccuracyDataPoint[] = [
  { date: '2017-07-01', actual: 850000, predicted: 830000, error: 20000, mape: 2.35 },
  { date: '2017-07-02', actual: 920000, predicted: 905000, error: 15000, mape: 1.63 },
  { date: '2017-07-03', actual: 880000, predicted: 890000, error: -10000, mape: 1.14 },
  { date: '2017-07-04', actual: 950000, predicted: 935000, error: 15000, mape: 1.58 },
  { date: '2017-07-05', actual: 910000, predicted: 920000, error: -10000, mape: 1.10 },
  { date: '2017-07-06', actual: 870000, predicted: 865000, error: 5000, mape: 0.57 },
  { date: '2017-07-07', actual: 890000, predicted: 882000, error: 8000, mape: 0.90 },
  { date: '2017-07-08', actual: 940000, predicted: 955000, error: -15000, mape: 1.60 },
  { date: '2017-07-09', actual: 980000, predicted: 965000, error: 15000, mape: 1.53 },
  { date: '2017-07-10', actual: 920000, predicted: 930000, error: -10000, mape: 1.09 },
  { date: '2017-07-11', actual: 895000, predicted: 888000, error: 7000, mape: 0.78 },
  { date: '2017-07-12', actual: 910000, predicted: 918000, error: -8000, mape: 0.88 },
  { date: '2017-07-13', actual: 945000, predicted: 940000, error: 5000, mape: 0.53 },
  { date: '2017-07-14', actual: 985000, predicted: 970000, error: 15000, mape: 1.52 },
  { date: '2017-07-15', actual: 1020000, predicted: 1005000, error: 15000, mape: 1.47 },
];

const mockAccuracySummary: AccuracySummary = {
  data_points: 15,
  mean_actual: 924000,
  mean_predicted: 919800,
  mean_error: 4800,
  mean_mape: 1.24,
  correlation: 0.95,
};


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

// Helper to format currency values
function formatCurrency(value: number): string {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(2)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(0)}K`;
  }
  return `$${value.toFixed(0)}`;
}

// Determine trend direction based on percentage (±1% threshold for "stable")
function getTrendDirection(trendPercent: number): 'up' | 'down' | 'stable' {
  if (trendPercent > 1) return 'up';
  if (trendPercent < -1) return 'down';
  return 'stable';
}

function StatCard({
  icon: Icon,
  label,
  value,
  subValue,
  trendPercent,
  delay = 0,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  subValue?: string;
  trendPercent?: number;
  delay?: number;
}) {
  const trend = trendPercent !== undefined ? getTrendDirection(trendPercent) : undefined;

  return (
    <div
      className={cn(
        'card p-5 animate-fade-in-up',
        'hover:border-primary/30 transition-all duration-300',
        'group'
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary transition-transform group-hover:scale-110">
          <Icon className="h-5 w-5" />
        </div>
        {trend && trend !== 'stable' && (
          <span
            className={cn(
              'badge text-xs',
              trend === 'up' ? 'badge-success' : 'badge-destructive'
            )}
          >
            {trendPercent !== undefined && trendPercent > 0 ? '+' : ''}
            {trendPercent?.toFixed(1)}%
          </span>
        )}
      </div>
      <div className="mt-4">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
          {value}
        </p>
        {subValue && (
          <p className="mt-1 text-sm text-muted-foreground">{subValue}</p>
        )}
      </div>
    </div>
  );
}

export function Dashboard() {
  const [selectedDate, setSelectedDate] = useState('2017-08-01');
  const [selectedStore, setSelectedStore] = useState(1);
  const [selectedFamily, setSelectedFamily] = useState('GROCERY I');
  const [horizon, setHorizon] = useState<ForecastHorizon>(90);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch hierarchy data
  const {
    data: hierarchyData,
    isLoading: hierarchyLoading,
    refetch: refetchHierarchy,
  } = useQuery({
    queryKey: ['hierarchy', selectedDate],
    queryFn: () => fetchHierarchy(selectedDate),
    retry: 1,
    staleTime: 1000 * 60 * 5,
  });

  // Fetch explanation data
  const {
    data: explanationData,
    isLoading: explanationLoading,
    error: explanationError,
    refetch: refetchExplanation,
  } = useQuery({
    queryKey: ['explanation', selectedStore, selectedFamily, selectedDate],
    queryFn: () => fetchExplanation(selectedStore, selectedFamily, selectedDate),
    retry: 1,
    staleTime: 1000 * 60 * 5,
  });

  // Fetch metrics data
  const {
    data: metricsData,
    isLoading: metricsLoading,
  } = useQuery({
    queryKey: ['metrics'],
    queryFn: fetchMetrics,
    retry: 1,
    staleTime: 1000 * 60 * 10,
  });

  // Fetch forecast data for selected store/family
  const {
    data: forecastData,
    isLoading: forecastLoading,
    refetch: refetchForecast,
  } = useForecastData({
    storeNbr: selectedStore,
    family: selectedFamily,
    startDate: selectedDate,
    horizon,
  });

  // Fetch accuracy data
  const {
    data: accuracyData,
    isLoading: accuracyLoading,
    refetch: refetchAccuracy,
  } = useQuery({
    queryKey: ['accuracy'],
    queryFn: fetchAccuracy,
    retry: 1,
    staleTime: 1000 * 60 * 10,
  });

  const handleNodeSelect = (node: HierarchyNode) => {
    // Extract store/family from bottom-level selection
    if (node.level === 'bottom' || node.level === 'family') {
      const parts = node.id.split('_');
      if (parts.length >= 2) {
        const storeNum = parseInt(parts[0], 10);
        const familyName = parts.slice(1).join('_');
        if (!isNaN(storeNum)) {
          setSelectedStore(storeNum);
          setSelectedFamily(familyName);
        }
      }
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([refetchHierarchy(), refetchExplanation(), refetchForecast(), refetchAccuracy()]);
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleExport = (format: ExportFormat) => {
    if (displayForecast && displayForecast.length > 0) {
      exportData(
        {
          data: displayForecast,
          storeNbr: selectedStore,
          family: selectedFamily,
          startDate: selectedDate,
          horizon,
        },
        format
      );
    }
  };

  // Use mock data if API fails
  const displayHierarchy = hierarchyData ?? mockHierarchy;
  const displayMetrics = metricsData ?? mockModels;
  const displayForecast = forecastData && forecastData.length > 0 ? forecastData : mockForecastData;
  const displayAccuracyData = accuracyData?.data ?? mockAccuracyData;
  const displayAccuracySummary = accuracyData?.summary ?? mockAccuracySummary;
  const isUsingMockData = !hierarchyData || !metricsData || !forecastData || forecastData.length === 0 || !accuracyData;

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
          {/* Desktop layout: single row */}
          <div className="hidden md:flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent">
                <TrendingUp className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-foreground">
                  Multi-LOB Revenue Forecasting
                </h1>
                <p className="text-sm text-muted-foreground">
                  {horizon}-day hierarchical forecast with SHAP explainability
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

              {/* Compare link */}
              <Link
                to="/compare"
                className={cn(
                  'flex h-9 items-center gap-2 rounded-lg px-3',
                  'bg-secondary text-secondary-foreground',
                  'transition-all duration-200',
                  'hover:bg-secondary/80'
                )}
              >
                <ArrowLeftRight className="h-4 w-4" />
                <span className="text-sm font-medium">Compare</span>
              </Link>

              {/* Batch link */}
              <Link
                to="/batch"
                className={cn(
                  'flex h-9 items-center gap-2 rounded-lg px-3',
                  'bg-secondary text-secondary-foreground',
                  'transition-all duration-200',
                  'hover:bg-secondary/80'
                )}
              >
                <FileSpreadsheet className="h-4 w-4" />
                <span className="text-sm font-medium">Batch</span>
              </Link>

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

          {/* Mobile layout: stacked rows */}
          <div className="md:hidden space-y-3">
            {/* Title row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent">
                  <TrendingUp className="h-4 w-4 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold tracking-tight text-foreground">
                    MLRF Dashboard
                  </h1>
                  <p className="text-xs text-muted-foreground">
                    {horizon}-day forecast
                  </p>
                </div>
              </div>
              <ThemeToggle />
            </div>

            {/* Controls row */}
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
              {/* Date selector */}
              <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 shrink-0">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  min="2013-01-01"
                  max="2017-08-15"
                  className="bg-transparent text-sm focus:outline-none w-[110px]"
                />
              </div>

              {/* Horizon selector */}
              <div className="shrink-0">
                <HorizonSelect value={horizon} onChange={setHorizon} />
              </div>

              {/* Compare link - icon only on mobile */}
              <Link
                to="/compare"
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-lg shrink-0',
                  'bg-secondary text-secondary-foreground',
                  'transition-all duration-200',
                  'hover:bg-secondary/80'
                )}
                title="Compare stores"
              >
                <ArrowLeftRight className="h-4 w-4" />
              </Link>

              {/* Batch link - icon only on mobile */}
              <Link
                to="/batch"
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-lg shrink-0',
                  'bg-secondary text-secondary-foreground',
                  'transition-all duration-200',
                  'hover:bg-secondary/80'
                )}
                title="Batch predictions"
              >
                <FileSpreadsheet className="h-4 w-4" />
              </Link>

              {/* Refresh button - icon only on mobile */}
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-lg shrink-0',
                  'bg-secondary text-secondary-foreground',
                  'transition-all duration-200',
                  'hover:bg-secondary/80',
                  'disabled:opacity-50'
                )}
                title="Refresh data"
              >
                <RefreshCw
                  className={cn('h-4 w-4', isRefreshing && 'animate-spin')}
                />
              </button>
            </div>
          </div>

          {/* Mock data warning */}
          {isUsingMockData && (
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-warning/10 px-3 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm text-warning">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>Using demo data. Connect API for live data.</span>
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Stats row */}
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={TrendingUp}
            label="Total Forecast"
            value={formatCurrency(displayHierarchy.prediction)}
            subValue={`${horizon}-day projection`}
            trendPercent={displayHierarchy.trend_percent}
            delay={0}
          />
          <StatCard
            icon={BarChart3}
            label="Active Stores"
            value={String(displayHierarchy.children?.length ?? 54)}
            subValue="Across all regions"
            delay={100}
          />
          <StatCard
            icon={GitBranch}
            label="Product Families"
            value="33"
            subValue="Hierarchical categories"
            delay={200}
          />
          <StatCard
            icon={Sparkles}
            label="Model Accuracy"
            value={displayMetrics[0]?.rmsle.toFixed(2) ?? '—'}
            subValue="RMSLE (lower is better)"
            delay={300}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* SHAP Waterfall Chart */}
          <div className="card p-6 animate-fade-in-up animation-delay-100">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-foreground">
                  Forecast Explanation
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Store {selectedStore} &middot; {selectedFamily}
                </p>
              </div>
              <Link
                to={`/explain/${selectedStore}/${encodeURIComponent(selectedFamily)}`}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-3 py-1.5',
                  'text-sm font-medium text-primary',
                  'bg-primary/10 hover:bg-primary/20',
                  'transition-colors duration-200'
                )}
              >
                Details
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </div>

            {explanationLoading ? (
              <WaterfallSkeleton />
            ) : explanationError ? (
              <div className="flex h-64 flex-col items-center justify-center rounded-lg border border-dashed border-border p-8 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <Sparkles className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="mt-4 font-medium text-foreground">
                  No explanation data available
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Select a forecast from the hierarchy below
                </p>
              </div>
            ) : explanationData ? (
              <ShapWaterfall
                baseValue={explanationData.base_value}
                features={explanationData.features}
                prediction={explanationData.prediction}
                width={500}
                height={350}
              />
            ) : (
              <div className="flex h-64 items-center justify-center">
                <p className="text-muted-foreground">Select a forecast to explain</p>
              </div>
            )}
          </div>

          {/* Model Comparison */}
          <div className="card p-6 animate-fade-in-up animation-delay-200">
            {metricsLoading ? (
              <ModelComparisonSkeleton />
            ) : (
              <ModelComparison data={displayMetrics} />
            )}
          </div>

          {/* What-If Analysis */}
          <div className="card p-6 lg:col-span-2 animate-fade-in-up animation-delay-250">
            <WhatIfAnalysis
              storeNbr={selectedStore}
              family={selectedFamily}
              date={selectedDate}
              horizon={horizon}
            />
          </div>

          {/* Forecast Chart */}
          <div className="card p-6 lg:col-span-2 animate-fade-in-up animation-delay-300">
            {forecastLoading ? (
              <ChartSkeleton />
            ) : (
              <ForecastChart
                data={displayForecast}
                title={`Revenue Forecast - Store ${selectedStore}, ${selectedFamily}`}
                showConfidenceIntervals={true}
                onExport={handleExport}
                exportEnabled={displayForecast.length > 0}
              />
            )}
          </div>

          {/* Accuracy Chart */}
          <div className="card p-6 lg:col-span-2 animate-fade-in-up animation-delay-350">
            {accuracyLoading ? (
              <ChartSkeleton />
            ) : (
              <AccuracyChart
                data={displayAccuracyData}
                summary={displayAccuracySummary}
                title="Model Accuracy"
              />
            )}
          </div>

          {/* Hierarchy Drilldown */}
          <div className="card p-6 lg:col-span-2 animate-fade-in-up animation-delay-400">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-foreground">
                  Revenue by Hierarchy
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Drill down through stores and product families
                </p>
              </div>
            </div>
            {hierarchyLoading ? (
              <HierarchySkeleton />
            ) : (
              <HierarchyDrilldown
                data={displayHierarchy}
                onSelect={handleNodeSelect}
              />
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 bg-card/50 py-6">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <p className="text-sm text-muted-foreground">
              MLRF Dashboard v0.1.0
            </p>
            <p className="text-sm text-muted-foreground">
              Built with React + TypeScript + visx
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
