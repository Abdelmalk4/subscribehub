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
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18" />
              <path d="M9 21V9" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Plans & billing</h1>
            <p className="text-gray-500 text-sm">Manage your plan and billing history here.</p>
          </div>
        </div>
        <Avatar className="h-9 w-9">
          <AvatarImage src="" />
          <AvatarFallback className="bg-gray-100 text-gray-600 text-sm">
            {user?.email?.charAt(0).toUpperCase() || "U"}
          </AvatarFallback>
        </Avatar>
      </div>

      {/* Plans Section - 3 columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
            />
          );
        })}
      </div>

      {/* Previous Invoices Section */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <h2 className="text-base font-semibold text-gray-900">Previous invoices</h2>

          <div className="flex items-center gap-3">
            {/* Quick Filter Tabs */}
            <div className="flex bg-gray-100 rounded-lg p-0.5">
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
                onClick={() => setInvoiceFilter("active")}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  invoiceFilter === "active"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Active
              </button>
              <button
                onClick={() => setInvoiceFilter("archived")}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  invoiceFilter === "archived"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Archived
              </button>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search"
                value={invoiceSearch}
                onChange={(e) => setInvoiceSearch(e.target.value)}
                className="pl-9 w-40"
              />
            </div>

            {/* Sort Button */}
            <Button variant="outline" size="sm" className="gap-2">
              <SlidersHorizontal className="h-4 w-4" />
              Most recent
            </Button>
          </div>
        </div>

        {/* Invoices Table */}
        <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
          {filteredInvoices.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p>No invoices found.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-b border-gray-100">
                  <TableHead className="w-10 pl-4">
                    <Checkbox />
                  </TableHead>
                  <TableHead className="font-medium text-gray-500">Invoice</TableHead>
                  <TableHead className="font-medium text-gray-500">Date</TableHead>
                  <TableHead className="font-medium text-gray-500">Plan</TableHead>
                  <TableHead className="font-medium text-gray-500">Amount</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInvoices.map((invoice) => (
                  <TableRow key={invoice.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <TableCell className="pl-4">
                      <Checkbox />
                    </TableCell>
                    <TableCell className="font-medium text-gray-900">
                      {invoice.invoice_number}
                    </TableCell>
                    <TableCell className="text-gray-500">
                      {format(new Date(invoice.created_at), "d MMM yyyy")}
                    </TableCell>
                    <TableCell className="text-gray-500">
                      {invoice.plan?.plan_name || "—"}
                    </TableCell>
                    <TableCell className="text-gray-900">
                      USD ${invoice.amount.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-gray-600">
                        <Download className="h-4 w-4" />
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
