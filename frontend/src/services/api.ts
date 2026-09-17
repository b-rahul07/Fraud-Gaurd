// API Service for Fraud Detection Backend

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export interface Transaction {
  id: string;
  time: number;
  amount: number;
  anomalyScore: number;
  status: string;
}

export interface DashboardStats {
  totalMonitored: number;
  fraudCount: number;
  genuineCount: number;
  fraudRate: number;
  avgError: number;
  threshold: number;
}

export interface PredictionRequest {
  Time: number;
  V1: number;
  V2: number;
  V3: number;
  V4: number;
  V5: number;
  V6: number;
  V7: number;
  V8: number;
  V9: number;
  V10: number;
  V11: number;
  V12: number;
  V13: number;
  V14: number;
  V15: number;
  V16: number;
  V17: number;
  V18: number;
  V19: number;
  V20: number;
  V21: number;
  V22: number;
  V23: number;
  V24: number;
  V25: number;
  V26: number;
  V27: number;
  V28: number;
  Amount: number;
}

export interface PredictionResponse {
  prediction: string;
  anomalyScore: number;
  threshold: number;
  time: number;
  amount: number;
  isFraud: boolean;
}

export interface BatchPredictionResponse {
  success: boolean;
  totalTransactions: number;
  fraudulentCount: number;
  genuineCount: number;
  results: Array<{
    transactionId: string;
    time: number;
    amount: number;
    reconstructionError: number;
    structuralConfidence: number;
    threshold: number;
    isFraud: boolean;
    prediction: 'Fraudulent' | 'Genuine';
  }>;
}

class ApiService {
  private baseUrl: string;

  constructor() {
    // Remove trailing slash from base URL to prevent double slashes
    this.baseUrl = API_BASE_URL.replace(/\/$/, '');
  }

  async getStats(): Promise<DashboardStats> {
    try {
      const response = await fetch(`${this.baseUrl}/api/stats`);
      if (!response.ok) throw new Error('Failed to fetch stats');
      return await response.json();
    } catch (error) {
      console.error('Error fetching stats:', error);
      throw error;
    }
  }

