import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { ProjectStats } from "@/hooks/useAnalytics";

interface SubscribersByProjectChartProps {
  data: ProjectStats[];
}

export function SubscribersByProjectChart({ data }: SubscribersByProjectChartProps) {
  return (
    <Card>
      <CardHeader className="pb-2 pt-3 px-3 sm:px-4">
        <CardTitle className="text-sm">Subscribers by Project</CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3 sm:px-4 sm:pb-4">
        <div className="h-[140px] sm:h-[180px]">
          {data.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis 
                  dataKey="name" 
                  stroke="hsl(var(--muted-foreground))" 
                  fontSize={10}
                />
                <YAxis 
                  stroke="hsl(var(--muted-foreground))" 
                  fontSize={10}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "6px",
                    fontSize: "11px",
                  }}
                />
                <Bar 
                  dataKey="subscribers" 
                  fill="hsl(var(--chart-3))" 
                  radius={[4, 4, 0, 0]}
                  name="Subscribers"
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="text-center">
                <Users className="h-8 w-8 mx-auto mb-1.5 opacity-50" />
                <p className="text-xs">No project data yet</p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
