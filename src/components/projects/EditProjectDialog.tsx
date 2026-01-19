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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Settings, 
  CreditCard, 
  Wallet, 
  Loader2, 
  Trash2, 
  Webhook, 
  Check, 
  Copy, 
  ExternalLink, 
  CheckCircle2, 
  XCircle, 
  Unlink,
  AlertTriangle,
  Info,
  Zap
} from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const projectSchema = z.object({
  project_name: z.string().min(3).max(50),
  support_contact: z.string().optional(),
  stripe_enabled: z.boolean(),
  manual_enabled: z.boolean(),
  manual_instructions: z.string().optional(),
});

type ProjectFormData = z.infer<typeof projectSchema>;

interface Project {
  id: string;
  project_name: string;
  bot_token: string;
  channel_id: string;
  support_contact: string | null;
  status: string | null;
  admin_telegram_id: number | null;
  admin_username: string | null;
  stripe_config: any;
  manual_payment_config: any;
}

interface EditProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project | null;
  onSuccess: () => void;
}

export function EditProjectDialog({ open, onOpenChange, project, onSuccess }: EditProjectDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSettingWebhook, setIsSettingWebhook] = useState(false);
  const [webhookStatus, setWebhookStatus] = useState<"idle" | "success" | "error">("idle");
  const [copied, setCopied] = useState(false);
  const [isConnectingStripe, setIsConnectingStripe] = useState(false);
  const [isDisconnectingStripe, setIsDisconnectingStripe] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const webhookUrl = project
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/telegram-bot-handler?project_id=${project.id}`
    : "";

  const form = useForm<ProjectFormData>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      project_name: "",
      support_contact: "",
      stripe_enabled: false,
      manual_enabled: true,
      manual_instructions: "",
    },
  });

  useEffect(() => {
    if (project) {
      form.reset({
        project_name: project.project_name,
        support_contact: project.support_contact || "",
        stripe_enabled: project.stripe_config?.enabled || false,
        manual_enabled: project.manual_payment_config?.enabled ?? true,
        manual_instructions: project.manual_payment_config?.instructions || "",
      });
      setHasUnsavedChanges(false);
    }
  }, [project, form]);

  // Track form changes
  useEffect(() => {
    const subscription = form.watch(() => {
      setHasUnsavedChanges(true);
    });
    return () => subscription.unsubscribe();
  }, [form]);

  // Check if Stripe is connected via Connect
  const isStripeConnected = project?.stripe_config?.connected && project?.stripe_config?.stripe_account_id;
  const stripeAccountName = project?.stripe_config?.account_name;
  const stripeLivemode = project?.stripe_config?.livemode;

  const onSubmit = async (data: ProjectFormData) => {
    if (!project) return;

    setIsSubmitting(true);

    try {
      // Preserve existing stripe_config, just update enabled flag
      const stripeConfig = {
        ...project.stripe_config,
        enabled: data.stripe_enabled,
      };

      const manualConfig = {
        enabled: data.manual_enabled,
        instructions: data.manual_instructions || "",
      };

      const { error } = await supabase
        .from("projects")
        .update({
          project_name: data.project_name,
          support_contact: data.support_contact || null,
          stripe_config: stripeConfig,
          manual_payment_config: manualConfig,
        })
        .eq("id", project.id);

      if (error) throw error;

      toast.success("Project updated successfully!");
      setHasUnsavedChanges(false);
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      toast.error("Failed to update project", { description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!project) return;

    setIsDeleting(true);

    try {
      const { error } = await supabase.from("projects").delete().eq("id", project.id);

      if (error) throw error;

      toast.success("Project deleted successfully!");
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      toast.error("Failed to delete project", { description: error.message });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSetupWebhook = async () => {
    if (!project) return;

    setIsSettingWebhook(true);
    setWebhookStatus("idle");

    try {
      const response = await fetch(
        `https://api.telegram.org/bot${project.bot_token}/setWebhook`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: webhookUrl }),
        }
      );

      const data = await response.json();

      if (data.ok) {
        setWebhookStatus("success");
        toast.success("Webhook configured successfully!", {
          description: "Your bot is now ready to receive messages.",
        });
      } else {
        setWebhookStatus("error");
        toast.error("Failed to set webhook", { description: data.description });
      }
    } catch (error: any) {
      setWebhookStatus("error");
      toast.error("Failed to set webhook", { description: error.message });
    } finally {
      setIsSettingWebhook(false);
    }
  };

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    toast.success("Webhook URL copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleConnectStripe = async () => {
    if (!project) return;

    setIsConnectingStripe(true);

    try {
      const { data, error } = await supabase.functions.invoke("stripe-connect-oauth", {
        body: { 
          action: "get_connect_url",
          project_id: project.id 
        },
      });

      if (error) throw error;

      if (data.connect_url) {
        window.open(data.connect_url, "_blank", "width=600,height=800");
        toast.info("Complete the Stripe connection in the new window", {
          description: "Return here after authorizing to see your connection status.",
        });
      } else {
        throw new Error("No connect URL received");
      }
    } catch (error: any) {
      console.error("Stripe connect error:", error);
      toast.error("Failed to start Stripe connection", { description: error.message });
    } finally {
      setIsConnectingStripe(false);
    }
  };

  const handleDisconnectStripe = async () => {
    if (!project) return;

    setIsDisconnectingStripe(true);

    try {
      const { error } = await supabase
        .from("projects")
        .update({ 
          stripe_config: { 
            enabled: false,
            connected: false,
            stripe_account_id: null,
            account_name: null,
          } 
        })
        .eq("id", project.id);

      if (error) throw error;

      toast.success("Stripe account disconnected");
      onSuccess();
    } catch (error: any) {
      toast.error("Failed to disconnect Stripe", { description: error.message });
    } finally {
      setIsDisconnectingStripe(false);
    }
  };

  const handleClose = () => {
    if (hasUnsavedChanges) {
      // Could add a confirmation dialog here
    }
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center justify-between">
            <div>
              <SheetTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-primary" />
                Project Settings
              </SheetTitle>
              <SheetDescription>
                Configure settings and payment methods
              </SheetDescription>
            </div>
            {project?.status && (
              <Badge variant={project.status === "active" ? "success" : "secondary"}>
                {project.status}
              </Badge>
            )}
          </div>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 mt-6">
            <Tabs defaultValue="general" className="w-full">
              <TabsList className="w-full grid grid-cols-3 h-10">
                <TabsTrigger value="general" className="gap-1.5 text-xs sm:text-sm">
                  <Settings className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">General</span>
                </TabsTrigger>
                <TabsTrigger value="stripe" className="gap-1.5 text-xs sm:text-sm relative">
                  <CreditCard className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Stripe</span>
                  {isStripeConnected && (
                    <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-green-500" />
                  )}
                </TabsTrigger>
                <TabsTrigger value="manual" className="gap-1.5 text-xs sm:text-sm relative">
                  <Wallet className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Manual</span>
                  {form.watch("manual_enabled") && (
                    <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-green-500" />
                  )}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="general" className="space-y-4 mt-4">
                <FormField
                  control={form.control}
                  name="project_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Project Name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="support_contact"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Support Contact</FormLabel>
                      <FormControl>
                        <Input placeholder="@username or email" {...field} />
                      </FormControl>
                      <FormDescription>
                        How subscribers can reach you for support
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Webhook Setup Card */}
                <Card className={cn(
                  "transition-colors",
                  webhookStatus === "success" && "border-green-500/50 bg-green-500/5"
                )}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "h-8 w-8 rounded-lg flex items-center justify-center",
                        webhookStatus === "success" ? "bg-green-500/10" : "bg-primary/10"
                      )}>
                        <Webhook className={cn(
                          "h-4 w-4",
                          webhookStatus === "success" ? "text-green-600" : "text-primary"
                        )} />
                      </div>
                      <div>
                        <CardTitle className="text-sm">Telegram Webhook</CardTitle>
                        <CardDescription className="text-xs">
                          Auto-receive messages from your bot
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Input
                        value={webhookUrl}
                        readOnly
                        className="text-xs font-mono bg-muted/50 h-8"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 flex-shrink-0"
                        onClick={copyWebhookUrl}
                      >
                        {copied ? (
                          <Check className="h-3.5 w-3.5 text-green-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                    <Button
                      type="button"
                      variant={webhookStatus === "success" ? "outline" : "default"}
                      size="sm"
                      className="w-full gap-2"
                      onClick={handleSetupWebhook}
                      disabled={isSettingWebhook}
                    >
                      {isSettingWebhook ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Setting up...
                        </>
                      ) : webhookStatus === "success" ? (
                        <>
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                          Webhook Active
                        </>
                      ) : (
                        <>
                          <Zap className="h-4 w-4" />
                          Setup Webhook
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>

                {/* Danger Zone */}
                <Card className="border-destructive/30">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-lg bg-destructive/10 flex items-center justify-center">
                        <AlertTriangle className="h-4 w-4 text-destructive" />
                      </div>
                      <CardTitle className="text-sm text-destructive">Danger Zone</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground mb-3">
                      Permanently delete this project and all its data. This action cannot be undone.
                    </p>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="sm" className="gap-2">
                          <Trash2 className="h-4 w-4" />
                          Delete Project
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Project?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete the project
                            and all associated plans and subscriber data.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={handleDelete}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            {isDeleting ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              "Delete"
                            )}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="stripe" className="space-y-4 mt-4">
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "h-8 w-8 rounded-lg flex items-center justify-center",
                          isStripeConnected ? "bg-green-500/10" : "bg-primary/10"
                        )}>
                          <CreditCard className={cn(
                            "h-4 w-4",
                            isStripeConnected ? "text-green-600" : "text-primary"
                          )} />
                        </div>
                        <div>
                          <CardTitle className="text-sm">Stripe Payments</CardTitle>
                          <CardDescription className="text-xs">
                            Accept credit card payments
                          </CardDescription>
                        </div>
                      </div>
                      <FormField
                        control={form.control}
                        name="stripe_enabled"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                disabled={!isStripeConnected}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {isStripeConnected ? (
                      <div className="space-y-4">
                        <div className="flex items-center gap-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                          <CheckCircle2 className="h-6 w-6 text-green-500 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm text-foreground">Connected</span>
                              <Badge variant={stripeLivemode ? "default" : "secondary"} className="text-xs">
                                {stripeLivemode ? "Live" : "Test"}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground truncate">
                              {stripeAccountName || "Connected Account"}
                            </p>
                          </div>
                        </div>

                        <p className="text-xs text-muted-foreground">
                          Payments go directly to your connected Stripe account. No additional setup required!
                        </p>

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button 
                              type="button" 
                              variant="outline" 
                              size="sm" 
                              className="gap-2 text-muted-foreground"
                            >
                              <Unlink className="h-4 w-4" />
                              Disconnect Stripe
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Disconnect Stripe Account?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will disable Stripe payments for this project. 
                                You can reconnect anytime.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={handleDisconnectStripe}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                {isDisconnectingStripe ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  "Disconnect"
                                )}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border">
                          <XCircle className="h-6 w-6 text-muted-foreground flex-shrink-0" />
                          <div className="flex-1">
                            <p className="font-medium text-sm text-foreground">Not Connected</p>
                            <p className="text-xs text-muted-foreground">
                              Connect Stripe to accept card payments
                            </p>
                          </div>
                        </div>

                        <p className="text-xs text-muted-foreground">
                          Click below to securely connect your Stripe account. 
                          Payments go directly to your account — no API keys needed!
                        </p>

                        <Button
                          type="button"
                          className="w-full gap-2"
                          onClick={handleConnectStripe}
                          disabled={isConnectingStripe}
                        >
                          {isConnectingStripe ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Connecting...
                            </>
                          ) : (
                            <>
                              <CreditCard className="h-4 w-4" />
                              Connect with Stripe
                            </>
                          )}
                        </Button>

                        <p className="text-[10px] text-center text-muted-foreground">
                          You'll be redirected to Stripe to authorize the connection
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="manual" className="space-y-4 mt-4">
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Wallet className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-sm">Manual Payments</CardTitle>
                          <CardDescription className="text-xs">
                            Bank transfers, crypto, etc.
                          </CardDescription>
                        </div>
                      </div>
                      <FormField
                        control={form.control}
                        name="manual_enabled"
                        render={({ field }) => (
                          <FormItem>
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
                  </CardHeader>
                  <CardContent>
                    <FormField
                      control={form.control}
                      name="manual_instructions"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Payment Instructions</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder={`Enter payment instructions for subscribers...\n\nExample:\nBank: XYZ Bank\nAccount: 1234567890\n\nOr send USDT to: 0x...`}
                              className="min-h-[120px] text-sm"
                              {...field}
                            />
                          </FormControl>
                          <div className="flex items-center justify-between">
                            <FormDescription className="text-xs flex items-center gap-1">
                              <Info className="h-3 w-3" />
                              Markdown supported
                            </FormDescription>
                            <span className="text-xs text-muted-foreground">
                              {(field.value || "").length}/500
                            </span>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            {/* Footer */}
            <div className="flex gap-3 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}