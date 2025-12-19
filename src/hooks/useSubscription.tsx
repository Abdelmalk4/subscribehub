import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

interface SubscriptionPlan {
  id: string;
  plan_name: string;
  plan_slug: string;
  price: number;
  max_projects: number;
  max_subscribers: number;
}

interface SubscriptionData {
  id: string;
  status: 'trial' | 'active' | 'pending_payment' | 'expired';
  current_period_end: string | null;
  trial_ends_at: string | null;
  plan: SubscriptionPlan | null;
}

interface SubscriptionContextType {
  subscription: SubscriptionData | null;
  loading: boolean;
  isExpired: boolean;
  isTrialExpired: boolean;
  isActive: boolean;
  daysRemaining: number | null;
  canAccessFeatures: boolean;
  projectCount: number;
  subscriberCount: number;
  projectLimit: number;
  subscriberLimit: number;
  canCreateProject: boolean;
  canAddSubscriber: boolean;
  refetch: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [projectCount, setProjectCount] = useState(0);
  const [subscriberCount, setSubscriberCount] = useState(0);

  const fetchSubscription = useCallback(async () => {
    if (!user) {
      setSubscription(null);
      setLoading(false);
      return;
    }

    try {
      // Fetch subscription with plan details
      const { data: subData } = await supabase
        .from('client_subscriptions')
        .select(`
          id,
          status,
          current_period_end,
          trial_ends_at,
          plan_id,
          subscription_plans (
            id,
            plan_name,
            plan_slug,
            price,
            max_projects,
            max_subscribers
          )
        `)
        .eq('client_id', user.id)
        .single();

      if (subData) {
        const planData = subData.subscription_plans as unknown as SubscriptionPlan | null;
        setSubscription({
          id: subData.id,
          status: (subData.status as SubscriptionData['status']) || 'trial',
          current_period_end: subData.current_period_end,
          trial_ends_at: subData.trial_ends_at,
          plan: planData,
        });
      }

      // Count user's projects
      const { count: projCount } = await supabase
        .from('projects')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      setProjectCount(projCount || 0);

      // Count total subscribers across all user's projects
      const { data: userProjects } = await supabase
        .from('projects')
        .select('id')
        .eq('user_id', user.id);

      if (userProjects && userProjects.length > 0) {
        const projectIds = userProjects.map(p => p.id);
        const { count: subCount } = await supabase
          .from('subscribers')
          .select('*', { count: 'exact', head: true })
          .in('project_id', projectIds);

        setSubscriberCount(subCount || 0);
      }
    } catch (error) {
      console.error('Error fetching subscription:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  // Calculate derived values
  const now = new Date();
  
  const isExpired = subscription?.status === 'expired';
  
  const isTrialExpired = subscription?.status === 'trial' && 
    subscription?.trial_ends_at && 
    new Date(subscription.trial_ends_at) < now;
  
  const isActive = subscription?.status === 'active' || 
    (subscription?.status === 'trial' && !isTrialExpired);

  const canAccessFeatures = isActive && !isExpired && !isTrialExpired;

  // Calculate days remaining
  let daysRemaining: number | null = null;
  if (subscription) {
    const endDate = subscription.status === 'trial' 
      ? subscription.trial_ends_at 
      : subscription.current_period_end;
    
    if (endDate) {
      const diff = new Date(endDate).getTime() - now.getTime();
      daysRemaining = Math.ceil(diff / (1000 * 60 * 60 * 24));
    }
  }

  // Resource limits
  const projectLimit = subscription?.plan?.max_projects || 1;
  const subscriberLimit = subscription?.plan?.max_subscribers || 20;
  
  // -1 means unlimited
  const canCreateProject = canAccessFeatures && (projectLimit < 0 || projectCount < projectLimit);
  const canAddSubscriber = canAccessFeatures && (subscriberLimit < 0 || subscriberCount < subscriberLimit);

  return (
    <SubscriptionContext.Provider
      value={{
        subscription,
        loading,
        isExpired,
        isTrialExpired,
        isActive,
        daysRemaining,
        canAccessFeatures,
        projectCount,
        subscriberCount,
        projectLimit,
        subscriberLimit,
        canCreateProject,
        canAddSubscriber,
        refetch: fetchSubscription,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
}
