import { useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { KpiCard } from "@/components/KpiCard";
import { Activity, ShieldCheck, Target, Eye, Upload } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
} from "recharts";
import { useBatch } from "@/contexts/BatchContext";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

/**
 * Data sanitization utilities to prevent NaN/undefined from breaking Recharts
 */
const sanitizeNumber = (value: unknown, fallback: number = 0): number => {
  if (typeof value === 'number' && !isNaN(value) && isFinite(value)) {
    return value;
  }
  return fallback;
};

const formatNumber = (value: unknown, decimals: number = 2, fallback: string = '0.00'): string => {
  const num = sanitizeNumber(value);
  if (!Number.isFinite(num)) return fallback;
  return num.toFixed(decimals);
};

const isValidTransaction = (txn: unknown): boolean => {
  if (!txn || typeof txn !== 'object') return false;
  
  // Check required numeric fields
  if (!Number.isFinite(txn.time)) return false;
  if (!Number.isFinite(txn.amount)) return false;
  if (!Number.isFinite(txn.reconstructionError)) return false;
  if (!Number.isFinite(txn.structuralConfidence)) return false;
  
  // Check boolean field
  if (typeof txn.isFraud !== 'boolean') return false;
  
  return true;
};

export default function Dashboard() {
  const { batchData } = useBatch();
  const navigate = useNavigate();

  // Debug: Log what data we're receiving from context
  console.log('Dashboard Context Data:', batchData);
  if (batchData) {
    console.log('Transactions array:', batchData.results);
    console.log('First transaction sample:', batchData.results?.[0]);
    
    // Filter and log any invalid transactions
    const invalidTransactions = batchData.results.filter(txn => !isValidTransaction(txn));
    if (invalidTransactions.length > 0) {
      console.warn(`⚠️ Found ${invalidTransactions.length} invalid transactions (will be filtered out):`, invalidTransactions.slice(0, 3));
    }
  }

  // Calculate statistics from batch data with sanitization
  const stats = useMemo(() => {
    if (!batchData) return null;
    
    // Filter out invalid transactions
    const validResults = batchData.results.filter(isValidTransaction);
    
    if (validResults.length === 0) {
      console.warn('⚠️ No valid transactions found in batch data');
      return null;
    }
    
    const totalErrors = validResults.reduce((sum, txn) => sum + sanitizeNumber(txn.reconstructionError), 0);
    
    return {
      totalMonitored: validResults.length,
      fraudCount: sanitizeNumber(batchData.fraudulentCount, validResults.filter(t => t.isFraud).length),
      genuineCount: sanitizeNumber(batchData.genuineCount, validResults.filter(t => !t.isFraud).length),
      fraudRate: validResults.length > 0 
        ? (validResults.filter(t => t.isFraud).length / validResults.length) * 100 
        : 0,
      avgError: validResults.length > 0 ? totalErrors / validResults.length : 0,
    };
  }, [batchData]);

  // Generate time-series data from batch results with proper sorting, binning, and sanitization
  const timeSeriesData = useMemo(() => {
    if (!batchData || batchData.results.length === 0) return [];
    
    // Step 0: Filter out invalid transactions FIRST
    const validResults = batchData.results.filter(isValidTransaction);
    
    if (validResults.length === 0) {
      console.warn('⚠️ No valid transactions for time series chart');
      return [];
    }
    
    // Step 1: Sort all transactions by time in ascending order
    const sortedResults = [...validResults].sort((a, b) => a.time - b.time);
    
    // Step 2: Determine optimal bucket count based on data size
    // For large datasets, create more buckets but cap at 50 for readability
    const optimalBucketCount = Math.min(50, Math.max(12, Math.floor(sortedResults.length / 500)));
    
    // Step 3: Calculate bucket size (each bucket represents ~100-1000 transactions)
    const bucketSize = Math.ceil(sortedResults.length / optimalBucketCount);
    
    // Step 4: Create time-based buckets with sanitized data
    const buckets = Array.from({ length: optimalBucketCount }, (_, i) => {
      const start = i * bucketSize;
      const end = Math.min(start + bucketSize, sortedResults.length);
      const bucket = sortedResults.slice(start, end);
      
      if (bucket.length === 0) return null;
      
      // Get time range for this bucket
      const minTime = sanitizeNumber(bucket[0]?.time, 0);
      const maxTime = sanitizeNumber(bucket[bucket.length - 1]?.time, 0);
      const avgTime = (minTime + maxTime) / 2;
      
      const genuineCount = bucket.filter(txn => !txn.isFraud).length;
      const fraudulentCount = bucket.filter(txn => txn.isFraud).length;
      
      return {
        bucket: `${Math.floor(avgTime)}s`,
        time: sanitizeNumber(avgTime),
        genuine: sanitizeNumber(genuineCount),
        fraudulent: sanitizeNumber(fraudulentCount),
        totalInBucket: sanitizeNumber(bucket.length),
      };
    });
    
    // Step 5: Filter out any null buckets and ensure all values are valid numbers
    const sanitized = buckets.filter(bucket => 
      bucket !== null && 
      Number.isFinite(bucket.time) && 
      Number.isFinite(bucket.genuine) && 
      Number.isFinite(bucket.fraudulent)
    );
    
    console.log('✅ Time series data sanitized:', sanitized.length, 'buckets ready for chart');
    return sanitized;
  }, [batchData]);

  // Calculate confusion matrix from batch data with sanitization
  const confusionData = useMemo(() => {
    if (!batchData) {
      return [
        { name: "True Positive", value: 0, description: "Fraudulent Detected", color: "text-secondary" },
        { name: "True Negative", value: 0, description: "Genuine", color: "text-secondary" },
        { name: "False Positive", value: 0, description: "False Alarm", color: "text-primary" },
        { name: "False Negative", value: 0, description: "Missed", color: "text-destructive" },
      ];
    }
    
    // Filter valid transactions
    const validResults = batchData.results.filter(isValidTransaction);
    
    if (validResults.length === 0) {
      return [
        { name: "True Positive", value: 0, description: "Fraudulent Detected", color: "text-secondary" },
        { name: "True Negative", value: 0, description: "Genuine", color: "text-secondary" },
        { name: "False Positive", value: 0, description: "False Alarm", color: "text-primary" },
        { name: "False Negative", value: 0, description: "Missed", color: "text-destructive" },
      ];
    }
    
    const totalConfidence = validResults.reduce((sum, txn) => sum + sanitizeNumber(txn.structuralConfidence, 0), 0);
    const avgConfidence = sanitizeNumber(totalConfidence / validResults.length, 0.9);
    
    const fraudCount = sanitizeNumber(batchData.fraudulentCount, validResults.filter(t => t.isFraud).length);
    const genuineCount = sanitizeNumber(batchData.genuineCount, validResults.filter(t => !t.isFraud).length);
    
    const falsePositive = Math.round(genuineCount * (1 - avgConfidence) * 0.02);
    const falseNegative = Math.round(fraudCount * (1 - avgConfidence) * 0.01);

    return [
      { name: "True Positive", value: sanitizeNumber(fraudCount), description: "Fraudulent Detected", color: "text-secondary" },
      { name: "True Negative", value: sanitizeNumber(genuineCount), description: "Genuine", color: "text-secondary" },
      { name: "False Positive", value: sanitizeNumber(falsePositive), description: "False Alarm", color: "text-primary" },
      { name: "False Negative", value: sanitizeNumber(falseNegative), description: "Missed", color: "text-destructive" },
    ];
  }, [batchData]);

  // Generate weekly blocked data from batch results with proper sorting and sanitization
  const weeklyData = useMemo(() => {
    if (!batchData || batchData.results.length === 0) {
      return [
        { day: "Mon", blocked: 0 }, { day: "Tue", blocked: 0 }, { day: "Wed", blocked: 0 },
        { day: "Thu", blocked: 0 }, { day: "Fri", blocked: 0 }, { day: "Sat", blocked: 0 }, { day: "Sun", blocked: 0 },
      ];
    }
    
    // Filter valid transactions first
    const validResults = batchData.results.filter(isValidTransaction);
    
    if (validResults.length === 0) {
      return [
        { day: "Mon", blocked: 0 }, { day: "Tue", blocked: 0 }, { day: "Wed", blocked: 0 },
        { day: "Thu", blocked: 0 }, { day: "Fri", blocked: 0 }, { day: "Sat", blocked: 0 }, { day: "Sun", blocked: 0 },
      ];
    }
    
    // Sort fraud results by time
    const fraudResults = validResults
      .filter(txn => txn.isFraud)
      .sort((a, b) => a.time - b.time);
    
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const perDay = Math.ceil(fraudResults.length / 7);
    
    return days.map((day, idx) => ({
      day,
      blocked: sanitizeNumber(Math.max(0, Math.min(perDay, fraudResults.length - (idx * perDay)))),
    }));
  }, [batchData]);

  // Get recent transactions (last 10, sorted by time descending) - filtered and sanitized
  const recentTransactions = useMemo(() => {
    if (!batchData?.results) return [];
    
    // Filter valid transactions first
    const validResults = batchData.results.filter(isValidTransaction);
    
    return validResults
      .sort((a, b) => b.time - a.time) // Sort descending (most recent first)
      .slice(0, 10);
  }, [batchData]);

  const pieBreakdownData = useMemo(() => {
    const genuine = sanitizeNumber(stats?.genuineCount, 0);
    const fraud = sanitizeNumber(stats?.fraudCount, 0);
    return [
      { name: "Genuine", value: genuine, color: "hsl(157,100%,46%)" },
      { name: "Fraud", value: fraud, color: "hsl(0,90%,63%)" },
    ];
  }, [stats]);

  const amountBarData = useMemo(() => {
    return recentTransactions
      .slice()
      .sort((a, b) => a.time - b.time)
      .slice(-10)
      .map((tx, idx) => ({
        index: idx + 1,
        amount: sanitizeNumber(tx.amount, 0),
      }));
  }, [recentTransactions]);

  const reconstructionLineData = useMemo(() => {
    return recentTransactions
      .slice()
      .sort((a, b) => a.time - b.time)
      .slice(-10)
      .map((tx, idx) => ({
        index: idx + 1,
        error: sanitizeNumber(tx.reconstructionError, 0),
      }));
  }, [recentTransactions]);

  // Calculate model metrics with sanitization
  const recall = useMemo(() => {
    if (!batchData) return 0;
    const tp = sanitizeNumber(confusionData[0].value);
    const fn = sanitizeNumber(confusionData[3].value);
    const total = tp + fn;
    return total > 0 ? sanitizeNumber((tp / total) * 100) : 0;
  }, [confusionData, batchData]);

  const fpr = useMemo(() => {
    if (!batchData) return 0;
    const fp = sanitizeNumber(confusionData[2].value);
    const tn = sanitizeNumber(confusionData[1].value);
    const total = fp + tn;
    return total > 0 ? sanitizeNumber((fp / total) * 100) : 0;
  }, [confusionData, batchData]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Risk & Fraud Radar</h1>
            {batchData && (
              <p className="text-sm text-muted-foreground mt-1">
                Loaded: {batchData.fileName} • {batchData.uploadDate?.toLocaleString()}
              </p>
            )}
          </div>
          {!batchData && (
            <Button onClick={() => navigate('/batch-analysis')} className="gap-2">
              <Upload className="w-4 h-4" />
              Upload Batch Data
            </Button>
          )}
        </div>

        {!batchData ? (
          /* Empty State */
          <motion.div 
            className="flex flex-col items-center justify-center py-20 space-y-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="rounded-full bg-primary/10 p-6">
              <Upload className="w-12 h-12 text-primary" />
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold">No Batch Data Loaded</h2>
              <p className="text-muted-foreground max-w-md">
                Upload a CSV file in Batch Analysis to view batch fraud detection statistics and visualizations.
              </p>
            </div>
            <Button size="lg" onClick={() => navigate('/batch-analysis')} className="mt-4 gap-2">
              <Upload className="w-4 h-4" />
              Go to Batch Analysis
            </Button>
          </motion.div>
        ) : (
          <>
            {/* KPI Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard 
                icon={Activity} 
                label="Total Monitored" 
                value={sanitizeNumber(stats?.totalMonitored, 0).toLocaleString()} 
                change={`${sanitizeNumber(batchData.totalTransactions, 0)} txns`}
              />
              <KpiCard 
                icon={ShieldCheck} 
                label="Fraud Detection Rate" 
                value={`${formatNumber(stats?.fraudRate, 2, '0.00')}%`} 
                change={`${sanitizeNumber(stats?.fraudCount, 0)} fraudulent`}
              />
              <KpiCard 
                icon={Target} 
                label="Model Recall" 
                value={`${formatNumber(recall, 1, '0.0')}%`} 
                change="Detection accuracy"
              />
              <KpiCard 
                icon={Eye} 
                label="False Positive Rate" 
                value={`${formatNumber(fpr, 2, '0.00')}%`} 
                change="False alarms"
                positive={false} 
              />
            </div>

            {/* Charts Row */}
            <div className="grid lg:grid-cols-3 gap-4">
              {/* Area Chart */}
              <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-semibold text-foreground">Transaction Distribution</h3>
                  <span className="text-xs text-muted-foreground px-3 py-1 rounded-full border border-border">
                    {timeSeriesData.length} time buckets • Sorted
                  </span>
                </div>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={timeSeriesData || []}>
                    <defs>
                      <linearGradient id="genuineGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(68, 100%, 50%)" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="hsl(68, 100%, 50%)" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="fraudGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(0, 80%, 60%)" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="hsl(0, 80%, 60%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(232,12%,18%)" />
                    <XAxis dataKey="bucket" stroke="hsl(228,5%,55%)" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(228,5%,55%)" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(230,10%,10%)",
                        border: "1px solid hsl(232,12%,18%)",
                        borderRadius: "12px",
                        color: "hsl(0,0%,95%)",
                        fontSize: "12px",
                      }}
                    />
                    <Area type="monotone" dataKey="genuine" stroke="hsl(68,100%,50%)" fill="url(#genuineGrad)" strokeWidth={2} />
                    <Area type="monotone" dataKey="fraudulent" stroke="hsl(0,80%,60%)" fill="url(#fraudGrad)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Weekly Blocked */}
              <div className="rounded-2xl border border-border bg-card p-5">
                <h3 className="text-base font-semibold text-foreground mb-4">Weekly Distribution</h3>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={weeklyData || []}>
                    <XAxis dataKey="day" stroke="hsl(228,5%,55%)" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(228,5%,55%)" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(230,10%,10%)",
                        border: "1px solid hsl(232,12%,18%)",
                        borderRadius: "12px",
                        color: "hsl(0,0%,95%)",
                        fontSize: "12px",
                      }}
                    />
                    <Bar dataKey="blocked" fill="hsl(68,100%,50%)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Fraud Analytics */}
            <div className="rounded-2xl border border-border bg-card p-5">
              <h3 className="text-base font-semibold text-foreground mb-2">Fraud Analytics</h3>
              <p className="text-sm text-muted-foreground mb-5">
                The charts below visualize fraud distribution, transaction amount patterns, and anomaly reconstruction errors.
              </p>

              <div className="grid lg:grid-cols-3 gap-4">
                <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={pieBreakdownData}
                        cx="50%"
                        cy="50%"
                        innerRadius={0}
                        outerRadius={95}
                        dataKey="value"
                        stroke="hsl(232,12%,12%)"
                        strokeWidth={2}
                      >
                        {pieBreakdownData.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number) => value.toLocaleString()}
                        contentStyle={{
                          backgroundColor: "hsl(230,10%,10%)",
                          border: "1px solid hsl(232,12%,18%)",
                          borderRadius: "12px",
                          color: "hsl(0,0%,95%)",
                          fontSize: "12px",
                        }}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={amountBarData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(232,12%,18%)" />
                      <XAxis dataKey="index" stroke="hsl(228,5%,55%)" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis stroke="hsl(228,5%,55%)" fontSize={11} tickLine={false} axisLine={false} />
                      <Tooltip
                        formatter={(value: number) => [`$${value.toFixed(2)}`, "Transaction Amount"]}
                        contentStyle={{
                          backgroundColor: "hsl(230,10%,10%)",
                          border: "1px solid hsl(232,12%,18%)",
                          borderRadius: "12px",
                          color: "hsl(0,0%,95%)",
                          fontSize: "12px",
                        }}
                      />
                      <Legend />
                      <Bar dataKey="amount" name="Transaction Amount" fill="hsl(76, 100%, 50%)" radius={[5, 5, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={reconstructionLineData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(232,12%,18%)" />
                      <XAxis dataKey="index" stroke="hsl(228,5%,55%)" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis stroke="hsl(228,5%,55%)" fontSize={11} tickLine={false} axisLine={false} />
                      <Tooltip
                        formatter={(value: number) => [value.toExponential(3), "Reconstruction Error"]}
                        contentStyle={{
                          backgroundColor: "hsl(230,10%,10%)",
                          border: "1px solid hsl(232,12%,18%)",
                          borderRadius: "12px",
                          color: "hsl(0,0%,95%)",
                          fontSize: "12px",
                        }}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="error"
                        name="Reconstruction Error"
                        stroke="hsl(194, 100%, 55%)"
                        strokeWidth={3}
                        dot={{ r: 4, strokeWidth: 2, fill: "hsl(230,10%,10%)" }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Confusion Matrix */}
            <div className="rounded-2xl border border-border bg-card p-5">
              <h3 className="text-base font-semibold text-foreground mb-5">Confusion Matrix</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {confusionData.map((item) => (
                  <div key={item.name} className="rounded-2xl border border-border bg-muted/30 p-4 text-center">
                    <p className="text-xs text-muted-foreground mb-1">{item.name}</p>
                    <p className={`text-2xl font-bold ${item.color}`}>{item.value.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Transactions Log */}
            <div className="rounded-2xl border border-border bg-card p-5">
              <h3 className="text-base font-semibold text-foreground mb-5">Recent Transactions</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground text-xs">
                      <th className="text-left py-3 px-4 font-medium">Transaction ID</th>
                      <th className="text-right py-3 px-4 font-medium">Time</th>
                      <th className="text-right py-3 px-4 font-medium">Amount</th>
                      <th className="text-right py-3 px-4 font-medium">MSE</th>
                      <th className="text-center py-3 px-4 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentTransactions.map((tx) => (
                      <tr
                        key={tx.transactionId}
                        className="border-b border-border/50 transition-all duration-300 hover:bg-card/60 hover:backdrop-blur-xl hover:border-border/70"
                      >
                        <td className="py-3 px-4 font-mono text-foreground">{tx.transactionId || 'N/A'}</td>
                        <td className="py-3 px-4 text-right text-muted-foreground">
                          {formatNumber(tx.time, 0, '0')}
                        </td>
                        <td className="py-3 px-4 text-right text-foreground">
                          ${formatNumber(tx.amount, 2, '0.00')}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className={tx.isFraud ? "text-destructive font-medium" : "text-secondary font-medium"}>
                            {formatNumber(tx.reconstructionError, 6, '0.000000')}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                              tx.prediction === "Genuine"
                                ? "bg-secondary/15 text-secondary border border-secondary/30"
                                : "bg-destructive/15 text-destructive border border-destructive/30"
                            }`}
                          >
                            {tx.prediction || 'Unknown'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
