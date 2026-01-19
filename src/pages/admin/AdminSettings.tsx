import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Settings,
  CreditCard,
  Bell,
  Shield,
  Plus,
  Edit,
  Trash2,
  Save,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";
import { PaymentMethodsManager } from "@/components/admin/PaymentMethodsManager";
import { useAdminGuard } from "@/hooks/useAdminGuard";

interface SubscriptionPlan {
  id: string;
  plan_name: string;
  plan_slug: string;
  price: number;
  max_projects: number;
  max_subscribers: number;
  billing_cycle: string | null;
  features: Json;
  is_active: boolean | null;
}

export default function AdminSettings() {
  const { verifyAdminRole } = useAdminGuard();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [isNewPlan, setIsNewPlan] = useState(false);

  // Platform settings
  const [platformSettings, setPlatformSettings] = useState({
    maintenanceMode: false,
    allowNewSignups: true,
    defaultTrialDays: 14,
    supportEmail: "support@subscribehub.com",
  });

  useEffect(() => {
    fetchPlans();
    fetchPlatformSettings();
  }, []);

  const fetchPlans = async () => {
    const { data, error } = await supabase
      .from("subscription_plans")
      .select("*")
      .order("price", { ascending: true });

    if (error) {
      console.error("Error fetching plans:", error);
    } else {
      setPlans(data || []);
    }
    setLoading(false);
  };

  const fetchPlatformSettings = async () => {
    const { data } = await supabase
      .from("platform_config")
      .select("*");

    if (data) {
      const settingsMap = data.reduce((acc, item) => {
        acc[item.key] = item.value;
        return acc;
      }, {} as Record<string, Json>);

      setPlatformSettings((prev) => ({
        maintenanceMode: (settingsMap.maintenance_mode as boolean) ?? prev.maintenanceMode,
        allowNewSignups: (settingsMap.allow_new_signups as boolean) ?? prev.allowNewSignups,
        defaultTrialDays: (settingsMap.default_trial_days as number) ?? prev.defaultTrialDays,
        supportEmail: (settingsMap.support_email as string) ?? prev.supportEmail,
      }));
    }
  };

  const savePlatformSetting = async (key: string, value: Json) => {
    // Verify admin role before modifying settings
    const isAdmin = await verifyAdminRole();
    if (!isAdmin) return;

    const { error } = await supabase
      .from("platform_config")
      .upsert(
        { key, value, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );

    if (error) {
      toast.error("Failed to save setting");
      console.error(error);
    } else {
      toast.success("Setting saved");
    }
  };

  const handleSavePlan = async () => {
    if (!editingPlan) return;

    // Verify admin role before modifying plans
    const isAdmin = await verifyAdminRole();
    if (!isAdmin) return;

    const planData = {
      plan_name: editingPlan.plan_name,
      plan_slug: editingPlan.plan_slug,
      price: editingPlan.price,
      max_projects: editingPlan.max_projects,
      max_subscribers: editingPlan.max_subscribers,
      billing_cycle: editingPlan.billing_cycle,
      features: editingPlan.features,
      is_active: editingPlan.is_active,
    };

    if (isNewPlan) {
      const { error } = await supabase.from("subscription_plans").insert(planData);
      if (error) {
        toast.error("Failed to create plan");
        console.error(error);
      } else {
        toast.success("Plan created successfully");
        fetchPlans();
      }
    } else {
      const { error } = await supabase
        .from("subscription_plans")
        .update(planData)
        .eq("id", editingPlan.id);

      if (error) {
        toast.error("Failed to update plan");
        console.error(error);
      } else {
        toast.success("Plan updated successfully");
        fetchPlans();
      }
    }

    setEditingPlan(null);
    setIsNewPlan(false);
  };

  const handleDeletePlan = async (planId: string) => {
    if (!confirm("Are you sure you want to delete this plan?")) return;

    // Verify admin role before deleting
    const isAdmin = await verifyAdminRole();
    if (!isAdmin) return;

    const { error } = await supabase
      .from("subscription_plans")
      .delete()
      .eq("id", planId);

    if (error) {
      toast.error("Failed to delete plan");
      console.error(error);
    } else {
      toast.success("Plan deleted");
      fetchPlans();
    }
  };

  const openNewPlanDialog = () => {
    setEditingPlan({
      id: "",
      plan_name: "",
      plan_slug: "",
      price: 0,
      max_projects: 1,
      max_subscribers: 100,
      billing_cycle: "monthly",
      features: {},
      is_active: true,
    });
    setIsNewPlan(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Platform Settings</h1>
        <p className="text-gray-500 text-sm">Manage payment methods, subscription plans and platform configuration.</p>
      </div>

      {/* Payment Methods Manager */}
      <PaymentMethodsManager />

      {/* Platform Configuration */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            <CardTitle>General Settings</CardTitle>
          </div>
          <CardDescription>Configure platform-wide settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex items-center justify-between p-4 bg-muted/30 rounded-xl">
              <div>
                <Label className="text-foreground">Maintenance Mode</Label>
                <p className="text-sm text-muted-foreground">
                  Disable access for non-admin users
                </p>
              </div>
              <Switch
                checked={platformSettings.maintenanceMode}
                onCheckedChange={(checked) => {
                  setPlatformSettings((prev) => ({ ...prev, maintenanceMode: checked }));
                  savePlatformSetting("maintenance_mode", checked);
                }}
              />
            </div>

            <div className="flex items-center justify-between p-4 bg-muted/30 rounded-xl">
              <div>
                <Label className="text-foreground">Allow New Signups</Label>
                <p className="text-sm text-muted-foreground">
                  Enable new user registrations
                </p>
              </div>
              <Switch
                checked={platformSettings.allowNewSignups}
                onCheckedChange={(checked) => {
                  setPlatformSettings((prev) => ({ ...prev, allowNewSignups: checked }));
                  savePlatformSetting("allow_new_signups", checked);
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="trialDays">Default Trial Days</Label>
              <Input
                id="trialDays"
                type="number"
                value={platformSettings.defaultTrialDays}
                onChange={(e) =>
                  setPlatformSettings((prev) => ({
                    ...prev,
                    defaultTrialDays: parseInt(e.target.value) || 14,
                  }))
                }
                onBlur={() =>
                  savePlatformSetting("default_trial_days", platformSettings.defaultTrialDays)
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="supportEmail">Support Email</Label>
              <Input
                id="supportEmail"
                type="email"
                value={platformSettings.supportEmail}
                onChange={(e) =>
                  setPlatformSettings((prev) => ({
                    ...prev,
                    supportEmail: e.target.value,
                  }))
                }
                onBlur={() =>
                  savePlatformSetting("support_email", platformSettings.supportEmail)
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Subscription Plans */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              <CardTitle>Subscription Plans</CardTitle>
            </div>
            <Button onClick={openNewPlanDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Add Plan
            </Button>
          </div>
          <CardDescription>Manage platform subscription tiers</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plan Name</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Projects</TableHead>
                  <TableHead>Subscribers</TableHead>
                  <TableHead>Billing</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((plan) => (
                  <TableRow key={plan.id}>
                    <TableCell className="font-medium text-foreground">
                      {plan.plan_name}
                    </TableCell>
                    <TableCell>
                      ${Number(plan.price).toFixed(2)}
                    </TableCell>
                    <TableCell>{plan.max_projects}</TableCell>
                    <TableCell>{plan.max_subscribers.toLocaleString()}</TableCell>
                    <TableCell className="capitalize">{plan.billing_cycle}</TableCell>
                    <TableCell>
                      <Badge variant={plan.is_active ? "default" : "secondary"}>
                        {plan.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingPlan(plan);
                            setIsNewPlan(false);
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => handleDeletePlan(plan.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {plans.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <p className="text-muted-foreground">No plans configured</p>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Edit Plan Dialog */}
      <Dialog open={!!editingPlan} onOpenChange={() => setEditingPlan(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{isNewPlan ? "Create Plan" : "Edit Plan"}</DialogTitle>
          </DialogHeader>

          {editingPlan && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="planName">Plan Name</Label>
                  <Input
                    id="planName"
                    value={editingPlan.plan_name}
                    onChange={(e) =>
                      setEditingPlan({ ...editingPlan, plan_name: e.target.value })
                    }
                    placeholder="e.g., Pro Plan"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="planSlug">Plan Slug</Label>
                  <Input
                    id="planSlug"
                    value={editingPlan.plan_slug}
                    onChange={(e) =>
                      setEditingPlan({ ...editingPlan, plan_slug: e.target.value })
                    }
                    placeholder="e.g., pro"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="price">Price (USD)</Label>
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    value={editingPlan.price}
                    onChange={(e) =>
                      setEditingPlan({
                        ...editingPlan,
                        price: parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="billing">Billing Cycle</Label>
                  <Input
                    id="billing"
                    value={editingPlan.billing_cycle || ""}
                    onChange={(e) =>
                      setEditingPlan({ ...editingPlan, billing_cycle: e.target.value })
                    }
                    placeholder="monthly"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="maxProjects">Max Projects</Label>
                  <Input
                    id="maxProjects"
                    type="number"
                    value={editingPlan.max_projects}
                    onChange={(e) =>
                      setEditingPlan({
                        ...editingPlan,
                        max_projects: parseInt(e.target.value) || 1,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxSubscribers">Max Subscribers</Label>
                  <Input
                    id="maxSubscribers"
                    type="number"
                    value={editingPlan.max_subscribers}
                    onChange={(e) =>
                      setEditingPlan({
                        ...editingPlan,
                        max_subscribers: parseInt(e.target.value) || 100,
                      })
                    }
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-muted/30 rounded-xl">
                <Label htmlFor="isActive">Active</Label>
                <Switch
                  id="isActive"
                  checked={editingPlan.is_active ?? true}
                  onCheckedChange={(checked) =>
                    setEditingPlan({ ...editingPlan, is_active: checked })
                  }
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingPlan(null)}>
              Cancel
            </Button>
            <Button onClick={handleSavePlan}>
              <Save className="h-4 w-4 mr-2" />
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
