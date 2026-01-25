import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  FolderOpen,
  Users,
  DollarSign,
  Plus,
  Clock,
  Loader2,
  AlertTriangle,
  CheckCircle,
  ArrowRight,
} from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { addDays, format } from "date-fns";

interface DashboardStats {
  revenue: number;
  activeSubscribers: number;
  projectsUsed: number;
  needsAction: number;
  expiringSoon: number;
}

interface PendingSubscriber {
  id: string;
  first_name: string | null;
  username: string | null;
  project_name: string;
  plan_name: string | null;
  created_at: string;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    revenue: 0,
    activeSubscribers: 0,
    projectsUsed: 0,
    needsAction: 0,
    expiringSoon: 0,
  });
  const [pendingSubscribers, setPendingSubscribers] = useState<PendingSubscriber[]>([]);
  const [userName, setUserName] = useState("User");
  const [hasProjects, setHasProjects] = useState(true);

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
      setHasProjects(projectsUsed > 0);

      // Fetch subscribers for user's projects
      let activeSubscribers = 0;
      let expiringSoon = 0;
      let needsAction = 0;
      let totalRevenue = 0;

      if (projectIds.length > 0) {
        // Count active subscribers
        const { count: activeCount } = await supabase
          .from("subscribers")
          .select("*", { count: "exact", head: true })
          .in("project_id", projectIds)
          .eq("status", "active");

        activeSubscribers = activeCount || 0;

        // Count pending (needs action)
        const { count: pendingCount } = await supabase
          .from("subscribers")
          .select("*", { count: "exact", head: true })
          .in("project_id", projectIds)
          .in("status", ["pending_approval", "awaiting_proof"]);

        needsAction = pendingCount || 0;

        // Fetch pending subscribers for quick action
        const { data: pendingSubs } = await supabase
          .from("subscribers")
          .select(`
            id,
            first_name,
            username,
            created_at,
            projects!inner(project_name),
            plans(plan_name)
          `)
          .in("project_id", projectIds)
          .in("status", ["pending_approval", "awaiting_proof"])
          .order("created_at", { ascending: false })
          .limit(5);

        if (pendingSubs) {
          setPendingSubscribers(pendingSubs.map((s: any) => ({
            id: s.id,
            first_name: s.first_name,
            username: s.username,
            project_name: s.projects?.project_name || "Unknown",
            plan_name: s.plans?.plan_name || null,
            created_at: s.created_at,
          })));
        }

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
      }

      setStats({
        revenue: totalRevenue,
        activeSubscribers,
        projectsUsed,
        needsAction,
        expiringSoon,
      });
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
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Empty state for new users
  if (!hasProjects) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
          <FolderOpen className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-xl font-semibold text-foreground mb-2">Welcome to SubscribeHub!</h1>
        <p className="text-muted-foreground text-sm max-w-md mb-6">
          Create your first project to start managing Telegram subscriptions. It only takes a minute.
        </p>
        <Link to="/projects">
          <Button size="lg" className="gap-2">
            <Plus className="h-4 w-4" />
            Create Your First Project
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 w-full max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-base font-semibold text-foreground">Welcome back, {userName}! 👋</h1>
          <p className="text-muted-foreground text-xs">Here's what's happening with your channels today.</p>
        </div>
        <Link to="/projects">
          <Button size="sm" className="h-7 text-xs px-2.5 gap-1.5">
            <Plus className="h-3 w-3" />
            New Project
          </Button>
        </Link>
      </div>

      {/* PRIORITY: Needs Action Banner */}
      {stats.needsAction > 0 && (
        <Card className="border-warning/50 bg-warning/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-warning/20 flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-warning" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">
                    {stats.needsAction} payment{stats.needsAction > 1 ? 's' : ''} waiting for approval
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Review and approve to activate subscriptions
                  </p>
                </div>
              </div>
              <Link to="/subscribers">
                <Button className="gap-1.5 bg-warning hover:bg-warning/90 text-warning-foreground">
                  Review Now
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
            
            {/* Quick list of pending */}
            {pendingSubscribers.length > 0 && (
              <div className="mt-4 pt-4 border-t border-warning/20">
                <div className="space-y-2">
                  {pendingSubscribers.slice(0, 3).map((sub) => (
                    <div key={sub.id} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                          {(sub.first_name || sub.username || "?")[0].toUpperCase()}
                        </div>
                        <span className="text-foreground">
                          {sub.first_name || sub.username || "Unknown"}
                        </span>
                        <span className="text-muted-foreground">·</span>
                        <span className="text-muted-foreground text-xs">{sub.project_name}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{getTimeAgo(sub.created_at)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-md bg-success/10 flex items-center justify-center">
                <DollarSign className="h-4 w-4 text-success" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Revenue</p>
                <p className="text-lg font-semibold text-foreground">${stats.revenue.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center">
                <FolderOpen className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Projects</p>
                <p className="text-lg font-semibold text-foreground">{stats.projectsUsed}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-md bg-success/10 flex items-center justify-center">
                <Users className="h-4 w-4 text-success" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Active Subs</p>
                <p className="text-lg font-semibold text-foreground">{stats.activeSubscribers}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={stats.expiringSoon > 0 ? "border-warning/30" : ""}>
          <CardContent className="p-3">
            <div className="flex items-center gap-2.5">
              <div className={`h-8 w-8 rounded-md flex items-center justify-center ${stats.expiringSoon > 0 ? 'bg-warning/10' : 'bg-muted'}`}>
                <Clock className={`h-4 w-4 ${stats.expiringSoon > 0 ? 'text-warning' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Expiring Soon</p>
                <p className={`text-lg font-semibold ${stats.expiringSoon > 0 ? 'text-warning' : 'text-foreground'}`}>
                  {stats.expiringSoon}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* All Caught Up State */}
      {stats.needsAction === 0 && (
        <Card>
          <CardContent className="p-6 text-center">
            <div className="h-12 w-12 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-3">
              <CheckCircle className="h-6 w-6 text-success" />
            </div>
            <h3 className="font-semibold text-foreground mb-1">You're all caught up!</h3>
            <p className="text-sm text-muted-foreground mb-4">
              No pending payments to review. Your bot is handling subscriptions automatically.
            </p>
            <div className="flex justify-center gap-2">
              <Link to="/subscribers">
                <Button variant="outline" size="sm">View Subscribers</Button>
              </Link>
              <Link to="/projects">
                <Button variant="outline" size="sm">Manage Projects</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Stats Summary */}
      <div className="text-center text-xs text-muted-foreground">
        <p>
          Today: {format(new Date(), "EEEE, MMMM d, yyyy")}
        </p>
      </div>
    </div>
  );
}
