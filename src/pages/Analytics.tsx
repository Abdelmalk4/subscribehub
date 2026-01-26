import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar, Loader2 } from "lucide-react";
import { useAnalytics } from "@/hooks/useAnalytics";
import {
  AnalyticsKPICards,
  SubscriberGrowthChart,
  SubscriberStatusChart,
  CumulativeRevenueChart,
  RevenueByPlanChart,
  SubscribersByProjectChart,
  ProjectPerformanceTable,
} from "@/components/analytics";

export default function Analytics() {
  const [period, setPeriod] = useState("30d");
  const { isLoading, data } = useAnalytics(period);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="w-full space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-semibold text-foreground">Analytics</h1>
          <p className="text-muted-foreground text-xs sm:text-sm">Track your revenue and subscriber metrics.</p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[110px] h-7 text-xs">
            <Calendar className="h-3 w-3 mr-1.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d" className="text-xs">Last 7 days</SelectItem>
            <SelectItem value="30d" className="text-xs">Last 30 days</SelectItem>
            <SelectItem value="90d" className="text-xs">Last 90 days</SelectItem>
            <SelectItem value="1y" className="text-xs">Last year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <AnalyticsKPICards data={data} />

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
        <SubscriberGrowthChart data={data.dailyStats} />
        <SubscriberStatusChart stats={data.subscriberStats} />
      </div>

      {/* Cumulative Revenue Chart */}
      <CumulativeRevenueChart data={data.dailyStats} lifetimeRevenue={data.lifetimeRevenue} />

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        <RevenueByPlanChart data={data.planRevenue} />
        <SubscribersByProjectChart data={data.projectStats} />
      </div>

      {/* Project Performance Table */}
      <ProjectPerformanceTable data={data.projectStats} />
    </div>
  );
}
