import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Package, Plus, Loader2, Pencil, Trash2, DollarSign, Calendar } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const planSchema = z.object({
  plan_name: z.string().min(2, "Name must be at least 2 characters").max(50),
  price: z.string().refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) >= 0, {
    message: "Price must be a valid number",
  }),
  currency: z.string().min(1, "Select a currency"),
  duration_days: z.string().refine((val) => !isNaN(parseInt(val)) && parseInt(val) > 0, {
    message: "Duration must be a positive number",
  }),
  description: z.string().optional(),
  stripe_price_id: z.string().optional(),
});

type PlanFormData = z.infer<typeof planSchema>;

interface Plan {
  id: string;
  plan_name: string;
  price: number;
  currency: string | null;
  duration_days: number;
  description: string | null;
  stripe_price_id: string | null;
  is_active: boolean | null;
}

interface PlansDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | null;
  projectName: string;
}

const DURATION_PRESETS = [
  { label: "7 days", value: "7" },
  { label: "30 days", value: "30" },
  { label: "90 days", value: "90" },
  { label: "180 days", value: "180" },
  { label: "365 days", value: "365" },
];

const CURRENCIES = ["USD", "EUR", "GBP", "AED", "SAR"];

export function PlansDialog({ open, onOpenChange, projectId, projectName }: PlansDialogProps) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [showForm, setShowForm] = useState(false);

  const form = useForm<PlanFormData>({
    resolver: zodResolver(planSchema),
    defaultValues: {
      plan_name: "",
      price: "",
      currency: "USD",
      duration_days: "30",
      description: "",
      stripe_price_id: "",
    },
  });

  const fetchPlans = async () => {
    if (!projectId) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("plans")
        .select("*")
        .eq("project_id", projectId)
        .order("price", { ascending: true });

      if (error) throw error;
      setPlans(data || []);
    } catch (error: any) {
      toast.error("Failed to load plans", { description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (open && projectId) {
      fetchPlans();
    }
  }, [open, projectId]);

  const handleEdit = (plan: Plan) => {
    setEditingPlan(plan);
    form.reset({
      plan_name: plan.plan_name,
      price: plan.price.toString(),
      currency: plan.currency || "USD",
      duration_days: plan.duration_days.toString(),
      description: plan.description || "",
      stripe_price_id: plan.stripe_price_id || "",
    });
    setShowForm(true);
  };

  const handleNewPlan = () => {
    setEditingPlan(null);
    form.reset({
      plan_name: "",
      price: "",
      currency: "USD",
      duration_days: "30",
      description: "",
      stripe_price_id: "",
    });
    setShowForm(true);
  };

  const handleDelete = async (planId: string) => {
    try {
      const { error } = await supabase.from("plans").delete().eq("id", planId);
      if (error) throw error;

      toast.success("Plan deleted successfully!");
      fetchPlans();
    } catch (error: any) {
      toast.error("Failed to delete plan", { description: error.message });
    }
  };

  const onSubmit = async (data: PlanFormData) => {
    if (!projectId) return;

    setIsSaving(true);

    try {
      const planData = {
        project_id: projectId,
        plan_name: data.plan_name,
        price: parseFloat(data.price),
        currency: data.currency,
        duration_days: parseInt(data.duration_days),
        description: data.description || null,
        stripe_price_id: data.stripe_price_id || null,
        is_active: true,
      };

      if (editingPlan) {
        const { error } = await supabase
          .from("plans")
          .update(planData)
          .eq("id", editingPlan.id);
        if (error) throw error;
        toast.success("Plan updated successfully!");
      } else {
        const { error } = await supabase.from("plans").insert(planData);
        if (error) throw error;
        toast.success("Plan created successfully!");
      }

      setShowForm(false);
      setEditingPlan(null);
      form.reset();
      fetchPlans();
    } catch (error: any) {
      toast.error("Failed to save plan", { description: error.message });
    } finally {
      setIsSaving(false);
    }
  };

  const formatPrice = (price: number, currency: string | null) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
    }).format(price);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Subscription Plans
          </SheetTitle>
          <SheetDescription>
            Manage subscription plans for {projectName}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {!showForm ? (
            <>
              <Button onClick={handleNewPlan} className="w-full gap-2">
                <Plus className="h-4 w-4" />
                Add New Plan
              </Button>

              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : plans.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No plans yet</p>
                  <p className="text-sm">Create your first subscription plan</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {plans.map((plan) => (
                    <Card key={plan.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold text-foreground">{plan.plan_name}</h3>
                              {plan.is_active ? (
                                <Badge variant="success" className="text-xs">Active</Badge>
                              ) : (
                                <Badge variant="secondary" className="text-xs">Inactive</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <DollarSign className="h-3 w-3" />
                                {formatPrice(plan.price, plan.currency)}
                              </span>
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {plan.duration_days} days
                              </span>
                            </div>
                            {plan.description && (
                              <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                                {plan.description}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => handleEdit(plan)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon-sm">
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Plan?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will permanently delete "{plan.plan_name}". Active subscribers
                                    will keep their current subscription.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDelete(plan.id)}
                                    className="bg-destructive text-destructive-foreground"
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold">
                    {editingPlan ? "Edit Plan" : "New Plan"}
                  </h3>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowForm(false);
                      setEditingPlan(null);
                    }}
                  >
                    Cancel
                  </Button>
                </div>

                <FormField
                  control={form.control}
                  name="plan_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Plan Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Monthly Access" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="price"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Price</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" placeholder="10.00" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="currency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Currency</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select currency" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {CURRENCIES.map((currency) => (
                              <SelectItem key={currency} value={currency}>
                                {currency}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="duration_days"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Duration</FormLabel>
                      <div className="flex flex-wrap gap-2 mb-2">
                        {DURATION_PRESETS.map((preset) => (
                          <Button
                            key={preset.value}
                            type="button"
                            variant={field.value === preset.value ? "default" : "outline"}
                            size="sm"
                            onClick={() => field.onChange(preset.value)}
                          >
                            {preset.label}
                          </Button>
                        ))}
                      </div>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="Custom days"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>Number of days for this subscription</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (Optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Full access to premium content..."
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="stripe_price_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Stripe Price ID (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="price_1234..." {...field} />
                      </FormControl>
                      <FormDescription>
                        If you have an existing Stripe price
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : editingPlan ? (
                    "Update Plan"
                  ) : (
                    "Create Plan"
                  )}
                </Button>
              </form>
            </Form>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
