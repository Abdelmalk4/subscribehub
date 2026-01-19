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
import { Switch } from "@/components/ui/switch";
import { 
  Package, 
  Plus, 
  Loader2, 
  Pencil, 
  Trash2, 
  DollarSign, 
  Calendar,
  ArrowLeft,
  Copy,
  Sparkles,
  Users,
  ChevronRight,
  Info
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
  is_active: z.boolean(),
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
  { label: "1 Week", value: "7", icon: "📅" },
  { label: "1 Month", value: "30", icon: "📆" },
  { label: "3 Months", value: "90", icon: "🗓️" },
  { label: "6 Months", value: "180", icon: "📊" },
  { label: "1 Year", value: "365", icon: "🎯" },
];

const CURRENCIES = [
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "GBP", symbol: "£", name: "British Pound" },
  { code: "AED", symbol: "د.إ", name: "UAE Dirham" },
  { code: "SAR", symbol: "﷼", name: "Saudi Riyal" },
];

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
      is_active: true,
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
      setShowForm(false);
      setEditingPlan(null);
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
      is_active: plan.is_active ?? true,
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
      is_active: true,
    });
    setShowForm(true);
  };

  const handleDuplicate = (plan: Plan) => {
    setEditingPlan(null);
    form.reset({
      plan_name: `${plan.plan_name} (Copy)`,
      price: plan.price.toString(),
      currency: plan.currency || "USD",
      duration_days: plan.duration_days.toString(),
      description: plan.description || "",
      stripe_price_id: "",
      is_active: true,
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
        is_active: data.is_active,
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
    const curr = CURRENCIES.find(c => c.code === currency) || CURRENCIES[0];
    return `${curr.symbol}${price.toFixed(2)}`;
  };

  const selectedCurrency = CURRENCIES.find(c => c.code === form.watch("currency")) || CURRENCIES[0];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center gap-2">
            {showForm && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 -ml-2"
                onClick={() => {
                  setShowForm(false);
                  setEditingPlan(null);
                }}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div>
              <SheetTitle className="flex items-center gap-2">
                <Package className="h-5 w-5 text-primary" />
                {showForm 
                  ? editingPlan 
                    ? "Edit Plan" 
                    : "New Plan"
                  : "Subscription Plans"
                }
              </SheetTitle>
              <SheetDescription>
                {showForm
                  ? `Configure your ${editingPlan ? "" : "new "}subscription plan`
                  : `Manage plans for ${projectName}`
                }
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="mt-6">
          {!showForm ? (
            <div className="space-y-4">
              <Button onClick={handleNewPlan} className="w-full gap-2">
                <Plus className="h-4 w-4" />
                Add New Plan
              </Button>

              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : plans.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                      <Sparkles className="h-7 w-7 text-primary" />
                    </div>
                    <h3 className="font-semibold text-foreground mb-1">No plans yet</h3>
                    <p className="text-sm text-muted-foreground mb-4 max-w-[240px]">
                      Create your first subscription plan to start accepting subscribers
                    </p>
                    <Button onClick={handleNewPlan} size="sm" className="gap-2">
                      <Plus className="h-4 w-4" />
                      Create Your First Plan
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {plans.map((plan) => (
                    <Card 
                      key={plan.id} 
                      className={cn(
                        "transition-all hover:shadow-sm",
                        !plan.is_active && "opacity-60"
                      )}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-foreground truncate">{plan.plan_name}</h3>
                              {plan.is_active ? (
                                <Badge variant="success" className="text-xs">Active</Badge>
                              ) : (
                                <Badge variant="secondary" className="text-xs">Inactive</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1 font-medium text-foreground">
                                <DollarSign className="h-3.5 w-3.5 text-primary" />
                                {formatPrice(plan.price, plan.currency)}
                              </span>
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3.5 w-3.5" />
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
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => handleDuplicate(plan)}
                                  >
                                    <Copy className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Duplicate</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleEdit(plan)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
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
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                {/* Plan Details Section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Package className="h-4 w-4" />
                    Plan Details
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

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description (Optional)</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Full access to premium content..."
                            className="resize-none"
                            {...field}
                          />
                        </FormControl>
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Shown to subscribers when selecting a plan</span>
                          <span>{(field.value || "").length}/200</span>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="is_active"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <FormLabel className="text-sm font-medium">Active</FormLabel>
                          <FormDescription className="text-xs">
                            Only active plans are shown to subscribers
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                {/* Pricing Section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <DollarSign className="h-4 w-4" />
                    Pricing
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="price"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Price</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                                {selectedCurrency.symbol}
                              </span>
                              <Input 
                                type="number" 
                                step="0.01" 
                                placeholder="10.00" 
                                className="pl-7"
                                {...field} 
                              />
                            </div>
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
                                <SelectItem key={currency.code} value={currency.code}>
                                  <span className="flex items-center gap-2">
                                    <span className="text-muted-foreground">{currency.symbol}</span>
                                    {currency.code}
                                  </span>
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
                        <div className="grid grid-cols-5 gap-2 mb-3">
                          {DURATION_PRESETS.map((preset) => (
                            <Button
                              key={preset.value}
                              type="button"
                              variant={field.value === preset.value ? "default" : "outline"}
                              size="sm"
                              className="flex-col h-auto py-2 px-1"
                              onClick={() => field.onChange(preset.value)}
                            >
                              <span className="text-lg mb-0.5">{preset.icon}</span>
                              <span className="text-[10px]">{preset.label}</span>
                            </Button>
                          ))}
                        </div>
                        <FormControl>
                          <div className="relative">
                            <Input
                              type="number"
                              placeholder="Custom days"
                              {...field}
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                              days
                            </span>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Advanced Section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Info className="h-4 w-4" />
                    Advanced (Optional)
                  </div>

                  <FormField
                    control={form.control}
                    name="stripe_price_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Stripe Price ID</FormLabel>
                        <FormControl>
                          <Input placeholder="price_1234..." {...field} />
                        </FormControl>
                        <FormDescription>
                          Link to an existing Stripe price for automated billing
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setShowForm(false);
                      setEditingPlan(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
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
                </div>
              </form>
            </Form>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}