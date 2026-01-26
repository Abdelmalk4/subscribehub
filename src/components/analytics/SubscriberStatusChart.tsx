import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users } from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { SubscriberStats } from "@/hooks/useAnalytics";

interface SubscriberStatusChartProps {
  stats: SubscriberStats;
}

export function SubscriberStatusChart({ stats }: SubscriberStatusChartProps) {
  const statusData = [
    { name: "Active", value: stats.active, color: "hsl(var(--chart-2))" },
    { name: "Pending", value: stats.pending, color: "hsl(var(--chart-4))" },
    { name: "Expired", value: stats.expired, color: "hsl(var(--chart-1))" },
  ];

  return (
    <Card>
      <CardHeader className="pb-2 pt-3 px-3 sm:px-4">
        <CardTitle className="text-sm">Subscriber Status</CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3 sm:px-4 sm:pb-4">
        <div className="h-[140px] sm:h-[180px] lg:h-[210px] flex items-center justify-center">
          {stats.total > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={35}
                  outerRadius={60}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "6px",
                    fontSize: "11px",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-1.5 opacity-50" />
              <p className="text-xs">No subscriber data yet</p>
            </div>
          )}
        </div>
        <div className="flex justify-center gap-4 mt-1.5">
          {statusData.map((item) => (
            <div key={item.name} className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="text-[10px] text-muted-foreground">
                {item.name} ({item.value})
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
