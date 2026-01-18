import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Calendar, ExternalLink, RefreshCw } from 'lucide-react';
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

export function Dashboard() {
  const [selectedDate, setSelectedDate] = useState('2017-08-01');
  const [selectedStore, setSelectedStore] = useState(1);
  const [selectedFamily, setSelectedFamily] = useState('GROCERY I');

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

  const handleRefresh = () => {
    refetchHierarchy();
    refetchExplanation();
  };

  // Use mock data if API fails
  const displayHierarchy = hierarchyData ?? mockHierarchy;
  const displayMetrics = metricsData ?? mockModels;
  const isUsingMockData = !hierarchyData || !metricsData;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Multi-LOB Revenue Forecasting
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                90-day forecast with SHAP explainability
              </p>
            </div>

            <div className="flex items-center gap-4">
              {/* Date selector */}
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-gray-400" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Refresh button */}
              <button
                onClick={handleRefresh}
                className="flex items-center gap-1 rounded-md bg-gray-100 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
            </div>
          </div>

          {/* Mock data warning */}
          {isUsingMockData && (
            <div className="mt-3 rounded-md bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
              Using demo data. Connect the API server for live data.
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* SHAP Waterfall Chart */}
          <div className="rounded-lg bg-white p-6 shadow">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Forecast Explanation
                </h2>
                <p className="text-sm text-gray-500">
                  Store {selectedStore} - {selectedFamily}
                </p>
              </div>
              <Link
                to={`/explain/${selectedStore}/${encodeURIComponent(selectedFamily)}`}
                className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
              >
                Details
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>

            {explanationLoading ? (
              <div className="flex h-64 items-center justify-center">
                <div className="text-gray-500">Loading explanation...</div>
              </div>
            ) : explanationError ? (
              <div className="flex h-64 flex-col items-center justify-center text-center">
                <p className="text-gray-500">
                  No explanation data available.
                </p>
                <p className="mt-1 text-sm text-gray-400">
                  Select a forecast from the hierarchy below.
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
                <p className="text-gray-500">Select a forecast to explain</p>
              </div>
            )}
          </div>

          {/* Model Comparison */}
          <div className="rounded-lg bg-white p-6 shadow">
            {metricsLoading ? (
              <div className="flex h-64 items-center justify-center">
                <div className="text-gray-500">Loading metrics...</div>
              </div>
            ) : (
              <ModelComparison data={displayMetrics} />
            )}
          </div>

          {/* Forecast Chart */}
          <div className="rounded-lg bg-white p-6 shadow lg:col-span-2">
            <ForecastChart
              data={mockForecastData}
              title={`Revenue Forecast - Store ${selectedStore}, ${selectedFamily}`}
              showConfidenceIntervals={true}
            />
          </div>

          {/* Hierarchy Drilldown */}
          <div className="rounded-lg bg-white p-6 shadow lg:col-span-2">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              Revenue by Hierarchy
            </h2>
            {hierarchyLoading ? (
              <div className="flex h-64 items-center justify-center">
                <div className="text-gray-500">Loading hierarchy...</div>
              </div>
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
      <footer className="border-t bg-white py-4">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm text-gray-500">
            MLRF Dashboard v0.1.0 | Built with React + TypeScript + visx
          </p>
        </div>
      </footer>
    </div>
  );
}
