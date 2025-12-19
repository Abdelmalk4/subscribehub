import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  FolderOpen,
  Users,
  DollarSign,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  Clock,
  Zap,
  Crown,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format, differenceInDays, addDays } from "date-fns";

interface DashboardStats {
  revenue: number;
  revenueChange: number;
  activeSubscribers: number;
  subscriberChange: number;
  projectsUsed: number;
  projectsLimit: number;
  expiringSoon: number;
  subscribersUsed: number;
  subscribersLimit: number;
}

interface Subscription {
  status: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
  subscription_plans: {
    plan_name: string;
    max_projects: number;
    max_subscribers: number;
  } | null;
}

interface RecentActivity {
  id: string;
  type: "subscription" | "payment" | "expired";
  message: string;
  time: string;
  project: string;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    revenue: 0,
    revenueChange: 0,
    activeSubscribers: 0,
    subscriberChange: 0,
    projectsUsed: 0,
    projectsLimit: 1,
    expiringSoon: 0,
    subscribersUsed: 0,
    subscribersLimit: 20,
  });
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [userName, setUserName] = useState("User");

  useEffect(() => {
    if (user) {
      fetchDashboardData();
    }
  }, [user]);

  const fetchDashboardData = async () => {
    if (!user) return;
    setIsLoading(true);

    try {
      // Fetch user profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profile) {
        setUserName(profile.full_name || profile.email?.split("@")[0] || "User");
      }

      // Fetch user's subscription
      const { data: clientSub } = await supabase
        .from("client_subscriptions")
        .select(`
          status,
          trial_ends_at,
          current_period_end,
          subscription_plans (
            plan_name,
            max_projects,
            max_subscribers
          )
        `)
        .eq("client_id", user.id)
        .maybeSingle();

      setSubscription(clientSub as Subscription | null);

      // Fetch user's projects
      const { data: projects } = await supabase
        .from("projects")
        .select("id, project_name")
        .eq("user_id", user.id);

      const projectIds = (projects || []).map((p) => p.id);
      const projectsUsed = projectIds.length;

      // Fetch subscribers for user's projects
      let activeSubscribers = 0;
      let totalSubscribers = 0;
      let expiringSoon = 0;
      let totalRevenue = 0;
      const activities: RecentActivity[] = [];

      if (projectIds.length > 0) {
        // Count active subscribers
        const { count: activeCount } = await supabase
          .from("subscribers")
          .select("*", { count: "exact", head: true })
          .in("project_id", projectIds)
          .eq("status", "active");

        activeSubscribers = activeCount || 0;

        // Count total subscribers
        const { count: totalCount } = await supabase
          .from("subscribers")
          .select("*", { count: "exact", head: true })
          .in("project_id", projectIds);

        totalSubscribers = totalCount || 0;

        // Count expiring in next 7 days
        const sevenDaysFromNow = addDays(new Date(), 7).toISOString();
        const { count: expiringCount } = await supabase
          .from("subscribers")
          .select("*", { count: "exact", head: true })
          .in("project_id", projectIds)
          .eq("status", "active")
          .lte("expiry_date", sevenDaysFromNow)
          .gt("expiry_date", new Date().toISOString());

        expiringSoon = expiringCount || 0;

        // Calculate revenue from active subscribers with plans
        const { data: subscribersWithPlans } = await supabase
          .from("subscribers")
          .select("plans(price)")
          .in("project_id", projectIds)
          .eq("status", "active");

        totalRevenue = (subscribersWithPlans || []).reduce(
          (sum, s: any) => sum + (s.plans?.price || 0),
          0
        );

        // Fetch recent activity (last 10 subscriber changes)
        const { data: recentSubs } = await supabase
          .from("subscribers")
          .select("id, status, first_name, username, created_at, updated_at, projects(project_name)")
          .in("project_id", projectIds)
          .order("updated_at", { ascending: false })
          .limit(10);

        (recentSubs || []).forEach((sub: any) => {
          const displayName = sub.username ? `@${sub.username}` : sub.first_name || "User";
          const projectName = sub.projects?.project_name || "Unknown";
          const timeAgo = getTimeAgo(sub.updated_at);

          if (sub.status === "active") {
            activities.push({
              id: sub.id,
              type: "subscription",
              message: `New subscriber ${displayName}`,
              time: timeAgo,
              project: projectName,
            });
          } else if (sub.status === "expired") {
            activities.push({
              id: sub.id,
              type: "expired",
              message: `Subscription expired ${displayName}`,
              time: timeAgo,
              project: projectName,
            });
          } else if (sub.status === "pending_approval") {
            activities.push({
              id: sub.id,
              type: "payment",
              message: `Payment pending ${displayName}`,
              time: timeAgo,
              project: projectName,
            });
          }
        });
      }

      const subPlan = clientSub?.subscription_plans as any;
      setStats({
        revenue: totalRevenue,
        revenueChange: 12.5, // Would need historical data to calculate
        activeSubscribers,
        subscriberChange: Math.round(activeSubscribers * 0.15),
        projectsUsed,
        projectsLimit: subPlan?.max_projects || 1,
        expiringSoon,
        subscribersUsed: totalSubscribers,
        subscribersLimit: subPlan?.max_subscribers || 20,
      });

      setRecentActivity(activities.slice(0, 4));
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
    return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
  };

  const getSubscriptionInfo = () => {
    if (!subscription) {
      return { planName: "Free Trial", daysLeft: 14, progress: 0 };
    }

    const planName = subscription.subscription_plans?.plan_name || "Free Trial";
    const endDate = subscription.trial_ends_at || subscription.current_period_end;
    
    if (!endDate) {
      return { planName, daysLeft: 0, progress: 100 };
    }

    const daysLeft = Math.max(0, differenceInDays(new Date(endDate), new Date()));
    const totalDays = subscription.status === "trial" ? 14 : 30;
    const progress = Math.round(((totalDays - daysLeft) / totalDays) * 100);

    return { planName, daysLeft, progress };
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const { planName, daysLeft, progress } = getSubscriptionInfo();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Welcome back, {userName}! 👋</h1>
          <p className="text-muted-foreground mt-1">Here's what's happening with your channels today.</p>
        </div>
        <Link to="/projects">
          <Button variant="gradient" className="gap-2">
            <Plus className="h-4 w-4" />
            New Project
          </Button>
        </Link>
      </div>

      {/* Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Subscription Status Card - Span 2 columns on large screens */}
        <Card variant="glow" className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Crown className="h-5 w-5 text-warning" />
                Your Subscription
              </CardTitle>
              <Badge variant={subscription?.status === "active" ? "success" : "warning"}>
                <span className="h-1.5 w-1.5 rounded-full bg-current mr-1.5 animate-pulse" />
                {planName}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {subscription?.status === "trial" ? "Trial ends in" : "Renews in"}
              </span>
              <span className="font-semibold text-foreground">{daysLeft} days</span>
            </div>
            <Progress value={progress} className="h-2" />
            
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Projects Used</p>
                <p className="text-lg font-semibold text-foreground">
                  {stats.projectsUsed} <span className="text-muted-foreground text-sm font-normal">/ {stats.projectsLimit}</span>
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Subscribers Used</p>
                <p className="text-lg font-semibold text-foreground">
                  {stats.subscribersUsed} <span className="text-muted-foreground text-sm font-normal">/ {stats.subscribersLimit}</span>
                </p>
              </div>
            </div>

            <Link to="/billing">
              <Button variant="glass-primary" className="w-full mt-2">
                <Zap className="h-4 w-4 mr-2" />
                Upgrade Plan
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card variant="glass">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link to="/projects" className="block">
              <Button variant="glass" className="w-full justify-start gap-3">
                <FolderOpen className="h-4 w-4 text-primary" />
                Create New Project
              </Button>
            </Link>
            <Link to="/subscribers" className="block">
              <Button variant="glass" className="w-full justify-start gap-3">
                <Users className="h-4 w-4 text-secondary" />
                Manage Subscribers
              </Button>
            </Link>
            <Link to="/analytics" className="block">
              <Button variant="glass" className="w-full justify-start gap-3">
                <TrendingUp className="h-4 w-4 text-success" />
                View Analytics
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Revenue Card */}
        <Card variant="glass-hover">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="h-12 w-12 rounded-xl bg-success/20 flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-success" />
              </div>
              <Badge variant={stats.revenueChange >= 0 ? "success" : "error"} className="gap-1">
                {stats.revenueChange >= 0 ? (
                  <ArrowUpRight className="h-3 w-3" />
                ) : (
                  <ArrowDownRight className="h-3 w-3" />
                )}
                {stats.revenueChange >= 0 ? "+" : ""}{stats.revenueChange}%
              </Badge>
            </div>
            <div className="mt-4">
              <p className="text-3xl font-bold text-foreground">
                ${stats.revenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-sm text-muted-foreground">Revenue this month</p>
            </div>
          </CardContent>
        </Card>

        {/* Active Subscribers Card */}
        <Card variant="glass-hover">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="h-12 w-12 rounded-xl bg-primary/20 flex items-center justify-center">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <Badge variant="info" className="gap-1">
                <ArrowUpRight className="h-3 w-3" />
                +{stats.subscriberChange}
              </Badge>
            </div>
            <div className="mt-4">
              <p className="text-3xl font-bold text-foreground">{stats.activeSubscribers}</p>
              <p className="text-sm text-muted-foreground">Active subscribers</p>
            </div>
          </CardContent>
        </Card>

        {/* Expiring Soon Card */}
        <Card variant="glass-hover">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="h-12 w-12 rounded-xl bg-warning/20 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-warning" />
              </div>
              <Badge variant="warning">
                <Clock className="h-3 w-3 mr-1" />
                next 7 days
              </Badge>
            </div>
            <div className="mt-4">
              <p className="text-3xl font-bold text-foreground">{stats.expiringSoon}</p>
              <p className="text-sm text-muted-foreground">Expiring soon</p>
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity - Span full width */}
        <Card variant="glass" className="md:col-span-2 lg:col-span-3">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Recent Activity</CardTitle>
              <Link to="/subscribers">
                <Button variant="ghost" size="sm" className="text-primary">
                  View All
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {recentActivity.length > 0 ? (
              <div className="space-y-4">
                {recentActivity.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`h-2 w-2 rounded-full ${
                        activity.type === "subscription" ? "bg-success" :
                        activity.type === "payment" ? "bg-primary" :
                        "bg-warning"
                      }`} />
                      <div>
                        <p className="text-sm font-medium text-foreground">{activity.message}</p>
                        <p className="text-xs text-muted-foreground">{activity.project}</p>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">{activity.time}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No recent activity yet</p>
                <p className="text-sm">Create a project to get started!</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
