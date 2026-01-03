import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Loader2, Receipt, Eye, Upload, FileText } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { InvoiceProofUpload } from "@/components/billing/InvoiceProofUpload";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface Invoice {
  id: string;
  invoice_number: string;
  amount: number;
  status: string;
  payment_method: string | null;
  payment_proof_url: string | null;
  notes: string | null;
  admin_notes: string | null;
  due_date: string | null;
  paid_at: string | null;
  created_at: string;
  plan?: {
    plan_name: string;
  } | null;
}

interface PaymentMethod {
  id: string;
  method_name: string;
  method_type: string;
  details: Record<string, string>;
  instructions: string | null;
}

export function InvoicesList() {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [platformMethods, setPlatformMethods] = useState<PaymentMethod[]>([]);

  useEffect(() => {
    if (user) {
      fetchInvoices();
      fetchPlatformMethods();
    }
  }, [user]);

  const fetchInvoices = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("invoices")
        .select(`
          *,
          subscription_plans (plan_name)
        `)
        .eq("client_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      setInvoices(
        (data || []).map((inv: any) => ({
          ...inv,
          plan: inv.subscription_plans,
        }))
      );
    } catch (error: any) {
      toast.error("Failed to load invoices");
    } finally {
      setLoading(false);
    }
  };

  const fetchPlatformMethods = async () => {
    try {
      const { data } = await supabase
        .from("platform_payment_methods")
        .select("*")
        .eq("is_active", true)
        .order("display_order", { ascending: true });

      setPlatformMethods((data || []) as PaymentMethod[]);
    } catch (error) {
      console.error("Failed to fetch platform methods:", error);
    }
  };

  const filteredInvoices = invoices.filter((inv) =>
    statusFilter === "all" ? true : inv.status === statusFilter
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return <Badge variant="success">Paid</Badge>;
      case "pending":
        return <Badge variant="warning">Pending</Badge>;
      case "rejected":
        return <Badge variant="destructive">Rejected</Badge>;
      case "cancelled":
        return <Badge variant="secondary">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
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

      toast.success("Payment proof uploaded! Awaiting admin review.");
      setUploadOpen(false);
      fetchInvoices();
    } catch (error: any) {
      toast.error("Failed to update invoice", { description: error.message });
    }
  };

  const openDetail = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setDetailOpen(true);
  };

  const openUpload = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setUploadOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card variant="glass">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Invoices
          </CardTitle>
          <Tabs value={statusFilter} onValueChange={setStatusFilter}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="pending">Pending</TabsTrigger>
              <TabsTrigger value="paid">Paid</TabsTrigger>
              <TabsTrigger value="rejected">Rejected</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent>
        {filteredInvoices.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No invoices found.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInvoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell className="font-mono text-sm">
                    {invoice.invoice_number}
                  </TableCell>
                  <TableCell>{invoice.plan?.plan_name || "—"}</TableCell>
                  <TableCell>${invoice.amount.toFixed(2)}</TableCell>
                  <TableCell>
                    {format(new Date(invoice.created_at), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openDetail(invoice)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {invoice.status === "pending" && !invoice.payment_proof_url && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openUpload(invoice)}
                        >
                          <Upload className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* Invoice Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Invoice Details</DialogTitle>
            <DialogDescription>
              {selectedInvoice?.invoice_number}
            </DialogDescription>
          </DialogHeader>
          {selectedInvoice && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Plan</p>
                  <p className="font-medium">
                    {selectedInvoice.plan?.plan_name || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Amount</p>
                  <p className="font-medium">${selectedInvoice.amount.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  {getStatusBadge(selectedInvoice.status)}
                </div>
                <div>
                  <p className="text-muted-foreground">Created</p>
                  <p className="font-medium">
                    {format(new Date(selectedInvoice.created_at), "PPP")}
                  </p>
                </div>
              </div>

              {selectedInvoice.payment_proof_url && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Payment Proof</p>
                  <a
                    href={selectedInvoice.payment_proof_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline text-sm"
                  >
                    View uploaded proof
                  </a>
                </div>
              )}

              {selectedInvoice.admin_notes && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Admin Notes</p>
                  <p className="text-sm bg-muted/50 rounded-lg p-3">
                    {selectedInvoice.admin_notes}
                  </p>
                </div>
              )}

              {selectedInvoice.status === "pending" && platformMethods.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Payment Options</p>
                  <div className="space-y-2 text-sm">
                    {platformMethods.map((method) => (
                      <div key={method.id} className="bg-muted/30 rounded-lg p-3">
                        <p className="font-medium">{method.method_name}</p>
                        {Object.entries(method.details).map(([key, value]) =>
                          value ? (
                            <p key={key} className="text-muted-foreground">
                              {key.replace(/_/g, " ")}: {value}
                            </p>
                          ) : null
                        )}
                        {method.instructions && (
                          <p className="text-muted-foreground mt-1">
                            {method.instructions}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            {selectedInvoice?.status === "pending" &&
              !selectedInvoice.payment_proof_url && (
                <Button onClick={() => {
                  setDetailOpen(false);
                  openUpload(selectedInvoice);
                }}>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Payment Proof
                </Button>
              )}
            <Button variant="outline" onClick={() => setDetailOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
    </Card>
  );
}
