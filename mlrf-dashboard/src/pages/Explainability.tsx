import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Info } from 'lucide-react';
import { ShapWaterfall } from '../components/ShapWaterfall';
import { fetchExplanation, type WaterfallFeature } from '../lib/api';
import { cn, formatNumber } from '../lib/utils';

// Feature descriptions for educational tooltips
const featureDescriptions: Record<string, string> = {
  sales_lag_1: 'Sales from 1 day ago',
  sales_lag_7: 'Sales from 7 days ago (same weekday)',
  sales_lag_14: 'Sales from 14 days ago',
  sales_lag_28: 'Sales from 28 days ago (same weekday)',
  sales_lag_90: 'Sales from 90 days ago',
  sales_rolling_mean_7: 'Average sales over last 7 days',
  sales_rolling_mean_14: 'Average sales over last 14 days',
  sales_rolling_mean_28: 'Average sales over last 28 days',
  sales_rolling_mean_90: 'Average sales over last 90 days',
  sales_rolling_std_7: 'Volatility of sales over last 7 days',
  sales_rolling_std_14: 'Volatility of sales over last 14 days',
  sales_rolling_std_28: 'Volatility of sales over last 28 days',
  sales_rolling_std_90: 'Volatility of sales over last 90 days',
  dayofweek: 'Day of the week (0=Monday, 6=Sunday)',
  month: 'Month of the year (1-12)',
  day: 'Day of the month (1-31)',
  year: 'Year',
  dayofyear: 'Day number in the year (1-365)',
  is_mid_month: 'Whether it is the 15th of the month',
  is_leap_year: 'Whether the year is a leap year',
  oil_price: 'Current oil price (affects transportation costs)',
  is_holiday: 'Whether it is a national holiday',
  onpromotion: 'Number of items on promotion',
  promo_rolling_7: 'Sum of promotions over last 7 days',
  cluster: 'Store cluster type',
  type: 'Store type category',
};

// Mock data for when API is unavailable
const mockExplanation = {
  base_value: 1500,
  prediction: 2350,
  features: [
    { name: 'sales_lag_7', value: 2100, shap_value: 320, cumulative: 1820, direction: 'positive' as const },
    { name: 'sales_rolling_mean_28', value: 1980, shap_value: 180, cumulative: 2000, direction: 'positive' as const },
    { name: 'dayofweek', value: 5, shap_value: 120, cumulative: 2120, direction: 'positive' as const },
    { name: 'onpromotion', value: 45, shap_value: 95, cumulative: 2215, direction: 'positive' as const },
    { name: 'oil_price', value: 52.3, shap_value: -65, cumulative: 2150, direction: 'negative' as const },
    { name: 'is_holiday', value: 0, shap_value: -45, cumulative: 2105, direction: 'negative' as const },
    { name: 'month', value: 8, shap_value: 85, cumulative: 2190, direction: 'positive' as const },
    { name: 'sales_rolling_std_7', value: 250, shap_value: 55, cumulative: 2245, direction: 'positive' as const },
    { name: 'sales_lag_28', value: 1850, shap_value: 50, cumulative: 2295, direction: 'positive' as const },
    { name: 'promo_rolling_7', value: 180, shap_value: 55, cumulative: 2350, direction: 'positive' as const },
  ],
};

