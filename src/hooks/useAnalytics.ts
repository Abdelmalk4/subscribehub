import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { subDays, eachDayOfInterval, format, parseISO } from "date-fns";

export interface SubscriberStats {
  active: number;
  pending: number;
  expired: number;
  total: number;
}

export interface DailyStats {
  date: string;
  newSubscribers: number;
  expired: number;
  revenue: number;
  cumulativeRevenue: number;
}

export interface PlanRevenue {
  name: string;
  revenue: number;
  subscribers: number;
}

export interface ProjectStats {
  name: string;
  subscribers: number;
  revenue: number;
}

export interface AnalyticsData {
  subscriberStats: SubscriberStats;
  dailyStats: DailyStats[];
  planRevenue: PlanRevenue[];
  projectStats: ProjectStats[];
  retentionRate: number;
  avgRevenuePerUser: number;
  lifetimeRevenue: number;
  totalRevenue: number;
}

const PERIOD_DAYS: Record<string, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "1y": 365,
};

export function useAnalytics(period: string) {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState<AnalyticsData>({
    subscriberStats: { active: 0, pending: 0, expired: 0, total: 0 },
    dailyStats: [],
    planRevenue: [],
    projectStats: [],
    retentionRate: 0,
    avgRevenuePerUser: 0,
    lifetimeRevenue: 0,
    totalRevenue: 0,
  });

  const fetchAnalytics = useCallback(async () => {
    if (!user) return;

    setIsLoading(true);
    const days = PERIOD_DAYS[period];
    const startDate = subDays(new Date(), days);

    try {
      // Fetch subscriber counts by status
      const statusCounts: SubscriberStats = { active: 0, pending: 0, expired: 0, total: 0 };
      
      const [activeRes, pendingRes, expiredRes] = await Promise.all([
        supabase
          .from("subscribers")
          .select("*", { count: "exact", head: true })
          .eq("status", "active" as any),
        supabase
          .from("subscribers")
          .select("*", { count: "exact", head: true })
          .in("status", ["pending_approval", "pending_payment", "awaiting_proof"] as any),
        supabase
          .from("subscribers")
          .select("*", { count: "exact", head: true })
          .eq("status", "expired" as any),
      ]);

      statusCounts.active = activeRes.count || 0;
      statusCounts.pending = pendingRes.count || 0;
      statusCounts.expired = expiredRes.count || 0;
      statusCounts.total = statusCounts.active + statusCounts.pending + statusCounts.expired;

      // Calculate retention rate
      const retentionRate = statusCounts.total > 0 
        ? Math.round((statusCounts.active / statusCounts.total) * 100) 
        : 0;

      // Fetch subscribers with plans
      const [activeSubsRes, allPaidSubsRes] = await Promise.all([
        supabase
          .from("subscribers")
          .select(`*, plans(plan_name, price, currency), projects(project_name)`)
          .eq("status", "active" as any),
        supabase
          .from("subscribers")
          .select(`*, plans(plan_name, price, currency), projects(project_name)`)
          .in("status", ["active", "expired"] as any),
      ]);

      const activeSubscribers = activeSubsRes.data || [];
      const allPaidSubscribers = allPaidSubsRes.data || [];

      // Calculate current revenue and aggregations
      let currentRevenue = 0;
      const planRevenueMap: Record<string, { revenue: number; subscribers: number }> = {};
      const projectRevenueMap: Record<string, { subscribers: number; revenue: number }> = {};

      activeSubscribers.forEach((sub: any) => {
        const price = sub.plans?.price || 0;
        currentRevenue += price;

        const planName = sub.plans?.plan_name || "Unknown";
        if (!planRevenueMap[planName]) {
          planRevenueMap[planName] = { revenue: 0, subscribers: 0 };
        }
        planRevenueMap[planName].revenue += price;
        planRevenueMap[planName].subscribers += 1;

        const projectName = sub.projects?.project_name || "Unknown";
        if (!projectRevenueMap[projectName]) {
          projectRevenueMap[projectName] = { subscribers: 0, revenue: 0 };
        }
        projectRevenueMap[projectName].subscribers += 1;
        projectRevenueMap[projectName].revenue += price;
      });

      // Calculate lifetime revenue
      let lifetimeRevenue = 0;
      allPaidSubscribers.forEach((sub: any) => {
        lifetimeRevenue += sub.plans?.price || 0;
      });

      const avgRevenuePerUser = statusCounts.active > 0 ? currentRevenue / statusCounts.active : 0;

      const planRevenue = Object.entries(planRevenueMap)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.revenue - a.revenue);

      const projectStats = Object.entries(projectRevenueMap)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.subscribers - a.subscribers);

      // Generate daily stats
      const dateRange = eachDayOfInterval({ start: startDate, end: new Date() });

      const [allSubsRes, periodSubsRes] = await Promise.all([
        supabase
          .from("subscribers")
          .select("created_at, status, plans(price)")
          .in("status", ["active", "expired"] as any)
          .order("created_at", { ascending: true }),
        supabase
          .from("subscribers")
          .select("created_at, status, plans(price)")
          .gte("created_at", startDate.toISOString()),
      ]);

      const allSubscribers = allSubsRes.data || [];
      const periodSubscribers = periodSubsRes.data || [];

      // Baseline revenue calculation
      let baselineRevenue = 0;
      allSubscribers.forEach((sub: any) => {
        if (sub.created_at && parseISO(sub.created_at) < startDate) {
          baselineRevenue += sub.plans?.price || 0;
        }
      });

      // Build daily data
      let runningTotal = baselineRevenue;
      const dailyStats: DailyStats[] = dateRange.map((date) => {
        const dateStr = format(date, "yyyy-MM-dd");
        
        const daySubscribers = periodSubscribers.filter(
          (s: any) => s.created_at && format(parseISO(s.created_at), "yyyy-MM-dd") === dateStr
        );

        const expiredOnDay = allSubscribers.filter(
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

      setData({
        subscriberStats: statusCounts,
        dailyStats,
        planRevenue,
        projectStats,
        retentionRate,
        avgRevenuePerUser,
        lifetimeRevenue,
        totalRevenue: currentRevenue,
      });
    } catch (error) {
      console.error("Failed to fetch analytics:", error);
    } finally {
      setIsLoading(false);
    }
  }, [user, period]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  return { isLoading, data, refetch: fetchAnalytics };
}
