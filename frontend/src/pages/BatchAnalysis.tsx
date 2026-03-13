import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Upload, FileText, CheckCircle2, XCircle, AlertCircle, Database, TrendingUp, Activity } from 'lucide-react';
import { useBatch } from '../contexts/BatchContext';
import { useAuth } from '../contexts/AuthContext';
import { apiService } from '../services/api';
import { saveBatchToFirestore } from '../lib/batchService';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import { useToast } from '../hooks/use-toast';
import DashboardLayout from '../components/DashboardLayout';

/**
 * Validates the batch prediction response structure
 * Ensures all required fields are present and properly typed
 */
function validateBatchResponse(data: unknown): boolean {
  if (!data || typeof data !== 'object') {
    console.error('Validation failed: Data is not an object');
    return false;
  }

  if (!Array.isArray(data.results)) {
    console.error('Validation failed: results is not an array');
    return false;
  }

  if (data.results.length === 0) {
    console.error('Validation failed: results array is empty');
    return false;
  }

  // Validate first transaction has all required fields
  const firstTxn = data.results[0];
  const requiredFields = [
    'transactionId',
    'time',
    'amount',
    'reconstructionError',
    'structuralConfidence',
    'threshold',
    'isFraud',
    'prediction'
  ];

  for (const field of requiredFields) {
    if (!(field in firstTxn)) {
      console.error(`Validation failed: Missing field "${field}" in transaction`);
      return false;
    }
  }

  // Validate data types
  if (typeof firstTxn.time !== 'number') {
    console.error('Validation failed: time is not a number');
    return false;
  }

  if (typeof firstTxn.amount !== 'number') {
    console.error('Validation failed: amount is not a number');
    return false;
  }

  if (typeof firstTxn.isFraud !== 'boolean') {
    console.error('Validation failed: isFraud is not a boolean');
    return false;
  }

  console.log('✅ Batch response validation passed');
  return true;
}

