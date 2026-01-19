import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Building2,
  Wallet,
  Bitcoin,
  Plus,
  Loader2,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface PaymentMethod {
  id: string;
  user_id: string;
  method_type: "bank_transfer" | "binance" | "crypto";
  method_name: string;
  details: Record<string, string>;
  instructions: string | null;
  is_active: boolean;
  display_order: number;
}

const methodTypeConfig: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  bank_transfer: { label: "Bank Transfer", icon: Building2, color: "text-blue-500" },
  binance: { label: "Binance Pay", icon: Wallet, color: "text-yellow-500" },
  crypto: { label: "Crypto (USDT)", icon: Bitcoin, color: "text-orange-500" },
};

const defaultDetails: Record<string, Record<string, string>> = {
  bank_transfer: { bank_name: "", account_name: "", account_number: "", routing_number: "" },
  binance: { binance_id: "", binance_email: "" },
  crypto: { network: "", address: "" },
};

export function ClientPaymentMethodsManager() {
  const { user } = useAuth();
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMethod, setEditingMethod] = useState<Partial<PaymentMethod> | null>(null);

  useEffect(() => {
    if (user) fetchMethods();
  }, [user]);

  const fetchMethods = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("client_payment_methods")
        .select("*")
        .eq("user_id", user.id)
        .order("display_order", { ascending: true });

      if (error) throw error;
      setMethods((data || []) as PaymentMethod[]);
    } catch (error: any) {
      toast.error("Failed to load payment methods");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!editingMethod || !user) return;

    setSaving(true);
    try {
      if (editingMethod.id) {
        const { error } = await supabase
          .from("client_payment_methods")
          .update({
            method_name: editingMethod.method_name,
            details: editingMethod.details,
            instructions: editingMethod.instructions,
            is_active: editingMethod.is_active,
          })
          .eq("id", editingMethod.id);

        if (error) throw error;
        toast.success("Payment method updated");
      } else {
        const { error } = await supabase.from("client_payment_methods").insert({
          user_id: user.id,
          method_type: editingMethod.method_type,
          method_name: editingMethod.method_name,
          details: editingMethod.details,
          instructions: editingMethod.instructions,
          is_active: editingMethod.is_active ?? true,
          display_order: methods.length,
        });

        if (error) throw error;
        toast.success("Payment method added");
      }

      setDialogOpen(false);
      setEditingMethod(null);
      fetchMethods();
    } catch (error: any) {
      toast.error("Failed to save payment method", { description: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from("client_payment_methods").delete().eq("id", id);
      if (error) throw error;
      toast.success("Payment method deleted");
      fetchMethods();
    } catch (error: any) {
      toast.error("Failed to delete", { description: error.message });
    }
  };

  const handleToggleActive = async (id: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from("client_payment_methods")
        .update({ is_active: isActive })
        .eq("id", id);

      if (error) throw error;
      setMethods((prev) =>
        prev.map((m) => (m.id === id ? { ...m, is_active: isActive } : m))
      );
      toast.success(isActive ? "Payment method enabled" : "Payment method disabled");
    } catch (error: any) {
      toast.error("Failed to update status");
    }
  };

  const openNewDialog = (type: "bank_transfer" | "binance" | "crypto") => {
    setEditingMethod({
      method_type: type,
      method_name: methodTypeConfig[type].label,
      details: { ...defaultDetails[type] },
      instructions: "",
      is_active: true,
    });
    setDialogOpen(true);
  };

  const openEditDialog = (method: PaymentMethod) => {
    setEditingMethod({ ...method });
    setDialogOpen(true);
  };

  const updateDetails = (key: string, value: string) => {
    if (!editingMethod) return;
    setEditingMethod({
      ...editingMethod,
      details: { ...editingMethod.details, [key]: value },
    });
  };

  const renderDetailsFields = () => {
    if (!editingMethod) return null;

    switch (editingMethod.method_type) {
      case "bank_transfer":
        return (
          <>
            <div className="space-y-2">
              <Label>Bank Name</Label>
              <Input
                value={editingMethod.details?.bank_name || ""}
                onChange={(e) => updateDetails("bank_name", e.target.value)}
                placeholder="e.g., Chase Bank"
              />
            </div>
            <div className="space-y-2">
              <Label>Account Name</Label>
              <Input
                value={editingMethod.details?.account_name || ""}
                onChange={(e) => updateDetails("account_name", e.target.value)}
                placeholder="Account holder name"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Account Number</Label>
                <Input
                  value={editingMethod.details?.account_number || ""}
                  onChange={(e) => updateDetails("account_number", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Routing Number</Label>
                <Input
                  value={editingMethod.details?.routing_number || ""}
                  onChange={(e) => updateDetails("routing_number", e.target.value)}
                />
              </div>
            </div>
          </>
        );
      case "binance":
        return (
          <>
            <div className="space-y-2">
              <Label>Binance ID</Label>
              <Input
                value={editingMethod.details?.binance_id || ""}
                onChange={(e) => updateDetails("binance_id", e.target.value)}
                placeholder="Your Binance Pay ID"
              />
            </div>
            <div className="space-y-2">
              <Label>Binance Email (Optional)</Label>
              <Input
                value={editingMethod.details?.binance_email || ""}
                onChange={(e) => updateDetails("binance_email", e.target.value)}
                placeholder="email@example.com"
              />
            </div>
          </>
        );
      case "crypto":
        return (
          <>
            <div className="space-y-2">
              <Label>Network</Label>
              <Input
                value={editingMethod.details?.network || ""}
                onChange={(e) => updateDetails("network", e.target.value)}
                placeholder="e.g., TRC20, ERC20, BEP20"
              />
            </div>
            <div className="space-y-2">
              <Label>Wallet Address</Label>
              <Input
                value={editingMethod.details?.address || ""}
                onChange={(e) => updateDetails("address", e.target.value)}
                placeholder="Your USDT wallet address"
              />
            </div>
          </>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Your Payment Methods</CardTitle>
        <CardDescription>
          These payment methods will be shown to your subscribers when they select manual payment.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => openNewDialog("bank_transfer")}>
            <Building2 className="h-4 w-4 mr-2" />
            Add Bank Transfer
          </Button>
          <Button variant="outline" size="sm" onClick={() => openNewDialog("binance")}>
            <Wallet className="h-4 w-4 mr-2" />
            Add Binance Pay
          </Button>
          <Button variant="outline" size="sm" onClick={() => openNewDialog("crypto")}>
            <Bitcoin className="h-4 w-4 mr-2" />
            Add Crypto (USDT)
          </Button>
        </div>

        {methods.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Plus className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No payment methods configured yet.</p>
            <p className="text-sm">Add your payment methods so subscribers can pay you.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {methods.map((method) => {
                const config = methodTypeConfig[method.method_type];
                const Icon = config?.icon || Wallet;
                return (
                  <TableRow key={method.id}>
                    <TableCell className="font-medium">{method.method_name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="gap-1">
                        <Icon className={`h-3 w-3 ${config?.color || ""}`} />
                        {config?.label || method.method_type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={method.is_active}
                        onCheckedChange={(checked) => handleToggleActive(method.id, checked)}
                      />
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditDialog(method)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDelete(method.id)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingMethod?.id ? "Edit" : "Add"} Payment Method
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Display Name</Label>
              <Input
                value={editingMethod?.method_name || ""}
                onChange={(e) =>
                  setEditingMethod((prev) =>
                    prev ? { ...prev, method_name: e.target.value } : null
                  )
                }
                placeholder="e.g., My Bank Account"
              />
            </div>
            {renderDetailsFields()}
            <div className="space-y-2">
              <Label>Instructions (Optional)</Label>
              <Textarea
                value={editingMethod?.instructions || ""}
                onChange={(e) =>
                  setEditingMethod((prev) =>
                    prev ? { ...prev, instructions: e.target.value } : null
                  )
                }
                placeholder="Additional instructions for subscribers..."
                rows={2}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={editingMethod?.is_active ?? true}
                onCheckedChange={(checked) =>
                  setEditingMethod((prev) =>
                    prev ? { ...prev, is_active: checked } : null
                  )
                }
              />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingMethod?.id ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
