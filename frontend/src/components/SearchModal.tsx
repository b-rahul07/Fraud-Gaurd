import { useState, useMemo } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Search, AlertCircle, CheckCircle2, TrendingUp } from 'lucide-react';
import { useBatch } from '@/contexts/BatchContext';

interface SearchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function SearchModal({ open, onOpenChange }: SearchModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const { batchData } = useBatch();

  const filteredTransactions = useMemo(() => {
    if (!searchQuery.trim() || !batchData?.results) return [];
    
    const query = searchQuery.toLowerCase().trim();
    return batchData.results.filter(txn => 
      txn.transactionId.toLowerCase().includes(query)
    );
  }, [searchQuery, batchData?.results]);

  const handleClose = () => {
    setSearchQuery('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 gap-0 bg-background/80 backdrop-blur-xl border-border/50 shadow-2xl">
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-border/50">
          <Search className="h-5 w-5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by Transaction ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
            autoFocus
          />
          <kbd className="hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[400px] overflow-y-auto p-2">
          {!batchData?.results ? (
            // Empty State - No Data
            <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
                <TrendingUp className="h-8 w-8 text-primary/60" />
              </div>
              <h3 className="text-lg font-semibold mb-2 text-foreground">No Batch Data</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                Upload a batch to search transactions
              </p>
            </div>
          ) : searchQuery.trim() === '' ? (
            // Hint State - Waiting for Input
            <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
              <div className="w-16 h-16 rounded-2xl bg-muted/50 border border-border flex items-center justify-center mb-4">
                <Search className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground max-w-sm">
                Start typing a transaction ID to search through {batchData.totalTransactions.toLocaleString()} transactions
              </p>
            </div>
          ) : filteredTransactions.length === 0 ? (
            // No Results State
            <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
              <div className="w-16 h-16 rounded-2xl bg-muted/50 border border-border flex items-center justify-center mb-4">
                <Search className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-base font-semibold mb-2 text-foreground">No transactions found</h3>
              <p className="text-sm text-muted-foreground">
                Try a different transaction ID
              </p>
            </div>
          ) : (
            // Results List
            <div className="space-y-2">
              {filteredTransactions.map((txn) => (
                <button
                  key={txn.transactionId}
                  onClick={handleClose}
                  className="w-full p-4 rounded-xl bg-muted/30 hover:bg-muted/50 border border-border/50 hover:border-border transition-all text-left group"
                >
                  <div className="flex items-start justify-between gap-4">
                    {/* Left Side - Transaction Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-mono text-sm font-semibold text-foreground">
                          {txn.transactionId}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                            txn.isFraud
                              ? 'bg-red-500/10 text-red-600 border border-red-500/20'
                              : 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                          }`}
                        >
                          {txn.isFraud ? (
                            <>
                              <AlertCircle className="h-3 w-3" />
                              Fraudulent
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="h-3 w-3" />
                              Genuine
                            </>
                          )}
                        </span>
                      </div>

                      {/* Transaction Details Grid */}
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Amount:</span>
                          <span className="font-semibold text-foreground">
                            ${txn.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Score:</span>
                          <span className={`font-medium ${txn.isFraud ? 'text-red-600' : 'text-emerald-600'}`}>
                            {txn.reconstructionError.toFixed(4)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Probability:</span>
                          <span className="font-medium text-foreground">
                            {(txn.structuralConfidence * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Threshold:</span>
                          <span className="font-medium text-muted-foreground">
                            {txn.threshold.toFixed(4)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right Side - Visual Indicator */}
                    <div className="flex flex-col items-end justify-center gap-1">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                        txn.isFraud
                          ? 'bg-red-500/10 border border-red-500/20'
                          : 'bg-emerald-500/10 border border-emerald-500/20'
                      }`}>
                        {txn.isFraud ? (
                          <AlertCircle className="h-6 w-6 text-red-600" />
                        ) : (
                          <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer - Help Text */}
        {batchData?.results && searchQuery.trim() !== '' && filteredTransactions.length > 0 && (
          <div className="px-4 py-3 border-t border-border/50 bg-muted/20">
            <p className="text-xs text-muted-foreground text-center">
              Showing {filteredTransactions.length} of {batchData.totalTransactions.toLocaleString()} transactions
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
