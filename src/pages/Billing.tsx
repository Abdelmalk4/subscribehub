import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  Search,
  Download,
  SlidersHorizontal,
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
import { UpgradePlanDialog } from "@/components/billing/UpgradePlanDialog";
import { PlanCard } from "@/components/billing/PlanCard";
import { CurrentPlanCard } from "@/components/billing/CurrentPlanCard";
import { UsageSummaryCard } from "@/components/billing/UsageSummaryCard";
import { BillingCycleToggle } from "@/components/billing/BillingCycleToggle";
import { PaymentMethodsCard } from "@/components/billing/PaymentMethodsCard";
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
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

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

export default function Billing() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  // Usage stats
  const [projectsUsed, setProjectsUsed] = useState(0);
  const [subscribersUsed, setSubscribersUsed] = useState(0);

  // Billing cycle toggle
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");

  // Filter states
  const [invoiceFilter, setInvoiceFilter] = useState<"all" | "active" | "archived">("all");
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

      // Fetch all plans (limit to 3 for display)
      const { data: plansData } = await supabase
        .from("subscription_plans")
        .select("*")
        .eq("is_active", true)
        .order("price", { ascending: true })
        .limit(3);

      if (plansData) {
        setPlans(
          plansData.map((p) => ({
            ...p,
            billing_cycle: p.billing_cycle || "monthly",
            features: Array.isArray(p.features) ? (p.features as string[]) : [],
          }))
        );
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

      // Fetch usage stats - projects count
      const { count: projectCount } = await supabase
        .from("projects")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id);

      setProjectsUsed(projectCount || 0);

      // Fetch usage stats - subscribers count (across all user's projects)
      const { data: userProjects } = await supabase
        .from("projects")
        .select("id")
        .eq("user_id", user.id);

      if (userProjects && userProjects.length > 0) {
        const projectIds = userProjects.map((p) => p.id);
        const { count: subscriberCount } = await supabase
          .from("subscribers")
          .select("*", { count: "exact", head: true })
          .in("project_id", projectIds)
          .eq("status", "active");

        setSubscribersUsed(subscriberCount || 0);
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

  const getCurrentPlanSlug = () => subscription?.plan?.plan_slug || "";

  // Get icon color for plan card
  const getIconColor = (index: number): "pink" | "purple" | "orange" => {
    const colors: ("pink" | "purple" | "orange")[] = ["pink", "purple", "orange"];
    return colors[index % colors.length];
  };

  // Get status badge for invoice
  const getInvoiceStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return <Badge variant="success" className="text-[10px]">Paid</Badge>;
      case "pending":
        return <Badge variant="warning" className="text-[10px]">Pending</Badge>;
      case "rejected":
        return <Badge variant="destructive" className="text-[10px]">Rejected</Badge>;
      default:
        return <Badge variant="secondary" className="text-[10px]">{status}</Badge>;
    }
  };

  // Filter invoices
  const filteredInvoices = invoices.filter((inv) => {
    const matchesFilter =
      invoiceFilter === "all" ||
      (invoiceFilter === "active" && inv.status === "pending") ||
      (invoiceFilter === "archived" && inv.status === "paid");
    const matchesSearch =
      !invoiceSearch ||
      inv.invoice_number.toLowerCase().includes(invoiceSearch.toLowerCase()) ||
      inv.plan?.plan_name?.toLowerCase().includes(invoiceSearch.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 w-full">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18" />
              <path d="M9 21V9" />
            </svg>
          </div>
          <div>
            <h1 className="text-base font-semibold text-foreground">Plans & billing</h1>
            <p className="text-muted-foreground text-xs">Manage your plan and billing history here.</p>
          </div>
        </div>
        <Avatar className="h-6 w-6">
          <AvatarImage src="" />
          <AvatarFallback className="bg-muted text-muted-foreground text-[10px]">
            {user?.email?.charAt(0).toUpperCase() || "U"}
          </AvatarFallback>
        </Avatar>
      </div>

      {/* Current Plan & Usage Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <CurrentPlanCard
          planName={subscription?.plan?.plan_name || null}
          status={subscription?.status || "trial"}
          billingCycle={subscription?.plan?.billing_cycle || "monthly"}
          currentPeriodEnd={subscription?.current_period_end || null}
          trialEndsAt={subscription?.trial_ends_at || null}
          onCancelSubscription={() => setCancelDialogOpen(true)}
        />
        <UsageSummaryCard
          projectsUsed={projectsUsed}
          maxProjects={subscription?.plan?.max_projects || 1}
          subscribersUsed={subscribersUsed}
          maxSubscribers={subscription?.plan?.max_subscribers || 50}
        />
      </div>

      {/* Billing Cycle Toggle */}
      <BillingCycleToggle value={billingCycle} onChange={setBillingCycle} />

      {/* Plans Section - 3 columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
        {plans.map((plan, index) => {
          const isCurrentPlan = getCurrentPlanSlug() === plan.plan_slug;
          const isUnlimited = plan.plan_slug === "unlimited";

          if (isUnlimited) {
            return (
              <PlanCard
                key={plan.id}
                planName={plan.plan_name}
                price={plan.price}
                features={plan.features}
                iconColor={getIconColor(index)}
                isCurrentPlan={isCurrentPlan}
                onSelectPlan={() => setContactSalesOpen(true)}
                disabled={actionLoading}
                billingCycle={billingCycle}
              />
            );
          }

          return (
            <PlanCard
              key={plan.id}
              planName={plan.plan_name}
              price={plan.price}
              features={plan.features}
              iconColor={getIconColor(index)}
              isCurrentPlan={isCurrentPlan}
              onSelectPlan={() => openUpgradeDialog(plan)}
              disabled={actionLoading}
              billingCycle={billingCycle}
            />
          );
        })}
      </div>

      {/* Payment Methods Card */}
      <PaymentMethodsCard />

      {/* Previous Invoices Section */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2.5">
          <h2 className="text-sm font-semibold text-foreground">Previous invoices</h2>

          <div className="flex items-center gap-2">
            {/* Quick Filter Tabs */}
            <div className="flex bg-muted rounded-md p-0.5">
              <button
                onClick={() => setInvoiceFilter("all")}
                className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                  invoiceFilter === "all"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                View all
              </button>
              <button
                onClick={() => setInvoiceFilter("active")}
                className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                  invoiceFilter === "active"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Active
              </button>
              <button
                onClick={() => setInvoiceFilter("archived")}
                className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                  invoiceFilter === "archived"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Archived
              </button>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input
                placeholder="Search"
                value={invoiceSearch}
                onChange={(e) => setInvoiceSearch(e.target.value)}
                className="pl-7 w-28 h-7 text-xs"
              />
            </div>

            {/* Sort Button */}
            <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs px-2">
              <SlidersHorizontal className="h-3 w-3" />
              Most recent
            </Button>
          </div>
        </div>

        {/* Invoices Table */}
        <div className="border border-border rounded-lg overflow-hidden bg-card">
          {filteredInvoices.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-xs">No invoices found.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-b border-border">
                  <TableHead className="w-8 pl-3">
                    <Checkbox className="scale-75" />
                  </TableHead>
                  <TableHead className="font-medium text-muted-foreground text-xs py-2">Invoice</TableHead>
                  <TableHead className="font-medium text-muted-foreground text-xs py-2">Date</TableHead>
                  <TableHead className="font-medium text-muted-foreground text-xs py-2 hidden sm:table-cell">Plan</TableHead>
                  <TableHead className="font-medium text-muted-foreground text-xs py-2">Amount</TableHead>
                  <TableHead className="font-medium text-muted-foreground text-xs py-2">Status</TableHead>
                  <TableHead className="w-8"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInvoices.map((invoice) => (
                  <TableRow key={invoice.id} className="border-b border-border/50 hover:bg-muted/30">
                    <TableCell className="pl-3 py-2">
                      <Checkbox className="scale-75" />
                    </TableCell>
                    <TableCell className="font-medium text-foreground text-xs py-2">
                      {invoice.invoice_number}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs py-2">
                      {format(new Date(invoice.created_at), "d MMM yyyy")}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs py-2 hidden sm:table-cell">
                      {invoice.plan?.plan_name || "—"}
                    </TableCell>
                    <TableCell className="text-foreground text-xs py-2">
                      USD ${invoice.amount.toFixed(2)}
                    </TableCell>
                    <TableCell className="py-2">
                      {getInvoiceStatusBadge(invoice.status)}
                    </TableCell>
                    <TableCell className="py-2">
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground">
                        <Download className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
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
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
        billingCycle={billingCycle}
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
