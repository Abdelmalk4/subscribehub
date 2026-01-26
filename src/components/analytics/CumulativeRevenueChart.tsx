import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wallet } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { DailyStats } from "@/hooks/useAnalytics";

interface CumulativeRevenueChartProps {
  data: DailyStats[];
  lifetimeRevenue: number;
}

export function CumulativeRevenueChart({ data, lifetimeRevenue }: CumulativeRevenueChartProps) {
  return (
    <Card>
      <CardHeader className="pb-2 pt-3 px-3 sm:px-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <Wallet className="h-3.5 w-3.5 text-primary" />
            Cumulative Revenue Over Time
          </CardTitle>
          <Badge variant="outline" className="text-primary border-primary/30 text-[10px] px-1.5 w-fit">
            Lifetime: ${lifetimeRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-3 sm:px-4 sm:pb-4">
        <div className="h-[160px] sm:h-[200px] lg:h-[220px]">
          {data.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="colorCumulative" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-3))" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="hsl(var(--chart-3))" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis 
                  dataKey="date" 
                  stroke="hsl(var(--muted-foreground))" 
                  fontSize={10}
                  tickLine={false}
                />
                <YAxis 
                  stroke="hsl(var(--muted-foreground))" 
                  fontSize={10}
                  tickLine={false}
                  tickFormatter={(value) => `$${value.toLocaleString()}`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "6px",
                    fontSize: "11px",
                  }}
                  formatter={(value: number) => [`$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, "Cumulative Revenue"]}
                />
                <Area
                  type="monotone"
                  dataKey="cumulativeRevenue"
                  name="Cumulative Revenue"
                  stroke="hsl(var(--chart-3))"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorCumulative)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="text-center">
                <Wallet className="h-8 w-8 mx-auto mb-1.5 opacity-50" />
                <p className="text-xs">No revenue data yet</p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
