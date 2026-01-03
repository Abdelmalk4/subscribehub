import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, UserPlus, AlertTriangle, Crown } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { useNavigate } from "react-router-dom";

const subscriberSchema = z.object({
  telegram_user_id: z.string().regex(/^\d+$/, "Must be a valid Telegram user ID"),
  username: z.string().optional(),
  first_name: z.string().optional(),
  project_id: z.string().min(1, "Select a project"),
  plan_id: z.string().min(1, "Select a plan"),
  notes: z.string().optional(),
});

type SubscriberFormData = z.infer<typeof subscriberSchema>;

interface Project {
  id: string;
  project_name: string;
}

interface Plan {
  id: string;
  plan_name: string;
  price: number;
  currency: string | null;
  duration_days: number;
}

interface AddSubscriberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: Project[];
  onSuccess: () => void;
}

export function AddSubscriberDialog({ open, onOpenChange, projects, onSuccess }: AddSubscriberDialogProps) {
  const navigate = useNavigate();
  const limits = useSubscriptionLimits();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);

  const isAtLimit = !limits.loading && !limits.canAddSubscriber;
  const form = useForm<SubscriberFormData>({
    resolver: zodResolver(subscriberSchema),
    defaultValues: {
      telegram_user_id: "",
      username: "",
      first_name: "",
      project_id: "",
      plan_id: "",
      notes: "",
    },
  });

  const selectedProjectId = form.watch("project_id");

  const fetchPlans = async (projectId: string) => {
    setLoadingPlans(true);
    try {
      const { data, error } = await supabase
        .from("plans")
        .select("id, plan_name, price, currency, duration_days")
        .eq("project_id", projectId)
        .eq("is_active", true);

      if (error) throw error;
      setPlans(data || []);
      form.setValue("plan_id", "");
    } catch (error: any) {
      toast.error("Failed to load plans");
      setPlans([]);
    } finally {
      setLoadingPlans(false);
    }
  };

  const handleProjectChange = (projectId: string) => {
    form.setValue("project_id", projectId);
    if (projectId) {
      fetchPlans(projectId);
    } else {
      setPlans([]);
    }
  };

  const onSubmit = async (data: SubscriberFormData) => {
    setIsSubmitting(true);

    try {
      const selectedPlan = plans.find((p) => p.id === data.plan_id);
      const startDate = new Date();
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + (selectedPlan?.duration_days || 30));

      const { error } = await supabase.from("subscribers").insert({
        telegram_user_id: parseInt(data.telegram_user_id),
        username: data.username || null,
        first_name: data.first_name || null,
        project_id: data.project_id,
        plan_id: data.plan_id,
        status: "active",
        payment_method: "manual",
        start_date: startDate.toISOString(),
        expiry_date: expiryDate.toISOString(),
        notes: data.notes || null,
        expiry_reminder_sent: false,
        final_reminder_sent: false,
      });

      if (error) throw error;

      toast.success("Subscriber added successfully!");
      form.reset();
      setPlans([]);
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      if (error.message?.includes("duplicate key")) {
        toast.error("This user is already subscribed to this project");
      } else {
        toast.error("Failed to add subscriber", { description: error.message });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    form.reset();
    setPlans([]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Add Subscriber
          </DialogTitle>
          <DialogDescription>
            Manually add a subscriber with an active subscription.
          </DialogDescription>
        </DialogHeader>

        {/* Limit Warning */}
        {isAtLimit && (
          <Alert className="border-warning/50 bg-warning/10">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <AlertDescription className="flex items-center justify-between">
              <span>
                You've reached your subscriber limit ({limits.currentSubscribers}/{limits.maxSubscribers}).
              </span>
              <Button
                variant="warning"
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                  navigate("/billing");
                }}
              >
                <Crown className="h-4 w-4 mr-1" />
                Upgrade
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="telegram_user_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Telegram User ID *</FormLabel>
                  <FormControl>
                    <Input placeholder="123456789" {...field} />
                  </FormControl>
                  <FormDescription>
                    The numeric Telegram user ID
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username</FormLabel>
                    <FormControl>
                      <Input placeholder="john_doe" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="first_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First Name</FormLabel>
                    <FormControl>
                      <Input placeholder="John" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="project_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Project *</FormLabel>
                  <Select onValueChange={handleProjectChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a project" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.project_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="plan_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Plan *</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={!selectedProjectId || loadingPlans}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            loadingPlans
                              ? "Loading plans..."
                              : !selectedProjectId
                              ? "Select a project first"
                              : "Select a plan"
                          }
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {plans.map((plan) => (
                        <SelectItem key={plan.id} value={plan.id}>
                          {plan.plan_name} - {plan.currency || "USD"} {plan.price} ({plan.duration_days} days)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Optional admin notes..."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" onClick={handleClose} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" variant="gradient" className="flex-1" disabled={isSubmitting || isAtLimit}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Adding...
                  </>
                ) : (
                  "Add Subscriber"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
