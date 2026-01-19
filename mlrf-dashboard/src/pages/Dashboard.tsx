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
} from 'lucide-react';
import { useTheme } from '../lib/theme';
import { ShapWaterfall } from '../components/ShapWaterfall';
import { HierarchyDrilldown } from '../components/HierarchyDrilldown';
import { ModelComparison } from '../components/ModelComparison';
import { ForecastChart, type ForecastDataPoint } from '../components/ForecastChart';
import {
  fetchExplanation,
  fetchHierarchy,
  fetchMetrics,
  type HierarchyNode,
  type ModelMetric,
} from '../lib/api';
import { cn } from '../lib/utils';

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

function LoadingSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-3', className)}>
      <div className="skeleton h-4 w-3/4" />
      <div className="skeleton h-4 w-1/2" />
      <div className="skeleton h-32 w-full" />
    </div>
  );
}

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

function StatCard({
  icon: Icon,
  label,
  value,
  subValue,
  trend,
  delay = 0,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  subValue?: string;
  trend?: 'up' | 'down';
  delay?: number;
}) {
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
        {trend && (
          <span
            className={cn(
              'badge text-xs',
              trend === 'up' ? 'badge-success' : 'badge-destructive'
            )}
          >
            {trend === 'up' ? '+' : '-'}
            {trend === 'up' ? '12%' : '5%'}
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
    await Promise.all([refetchHierarchy(), refetchExplanation()]);
    setTimeout(() => setIsRefreshing(false), 500);
  };

  // Use mock data if API fails
  const displayHierarchy = hierarchyData ?? mockHierarchy;
  const displayMetrics = metricsData ?? mockModels;
  const isUsingMockData = !hierarchyData || !metricsData;

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
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent">
                <TrendingUp className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-foreground">
                  Multi-LOB Revenue Forecasting
                </h1>
                <p className="text-sm text-muted-foreground">
                  90-day hierarchical forecast with SHAP explainability
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
                  className="bg-transparent text-sm focus:outline-none"
                />
              </div>

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
        {/* Stats row */}
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={TrendingUp}
            label="Total Forecast"
            value="$5.25M"
            subValue="90-day projection"
            trend="up"
            delay={0}
          />
          <StatCard
            icon={BarChart3}
            label="Active Stores"
            value="54"
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
            value="0.42"
            subValue="RMSLE (lower is better)"
            trend="up"
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
              <LoadingSkeleton className="h-64" />
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
              <LoadingSkeleton className="h-64" />
            ) : (
              <ModelComparison data={displayMetrics} />
            )}
          </div>

          {/* Forecast Chart */}
          <div className="card p-6 lg:col-span-2 animate-fade-in-up animation-delay-300">
            <ForecastChart
              data={mockForecastData}
              title={`Revenue Forecast - Store ${selectedStore}, ${selectedFamily}`}
              showConfidenceIntervals={true}
            />
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
              <LoadingSkeleton className="h-64" />
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
