import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle,
  XCircle,
  CalendarPlus,
  Loader2,
  X,
  AlertTriangle,
  MessageSquare
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface BulkActionsBarProps {
  selectedCount: number;
  selectedStatuses: Record<string, number>;
  isProcessing: boolean;
  onApprove: () => void;
  onReject: () => void;
  onExtend: () => void;
  onClear: () => void;
  activeTab: string;
}

export function BulkActionsBar({
  selectedCount,
  selectedStatuses,
  isProcessing,
  onApprove,
  onReject,
  onExtend,
  onClear,
  activeTab
}: BulkActionsBarProps) {
  if (selectedCount === 0) return null;

  // Calculate action eligibility
  const canApprove = (selectedStatuses["pending_approval"] || 0) + (selectedStatuses["awaiting_proof"] || 0);
  const canReject = canApprove;
  const canExtend = selectedStatuses["active"] || 0;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.2 }}
      >
        <Card className="bg-primary/10 border-primary/30">
          <CardContent className="py-3 px-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              {/* Selection Info */}
              <div className="flex items-center gap-3">
                <Badge variant="secondary" className="gap-1 px-3 py-1">
                  {selectedCount} selected
                </Badge>
                
                {/* Impact Preview */}
                <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground">
                  {canApprove > 0 && (
                    <span className="flex items-center gap-1">
                      <CheckCircle className="h-3 w-3 text-success" />
                      {canApprove} can approve
                    </span>
                  )}
                  {canExtend > 0 && (
                    <span className="flex items-center gap-1">
                      <CalendarPlus className="h-3 w-3 text-primary" />
                      {canExtend} can extend
                    </span>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                {activeTab === "all" && canApprove > 0 && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 bg-success/20 border-success/30 text-success hover:bg-success/30"
                      onClick={onApprove}
                      disabled={isProcessing}
                    >
                      {isProcessing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle className="h-4 w-4" />
                      )}
                      Approve ({canApprove})
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 bg-destructive/20 border-destructive/30 text-destructive hover:bg-destructive/30"
                      onClick={onReject}
                      disabled={isProcessing}
                    >
                      {isProcessing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <XCircle className="h-4 w-4" />
                      )}
                      Reject ({canReject})
                    </Button>
                  </>
                )}

                {(activeTab === "active" || canExtend > 0) && canExtend > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 bg-primary/20 border-primary/30 text-primary hover:bg-primary/30"
                    onClick={onExtend}
                    disabled={isProcessing}
                  >
                    {isProcessing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CalendarPlus className="h-4 w-4" />
                    )}
                    Extend 30d ({canExtend})
                  </Button>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1"
                  onClick={onClear}
                >
                  <X className="h-3 w-3" />
                  Clear
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}
