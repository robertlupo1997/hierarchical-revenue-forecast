const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8081';

export interface PredictRequest {
  store_nbr: number;
  family: string;
  date: string;
  features: number[];
  horizon: number;
}

export interface SimplePredictRequest {
  store_nbr: number;
  family: string;
  date: string;
  horizon: number;
}

export interface PredictResponse {
  store_nbr: number;
  family: string;
  date: string;
  prediction: number;
  cached: boolean;
  latency_ms: number;
}

export interface BatchPredictRequest {
  requests: PredictRequest[];
}

export interface BatchPredictResponse {
  predictions: PredictResponse[];
  total_latency_ms: number;
}

export interface WaterfallFeature {
  name: string;
  value: number | null;
  shap_value: number;
  cumulative: number;
  direction: 'positive' | 'negative';
}

export interface ExplainResponse {
  base_value: number;
  features: WaterfallFeature[];
  prediction: number;
}

export interface HierarchyNode {
  id: string;
  name: string;
  level: 'total' | 'store' | 'family' | 'bottom';
  prediction: number;
  actual?: number;
  previous_prediction?: number;
  trend_percent?: number;
  children?: HierarchyNode[];
}

export interface ModelMetric {
  model: string;
  rmsle: number;
  mape: number;
  rmse: number;
}

export interface HealthResponse {
  status: string;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE) {
    this.baseUrl = baseUrl;
  }

  private async fetch<T>(
    endpoint: string,
    options?: RequestInit
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  async health(): Promise<HealthResponse> {
    return this.fetch<HealthResponse>('/health');
  }

  async predict(request: PredictRequest): Promise<PredictResponse> {
    return this.fetch<PredictResponse>('/predict', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async predictSimple(request: SimplePredictRequest): Promise<PredictResponse> {
    return this.fetch<PredictResponse>('/predict/simple', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async predictBatch(request: BatchPredictRequest): Promise<BatchPredictResponse> {
    return this.fetch<BatchPredictResponse>('/predict/batch', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async explain(
    storeNbr: number,
    family: string,
    date: string
  ): Promise<ExplainResponse> {
    return this.fetch<ExplainResponse>('/explain', {
      method: 'POST',
      body: JSON.stringify({
        store_nbr: storeNbr,
        family,
        date,
      }),
    });
  }

  async getHierarchy(date: string): Promise<HierarchyNode> {
    return this.fetch<HierarchyNode>(`/hierarchy?date=${encodeURIComponent(date)}`);
  }

  async getMetrics(): Promise<ModelMetric[]> {
    return this.fetch<ModelMetric[]>('/model-metrics');
  }
}

export const apiClient = new ApiClient();

// Convenience functions for React Query
export async function fetchPrediction(req: PredictRequest): Promise<PredictResponse> {
  return apiClient.predict(req);
}

export async function fetchExplanation(
  storeNbr: number,
  family: string,
  date: string
): Promise<ExplainResponse> {
  return apiClient.explain(storeNbr, family, date);
}

export async function fetchHierarchy(date: string): Promise<HierarchyNode> {
  return apiClient.getHierarchy(date);
}

export async function fetchMetrics(): Promise<ModelMetric[]> {
  return apiClient.getMetrics();
}

export async function fetchSimplePrediction(
  storeNbr: number,
  family: string,
  date: string,
  horizon: number
): Promise<PredictResponse> {
  return apiClient.predictSimple({
    store_nbr: storeNbr,
    family,
    date,
    horizon,
  });
}
