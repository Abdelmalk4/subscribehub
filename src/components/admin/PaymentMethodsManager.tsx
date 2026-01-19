import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  Edit,
  Trash2,
  Save,
  Banknote,
  Bitcoin,
  Wallet,
  GripVertical,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";

interface PaymentMethod {
  id: string;
  method_type: "bank_transfer" | "binance" | "crypto";
  method_name: string;
  details: Json;
  instructions: string | null;
  is_active: boolean | null;
  display_order: number | null;
}

const methodTypeConfig = {
  bank_transfer: { label: "Bank Transfer", icon: Banknote, color: "text-blue-500" },
  binance: { label: "Binance Pay", icon: Wallet, color: "text-amber-500" },
  crypto: { label: "Crypto Wallet", icon: Bitcoin, color: "text-orange-500" },
};

const defaultDetails = {
  bank_transfer: {
    bank_name: "",
    account_name: "",
    account_number: "",
    swift_bic: "",
    iban: "",
    routing_number: "",
  },
  binance: {
    binance_id: "",
    binance_email: "",
  },
  crypto: {
    network: "",
    wallet_address: "",
    coin_type: "",
  },
};

export function PaymentMethodsManager() {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingMethod, setEditingMethod] = useState<PaymentMethod | null>(null);
  const [isNew, setIsNew] = useState(false);

  useEffect(() => {
    fetchMethods();
  }, []);

  const fetchMethods = async () => {
    const { data, error } = await supabase
      .from("platform_payment_methods")
      .select("*")
      .order("display_order", { ascending: true });

    if (error) {
      console.error("Error fetching payment methods:", error);
      toast.error("Failed to load payment methods");
    } else {
      setMethods((data as PaymentMethod[]) || []);
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!editingMethod) return;

    const methodData = {
      method_type: editingMethod.method_type,
      method_name: editingMethod.method_name,
      details: editingMethod.details,
      instructions: editingMethod.instructions,
      is_active: editingMethod.is_active,
      display_order: editingMethod.display_order || methods.length,
    };

    if (isNew) {
      const { error } = await supabase.from("platform_payment_methods").insert(methodData);
      if (error) {
        toast.error("Failed to create payment method");
        console.error(error);
      } else {
        toast.success("Payment method created");
        fetchMethods();
      }
    } else {
      const { error } = await supabase
        .from("platform_payment_methods")
        .update(methodData)
        .eq("id", editingMethod.id);

      if (error) {
        toast.error("Failed to update payment method");
        console.error(error);
      } else {
        toast.success("Payment method updated");
        fetchMethods();
      }
    }

    setEditingMethod(null);
    setIsNew(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this payment method?")) return;

    const { error } = await supabase
      .from("platform_payment_methods")
      .delete()
      .eq("id", id);

    if (error) {
      toast.error("Failed to delete payment method");
      console.error(error);
    } else {
      toast.success("Payment method deleted");
      fetchMethods();
    }
  };

  const handleToggleActive = async (id: string, isActive: boolean) => {
    const { error } = await supabase
      .from("platform_payment_methods")
      .update({ is_active: isActive })
      .eq("id", id);

    if (error) {
      toast.error("Failed to update status");
    } else {
      fetchMethods();
    }
  };

  const openNewDialog = (type: "bank_transfer" | "binance" | "crypto") => {
    setEditingMethod({
      id: "",
      method_type: type,
      method_name: "",
      details: defaultDetails[type],
      instructions: "",
      is_active: true,
      display_order: methods.length,
    });
    setIsNew(true);
  };

  const updateDetails = (key: string, value: string) => {
    if (!editingMethod) return;
    const currentDetails = (editingMethod.details as Record<string, string>) || {};
    setEditingMethod({
      ...editingMethod,
      details: { ...currentDetails, [key]: value },
    });
  };

  const renderDetailsFields = () => {
    if (!editingMethod) return null;
    const details = (editingMethod.details as Record<string, string>) || {};

    switch (editingMethod.method_type) {
      case "bank_transfer":
        return (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Bank Name</Label>
                <Input
                  value={details.bank_name || ""}
                  onChange={(e) => updateDetails("bank_name", e.target.value)}
                  placeholder="e.g., Chase Bank"
                />
              </div>
              <div className="space-y-2">
                <Label>Account Name</Label>
                <Input
                  value={details.account_name || ""}
                  onChange={(e) => updateDetails("account_name", e.target.value)}
                  placeholder="Account holder name"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Account Number</Label>
                <Input
                  value={details.account_number || ""}
                  onChange={(e) => updateDetails("account_number", e.target.value)}
                  placeholder="Account number"
                />
              </div>
              <div className="space-y-2">
                <Label>IBAN (if applicable)</Label>
                <Input
                  value={details.iban || ""}
                  onChange={(e) => updateDetails("iban", e.target.value)}
                  placeholder="IBAN"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>SWIFT/BIC</Label>
                <Input
                  value={details.swift_bic || ""}
                  onChange={(e) => updateDetails("swift_bic", e.target.value)}
                  placeholder="SWIFT code"
                />
              </div>
              <div className="space-y-2">
                <Label>Routing Number</Label>
                <Input
                  value={details.routing_number || ""}
                  onChange={(e) => updateDetails("routing_number", e.target.value)}
                  placeholder="Routing number"
                />
              </div>
            </div>
          </>
        );

      case "binance":
        return (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Binance ID / Pay ID</Label>
              <Input
                value={details.binance_id || ""}
                onChange={(e) => updateDetails("binance_id", e.target.value)}
                placeholder="Your Binance Pay ID"
              />
            </div>
            <div className="space-y-2">
              <Label>Binance Email (optional)</Label>
              <Input
                value={details.binance_email || ""}
                onChange={(e) => updateDetails("binance_email", e.target.value)}
                placeholder="Email linked to Binance"
              />
            </div>
          </div>
        );

      case "crypto":
        return (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Cryptocurrency</Label>
                <Input
                  value={details.coin_type || ""}
                  onChange={(e) => updateDetails("coin_type", e.target.value)}
                  placeholder="e.g., BTC, ETH, USDT"
                />
              </div>
              <div className="space-y-2">
                <Label>Network</Label>
                <Input
                  value={details.network || ""}
                  onChange={(e) => updateDetails("network", e.target.value)}
                  placeholder="e.g., ERC20, TRC20, BEP20"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Wallet Address</Label>
              <Input
                value={details.wallet_address || ""}
                onChange={(e) => updateDetails("wallet_address", e.target.value)}
                placeholder="Your wallet address"
                className="font-mono text-sm"
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
      <Card>
        <CardContent className="py-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-primary" />
                Payment Methods
              </CardTitle>
              <CardDescription>
                Configure platform-wide payment options for subscribers
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => openNewDialog("bank_transfer")}>
                <Banknote className="h-4 w-4 mr-1" />
                Bank
              </Button>
              <Button variant="outline" size="sm" onClick={() => openNewDialog("binance")}>
                <Wallet className="h-4 w-4 mr-1" />
                Binance
              </Button>
              <Button variant="outline" size="sm" onClick={() => openNewDialog("crypto")}>
                <Bitcoin className="h-4 w-4 mr-1" />
                Crypto
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {methods.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Wallet className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>No payment methods configured yet.</p>
              <p className="text-sm">Add bank transfer, Binance, or crypto options above.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Method</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {methods.map((method) => {
                  const config = methodTypeConfig[method.method_type];
                  const Icon = config.icon;
                  return (
                    <TableRow key={method.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg bg-muted/50 ${config.color}`}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <span className="font-medium">{method.method_name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{config.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={method.is_active ?? true}
                          onCheckedChange={(checked) => handleToggleActive(method.id, checked)}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingMethod(method);
                              setIsNew(false);
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => handleDelete(method.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit/Create Dialog */}
      <Dialog open={!!editingMethod} onOpenChange={() => setEditingMethod(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {isNew ? "Add Payment Method" : "Edit Payment Method"}
            </DialogTitle>
          </DialogHeader>

          {editingMethod && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Display Name</Label>
                <Input
                  value={editingMethod.method_name}
                  onChange={(e) =>
                    setEditingMethod({ ...editingMethod, method_name: e.target.value })
                  }
                  placeholder="e.g., USD Bank Transfer, BTC Wallet"
                />
              </div>

              {renderDetailsFields()}

              <div className="space-y-2">
                <Label>Instructions for Users</Label>
                <Textarea
                  value={editingMethod.instructions || ""}
                  onChange={(e) =>
                    setEditingMethod({ ...editingMethod, instructions: e.target.value })
                  }
                  placeholder="Payment instructions shown to subscribers..."
                  rows={3}
                />
              </div>

              <div className="flex items-center justify-between p-4 bg-muted/30 rounded-xl">
                <Label>Active</Label>
                <Switch
                  checked={editingMethod.is_active ?? true}
                  onCheckedChange={(checked) =>
                    setEditingMethod({ ...editingMethod, is_active: checked })
                  }
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingMethod(null)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              <Save className="h-4 w-4 mr-2" />
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
