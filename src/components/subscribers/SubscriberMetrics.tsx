import { Card, CardContent } from "@/components/ui/card";
import { 
  Users, 
  UserCheck, 
  Clock, 
  AlertTriangle,
  TrendingDown,
  DollarSign,
  ArrowUp,
  ArrowDown
} from "lucide-react";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  colorClass: string;
  bgClass: string;
  isActive?: boolean;
  onClick?: () => void;
  subtitle?: string;
}

function MetricCard({ 
  label, 
  value, 
  icon, 
  trend, 
  colorClass, 
  bgClass, 
  isActive,
  onClick,
  subtitle
}: MetricCardProps) {
  return (
    <Card 
      variant="glass" 
      className={cn(
        "cursor-pointer transition-all duration-300 hover:scale-[1.02]",
        isActive && "ring-2 ring-primary border-primary/50"
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {label}
            </p>
            <p className={cn("text-2xl font-bold", colorClass)}>
              {value}
            </p>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
          <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center", bgClass)}>
            {icon}
          </div>
        </div>
        {trend && (
          <div className="mt-3 flex items-center gap-1">
            {trend.isPositive ? (
              <ArrowUp className="h-3 w-3 text-success" />
            ) : (
              <ArrowDown className="h-3 w-3 text-destructive" />
            )}
            <span className={cn(
              "text-xs font-medium",
              trend.isPositive ? "text-success" : "text-destructive"
            )}>
              {trend.isPositive ? "+" : ""}{trend.value}%
            </span>
            <span className="text-xs text-muted-foreground">vs last month</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface SubscriberMetricsProps {
  stats: {
    active: number;
    pending_approval: number;
    awaiting_proof: number;
    expired: number;
    expiring_soon: number;
    churn_rate: number;
    mrr: number;
  };
  activeFilter: string | null;
  onFilterClick: (filter: string) => void;
}

export function SubscriberMetrics({ stats, activeFilter, onFilterClick }: SubscriberMetricsProps) {
  const metrics: MetricCardProps[] = [
    {
      label: "Active",
      value: stats.active,
      icon: <UserCheck className="h-5 w-5 text-success" />,
      colorClass: "text-success",
      bgClass: "bg-success/20",
      isActive: activeFilter === "active",
      onClick: () => onFilterClick("active"),
      trend: { value: 12, isPositive: true }
    },
    {
      label: "Pending",
      value: stats.pending_approval,
      icon: <Clock className="h-5 w-5 text-warning" />,
      colorClass: "text-warning",
      bgClass: "bg-warning/20",
      isActive: activeFilter === "pending_approval",
      onClick: () => onFilterClick("pending_approval"),
      subtitle: "Needs review"
    },
    {
      label: "Awaiting Proof",
      value: stats.awaiting_proof,
      icon: <AlertTriangle className="h-5 w-5 text-secondary" />,
      colorClass: "text-secondary",
      bgClass: "bg-secondary/20",
      isActive: activeFilter === "awaiting_proof",
      onClick: () => onFilterClick("awaiting_proof"),
    },
    {
      label: "Expiring Soon",
      value: stats.expiring_soon,
      icon: <AlertTriangle className="h-5 w-5 text-orange-400" />,
      colorClass: "text-orange-400",
      bgClass: "bg-orange-500/20",
      isActive: activeFilter === "expiring_soon",
      onClick: () => onFilterClick("expiring_soon"),
      subtitle: "Within 7 days"
    },
    {
      label: "Churn Rate",
      value: `${stats.churn_rate.toFixed(1)}%`,
      icon: <TrendingDown className="h-5 w-5 text-destructive" />,
      colorClass: stats.churn_rate > 10 ? "text-destructive" : "text-muted-foreground",
      bgClass: "bg-destructive/20",
      isActive: activeFilter === "expired",
      onClick: () => onFilterClick("expired"),
      trend: stats.churn_rate > 0 ? { value: Math.round(stats.churn_rate), isPositive: false } : undefined
    },
    {
      label: "Est. MRR",
      value: `$${stats.mrr.toLocaleString()}`,
      icon: <DollarSign className="h-5 w-5 text-primary" />,
      colorClass: "text-primary",
      bgClass: "bg-primary/20",
      isActive: false,
      onClick: () => {},
      trend: { value: 8, isPositive: true }
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {metrics.map((metric) => (
        <MetricCard key={metric.label} {...metric} />
      ))}
    </div>
  );
}