function FeatureTable({ features }: { features: WaterfallFeature[] }) {
  const sortedFeatures = [...features].sort(
    (a, b) => Math.abs(b.shap_value) - Math.abs(a.shap_value)
  );

  return (
    <div className="overflow-hidden rounded-lg border">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
              Feature
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">
              Value
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">
              SHAP Impact
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
              Direction
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {sortedFeatures.map((feature, index) => (
            <tr
              key={feature.name}
              className={index < 3 ? 'bg-yellow-50' : undefined}
            >
              <td className="px-4 py-3">
                <div className="flex items-start gap-2">
                  <span className="font-medium text-gray-900">
                    {feature.name}
                  </span>
                  {featureDescriptions[feature.name] && (
                    <div className="group relative">
                      <Info className="h-4 w-4 text-gray-400" />
                      <div className="invisible absolute left-0 top-5 z-10 w-48 rounded-md bg-gray-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:visible group-hover:opacity-100">
                        {featureDescriptions[feature.name]}
                      </div>
                    </div>
                  )}
                </div>
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-600">
                {feature.value !== null ? formatNumber(feature.value, 2) : 'N/A'}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right">
                <span
                  className={cn(
                    'font-mono text-sm font-medium',
                    feature.direction === 'positive'
                      ? 'text-red-600'
                      : 'text-blue-600'
                  )}
                >
                  {feature.shap_value > 0 ? '+' : ''}
                  {formatNumber(feature.shap_value, 4)}
                </span>
              </td>
              <td className="px-4 py-3">
                <span
                  className={cn(
                    'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                    feature.direction === 'positive'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-blue-100 text-blue-800'
                  )}
                >
                  {feature.direction === 'positive' ? 'Increases' : 'Decreases'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Explainability() {
  const { store, family } = useParams<{ store: string; family: string }>();
  const storeNum = parseInt(store ?? '1', 10);
  const familyName = decodeURIComponent(family ?? 'GROCERY I');

  const {
    data: explanationData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['explanation', storeNum, familyName, '2017-08-01'],
    queryFn: () => fetchExplanation(storeNum, familyName, '2017-08-01'),
    retry: 1,
  });

  // Use mock data if API fails
  const displayData = explanationData ?? mockExplanation;
  const isUsingMockData = !explanationData;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="flex items-center gap-1 text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Link>
          </div>

          <div className="mt-4">
            <h1 className="text-2xl font-bold text-gray-900">
              Forecast Explanation
            </h1>
            <p className="mt-1 text-gray-500">
              Store {storeNum} - {familyName}
            </p>
          </div>

          {isUsingMockData && (
            <div className="mt-3 rounded-md bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
              Using demo data. Connect the API server for live explanations.
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {isLoading ? (
          <div className="flex h-96 items-center justify-center">
            <div className="text-gray-500">Loading explanation...</div>
          </div>
        ) : error && !isUsingMockData ? (
          <div className="flex h-96 items-center justify-center">
            <div className="text-center">
              <p className="text-gray-500">Failed to load explanation data.</p>
              <p className="mt-1 text-sm text-gray-400">
                {error instanceof Error ? error.message : 'Unknown error'}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Summary cards */}
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg bg-white p-6 shadow">
                <div className="text-sm text-gray-500">Base Value</div>
                <div className="mt-1 text-2xl font-bold text-gray-700">
                  {formatNumber(displayData.base_value, 2)}
                </div>
                <div className="mt-1 text-xs text-gray-400">
                  Average prediction across all samples
                </div>
              </div>
              <div className="rounded-lg bg-white p-6 shadow">
                <div className="text-sm text-gray-500">Final Prediction</div>
                <div className="mt-1 text-2xl font-bold text-green-600">
                  {formatNumber(displayData.prediction, 2)}
                </div>
                <div className="mt-1 text-xs text-gray-400">
                  Base + SHAP contributions
                </div>
              </div>
              <div className="rounded-lg bg-white p-6 shadow">
                <div className="text-sm text-gray-500">Total Impact</div>
                <div
                  className={cn(
                    'mt-1 text-2xl font-bold',
                    displayData.prediction > displayData.base_value
                      ? 'text-red-600'
                      : 'text-blue-600'
                  )}
                >
                  {displayData.prediction > displayData.base_value ? '+' : ''}
                  {formatNumber(displayData.prediction - displayData.base_value, 2)}
                </div>
                <div className="mt-1 text-xs text-gray-400">
                  {displayData.prediction > displayData.base_value
                    ? 'Above average'
                    : 'Below average'}
                </div>
              </div>
            </div>

            {/* Waterfall chart */}
            <div className="rounded-lg bg-white p-6 shadow">
              <h2 className="mb-4 text-lg font-semibold text-gray-900">
                SHAP Waterfall Chart
              </h2>
              <p className="mb-4 text-sm text-gray-500">
                This chart shows how each feature contributes to moving the
                prediction away from the base value. Red bars push the
                prediction higher, blue bars push it lower.
              </p>
              <div className="flex justify-center">
                <ShapWaterfall
                  baseValue={displayData.base_value}
                  features={displayData.features}
                  prediction={displayData.prediction}
                  width={700}
                  height={450}
                />
              </div>
            </div>

            {/* Feature table */}
            <div className="rounded-lg bg-white p-6 shadow">
              <h2 className="mb-4 text-lg font-semibold text-gray-900">
                Feature Contributions
              </h2>
              <p className="mb-4 text-sm text-gray-500">
                Features sorted by absolute SHAP value impact. Top 3 features
                are highlighted.
              </p>
              <FeatureTable features={displayData.features} />
            </div>

            {/* How to interpret section */}
            <div className="rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 p-6">
              <h3 className="text-lg font-semibold text-gray-900">
                How to Interpret SHAP Values
              </h3>
              <ul className="mt-3 space-y-2 text-sm text-gray-600">
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-2 w-2 rounded-full bg-gray-700" />
                  <span>
                    <strong>Base Value:</strong> The average model prediction
                    across all training samples. This is the starting point.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-2 w-2 rounded-full bg-red-500" />
                  <span>
                    <strong>Positive SHAP (Red):</strong> This feature pushes
                    the prediction higher than the base value.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-2 w-2 rounded-full bg-blue-500" />
                  <span>
                    <strong>Negative SHAP (Blue):</strong> This feature pushes
                    the prediction lower than the base value.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-2 w-2 rounded-full bg-green-500" />
                  <span>
                    <strong>Final Prediction:</strong> Base value plus all SHAP
                    contributions equals the final forecast.
                  </span>
                </li>
              </ul>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
