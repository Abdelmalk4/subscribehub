import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DollarSign,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  UserCheck,
  BarChart3,
  Wallet,
} from "lucide-react";
import type { AnalyticsData } from "@/hooks/useAnalytics";

interface AnalyticsKPICardsProps {
  data: AnalyticsData;
}

export function AnalyticsKPICards({ data }: AnalyticsKPICardsProps) {
  const { subscriberStats, retentionRate, avgRevenuePerUser, lifetimeRevenue, totalRevenue } = data;

  const kpis = [
    {
      title: "Lifetime Revenue",
      value: `$${lifetimeRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      change: "All time",
      isPositive: true,
      icon: Wallet,
      color: "text-primary",
      bgColor: "bg-primary/20",
    },
    {
      title: "Current Revenue",
      value: `$${totalRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      change: "Active subs",
      isPositive: true,
      icon: DollarSign,
      color: "text-success",
      bgColor: "bg-success/20",
    },
    {
      title: "Active Subscribers",
      value: subscriberStats.active.toString(),
      change: `${subscriberStats.total} total`,
      isPositive: true,
      icon: UserCheck,
      color: "text-secondary",
      bgColor: "bg-secondary/20",
    },
    {
      title: "Retention Rate",
      value: `${retentionRate}%`,
      change: retentionRate >= 80 ? "Excellent" : retentionRate >= 50 ? "Good" : "Needs work",
      isPositive: retentionRate >= 50,
      icon: TrendingUp,
      color: retentionRate >= 80 ? "text-success" : retentionRate >= 50 ? "text-warning" : "text-destructive",
      bgColor: retentionRate >= 80 ? "bg-success/20" : retentionRate >= 50 ? "bg-warning/20" : "bg-destructive/20",
    },
    {
      title: "Avg Revenue/User",
      value: `$${avgRevenuePerUser.toFixed(2)}`,
      change: "Per active sub",
      isPositive: avgRevenuePerUser > 0,
      icon: BarChart3,
      color: "text-accent-foreground",
      bgColor: "bg-accent/20",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3">
      {kpis.map((kpi) => (
        <Card key={kpi.title}>
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center justify-between">
              <div className={`h-8 w-8 rounded-lg ${kpi.bgColor} flex items-center justify-center`}>
                <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
              </div>
              <Badge variant={kpi.isPositive ? "success" : "error"} className="gap-0.5 text-[10px] px-1.5 py-0.5">
                {kpi.isPositive ? (
                  <ArrowUpRight className="h-2.5 w-2.5" />
                ) : (
                  <ArrowDownRight className="h-2.5 w-2.5" />
                )}
                {kpi.change}
              </Badge>
            </div>
            <div className="mt-2.5">
              <p className="text-xl font-bold text-foreground">{kpi.value}</p>
              <p className="text-[10px] text-muted-foreground">{kpi.title}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
