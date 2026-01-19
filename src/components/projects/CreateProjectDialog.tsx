import { useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Bot, 
  Hash, 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  AlertTriangle, 
  Crown,
  ArrowLeft,
  ArrowRight,
  Sparkles,
  Package,
  ExternalLink,
  Info
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

const projectSchema = z.object({
  project_name: z.string().min(3, "Name must be at least 3 characters").max(50, "Name must be less than 50 characters"),
  bot_token: z.string().regex(/^\d+:[A-Za-z0-9_-]+$/, "Invalid bot token format"),
  channel_id: z.string().regex(/^(-100\d+|@\w+)$/, "Channel ID must start with -100 or @username"),
  support_contact: z.string().optional(),
});

type ProjectFormData = z.infer<typeof projectSchema>;

interface ValidationResult {
  valid: boolean;
  error?: string;
  step?: string;
  bot?: { id: number; username: string; first_name: string };
  channel?: { id: number; title: string; type: string; username?: string };
}

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

type Step = "info" | "bot" | "success";

const STEPS: { key: Step; label: string; icon: React.ReactNode }[] = [
  { key: "info", label: "Basic Info", icon: <Sparkles className="h-4 w-4" /> },
  { key: "bot", label: "Bot Setup", icon: <Bot className="h-4 w-4" /> },
  { key: "success", label: "Complete", icon: <CheckCircle2 className="h-4 w-4" /> },
];

export function CreateProjectDialog({ open, onOpenChange, onSuccess }: CreateProjectDialogProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const limits = useSubscriptionLimits();
  const [currentStep, setCurrentStep] = useState<Step>("info");
  const [isValidating, setIsValidating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);

  const isAtLimit = !limits.loading && !limits.canAddProject;
  const form = useForm<ProjectFormData>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      project_name: "",
      bot_token: "",
      channel_id: "",
      support_contact: "",
    },
  });

  const currentStepIndex = STEPS.findIndex(s => s.key === currentStep);

  const handleValidate = async () => {
    const botToken = form.getValues("bot_token");
    const channelId = form.getValues("channel_id");

    if (!botToken || !channelId) {
      toast.error("Please enter bot token and channel ID first");
      return;
    }

    setIsValidating(true);
    setValidationResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("validate-project-setup", {
        body: { bot_token: botToken, channel_id: channelId },
      });

      if (error) {
        setValidationResult({ valid: false, error: error.message });
        return;
      }

      setValidationResult(data);

      if (data.valid) {
        toast.success("Validation successful!", {
          description: `Bot: @${data.bot.username} | Channel: ${data.channel.title}`,
        });
      } else {
        toast.error("Validation failed", { description: data.error });
      }
    } catch (error: any) {
      setValidationResult({ valid: false, error: error.message });
      toast.error("Validation failed", { description: error.message });
    } finally {
      setIsValidating(false);
    }
  };

  const onSubmit = async (data: ProjectFormData) => {
    if (!validationResult?.valid) {
      toast.error("Please validate your bot and channel first");
      return;
    }

    if (!user) {
      toast.error("You must be logged in to create a project");
      return;
    }

    setIsSubmitting(true);

    try {
      const { data: newProject, error } = await supabase.from("projects").insert({
        user_id: user.id,
        project_name: data.project_name,
        bot_token: data.bot_token,
        channel_id: data.channel_id,
        support_contact: data.support_contact || null,
        admin_telegram_id: validationResult.bot?.id || null,
        admin_username: validationResult.bot?.username || null,
        status: "active",
        stripe_config: { enabled: false },
        manual_payment_config: { enabled: true, instructions: "" },
      }).select("id").single();

      if (error) throw error;

      setCreatedProjectId(newProject.id);

      // Auto-setup webhook for the bot
      const { data: webhookResult, error: webhookError } = await supabase.functions.invoke(
        "setup-telegram-webhook",
        {
          body: {
            bot_token: data.bot_token,
            project_id: newProject.id,
          },
        }
      );

      if (webhookError || !webhookResult?.success) {
        console.error("Webhook setup failed:", webhookError || webhookResult?.error);
      }

      setCurrentStep("success");
      onSuccess();
    } catch (error: any) {
      toast.error("Failed to create project", { description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    form.reset();
    setValidationResult(null);
    setCurrentStep("info");
    setCreatedProjectId(null);
    onOpenChange(false);
  };

  const handleNextStep = async () => {
    if (currentStep === "info") {
      const isValid = await form.trigger(["project_name", "support_contact"]);
      if (isValid) {
        setCurrentStep("bot");
      }
    }
  };

  const handlePrevStep = () => {
    if (currentStep === "bot") {
      setCurrentStep("info");
    }
  };

  const canProceedToBot = form.watch("project_name")?.length >= 3;

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            Create New Project
          </SheetTitle>
          <SheetDescription>
            Set up a new Telegram channel with automated subscription management.
          </SheetDescription>
        </SheetHeader>

        {/* Step Indicator */}
        {currentStep !== "success" && (
          <div className="mt-6 mb-6">
            <div className="flex items-center justify-between">
              {STEPS.slice(0, 2).map((step, index) => (
                <div key={step.key} className="flex items-center flex-1">
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        "h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors",
                        currentStepIndex > index
                          ? "bg-primary text-primary-foreground"
                          : currentStepIndex === index
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {currentStepIndex > index ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        step.icon
                      )}
                    </div>
                    <span
                      className={cn(
                        "text-sm font-medium hidden sm:block",
                        currentStepIndex >= index
                          ? "text-foreground"
                          : "text-muted-foreground"
                      )}
                    >
                      {step.label}
                    </span>
                  </div>
                  {index < 1 && (
                    <div
                      className={cn(
                        "flex-1 h-0.5 mx-3",
                        currentStepIndex > index ? "bg-primary" : "bg-muted"
                      )}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Limit Warning */}
        {isAtLimit && currentStep !== "success" && (
          <Alert className="mb-4 border-warning/50 bg-warning/10">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <AlertDescription className="flex items-center justify-between">
              <span className="text-sm">
                You've reached your project limit ({limits.currentProjects}/{limits.maxProjects}).
              </span>
              <Button
                variant="warning"
                size="sm"
                onClick={() => {
                  handleClose();
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
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Step 1: Basic Info */}
            {currentStep === "info" && (
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="project_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Project Name</FormLabel>
                      <FormControl>
                        <Input placeholder="My Premium Channel" {...field} />
                      </FormControl>
                      <FormDescription>A friendly name for your project (3-50 characters)</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="support_contact"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Support Contact (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="@yourusername or support email" {...field} />
                      </FormControl>
                      <FormDescription>
                        How subscribers can contact you for support
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={handleClose} className="flex-1">
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    className="flex-1 gap-2"
                    onClick={handleNextStep}
                    disabled={!canProceedToBot || isAtLimit}
                  >
                    Next
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Step 2: Bot Setup */}
            {currentStep === "bot" && (
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="bot_token"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Bot className="h-4 w-4" />
                        Bot Token
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="123456789:ABCdefGHIjklMNOpqrSTUvwxYZ"
                          type="password"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription className="flex items-center gap-1">
                        <Info className="h-3 w-3" />
                        Get this from @BotFather on Telegram. Keep it secret!
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="channel_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Hash className="h-4 w-4" />
                        Channel ID
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="-1001234567890 or @channelname" {...field} />
                      </FormControl>
                      <FormDescription className="flex items-center gap-1">
                        <Info className="h-3 w-3" />
                        The numeric ID (starts with -100) or @username of your channel
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Validation Section */}
                <Card className={cn(
                  "transition-colors",
                  validationResult?.valid 
                    ? "border-green-500/50 bg-green-500/5" 
                    : validationResult && !validationResult.valid
                    ? "border-destructive/50 bg-destructive/5"
                    : "border-border bg-muted/30"
                )}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Validation Status</span>
                      {validationResult && (
                        <Badge variant={validationResult.valid ? "success" : "destructive"}>
                          {validationResult.valid ? (
                            <><CheckCircle2 className="h-3 w-3 mr-1" /> Verified</>
                          ) : (
                            <><XCircle className="h-3 w-3 mr-1" /> Failed</>
                          )}
                        </Badge>
                      )}
                    </div>

                    {validationResult?.valid && (
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2 p-2 rounded-md bg-green-500/10">
                          <Bot className="h-4 w-4 text-green-600" />
                          <span className="text-foreground font-medium">@{validationResult.bot?.username}</span>
                          <span className="text-muted-foreground">({validationResult.bot?.first_name})</span>
                        </div>
                        <div className="flex items-center gap-2 p-2 rounded-md bg-green-500/10">
                          <Hash className="h-4 w-4 text-green-600" />
                          <span className="text-foreground font-medium">{validationResult.channel?.title}</span>
                        </div>
                      </div>
                    )}

                    {validationResult && !validationResult.valid && (
                      <div className="flex items-start gap-2 text-sm p-2 rounded-md bg-destructive/10 text-destructive">
                        <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <span>{validationResult.error}</span>
                      </div>
                    )}

                    <Button
                      type="button"
                      variant={validationResult?.valid ? "outline" : "default"}
                      className="w-full gap-2"
                      onClick={handleValidate}
                      disabled={isValidating}
                    >
                      {isValidating ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Validating...
                        </>
                      ) : validationResult?.valid ? (
                        <>
                          <CheckCircle2 className="h-4 w-4" />
                          Re-validate
                        </>
                      ) : (
                        "Validate Bot & Channel"
                      )}
                    </Button>
                  </CardContent>
                </Card>

                <div className="flex gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={handlePrevStep} className="gap-2">
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={isSubmitting || !validationResult?.valid || isAtLimit}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      "Create Project"
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* Step 3: Success */}
            {currentStep === "success" && (
              <div className="space-y-6 text-center py-4">
                <div className="mx-auto h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center">
                  <CheckCircle2 className="h-8 w-8 text-green-600" />
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-1">
                    Project Created Successfully!
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Your bot is configured and ready to accept subscribers.
                  </p>
                </div>

                <Card className="text-left">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Bot className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{form.getValues("project_name")}</p>
                        <p className="text-sm text-muted-foreground">
                          @{validationResult?.bot?.username}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="space-y-2">
                  <Button 
                    type="button" 
                    className="w-full gap-2"
                    onClick={() => {
                      handleClose();
                      // Trigger plans dialog opening via parent
                    }}
                  >
                    <Package className="h-4 w-4" />
                    Add Subscription Plans
                  </Button>
                  
                  {validationResult?.bot?.username && (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full gap-2"
                      onClick={() => window.open(`https://t.me/${validationResult.bot?.username}`, "_blank")}
                    >
                      <ExternalLink className="h-4 w-4" />
                      Open Bot in Telegram
                    </Button>
                  )}

                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={handleClose}
                  >
                    Close
                  </Button>
                </div>
              </div>
            )}
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}