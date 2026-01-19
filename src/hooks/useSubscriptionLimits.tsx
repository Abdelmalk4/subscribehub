import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface SubscriptionLimits {
  maxProjects: number;
  maxSubscribers: number;
  currentProjects: number;
  currentSubscribers: number;
  planName: string;
  status: string;
  isTrialExpired: boolean;
  trialEndsAt: string | null;
  canAddProject: boolean;
  canAddSubscriber: boolean;
  loading: boolean;
}

export function useSubscriptionLimits(): SubscriptionLimits {
  const { user } = useAuth();
  const [limits, setLimits] = useState<SubscriptionLimits>({
    maxProjects: 3,
    maxSubscribers: 50,
    currentProjects: 0,
    currentSubscribers: 0,
    planName: "Free Trial",
    status: "trial",
    isTrialExpired: false,
    trialEndsAt: null,
    canAddProject: true,
    canAddSubscriber: true,
    loading: true,
  });

  useEffect(() => {
    if (user) {
      fetchLimits();
    }
  }, [user]);

  const fetchLimits = async () => {
    if (!user) return;

    try {
      // Fetch subscription with plan
      const { data: subscription, error: subError } = await supabase
        .from("client_subscriptions")
        .select(`
          status,
          trial_ends_at,
          subscription_plans (
            plan_name,
            max_projects,
            max_subscribers
          )
        `)
        .eq("client_id", user.id)
        .maybeSingle();

      if (subError) {
        console.error("Error fetching subscription:", subError);
      }

      // Count projects
      const { count: projectCount, error: projectError } = await supabase
        .from("projects")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id);

      if (projectError) {
        console.error("Error counting projects:", projectError);
      }

      // Count subscribers across all projects
      const { data: userProjects } = await supabase
        .from("projects")
        .select("id")
        .eq("user_id", user.id);

      let subscriberCount = 0;
      if (userProjects && userProjects.length > 0) {
        const projectIds = userProjects.map((p) => p.id);
        const { count } = await supabase
          .from("subscribers")
          .select("*", { count: "exact", head: true })
          .in("project_id", projectIds);
        subscriberCount = count || 0;
      }

      const plan = subscription?.subscription_plans as any;
      const status = subscription?.status || "trial";
      const trialEndsAt = subscription?.trial_ends_at;
      const isTrialExpired = status === "trial" && trialEndsAt && new Date(trialEndsAt) < new Date();
      const isExpired = status === "expired" || isTrialExpired;

      // Get limits from plan, with reasonable defaults for trial users
      // A null subscription (new user) gets trial defaults
      const maxProjects = plan?.max_projects ?? 3;
      const maxSubscribers = plan?.max_subscribers ?? 50;
      const currentProjects = projectCount || 0;

      setLimits({
        maxProjects,
        maxSubscribers,
        currentProjects,
        currentSubscribers: subscriberCount,
        planName: plan?.plan_name || "Free Trial",
        status,
        isTrialExpired: !!isTrialExpired,
        trialEndsAt,
        canAddProject: !isExpired && (maxProjects < 0 || currentProjects < maxProjects),
        canAddSubscriber: !isExpired && (maxSubscribers < 0 || subscriberCount < maxSubscribers),
        loading: false,
      });
    } catch (error) {
      console.error("Failed to fetch subscription limits:", error);
      // On error, still allow actions but with conservative defaults
      setLimits((prev) => ({ 
        ...prev, 
        loading: false,
        canAddProject: true, // Allow on error to not block users
        canAddSubscriber: true,
      }));
    }
  };

  return limits;
}
