import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Crown,
  Check,
  ArrowRight,
  CreditCard,
  Receipt,
  Loader2,
  XCircle,
  RefreshCw,
  MessageSquare,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ContactSalesDialog } from "@/components/billing/ContactSalesDialog";
import { SubscriptionPaymentDialog } from "@/components/billing/SubscriptionPaymentDialog";

interface SubscriptionPlan {
  id: string;
  plan_name: string;
  plan_slug: string;
  price: number;
  max_projects: number;
  max_subscribers: number;
  features: string[];
  billing_cycle: string;
}

interface UserSubscription {
  id: string;
  status: string;
  current_period_end: string | null;
  trial_ends_at: string | null;
  plan: SubscriptionPlan | null;
}

interface PaymentRecord {
  id: string;
  created_at: string;
  amount: number;
  status: string;
  plan_name: string;
}

export default function Billing() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [projectCount, setProjectCount] = useState(0);
  const [subscriberCount, setSubscriberCount] = useState(0);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  
  // Dialog states
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [changePlanDialogOpen, setChangePlanDialogOpen] = useState(false);
  const [contactSalesOpen, setContactSalesOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);

  useEffect(() => {
    if (user) {
      fetchBillingData();
    }
  }, [user]);

  const fetchBillingData = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      // Fetch user's subscription with plan details
      const { data: subData } = await supabase
        .from("client_subscriptions")
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
            max_subscribers,
            features,
            billing_cycle
          )
        `)
        .eq("client_id", user.id)
        .single();

      if (subData) {
        const planData = subData.subscription_plans as unknown as SubscriptionPlan | null;
        setSubscription({
          id: subData.id,
          status: subData.status || "trial",
          current_period_end: subData.current_period_end,
          trial_ends_at: subData.trial_ends_at,
          plan: planData ? {
            ...planData,
            features: Array.isArray(planData.features) ? planData.features : []
          } : null,
        });
      }

      // Fetch all available plans
      const { data: plansData } = await supabase
        .from("subscription_plans")
        .select("*")
        .eq("is_active", true)
        .order("price", { ascending: true });

      if (plansData) {
        setPlans(plansData.map(p => ({
          ...p,
          billing_cycle: p.billing_cycle || "monthly",
          features: Array.isArray(p.features) ? (p.features as string[]) : []
        })));
      }

      // Count user's projects
      const { count: projCount } = await supabase
        .from("projects")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id);

      setProjectCount(projCount || 0);

      // Count total subscribers across all user's projects
      const { data: userProjects } = await supabase
        .from("projects")
        .select("id")
        .eq("user_id", user.id);

      if (userProjects && userProjects.length > 0) {
        const projectIds = userProjects.map(p => p.id);
        const { count: subCount } = await supabase
          .from("subscribers")
          .select("*", { count: "exact", head: true })
          .in("project_id", projectIds);

        setSubscriberCount(subCount || 0);
      }

      // Fetch payment history
      const { data: paymentData } = await supabase
        .from("client_subscription_payments")
        .select(`
          id,
          created_at,
          amount,
          status,
          subscription_plans (plan_name)
        `)
        .eq("client_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10);

      if (paymentData) {
        setPayments(paymentData.map(p => ({
          id: p.id,
          created_at: p.created_at || "",
          amount: p.amount,
          status: p.status || "pending",
          plan_name: (p.subscription_plans as unknown as { plan_name: string })?.plan_name || "Unknown",
        })));
      }
    } catch (error) {
      console.error("Error fetching billing data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!subscription) return;
    
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from("client_subscriptions")
        .update({ 
          status: "expired",
          current_period_end: new Date().toISOString()
        })
        .eq("id", subscription.id);

      if (error) throw error;
      
      toast.success("Subscription cancelled successfully");
      setCancelDialogOpen(false);
      fetchBillingData();
    } catch (error) {
      console.error("Error cancelling subscription:", error);
      toast.error("Failed to cancel subscription");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReactivateSubscription = async () => {
    if (!subscription) return;
    
    setActionLoading(true);
    try {
      const newPeriodEnd = new Date();
      newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);
      
      const { error } = await supabase
        .from("client_subscriptions")
        .update({ 
          status: subscription.plan ? "active" : "trial",
          current_period_start: new Date().toISOString(),
          current_period_end: newPeriodEnd.toISOString(),
          trial_ends_at: subscription.plan ? null : newPeriodEnd.toISOString()
        })
        .eq("id", subscription.id);

      if (error) throw error;
      
      toast.success("Subscription reactivated successfully");
      fetchBillingData();
    } catch (error) {
      console.error("Error reactivating subscription:", error);
      toast.error("Failed to reactivate subscription");
    } finally {
      setActionLoading(false);
    }
  };

  const handleChangePlan = async () => {
    if (!subscription || !selectedPlan) return;
    
    setActionLoading(true);
    try {
      const newPeriodEnd = new Date();
      newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);
      
      const { error } = await supabase
        .from("client_subscriptions")
        .update({ 
          plan_id: selectedPlan.id,
          status: "active",
          current_period_start: new Date().toISOString(),
          current_period_end: newPeriodEnd.toISOString(),
          trial_ends_at: null
        })
        .eq("id", subscription.id);

      if (error) throw error;
      
      toast.success(`Successfully switched to ${selectedPlan.plan_name} plan`);
      setChangePlanDialogOpen(false);
      setSelectedPlan(null);
      fetchBillingData();
    } catch (error) {
      console.error("Error changing plan:", error);
      toast.error("Failed to change plan");
    } finally {
      setActionLoading(false);
    }
  };

  const openChangePlanDialog = (plan: SubscriptionPlan) => {
    setSelectedPlan(plan);
    setPaymentDialogOpen(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge variant="success">Active</Badge>;
      case "trial":
        return <Badge variant="info">Trial</Badge>;
      case "pending_payment":
        return <Badge variant="warning">Pending Payment</Badge>;
      case "expired":
        return <Badge variant="destructive">Expired</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getRenewalDate = () => {
    if (subscription?.current_period_end) {
      return format(new Date(subscription.current_period_end), "MMM d, yyyy");
    }
    if (subscription?.trial_ends_at) {
      return format(new Date(subscription.trial_ends_at), "MMM d, yyyy");
    }
    return "N/A";
  };

  const getProjectLimit = () => subscription?.plan?.max_projects || 1;
  const getSubscriberLimit = () => subscription?.plan?.max_subscribers || 20;
  const getCurrentPlanSlug = () => subscription?.plan?.plan_slug || "";
  const isExpired = subscription?.status === "expired";

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Billing</h1>
        <p className="text-muted-foreground mt-1">
          Manage your subscription and payment methods.
        </p>
      </div>

      {/* Current Plan */}
      <Card variant="glow">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl flex items-center gap-2">
                <Crown className="h-5 w-5 text-warning" />
                Current Plan
              </CardTitle>
              <CardDescription>Your subscription details</CardDescription>
            </div>
            {getStatusBadge(subscription?.status || "trial")}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <p className="text-3xl font-bold text-foreground">
                {subscription?.plan?.plan_name || "Free Trial"}
              </p>
              <p className="text-muted-foreground">
                {subscription?.plan 
                  ? `$${subscription.plan.price}/month • ${isExpired ? "Expired" : `Renews ${getRenewalDate()}`}`
                  : `Trial ${isExpired ? "expired" : `ends ${getRenewalDate()}`}`
                }
              </p>
            </div>
            <div className="flex gap-2">
              {isExpired ? (
                <Button 
                  variant="gradient" 
                  onClick={handleReactivateSubscription}
                  disabled={actionLoading}
                >
                  {actionLoading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Reactivate
                </Button>
              ) : (
                <>
                  <Button variant="glass">
                    <CreditCard className="h-4 w-4 mr-2" />
                    Update Payment
                  </Button>
                  {(subscription?.plan || subscription?.status === "trial") && (
                    <Button 
                      variant="outline" 
                      onClick={() => setCancelDialogOpen(true)}
                      disabled={actionLoading}
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Cancel
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>

          {!isExpired && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Projects</span>
                <span className="font-medium text-foreground">
                    {projectCount} / {getProjectLimit() < 0 ? "∞" : getProjectLimit()}
                  </span>
                </div>
                <Progress 
                  value={getProjectLimit() < 0 ? 0 : (projectCount / getProjectLimit()) * 100} 
                  className="h-2" 
                />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subscribers</span>
                  <span className="font-medium text-foreground">
                    {subscriberCount} / {getSubscriberLimit() < 0 ? "∞" : getSubscriberLimit().toLocaleString()}
                  </span>
                </div>
                <Progress 
                  value={getSubscriberLimit() < 0 ? 0 : (subscriberCount / getSubscriberLimit()) * 100} 
                  className="h-2" 
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pricing Plans */}
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-4">Available Plans</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {plans.map((plan) => {
            const isCurrentPlan = getCurrentPlanSlug() === plan.plan_slug;
            const isPopular = plan.plan_slug === "pro";
            const isUnlimited = plan.plan_slug === "unlimited";
            const isUpgrade = subscription?.plan ? plan.price > subscription.plan.price : true;
            
            return (
              <Card
                key={plan.id}
                variant={isPopular ? "glow" : "glass"}
                className={isPopular ? "relative" : ""}
              >
                {isPopular && (
                  <Badge variant="info" className="absolute -top-3 left-1/2 -translate-x-1/2">
                    Most Popular
                  </Badge>
                )}
                <CardHeader className="text-center pb-2">
                  <CardTitle className="text-lg">{plan.plan_name}</CardTitle>
                  <div className="mt-2">
                    {isUnlimited ? (
                      <span className="text-4xl font-bold text-foreground">Contact Us</span>
                    ) : (
                      <>
                        <span className="text-4xl font-bold text-foreground">${plan.price}</span>
                        <span className="text-muted-foreground">/mo</span>
                      </>
                    )}
                  </div>
                  <CardDescription>
                    {plan.max_projects < 0 ? "Unlimited" : plan.max_projects} projects, {" "}
                    {plan.max_subscribers < 0 ? "Unlimited" : plan.max_subscribers.toLocaleString()} subscribers
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-2">
                    {plan.features.map((feature, idx) => (
                      <li key={idx} className="flex items-center gap-2 text-sm">
                        <Check className="h-4 w-4 text-success flex-shrink-0" />
                        <span className="text-muted-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  {isUnlimited ? (
                    <Button
                      variant="glass"
                      className="w-full"
                      onClick={() => setContactSalesOpen(true)}
                    >
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Talk to Sales
                    </Button>
                  ) : (
                    <Button
                      variant={isCurrentPlan ? "outline" : isPopular ? "gradient" : "glass"}
                      className="w-full"
                      disabled={isCurrentPlan || actionLoading}
                      onClick={() => !isCurrentPlan && openChangePlanDialog(plan)}
                    >
                      {isCurrentPlan ? "Current Plan" : isUpgrade ? "Upgrade" : "Downgrade"}
                      {!isCurrentPlan && <ArrowRight className="h-4 w-4 ml-2" />}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Payment History */}
      <Card variant="glass">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Payment History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No payment history yet.
            </p>
          ) : (
            <div className="space-y-3">
              {payments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex items-center justify-between p-4 rounded-lg bg-muted/30"
                >
                  <div>
                    <p className="font-medium text-foreground">{payment.plan_name} Plan</p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(payment.created_at), "MMM d, yyyy")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-foreground">${payment.amount.toFixed(2)}</p>
                    <Badge variant={payment.status === "paid" ? "success" : "warning"}>
                      {payment.status === "paid" ? "Paid" : payment.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cancel Subscription Dialog */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Subscription</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel your subscription? You'll lose access to premium features immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Keep Subscription</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelSubscription}
              disabled={actionLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {actionLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Cancel Subscription
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Change Plan Dialog */}
      <AlertDialog open={changePlanDialogOpen} onOpenChange={setChangePlanDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {selectedPlan && subscription?.plan && selectedPlan.price > subscription.plan.price
                ? "Upgrade Plan"
                : "Change Plan"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {selectedPlan && (
                <>
                  You're about to switch to the <strong>{selectedPlan.plan_name}</strong> plan at{" "}
                  <strong>${selectedPlan.price}/month</strong>. This change will take effect immediately.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleChangePlan}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Confirm Change
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Contact Sales Dialog */}
      <ContactSalesDialog open={contactSalesOpen} onOpenChange={setContactSalesOpen} />

      {/* Subscription Payment Dialog */}
      <SubscriptionPaymentDialog
        open={paymentDialogOpen}
        onOpenChange={setPaymentDialogOpen}
        selectedPlan={selectedPlan}
        subscriptionId={subscription?.id || null}
        onPaymentSubmitted={fetchBillingData}
      />
    </div>
  );
}
