import { Badge } from "@/components/ui/badge";
import { 
  Clock, 
  AlertTriangle, 
  UserX, 
  DollarSign,
  Zap
} from "lucide-react";
import { cn } from "@/lib/utils";

interface QuickFilter {
  id: string;
  label: string;
  icon: React.ReactNode;
  colorClass: string;
}

const quickFilters: QuickFilter[] = [
  {
    id: "expiring_7d",
    label: "Expiring < 7d",
    icon: <Clock className="h-3 w-3" />,
    colorClass: "bg-orange-500/20 text-orange-400 border-orange-500/30 hover:bg-orange-500/30"
  },
  {
    id: "pending_3d",
    label: "Pending > 3d",
    icon: <AlertTriangle className="h-3 w-3" />,
    colorClass: "bg-warning/20 text-warning border-warning/30 hover:bg-warning/30"
  },
  {
    id: "not_in_channel",
    label: "Not in Channel",
    icon: <UserX className="h-3 w-3" />,
    colorClass: "bg-destructive/20 text-destructive border-destructive/30 hover:bg-destructive/30"
  },
  {
    id: "high_value",
    label: "High Value",
    icon: <DollarSign className="h-3 w-3" />,
    colorClass: "bg-primary/20 text-primary border-primary/30 hover:bg-primary/30"
  },
  {
    id: "new_today",
    label: "New Today",
    icon: <Zap className="h-3 w-3" />,
    colorClass: "bg-success/20 text-success border-success/30 hover:bg-success/30"
  }
];

interface QuickFilterChipsProps {
  activeFilter: string | null;
  onFilterChange: (filter: string | null) => void;
}

export function QuickFilterChips({ activeFilter, onFilterChange }: QuickFilterChipsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <span className="text-xs text-muted-foreground self-center mr-1">Quick filters:</span>
      {quickFilters.map((filter) => (
        <Badge
          key={filter.id}
          variant="outline"
          className={cn(
            "cursor-pointer transition-all duration-200 gap-1.5 px-3 py-1",
            activeFilter === filter.id 
              ? cn(filter.colorClass, "ring-1 ring-current")
              : "bg-muted/30 text-muted-foreground border-border/50 hover:bg-muted/50"
          )}
          onClick={() => onFilterChange(activeFilter === filter.id ? null : filter.id)}
        >
          {filter.icon}
          {filter.label}
        </Badge>
      ))}
    </div>
  );
}
