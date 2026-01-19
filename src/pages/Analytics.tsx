import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DollarSign,
  Users,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  Loader2,
  UserCheck,
  UserX,
  BarChart3,
  Wallet,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  LineChart,
  Line,
  Legend,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format, subDays, startOfDay, eachDayOfInterval, parseISO } from "date-fns";

interface SubscriberStats {
  active: number;
  pending: number;
  expired: number;
  total: number;
}

interface DailyStats {
  date: string;
  newSubscribers: number;
  expired: number;
  revenue: number;
  cumulativeRevenue: number;
}

interface PlanRevenue {
  name: string;
  revenue: number;
  subscribers: number;
}

interface ProjectStats {
  name: string;
  subscribers: number;
  revenue: number;
}

const PERIOD_DAYS: Record<string, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "1y": 365,
};

export default function Analytics() {
  const { user } = useAuth();
  const [period, setPeriod] = useState("30d");
  const [isLoading, setIsLoading] = useState(true);
  const [subscriberStats, setSubscriberStats] = useState<SubscriberStats>({
    active: 0,
    pending: 0,
    expired: 0,
    total: 0,
  });
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [planRevenue, setPlanRevenue] = useState<PlanRevenue[]>([]);
  const [projectStats, setProjectStats] = useState<ProjectStats[]>([]);
  const [retentionRate, setRetentionRate] = useState(0);
  const [avgRevenuePerUser, setAvgRevenuePerUser] = useState(0);
  const [lifetimeRevenue, setLifetimeRevenue] = useState(0);

  const fetchAnalytics = async () => {
    if (!user) return;

    setIsLoading(true);
    const days = PERIOD_DAYS[period];
    const startDate = subDays(new Date(), days);

    try {
      // Fetch subscriber counts by status
      const statusCounts: SubscriberStats = { active: 0, pending: 0, expired: 0, total: 0 };
      
      const { count: activeCount } = await supabase
        .from("subscribers")
        .select("*", { count: "exact", head: true })
        .eq("status", "active" as any);
      statusCounts.active = activeCount || 0;

      const { count: pendingCount } = await supabase
        .from("subscribers")
        .select("*", { count: "exact", head: true })
        .in("status", ["pending_approval", "pending_payment", "awaiting_proof"] as any);
      statusCounts.pending = pendingCount || 0;

      const { count: expiredCount } = await supabase
        .from("subscribers")
        .select("*", { count: "exact", head: true })
        .eq("status", "expired" as any);
      statusCounts.expired = expiredCount || 0;

      statusCounts.total = statusCounts.active + statusCounts.pending + statusCounts.expired;
      setSubscriberStats(statusCounts);

      // Calculate retention rate
      const retention = statusCounts.total > 0 
        ? Math.round((statusCounts.active / statusCounts.total) * 100) 
        : 0;
      setRetentionRate(retention);

      // Fetch all subscribers with plans for revenue calculation (active only for current)
      const { data: activeSubscribers } = await supabase
        .from("subscribers")
        .select(`
          *,
          plans(plan_name, price, currency),
          projects(project_name)
        `)
        .eq("status", "active" as any);

      // Fetch all paid subscribers (active + expired) for lifetime revenue
      const { data: allPaidSubscribers } = await supabase
        .from("subscribers")
        .select(`
          *,
          plans(plan_name, price, currency),
          projects(project_name)
        `)
        .in("status", ["active", "expired"] as any);

      // Calculate current revenue (active only)
      let currentRevenue = 0;
      const planRevenueMap: Record<string, { revenue: number; subscribers: number }> = {};
      const projectRevenueMap: Record<string, { subscribers: number; revenue: number }> = {};

      (activeSubscribers || []).forEach((sub: any) => {
        const price = sub.plans?.price || 0;
        currentRevenue += price;

        // Aggregate by plan
        const planName = sub.plans?.plan_name || "Unknown";
        if (!planRevenueMap[planName]) {
          planRevenueMap[planName] = { revenue: 0, subscribers: 0 };
        }
        planRevenueMap[planName].revenue += price;
        planRevenueMap[planName].subscribers += 1;

        // Aggregate by project
        const projectName = sub.projects?.project_name || "Unknown";
        if (!projectRevenueMap[projectName]) {
          projectRevenueMap[projectName] = { subscribers: 0, revenue: 0 };
        }
        projectRevenueMap[projectName].subscribers += 1;
        projectRevenueMap[projectName].revenue += price;
      });

      // Calculate lifetime revenue (active + expired)
      let totalLifetimeRevenue = 0;
      (allPaidSubscribers || []).forEach((sub: any) => {
        totalLifetimeRevenue += sub.plans?.price || 0;
      });
      setLifetimeRevenue(totalLifetimeRevenue);

      setAvgRevenuePerUser(statusCounts.active > 0 ? currentRevenue / statusCounts.active : 0);

      // Convert maps to arrays
      setPlanRevenue(
        Object.entries(planRevenueMap)
          .map(([name, data]) => ({ name, ...data }))
          .sort((a, b) => b.revenue - a.revenue)
      );

      setProjectStats(
        Object.entries(projectRevenueMap)
          .map(([name, data]) => ({ name, ...data }))
          .sort((a, b) => b.subscribers - a.subscribers)
      );

      // Generate daily stats for the chart
      const dateRange = eachDayOfInterval({
        start: startDate,
        end: new Date(),
      });

      // Fetch ALL subscribers with plans for cumulative revenue (including expired)
      const { data: allSubscribers } = await supabase
        .from("subscribers")
        .select("created_at, status, plans(price)")
        .in("status", ["active", "expired"] as any)
        .order("created_at", { ascending: true });

      // Fetch subscribers created in selected period
      const { data: periodSubscribers } = await supabase
        .from("subscribers")
        .select("created_at, status, plans(price)")
        .gte("created_at", startDate.toISOString());

      // Calculate cumulative revenue up to start date (baseline)
      let baselineRevenue = 0;
      (allSubscribers || []).forEach((sub: any) => {
        if (sub.created_at && parseISO(sub.created_at) < startDate) {
          baselineRevenue += sub.plans?.price || 0;
        }
      });

      // Group by date and calculate cumulative revenue
      let runningTotal = baselineRevenue;
      const dailyData: DailyStats[] = dateRange.map((date) => {
        const dateStr = format(date, "yyyy-MM-dd");
        
        // Subscribers created on this day (from period query)
        const daySubscribers = (periodSubscribers || []).filter(
          (s: any) => s.created_at && format(parseISO(s.created_at), "yyyy-MM-dd") === dateStr
        );

        // Subscribers that expired on this day
        const expiredOnDay = (allSubscribers || []).filter(
          (s: any) => s.status === "expired" && s.created_at && format(parseISO(s.created_at), "yyyy-MM-dd") === dateStr
        ).length;

        const newSubs = daySubscribers.length;
        const dayRevenue = daySubscribers.reduce((sum: number, s: any) => sum + (s.plans?.price || 0), 0);
        runningTotal += dayRevenue;
        
        return {
          date: format(date, "MMM d"),
          newSubscribers: newSubs,
          expired: expiredOnDay,
          revenue: dayRevenue,
          cumulativeRevenue: runningTotal,
        };
      });

      setDailyStats(dailyData);
    } catch (error) {
      console.error("Failed to fetch analytics:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [user, period]);

  const subscriberStatusData = [
    { name: "Active", value: subscriberStats.active, color: "hsl(160, 84%, 39%)" },
    { name: "Pending", value: subscriberStats.pending, color: "hsl(38, 92%, 50%)" },
    { name: "Expired", value: subscriberStats.expired, color: "hsl(220, 40%, 50%)" },
  ];

  const totalRevenue = planRevenue.reduce((sum, p) => sum + p.revenue, 0);

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Analytics</h1>
          <p className="text-gray-500 text-xs">Track your revenue and subscriber metrics.</p>
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
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

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Subscriber Growth Chart - Spans 2 columns */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Subscriber Growth & Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyStats}>
                  <defs>
                    <linearGradient id="colorSubscribers" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(190, 100%, 50%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(190, 100%, 50%)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(160, 84%, 39%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(160, 84%, 39%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 30%, 20%)" />
                  <XAxis 
                    dataKey="date" 
                    stroke="hsl(215, 20%, 65%)" 
                    fontSize={12}
                    tickLine={false}
                  />
                  <YAxis 
                    yAxisId="left"
                    stroke="hsl(215, 20%, 65%)" 
                    fontSize={12}
                    tickLine={false}
                  />
                  <YAxis 
                    yAxisId="right"
                    orientation="right"
                    stroke="hsl(215, 20%, 65%)" 
                    fontSize={12}
                    tickLine={false}
                    tickFormatter={(value) => `$${value}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(220, 45%, 13%)",
                      border: "1px solid hsl(220, 30%, 20%)",
                      borderRadius: "8px",
                    }}
                    formatter={(value: number, name: string) => [
                      name === "revenue" ? `$${value}` : value,
                      name === "newSubscribers" ? "New Subscribers" : "Revenue"
                    ]}
                  />
                  <Legend />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="newSubscribers"
                    name="New Subscribers"
                    stroke="hsl(190, 100%, 50%)"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorSubscribers)"
                  />
                  <Area
                    yAxisId="right"
                    type="monotone"
                    dataKey="revenue"
                    name="Revenue"
                    stroke="hsl(160, 84%, 39%)"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorRevenue)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Subscriber Status Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Subscriber Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[220px] flex items-center justify-center">
              {subscriberStats.total > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={subscriberStatusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {subscriberStatusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(220, 45%, 13%)",
                        border: "1px solid hsl(220, 30%, 20%)",
                        borderRadius: "8px",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No subscriber data yet</p>
                </div>
              )}
            </div>
            <div className="flex justify-center gap-6 mt-2">
              {subscriberStatusData.map((item) => (
                <div key={item.name} className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-sm text-muted-foreground">
                    {item.name} ({item.value})
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cumulative Revenue Chart */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              Cumulative Revenue Over Time
            </CardTitle>
            <Badge variant="outline" className="text-primary border-primary/30">
              Lifetime: ${lifetimeRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            {dailyStats.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyStats}>
                  <defs>
                    <linearGradient id="colorCumulative" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(270, 91%, 65%)" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="hsl(270, 91%, 65%)" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 30%, 20%)" />
                  <XAxis 
                    dataKey="date" 
                    stroke="hsl(215, 20%, 65%)" 
                    fontSize={12}
                    tickLine={false}
                  />
                  <YAxis 
                    stroke="hsl(215, 20%, 65%)" 
                    fontSize={12}
                    tickLine={false}
                    tickFormatter={(value) => `$${value.toLocaleString()}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(220, 45%, 13%)",
                      border: "1px solid hsl(220, 30%, 20%)",
                      borderRadius: "8px",
                    }}
                    formatter={(value: number) => [`$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, "Cumulative Revenue"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="cumulativeRevenue"
                    name="Cumulative Revenue"
                    stroke="hsl(270, 91%, 65%)"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#colorCumulative)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center">
                  <Wallet className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No revenue data yet</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue by Plan */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Revenue by Plan</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              {planRevenue.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={planRevenue} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 30%, 20%)" />
                    <XAxis 
                      type="number" 
                      stroke="hsl(215, 20%, 65%)" 
                      fontSize={12}
                      tickFormatter={(value) => `$${value}`}
                    />
                    <YAxis 
                      dataKey="name" 
                      type="category" 
                      stroke="hsl(215, 20%, 65%)" 
                      fontSize={12} 
                      width={100}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(220, 45%, 13%)",
                        border: "1px solid hsl(220, 30%, 20%)",
                        borderRadius: "8px",
                      }}
                      formatter={(value: number) => [`$${value.toFixed(2)}`, "Revenue"]}
                    />
                    <Bar dataKey="revenue" fill="url(#barGradient)" radius={[0, 4, 4, 0]} />
                    <defs>
                      <linearGradient id="barGradient" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="hsl(190, 100%, 50%)" />
                        <stop offset="100%" stopColor="hsl(270, 91%, 65%)" />
                      </linearGradient>
                    </defs>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <div className="text-center">
                    <BarChart3 className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No plan data yet</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Subscribers by Project */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Subscribers by Project</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              {projectStats.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={projectStats}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 30%, 20%)" />
                    <XAxis 
                      dataKey="name" 
                      stroke="hsl(215, 20%, 65%)" 
                      fontSize={12}
                      tick={{ fill: "hsl(215, 20%, 65%)" }}
                    />
                    <YAxis 
                      stroke="hsl(215, 20%, 65%)" 
                      fontSize={12}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(220, 45%, 13%)",
                        border: "1px solid hsl(220, 30%, 20%)",
                        borderRadius: "8px",
                      }}
                    />
                    <Bar 
                      dataKey="subscribers" 
                      fill="hsl(270, 91%, 65%)" 
                      radius={[4, 4, 0, 0]}
                      name="Subscribers"
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <div className="text-center">
                    <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No project data yet</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Stats Table */}
      {projectStats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Project Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/30">
                    <th className="text-left py-3 px-4 text-muted-foreground font-medium">Project</th>
                    <th className="text-right py-3 px-4 text-muted-foreground font-medium">Subscribers</th>
                    <th className="text-right py-3 px-4 text-muted-foreground font-medium">Revenue</th>
                    <th className="text-right py-3 px-4 text-muted-foreground font-medium">Avg/Subscriber</th>
                  </tr>
                </thead>
                <tbody>
                  {projectStats.map((project, index) => (
                    <tr key={project.name} className={index !== projectStats.length - 1 ? "border-b border-border/20" : ""}>
                      <td className="py-3 px-4 text-foreground font-medium">{project.name}</td>
                      <td className="py-3 px-4 text-right text-foreground">{project.subscribers}</td>
                      <td className="py-3 px-4 text-right text-success font-medium">
                        ${project.revenue.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right text-muted-foreground">
                        ${project.subscribers > 0 ? (project.revenue / project.subscribers).toFixed(2) : "0.00"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
