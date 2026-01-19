import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import {
  Crown,
  Loader2,
  XCircle,
  RefreshCw,
  CreditCard,
  AlertTriangle,
  FolderOpen,
  Users,
  Search,
  Download,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { format, differenceInDays } from "date-fns";
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
import { UpgradePlanDialog } from "@/components/billing/UpgradePlanDialog";
import { PlanCard } from "@/components/billing/PlanCard";
import { PaymentMethodCard } from "@/components/billing/PaymentMethodCard";
import { InvoiceProofUpload } from "@/components/billing/InvoiceProofUpload";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";

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

interface Invoice {
  id: string;
  invoice_number: string;
  amount: number;
  status: string;
  payment_proof_url: string | null;
  created_at: string;
  plan?: { plan_name: string } | null;
}

interface PaymentMethod {
  id: string;
  method_name: string;
  method_type: string;
  details: Record<string, string>;
  instructions: string | null;
}

export default function Billing() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [projectCount, setProjectCount] = useState(0);
  const [subscriberCount, setSubscriberCount] = useState(0);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);

  // Filter states
  const [invoiceFilter, setInvoiceFilter] = useState<"all" | "pending" | "paid">("all");
  const [invoiceSearch, setInvoiceSearch] = useState("");

  // Dialog states
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [contactSalesOpen, setContactSalesOpen] = useState(false);
  const [upgradeDialogOpen, setUpgradeDialogOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  useEffect(() => {
    if (user) {
      fetchBillingData();
    }
  }, [user]);

  const fetchBillingData = async () => {
    if (!user) return;

    setLoading(true);
    try {
      // Fetch subscription with plan
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
          plan: planData
            ? {
                ...planData,
                features: Array.isArray(planData.features) ? planData.features : [],
              }
            : null,
        });
      }

      // Fetch all plans
      const { data: plansData } = await supabase
        .from("subscription_plans")
        .select("*")
        .eq("is_active", true)
        .order("price", { ascending: true });

      if (plansData) {
        setPlans(
          plansData.map((p) => ({
            ...p,
            billing_cycle: p.billing_cycle || "monthly",
            features: Array.isArray(p.features) ? (p.features as string[]) : [],
          }))
        );
      }

      // Fetch project count
      const { count: projCount } = await supabase
        .from("projects")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id);

      setProjectCount(projCount || 0);

      // Fetch subscriber count
      const { data: userProjects } = await supabase
        .from("projects")
        .select("id")
        .eq("user_id", user.id);

      if (userProjects && userProjects.length > 0) {
        const projectIds = userProjects.map((p) => p.id);
        const { count: subCount } = await supabase
          .from("subscribers")
          .select("*", { count: "exact", head: true })
          .in("project_id", projectIds);

        setSubscriberCount(subCount || 0);
      }

      // Fetch invoices
      const { data: invoicesData } = await supabase
        .from("invoices")
        .select(`*, subscription_plans (plan_name)`)
        .eq("client_id", user.id)
        .order("created_at", { ascending: false });

      if (invoicesData) {
        setInvoices(
          invoicesData.map((inv: any) => ({
            ...inv,
            plan: inv.subscription_plans,
          }))
        );
      }

      // Fetch platform payment methods
      const { data: methodsData } = await supabase
        .from("platform_payment_methods")
        .select("*")
        .eq("is_active", true)
        .order("display_order", { ascending: true });

      setPaymentMethods((methodsData || []) as PaymentMethod[]);
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
          current_period_end: new Date().toISOString(),
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
          trial_ends_at: subscription.plan ? null : newPeriodEnd.toISOString(),
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

  const openUpgradeDialog = (plan: SubscriptionPlan) => {
    setSelectedPlan(plan);
    setUpgradeDialogOpen(true);
  };

  const handleUploadComplete = async (url: string) => {
    if (!selectedInvoice) return;

    try {
      const { error } = await supabase
        .from("invoices")
        .update({
          payment_proof_url: url,
          notes: "Payment proof uploaded, awaiting review",
        })
        .eq("id", selectedInvoice.id);

      if (error) throw error;

      toast.success("Payment proof uploaded!");
      setUploadOpen(false);
      fetchBillingData();
    } catch (error: any) {
      toast.error("Failed to update invoice", { description: error.message });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge variant="success">Active</Badge>;
      case "trial":
        return <Badge variant="info">Trial</Badge>;
      case "pending_payment":
        return <Badge variant="warning">Pending</Badge>;
      case "expired":
        return <Badge variant="destructive">Expired</Badge>;
      case "paid":
        return <Badge variant="success">Paid</Badge>;
      case "pending":
        return <Badge variant="warning">Pending</Badge>;
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

  const getDaysRemaining = () => {
    const endDate = subscription?.current_period_end || subscription?.trial_ends_at;
    if (!endDate) return 0;
    return Math.max(0, differenceInDays(new Date(endDate), new Date()));
  };

  const getProjectLimit = () => subscription?.plan?.max_projects || 1;
  const getSubscriberLimit = () => subscription?.plan?.max_subscribers || 20;
  const getCurrentPlanSlug = () => subscription?.plan?.plan_slug || "";
  const isExpired = subscription?.status === "expired";
  const isTrial = subscription?.status === "trial";
  const daysRemaining = getDaysRemaining();
  const isNearExpiry = daysRemaining <= 7 && daysRemaining > 0;

  // Get accent color for plan card
  const getAccentColor = (slug: string): "primary" | "cyan" | "accent" => {
    if (slug === "pro" || slug === "business") return "cyan";
    if (slug === "premium" || slug === "enterprise" || slug === "unlimited") return "accent";
    return "primary";
  };

  // Filter invoices
  const filteredInvoices = invoices.filter((inv) => {
    const matchesFilter =
      invoiceFilter === "all" ||
      (invoiceFilter === "pending" && inv.status === "pending") ||
      (invoiceFilter === "paid" && inv.status === "paid");
    const matchesSearch =
      !invoiceSearch ||
      inv.invoice_number.toLowerCase().includes(invoiceSearch.toLowerCase()) ||
      inv.plan?.plan_name?.toLowerCase().includes(invoiceSearch.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-6xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Plans & billing</h1>
        <p className="text-gray-500 mt-1">
          Manage your subscription, invoices, and payment methods.
        </p>
      </div>

      {/* Near Expiry Warning */}
      {isNearExpiry && !isExpired && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="py-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <div className="flex-1">
              <p className="font-medium text-gray-900">
                Your {isTrial ? "trial" : "subscription"} expires in {daysRemaining} days
              </p>
              <p className="text-sm text-gray-600">
                Upgrade now to keep uninterrupted access to your channels.
              </p>
            </div>
            <Button size="sm">Upgrade Now</Button>
          </CardContent>
        </Card>
      )}

      {/* Section A: Plan Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Current Plan Card */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <Crown className="h-4 w-4 text-amber-500" />
                Current Plan
              </CardTitle>
              {getStatusBadge(subscription?.status || "trial")}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {subscription?.plan?.plan_name || "Free Trial"}
              </p>
              <p className="text-sm text-gray-500">
                {subscription?.plan
                  ? `$${subscription.plan.price}/month`
                  : "Limited features"}
              </p>
            </div>

            <div className="text-sm text-gray-600">
              {isExpired ? (
                <span className="text-error-500">Expired</span>
              ) : (
                <>Renews {getRenewalDate()}</>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              {isExpired ? (
                <Button
                  size="sm"
                  onClick={handleReactivateSubscription}
                  disabled={actionLoading}
                >
                  {actionLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Reactivate
                </Button>
              ) : (
                <>
                  <Button variant="secondary" size="sm">
                    <CreditCard className="h-4 w-4 mr-2" />
                    Update Payment
                  </Button>
                  {(subscription?.plan || subscription?.status === "trial") && (
                    <Button
                      variant="outline"
                      size="sm"
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
          </CardContent>
        </Card>

        {/* Usage Summary Card */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-medium">Usage Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Projects Usage */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 text-gray-600">
                  <FolderOpen className="h-4 w-4" />
                  <span>Projects</span>
                </div>
                <span className="font-medium text-gray-900">
                  {projectCount} / {getProjectLimit() < 0 ? "∞" : getProjectLimit()}
                </span>
              </div>
              <Progress
                value={getProjectLimit() < 0 ? 0 : (projectCount / getProjectLimit()) * 100}
                className="h-2"
              />
            </div>

            {/* Subscribers Usage */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 text-gray-600">
                  <Users className="h-4 w-4" />
                  <span>Subscribers</span>
                </div>
                <span className="font-medium text-gray-900">
                  {subscriberCount} / {getSubscriberLimit() < 0 ? "∞" : getSubscriberLimit().toLocaleString()}
                </span>
              </div>
              <Progress
                value={getSubscriberLimit() < 0 ? 0 : (subscriberCount / getSubscriberLimit()) * 100}
                className="h-2"
              />
            </div>

            {/* Trial Progress (if applicable) */}
            {isTrial && !isExpired && (
              <div className="pt-2 border-t border-gray-100">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-600">Trial Progress</span>
                  <span className="text-gray-500">{daysRemaining} days left</span>
                </div>
                <Progress value={((14 - daysRemaining) / 14) * 100} className="h-2" />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Section B: Available Plans */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Available Plans</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {plans.map((plan) => {
            const isCurrentPlan = getCurrentPlanSlug() === plan.plan_slug;
            const isPopular = plan.plan_slug === "pro";
            const isUnlimited = plan.plan_slug === "unlimited";

            return (
              <PlanCard
                key={plan.id}
                planName={plan.plan_name}
                price={plan.price}
                features={plan.features}
                maxProjects={plan.max_projects}
                maxSubscribers={plan.max_subscribers}
                accentColor={getAccentColor(plan.plan_slug)}
                isCurrentPlan={isCurrentPlan}
                isPopular={isPopular}
                isUnlimited={isUnlimited}
                onSelectPlan={() => openUpgradeDialog(plan)}
                onContactSales={() => setContactSalesOpen(true)}
                disabled={actionLoading}
              />
            );
          })}
        </div>
      </div>

      {/* Section C: Payment Methods */}
      {paymentMethods.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Wallet className="h-5 w-5 text-gray-500" />
            <h2 className="text-lg font-semibold text-gray-900">Payment Methods</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {paymentMethods.map((method) => (
              <PaymentMethodCard
                key={method.id}
                methodName={method.method_name}
                methodType={method.method_type}
                details={method.details}
                instructions={method.instructions}
              />
            ))}
          </div>
        </div>
      )}

      {/* Section D: Invoices & History */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Previous Invoices</h2>

          <div className="flex items-center gap-3">
            {/* Quick Filter */}
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setInvoiceFilter("all")}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  invoiceFilter === "all"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                View all
              </button>
              <button
                onClick={() => setInvoiceFilter("pending")}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  invoiceFilter === "pending"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Pending
              </button>
              <button
                onClick={() => setInvoiceFilter("paid")}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  invoiceFilter === "paid"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Completed
              </button>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search invoices..."
                value={invoiceSearch}
                onChange={(e) => setInvoiceSearch(e.target.value)}
                className="pl-9 w-48"
              />
            </div>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            {filteredInvoices.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p>No invoices found.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox />
                    </TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvoices.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell>
                        <Checkbox />
                      </TableCell>
                      <TableCell className="font-medium text-gray-900">
                        {invoice.invoice_number}
                      </TableCell>
                      <TableCell className="text-gray-500">
                        {format(new Date(invoice.created_at), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-normal">
                          {invoice.plan?.plan_name || "—"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-gray-900">
                        ${invoice.amount.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon">
                          <Download className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cancel Subscription Dialog */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Subscription</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel your subscription? You'll lose access to
              premium features immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Keep Subscription</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelSubscription}
              disabled={actionLoading}
              className="bg-error-500 text-white hover:bg-error-600"
            >
              {actionLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Cancel Subscription
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Contact Sales Dialog */}
      <ContactSalesDialog open={contactSalesOpen} onOpenChange={setContactSalesOpen} />

      {/* Upgrade Plan Dialog */}
      <UpgradePlanDialog
        open={upgradeDialogOpen}
        onOpenChange={setUpgradeDialogOpen}
        selectedPlan={selectedPlan}
        subscriptionId={subscription?.id || null}
        onSuccess={fetchBillingData}
      />

      {/* Upload Payment Proof Dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Payment Proof</DialogTitle>
            <DialogDescription>
              Invoice: {selectedInvoice?.invoice_number} • $
              {selectedInvoice?.amount.toFixed(2)}
            </DialogDescription>
          </DialogHeader>
          {selectedInvoice && (
            <InvoiceProofUpload
              invoiceId={selectedInvoice.id}
              currentProofUrl={selectedInvoice.payment_proof_url}
              onUploadComplete={handleUploadComplete}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