  async getTransactions(limit: number = 10): Promise<Transaction[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/transactions?limit=${limit}`);
      if (!response.ok) throw new Error('Failed to fetch transactions');
      const data = await response.json();
      return data.transactions;
    } catch (error) {
      console.error('Error fetching transactions:', error);
      throw error;
    }
  }

  async predict(features: PredictionRequest): Promise<PredictionResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/api/predict`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(features),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Prediction failed');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error making prediction:', error);
      throw error;
    }
  }

  generateRandomFeatures(profile: 'genuine' | 'fraud'): PredictionRequest {
    if (profile === 'genuine') {
      return {"Time": 166238.0, "V1": 0.0324324543352703, "V2": 0.845049887711819, "V3": 0.161689643179373, "V4": -0.798504315204253, "V5": 0.695579342173505, "V6": -0.56511649398538, "V7": 0.933764515599799, "V8": -0.0627159584904338, "V9": -0.349653334602418, "V10": -0.255273958239804, "V11": 0.504579086049177, "V12": 0.951402617133848, "V13": 0.471139368956274, "V14": 0.190258281346303, "V15": -1.12779570592091, "V16": 0.194477602325314, "V17": -0.828441984571064, "V18": -0.184734453641714, "V19": 0.349511782992854, "V20": 0.013429508220609, "V21": -0.229609184889063, "V22": -0.49137382646569, "V23": 0.001259200126344, "V24": -0.400305517337517, "V25": -0.451544137605067, "V26": 0.143433739735541, "V27": 0.246292546642658, "V28": 0.0841993718879143, "Amount": 2.58} as PredictionRequest;
    } else {
      return {"Time": 21662.0, "V1": -18.0185611876771, "V2": 10.5586001882538, "V3": -24.6677412485732, "V4": 11.7861803616399, "V5": -10.564656569212, "V6": -2.64568119936245, "V7": -18.02346767268, "V8": 2.69365540308048, "V9": -6.21946362785238, "V10": -12.7447607871859, "V11": 9.31813768535999, "V12": -13.3778574339457, "V13": 1.02192386777466, "V14": -12.7843458873548, "V15": -0.451145843251939, "V16": -7.55136493140559, "V17": -11.3259968724596, "V18": -4.70125277749548, "V19": 0.516317073274611, "V20": 1.00770320533757, "V21": -2.31947946208034, "V22": 0.908838783150801, "V23": 1.35290370698024, "V24": -1.05922233762791, "V25": 0.185750941504222, "V26": 0.687037383632165, "V27": 2.07808058379956, "V28": -1.42951702264525, "Amount": 1.0} as PredictionRequest;
    }
  }

  /**
   * Maps Flask response (potentially snake_case) to TypeScript camelCase format
   * Handles various possible key names and ensures proper types
   */
  private normalizeFlaskResponse(rawData: unknown): BatchPredictionResponse {
    console.log('Raw Flask Data (before normalization):', rawData);

    // Helper: Convert snake_case to camelCase
    const toCamelCase = (str: string): string => {
      return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    };

    // Helper: Get value from object with multiple possible keys
    const getField = (obj: Record<string, unknown>, keys: string[]): unknown => {
      for (const key of keys) {
        if (obj[key] !== undefined) return obj[key];
        // Try camelCase version
        const camelKey = toCamelCase(key);
        if (obj[camelKey] !== undefined) return obj[camelKey];
      }
      return undefined;
    };

    // Helper: Safely parse number
    const toNumber = (value: unknown): number => {
      if (typeof value === 'number') return value;
      const parsed = parseFloat(value);
      return isNaN(parsed) ? 0 : parsed;
    };

    // Helper: Safely parse boolean
    const toBoolean = (value: unknown): boolean => {
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') return value.toLowerCase() === 'true' || value === '1';
      return Boolean(value);
    };

    // Normalize transaction array
    const results = (Array.isArray((rawData as Record<string, unknown>)?.results) ? (rawData as Record<string, unknown>).results : []).map((txn: unknown, index: number) => {
      return {
        transactionId: getField(txn as Record<string, unknown>, ['transactionId', 'transaction_id', 'id']) as string || `TXN-${index + 1}`,
        time: toNumber(getField(txn as Record<string, unknown>, ['time', 'Time'])),
        amount: toNumber(getField(txn as Record<string, unknown>, ['amount', 'Amount'])),
        reconstructionError: toNumber(
          getField(txn as Record<string, unknown>, ['reconstructionError', 'reconstruction_error', 'mse', 'anomaly_score', 'anomalyScore'])
        ),
        structuralConfidence: toNumber(
          getField(txn as Record<string, unknown>, ['structuralConfidence', 'structural_confidence', 'confidence'])
        ),
        threshold: toNumber(getField(txn as Record<string, unknown>, ['threshold', 'Threshold'])),
        isFraud: toBoolean(getField(txn as Record<string, unknown>, ['isFraud', 'is_fraud', 'fraud', 'is_fraudulent'])),
        prediction: (getField(txn as Record<string, unknown>, ['prediction', 'label']) || 'Genuine') as 'Fraudulent' | 'Genuine',
      };
    });

    // Normalize top-level response
    const rawDataObj = rawData as Record<string, unknown>;
    const normalized: BatchPredictionResponse = {
      success: toBoolean(getField(rawDataObj, ['success', 'Success']) ?? true),
      totalTransactions: toNumber(
        getField(rawDataObj, ['totalTransactions', 'total_transactions', 'total', 'count']) || results.length
      ),
      fraudulentCount: toNumber(
        getField(rawDataObj, ['fraudulentCount', 'fraudulent_count', 'fraud_count', 'frauds'])
      ),
      genuineCount: toNumber(
        getField(rawDataObj, ['genuineCount', 'genuine_count', 'normal_count', 'normals'])
      ),
      results,
    };

    console.log('Normalized Flask Data (after mapping):', normalized);
    console.log('Sample normalized transaction:', normalized.results[0]);

    return normalized;
  }

  async batchPredict(file: File): Promise<BatchPredictionResponse> {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${this.baseUrl}/api/batch-predict`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Batch prediction failed');
      }

      const rawData = await response.json();
      
      // Normalize the Flask response to ensure proper format
      const normalizedData = this.normalizeFlaskResponse(rawData);
      
      return normalizedData;
    } catch (error) {
      console.error('Error in batch prediction:', error);
      throw error;
    }
  }
}

export const apiService = new ApiService();