export default function BatchAnalysis() {
  const { batchData, setBatchData, isLoading, setIsLoading, loadUserBatches } = useBatch();
  const { user } = useAuth();
  const { toast } = useToast();
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const csvFile = files.find(file => file.name.endsWith('.csv'));

    if (!csvFile) {
      toast({
        title: "Invalid File",
        description: "Please upload a CSV file",
        variant: "destructive",
      });
      return;
    }

    await processFile(csvFile);
  }, []);

  const handleFileInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await processFile(file);
    }
  }, []);

  const processFile = async (file: File) => {
    // Enforce authentication - prevent upload if no user
    if (!user?.uid) {
      toast({
        title: "Authentication Required",
        description: "You must be logged in to upload and analyze batches",
        variant: "destructive",
      });
      throw new Error('User must be authenticated to upload batches');
    }

    setIsLoading(true);
    setUploadProgress(0);

    // Simulate progress
    const progressInterval = setInterval(() => {
      setUploadProgress(prev => Math.min(prev + 10, 90));
    }, 200);

    try {
      // Step 1: Send to Flask backend for analysis
      const result = await apiService.batchPredict(file);
      
      clearInterval(progressInterval);
      setUploadProgress(100);

      // Step 1.5: Validate response structure
      if (!validateBatchResponse(result)) {
        throw new Error('Invalid response structure from backend');
      }

      const batchDataWithFile = {
        ...result,
        fileName: file.name,
      };

      // Step 2: Save to Firestore (user is guaranteed to exist from check above)
      // Absolutely guarantee userId is included in the saved document
      try {
        await saveBatchToFirestore(user.uid, batchDataWithFile);
        console.log('Batch data saved to Firestore with userId:', user.uid);
        
        // Step 3: Reload all batches from Firestore to merge with existing data
        await loadUserBatches();
        
        toast({
          title: "Analysis Complete",
          description: `Processed ${result.totalTransactions} transactions successfully`,
        });
      } catch (firestoreError) {
        console.error('Firestore save failed:', firestoreError);
        throw new Error('Failed to save batch data to database');
      }
    } catch (error) {
      clearInterval(progressInterval);
      toast({
        title: "Upload Failed",
        description: error instanceof Error ? error.message : "Failed to process CSV",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setTimeout(() => setUploadProgress(0), 1000);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Batch Analysis</h1>
          <p className="text-muted-foreground mt-1">
            Upload CSV files for bulk transaction fraud detection via GraphSAGE → Autoencoder pipeline
          </p>
        </div>

        {/* Upload Zone */}
        <Card className="border-2 border-dashed">
          <CardContent className="p-8">
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`
                relative overflow-hidden rounded-xl border-2 border-dashed transition-all duration-300
                ${isDragging 
                  ? 'border-primary bg-primary/5 scale-[1.02]' 
                  : 'border-border bg-card/60 hover:border-primary/50 hover:bg-card/80'
                }
                backdrop-blur-xl
              `}
            >
              {/* Background Pattern */}
              <div className="absolute inset-0 bg-grid-white/[0.02] pointer-events-none" />
              
              {/* Content */}
              <motion.div 
                className="relative p-12 flex flex-col items-center justify-center text-center space-y-4"
                animate={{ scale: isDragging ? 1.05 : 1 }}
              >
                <div className="relative">
                  <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full" />
                  <Upload className="w-16 h-16 text-primary relative" />
                </div>

                <div className="space-y-2">
                  <h3 className="text-2xl font-semibold">
                    {isDragging ? 'Drop CSV File Here' : 'Upload Transaction Data'}
                  </h3>
                  <p className="text-muted-foreground max-w-md">
                    Drag and drop a CSV file or click to browse. Must include Time, V1-V28, and Amount columns.
                  </p>
                </div>

                <div className="flex gap-3">
                  <Button
                    size="lg"
                    disabled={isLoading}
                    onClick={() => document.getElementById('file-input')?.click()}
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    {isLoading ? 'Processing...' : 'Choose File'}
                  </Button>
                  
                  <input
                    id="file-input"
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={handleFileInput}
                    disabled={isLoading}
                  />
                </div>

                {/* Progress Bar */}
                {isLoading && (
                  <motion.div 
                    className="w-full max-w-md space-y-2"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <Progress value={uploadProgress} className="h-2" />
                    <p className="text-sm text-muted-foreground">
                      Analyzing transactions through neural network...
                    </p>
                  </motion.div>
                )}
              </motion.div>
            </div>
          </CardContent>
        </Card>

        {/* Results Summary */}
        {batchData && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="bg-card/60 backdrop-blur-xl">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Total Analyzed</CardTitle>
                  <Database className="w-4 h-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{batchData.totalTransactions}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    From {batchData.fileName}
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-card/60 backdrop-blur-xl">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Fraudulent</CardTitle>
                  <XCircle className="w-4 h-4 text-destructive" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-destructive">
                    {batchData.fraudulentCount}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {((batchData.fraudulentCount / batchData.totalTransactions) * 100).toFixed(1)}% detection rate
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-card/60 backdrop-blur-xl">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Genuine</CardTitle>
                  <CheckCircle2 className="w-4 h-4 text-secondary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-secondary">
                    {batchData.genuineCount}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {((batchData.genuineCount / batchData.totalTransactions) * 100).toFixed(1)}% legitimate
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-card/60 backdrop-blur-xl">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Risk Level</CardTitle>
                  <Activity className="w-4 h-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {batchData.fraudulentCount > batchData.genuineCount ? 'HIGH' : 
                     batchData.fraudulentCount > batchData.totalTransactions * 0.1 ? 'MEDIUM' : 'LOW'}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Batch risk assessment
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Detailed Results Table */}
            <Card className="bg-card/60 backdrop-blur-xl">
              <CardHeader>
                <CardTitle>Transaction Details</CardTitle>
                <CardDescription>
                  Showing all {batchData.results.length} analyzed transactions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border overflow-hidden">
                  <div className="max-h-[500px] overflow-y-auto">
                    <table className="w-full">
                      <thead className="bg-muted/50 sticky top-0 backdrop-blur-lg">
                        <tr>
                          <th className="text-left p-3 text-xs font-medium">ID</th>
                          <th className="text-left p-3 text-xs font-medium">Amount</th>
                          <th className="text-left p-3 text-xs font-medium">MSE</th>
                          <th className="text-left p-3 text-xs font-medium">Confidence</th>
                          <th className="text-left p-3 text-xs font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {batchData.results.map((txn, idx) => (
                          <motion.tr
                            key={txn.transactionId}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.01 }}
                            className="hover:bg-muted/30 transition-colors"
                          >
                            <td className="p-3 font-mono text-xs">{txn.transactionId}</td>
                            <td className="p-3 text-sm">${txn.amount.toFixed(2)}</td>
                            <td className="p-3 font-mono text-xs">
                              {txn.reconstructionError.toFixed(6)}
                            </td>
                            <td className="p-3 text-sm">
                              {(txn.structuralConfidence * 100).toFixed(1)}%
                            </td>
                            <td className="p-3">
                              <Badge
                                variant={txn.isFraud ? "destructive" : "secondary"}
                                className="font-medium"
                              >
                                {txn.prediction}
                              </Badge>
                            </td>
                          </motion.tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Info Card */}
        {!batchData && !isLoading && (
          <Card className="bg-card/40 backdrop-blur-xl border-primary/20">
            <CardHeader>
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-primary mt-0.5" />
                <div>
                  <CardTitle className="text-base">How It Works</CardTitle>
                  <CardDescription className="mt-2 space-y-2">
                    <p>1. Upload a CSV file containing transaction data (Time, V1-V28, Amount columns)</p>
                    <p>2. GraphSAGE builds a k-nearest neighbors graph to capture structural relationships</p>
                    <p>3. Neural network generates embeddings and detects anomalies via reconstruction error</p>
                    <p>4. Results are displayed below and synced to the Dashboard for batch monitoring</p>
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
