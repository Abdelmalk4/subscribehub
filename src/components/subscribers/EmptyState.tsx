import { Button } from "@/components/ui/button";
import { 
  Users, 
  Search, 
  Filter,
  Plus,
  RefreshCw
} from "lucide-react";
import { motion } from "framer-motion";

interface EmptyStateProps {
  type: "no-subscribers" | "no-results";
  onAddSubscriber?: () => void;
  onClearFilters?: () => void;
  onRefresh?: () => void;
}

export function EmptyState({ type, onAddSubscriber, onClearFilters, onRefresh }: EmptyStateProps) {
  if (type === "no-results") {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center py-16 px-4"
      >
        <div className="h-16 w-16 rounded-full bg-muted/30 flex items-center justify-center mb-4">
          <Search className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">No results found</h3>
        <p className="text-muted-foreground text-center max-w-sm mb-6">
          We couldn't find any subscribers matching your current filters. 
          Try adjusting your search or filter criteria.
        </p>
        <div className="flex gap-3">
          {onClearFilters && (
            <Button variant="outline" onClick={onClearFilters} className="gap-2">
              <Filter className="h-4 w-4" />
              Clear Filters
            </Button>
          )}
          {onRefresh && (
            <Button variant="ghost" onClick={onRefresh} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          )}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-16 px-4"
    >
      <div className="h-20 w-20 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center mb-6">
        <Users className="h-10 w-10 text-primary" />
      </div>
      <h3 className="text-xl font-semibold text-foreground mb-2">No subscribers yet</h3>
      <p className="text-muted-foreground text-center max-w-md mb-6">
        Start building your community by adding your first subscriber. 
        They'll receive access to your exclusive Telegram channel.
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        {onAddSubscriber && (
          <Button variant="gradient" onClick={onAddSubscriber} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Your First Subscriber
          </Button>
        )}
      </div>
      
      {/* Quick Tips */}
      <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl">
        <div className="text-center p-4 rounded-lg bg-muted/20">
          <div className="text-2xl mb-2">1️⃣</div>
          <p className="text-sm text-muted-foreground">Share your bot link with potential subscribers</p>
        </div>
        <div className="text-center p-4 rounded-lg bg-muted/20">
          <div className="text-2xl mb-2">2️⃣</div>
          <p className="text-sm text-muted-foreground">Review and approve payment proofs</p>
        </div>
        <div className="text-center p-4 rounded-lg bg-muted/20">
          <div className="text-2xl mb-2">3️⃣</div>
          <p className="text-sm text-muted-foreground">Subscribers get auto-invited to your channel</p>
        </div>
      </div>
    </motion.div>
  );
}
