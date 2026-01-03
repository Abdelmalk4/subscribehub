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
import { Bot, Hash, Loader2, CheckCircle2, XCircle, AlertCircle, AlertTriangle, Crown } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { useNavigate } from "react-router-dom";

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

export function CreateProjectDialog({ open, onOpenChange, onSuccess }: CreateProjectDialogProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const limits = useSubscriptionLimits();
  const [isValidating, setIsValidating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);

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
      // Create the project first
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

      if (webhookError) {
        console.error("Webhook setup failed:", webhookError);
        toast.warning("Project created, but webhook setup failed", {
          description: "You may need to manually configure the bot webhook.",
        });
      } else if (!webhookResult?.success) {
        console.error("Webhook setup unsuccessful:", webhookResult?.error);
        toast.warning("Project created, but webhook setup failed", {
          description: webhookResult?.error || "You may need to manually configure the bot webhook.",
        });
      } else {
        toast.success("Project created successfully!", {
          description: "Bot webhook configured automatically. Your channel is ready!",
        });
      }

      form.reset();
      setValidationResult(null);
      onOpenChange(false);
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
    onOpenChange(false);
  };

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

        {/* Limit Warning */}
        {isAtLimit && (
          <Alert className="mt-4 border-warning/50 bg-warning/10">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <AlertDescription className="flex items-center justify-between">
              <span>
                You've reached your project limit ({limits.currentProjects}/{limits.maxProjects}).
                Upgrade to add more projects.
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
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 mt-6">
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
                  <FormDescription>
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
                  <FormDescription>
                    The numeric ID (starts with -100) or @username of your channel
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Validation Section */}
            <div className="space-y-3 p-4 rounded-lg bg-muted/30 border border-border/50">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Validation Status</span>
                {validationResult && (
                  <Badge variant={validationResult.valid ? "success" : "destructive"}>
                    {validationResult.valid ? (
                      <><CheckCircle2 className="h-3 w-3 mr-1" /> Valid</>
                    ) : (
                      <><XCircle className="h-3 w-3 mr-1" /> Invalid</>
                    )}
                  </Badge>
                )}
              </div>

              {validationResult?.valid && (
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Bot className="h-4 w-4 text-success" />
                    <span>Bot: @{validationResult.bot?.username}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Hash className="h-4 w-4 text-success" />
                    <span>Channel: {validationResult.channel?.title}</span>
                  </div>
                </div>
              )}

              {validationResult && !validationResult.valid && (
                <div className="flex items-start gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 mt-0.5" />
                  <span>{validationResult.error}</span>
                </div>
              )}

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleValidate}
                disabled={isValidating}
              >
                {isValidating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Validating...
                  </>
                ) : (
                  "Validate Bot & Channel"
                )}
              </Button>
            </div>

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
                type="submit"
                variant="gradient"
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
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
