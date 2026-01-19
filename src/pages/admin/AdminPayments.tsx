import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Search,
  Filter,
  Check,
  X,
  Eye,
  Clock,
  DollarSign,
  AlertCircle,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Image,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useAdminGuard } from "@/hooks/useAdminGuard";
import { logAuditEvent } from "@/lib/auditLog";

interface Payment {
  id: string;
  client_id: string;
  amount: number;
  status: string | null;
  payment_method: string | null;
  payment_proof_url: string | null;
  notes: string | null;
  created_at: string | null;
  plan_id: string | null;
  clientEmail?: string;
  clientName?: string;
  planName?: string;
}

export default function AdminPayments() {
  const { user } = useAuth();
  const { verifyAdminRole } = useAdminGuard();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [filteredPayments, setFilteredPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Stats
  const [stats, setStats] = useState({
    pending: 0,
    approved: 0,
    rejected: 0,
    totalAmount: 0,
  });

  useEffect(() => {
    fetchPayments();
  }, []);

  useEffect(() => {
    filterPayments();
  }, [payments, search, statusFilter]);

  const fetchPayments = async () => {
    setLoading(true);

    // Fetch payments with client info
    const { data: paymentsData, error } = await supabase
      .from("client_subscription_payments")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching payments:", error);
      toast.error("Failed to load payments");
      setLoading(false);
      return;
    }

    // Get unique client IDs and plan IDs
    const clientIds = [...new Set(paymentsData?.map((p) => p.client_id) || [])];
    const planIds = [...new Set(paymentsData?.filter((p) => p.plan_id).map((p) => p.plan_id) || [])];

    // Fetch profiles and plans
    const [profilesRes, plansRes] = await Promise.all([
      supabase.from("profiles").select("user_id, email, full_name").in("user_id", clientIds),
      planIds.length > 0
        ? supabase.from("subscription_plans").select("id, plan_name").in("id", planIds)
        : Promise.resolve({ data: [] }),
    ]);

    const profilesMap = new Map(
      (profilesRes.data || []).map((p) => [p.user_id, p])
    );
    const plansMap = new Map((plansRes.data || []).map((p) => [p.id, p.plan_name]));

    // Enrich payments
    const enrichedPayments = (paymentsData || []).map((payment) => {
      const profile = profilesMap.get(payment.client_id);
      return {
        ...payment,
        clientEmail: profile?.email || "Unknown",
        clientName: profile?.full_name || "Unknown Client",
        planName: payment.plan_id ? plansMap.get(payment.plan_id) || "Unknown Plan" : "N/A",
      };
    });

    setPayments(enrichedPayments);

    // Calculate stats
    const pending = enrichedPayments.filter((p) => p.status === "pending").length;
    const approved = enrichedPayments.filter((p) => p.status === "approved").length;
    const rejected = enrichedPayments.filter((p) => p.status === "rejected").length;
    const totalAmount = enrichedPayments
      .filter((p) => p.status === "approved")
      .reduce((sum, p) => sum + Number(p.amount), 0);

    setStats({ pending, approved, rejected, totalAmount });
    setLoading(false);
  };

  const filterPayments = () => {
    let filtered = [...payments];

    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.clientName?.toLowerCase().includes(searchLower) ||
          p.clientEmail?.toLowerCase().includes(searchLower)
      );
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((p) => p.status === statusFilter);
    }

    setFilteredPayments(filtered);
    setPage(1);
  };

  const handleReview = async (action: "approve" | "reject") => {
    if (!selectedPayment || !user) return;

    setReviewing(true);

    // CRITICAL: Verify admin role before performing sensitive operation
    const isAdmin = await verifyAdminRole();
    if (!isAdmin) {
      setReviewing(false);
      return;
    }

    const { error } = await supabase
      .from("client_subscription_payments")
      .update({
        status: action === "approve" ? "approved" : "rejected",
        notes: reviewNotes || null,
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
      })
      .eq("id", selectedPayment.id);

    if (error) {
      toast.error(`Failed to ${action} payment`);
      console.error(error);
    } else {
      toast.success(`Payment ${action === "approve" ? "approved" : "rejected"} successfully`);

      // PHASE 5: Log audit event
      await logAuditEvent({
        action: action === "approve" ? "payment_approved" : "payment_rejected",
        resourceType: "payment",
        resourceId: selectedPayment.id,
        changes: {
          client_id: selectedPayment.client_id,
          amount: selectedPayment.amount,
          plan: selectedPayment.planName,
          notes: reviewNotes || null,
        },
      });

      // If approved, update client subscription status
      if (action === "approve") {
        await supabase
          .from("client_subscriptions")
          .update({ status: "active" })
          .eq("client_id", selectedPayment.client_id);
      }

      fetchPayments();
      setSelectedPayment(null);
      setReviewNotes("");
    }

    setReviewing(false);
  };

  const getStatusBadge = (status: string | null) => {
    const variants: Record<string, { variant: "default" | "secondary" | "outline" | "destructive"; label: string; icon: React.ElementType }> = {
      pending: { variant: "outline", label: "Pending", icon: Clock },
      approved: { variant: "default", label: "Approved", icon: CheckCircle },
      rejected: { variant: "destructive", label: "Rejected", icon: X },
    };
    const config = variants[status || "pending"] || variants.pending;
    const Icon = config.icon;
    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const paginatedPayments = filteredPayments.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.ceil(filteredPayments.length / pageSize);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-6xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Payment Approvals</h1>
        <p className="text-gray-500 text-sm">Review and approve client subscription payments.</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card
          className="cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => setStatusFilter("pending")}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold text-amber-500">{stats.pending}</p>
              </div>
              <Clock className="h-8 w-8 text-amber-500/30" />
            </div>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => setStatusFilter("approved")}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Approved</p>
                <p className="text-2xl font-bold text-green-500">{stats.approved}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500/30" />
            </div>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => setStatusFilter("rejected")}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Rejected</p>
                <p className="text-2xl font-bold text-red-500">{stats.rejected}</p>
              </div>
              <AlertCircle className="h-8 w-8 text-red-500/30" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Revenue</p>
                <p className="text-2xl font-bold text-emerald-500">
                  ${stats.totalAmount.toLocaleString()}
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-emerald-500/30" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by client name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Payments</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Payments Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Payments ({filteredPayments.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedPayments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-foreground">
                          {payment.clientName}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {payment.clientEmail}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="font-semibold text-foreground">
                      ${Number(payment.amount).toFixed(2)}
                    </TableCell>
                    <TableCell>{payment.planName}</TableCell>
                    <TableCell className="capitalize">
                      {payment.payment_method || "N/A"}
                    </TableCell>
                    <TableCell>{getStatusBadge(payment.status)}</TableCell>
                    <TableCell>
                      {payment.created_at
                        ? format(new Date(payment.created_at), "MMM dd, yyyy")
                        : "N/A"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {payment.status === "pending" && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-green-500 hover:text-green-600"
                              onClick={() => {
                                setSelectedPayment(payment);
                                setReviewNotes("");
                              }}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive/80"
                              onClick={() => {
                                setSelectedPayment(payment);
                                setReviewNotes("");
                              }}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedPayment(payment);
                            setReviewNotes("");
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {paginatedPayments.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <p className="text-muted-foreground">No payments found</p>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
              <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Review Payment Dialog */}
      <Dialog open={!!selectedPayment} onOpenChange={() => setSelectedPayment(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Review Payment</DialogTitle>
          </DialogHeader>

          {selectedPayment && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Client</p>
                  <p className="font-medium text-foreground">{selectedPayment.clientName}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Amount</p>
                  <p className="font-semibold text-lg text-foreground">
                    ${Number(selectedPayment.amount).toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Plan</p>
                  <p className="font-medium text-foreground">{selectedPayment.planName}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Method</p>
                  <p className="font-medium text-foreground capitalize">
                    {selectedPayment.payment_method || "N/A"}
                  </p>
                </div>
              </div>

              {/* Payment Proof */}
              {selectedPayment.payment_proof_url && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Payment Proof</p>
                  <a
                    href={selectedPayment.payment_proof_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-primary hover:underline"
                  >
                    <Image className="h-4 w-4" />
                    View Proof
                  </a>
                </div>
              )}

              {/* Current Status */}
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                <span className="text-sm text-muted-foreground">Current Status</span>
                {getStatusBadge(selectedPayment.status)}
              </div>

              {/* Review Notes */}
              {selectedPayment.status === "pending" && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Review Notes (Optional)</p>
                  <Textarea
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    placeholder="Add notes about this review..."
                    rows={3}
                  />
                </div>
              )}

              {/* Existing Notes */}
              {selectedPayment.notes && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Notes</p>
                  <p className="text-sm text-foreground bg-muted/30 p-3 rounded-lg">
                    {selectedPayment.notes}
                  </p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            {selectedPayment?.status === "pending" ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => setSelectedPayment(null)}
                  disabled={reviewing}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => handleReview("reject")}
                  disabled={reviewing}
                >
                  <X className="h-4 w-4 mr-1" />
                  Reject
                </Button>
                <Button
                  variant="default"
                  onClick={() => handleReview("approve")}
                  disabled={reviewing}
                >
                  <Check className="h-4 w-4 mr-1" />
                  Approve
                </Button>
              </>
            ) : (
              <Button onClick={() => setSelectedPayment(null)}>Close</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
