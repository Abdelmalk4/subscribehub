import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  FolderOpen,
  DollarSign,
  TrendingUp,
  UserCheck,
  Clock,
  AlertCircle,
  Activity,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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
} from "recharts";
import { format, subDays, startOfDay } from "date-fns";

interface PlatformStats {
  totalClients: number;
  totalProjects: number;
  totalSubscribers: number;
  activeSubscribers: number;
  totalRevenue: number;
  pendingPayments: number;
  trialClients: number;
  activeClients: number;
}

export default function AdminOverview() {
  const [stats, setStats] = useState<PlatformStats>({
    totalClients: 0,
    totalProjects: 0,
    totalSubscribers: 0,
    activeSubscribers: 0,
    totalRevenue: 0,
    pendingPayments: 0,
    trialClients: 0,
    activeClients: 0,
  });
  const [growthData, setGrowthData] = useState<any[]>([]);
  const [subscriptionDistribution, setSubscriptionDistribution] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPlatformStats();
  }, []);

  const fetchPlatformStats = async () => {
    setLoading(true);

    // Fetch all data in parallel
    const [
      profilesRes,
      projectsRes,
      subscribersRes,
      paymentsRes,
      clientSubscriptionsRes,
    ] = await Promise.all([
      supabase.from("profiles").select("id, created_at"),
      supabase.from("projects").select("id, created_at"),
      supabase.from("subscribers").select("id, status, created_at"),
      supabase.from("client_subscription_payments").select("amount, status"),
      supabase.from("client_subscriptions").select("status"),
    ]);

    const profiles = profilesRes.data || [];
    const projects = projectsRes.data || [];
    const subscribers = subscribersRes.data || [];
    const payments = paymentsRes.data || [];
    const clientSubscriptions = clientSubscriptionsRes.data || [];

    // Calculate stats
    const totalRevenue = payments
      .filter((p) => p.status === "approved")
      .reduce((sum, p) => sum + Number(p.amount), 0);

    const pendingPayments = payments.filter((p) => p.status === "pending").length;
    const activeSubscribers = subscribers.filter((s) => s.status === "active").length;
    const trialClients = clientSubscriptions.filter((s) => s.status === "trial").length;
    const activeClients = clientSubscriptions.filter((s) => s.status === "active").length;

    setStats({
      totalClients: profiles.length,
      totalProjects: projects.length,
      totalSubscribers: subscribers.length,
      activeSubscribers,
      totalRevenue,
      pendingPayments,
      trialClients,
      activeClients,
    });

    // Build growth data for last 30 days
    const last30Days = Array.from({ length: 30 }, (_, i) => {
      const date = startOfDay(subDays(new Date(), 29 - i));
      return {
        date: format(date, "MMM dd"),
        clients: profiles.filter(
          (p) => new Date(p.created_at) <= date
        ).length,
        subscribers: subscribers.filter(
          (s) => new Date(s.created_at || "") <= date
        ).length,
      };
    });
    setGrowthData(last30Days);

    // Subscription status distribution
    const statusCounts = clientSubscriptions.reduce((acc, sub) => {
      const status = sub.status || "unknown";
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    setSubscriptionDistribution(
      Object.entries(statusCounts).map(([name, value]) => ({ name, value }))
    );

    setLoading(false);
  };

  const COLORS = ["hsl(var(--primary))", "hsl(var(--secondary))", "hsl(var(--accent))", "hsl(var(--muted))"];

  const kpiCards = [
    {
      title: "Total Clients",
      value: stats.totalClients,
      icon: Users,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      title: "Total Projects",
      value: stats.totalProjects,
      icon: FolderOpen,
      color: "text-secondary",
      bgColor: "bg-secondary/10",
    },
    {
      title: "Total Subscribers",
      value: stats.totalSubscribers,
      icon: UserCheck,
      color: "text-accent-foreground",
      bgColor: "bg-accent/30",
    },
    {
      title: "Active Subscribers",
      value: stats.activeSubscribers,
      icon: Activity,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
    },
    {
      title: "Total Revenue",
      value: `$${stats.totalRevenue.toLocaleString()}`,
      icon: DollarSign,
      color: "text-emerald-500",
      bgColor: "bg-emerald-500/10",
    },
    {
      title: "Pending Payments",
      value: stats.pendingPayments,
      icon: Clock,
      color: "text-amber-500",
      bgColor: "bg-amber-500/10",
    },
    {
      title: "Trial Clients",
      value: stats.trialClients,
      icon: TrendingUp,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      title: "Active Clients",
      value: stats.activeClients,
      icon: AlertCircle,
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Badge variant="outline" className="text-primary border-primary">
            Super Admin
          </Badge>
        </div>
        <h1 className="text-3xl font-bold text-foreground">Platform Overview</h1>
        <p className="text-muted-foreground mt-1">
          Monitor platform-wide statistics and performance
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((card) => (
          <Card key={card.title} variant="glass">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{card.title}</p>
                  <p className="text-2xl font-bold text-foreground mt-1">
                    {card.value}
                  </p>
                </div>
                <div className={`p-3 rounded-xl ${card.bgColor}`}>
                  <card.icon className={`h-6 w-6 ${card.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Growth Chart */}
        <Card variant="glass" className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Platform Growth</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={growthData}>
                  <defs>
                    <linearGradient id="colorClients" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorSubscribers" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--secondary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--secondary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="clients"
                    stroke="hsl(var(--primary))"
                    fillOpacity={1}
                    fill="url(#colorClients)"
                    strokeWidth={2}
                    name="Clients"
                  />
                  <Area
                    type="monotone"
                    dataKey="subscribers"
                    stroke="hsl(var(--secondary))"
                    fillOpacity={1}
                    fill="url(#colorSubscribers)"
                    strokeWidth={2}
                    name="Subscribers"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Subscription Distribution */}
        <Card variant="glass">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Client Subscriptions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={subscriptionDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                    label={({ name, percent }) =>
                      `${name} ${(percent * 100).toFixed(0)}%`
                    }
                  >
                    {subscriptionDistribution.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
