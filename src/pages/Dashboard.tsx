import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  FolderOpen,
  Users,
  DollarSign,
  Plus,
  Clock,
  Loader2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { addDays } from "date-fns";

interface DashboardStats {
  revenue: number;
  activeSubscribers: number;
  projectsUsed: number;
  expiringSoon: number;
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
    activeSubscribers: 0,
    projectsUsed: 0,
    expiringSoon: 0,
  });
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

      // Fetch user's projects
      const { data: projects } = await supabase
        .from("projects")
        .select("id, project_name")
        .eq("user_id", user.id);

      const projectIds = (projects || []).map((p) => p.id);
      const projectsUsed = projectIds.length;

      // Fetch subscribers for user's projects
      let activeSubscribers = 0;
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

        // Fetch recent activity
        const { data: recentSubs } = await supabase
          .from("subscribers")
          .select("id, status, first_name, username, updated_at, projects(project_name)")
          .in("project_id", projectIds)
          .order("updated_at", { ascending: false })
          .limit(5);

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

      setStats({
        revenue: totalRevenue,
        activeSubscribers,
        projectsUsed,
        expiringSoon,
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  const statCards = [
    {
      title: "Revenue",
      value: `$${stats.revenue.toLocaleString()}`,
      icon: DollarSign,
    },
    {
      title: "Active Projects",
      value: stats.projectsUsed.toString(),
      icon: FolderOpen,
    },
    {
      title: "Active Subscribers",
      value: stats.activeSubscribers.toString(),
      icon: Users,
    },
    {
      title: "Expiring Soon",
      value: stats.expiringSoon.toString(),
      icon: Clock,
    },
  ];

  return (
    <div className="space-y-4 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Welcome back, {userName}! 👋</h1>
          <p className="text-gray-500 text-xs">Here's what's happening with your channels today.</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" className="h-7 text-xs px-2.5">
            Export
          </Button>
          <Link to="/projects">
            <Button size="sm" className="h-7 text-xs px-2.5 gap-1.5">
              <Plus className="h-3 w-3" />
              New Project
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        {statCards.map((stat) => (
          <div
            key={stat.title}
            className="p-3 bg-white border border-gray-200 rounded-lg"
          >
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-md bg-gray-100 flex items-center justify-center">
                <stat.icon className="h-3.5 w-3.5 text-gray-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">{stat.title}</p>
                <p className="text-lg font-semibold text-gray-900">{stat.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Activity */}
      <div className="bg-white border border-gray-200 rounded-lg">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Recent Activity</h2>
          <Link to="/subscribers">
            <Button variant="ghost" size="sm" className="h-6 text-xs text-gray-500 hover:text-gray-900">
              View All
            </Button>
          </Link>
        </div>
        <div className="p-3">
          {recentActivity.length > 0 ? (
            <div className="space-y-1.5">
              {recentActivity.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      activity.type === "subscription" ? "bg-green-500" :
                      activity.type === "payment" ? "bg-amber-500" :
                      "bg-gray-400"
                    )} />
                    <div>
                      <p className="text-xs text-gray-900">{activity.message}</p>
                      <p className="text-[10px] text-gray-500">{activity.project}</p>
                    </div>
                  </div>
                  <span className="text-[10px] text-gray-500">{activity.time}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-5 text-gray-500">
              <Users className="h-7 w-7 mx-auto mb-1.5 opacity-40" />
              <p className="text-xs">No recent activity yet</p>
              <p className="text-[10px]">Create a project to get started!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
