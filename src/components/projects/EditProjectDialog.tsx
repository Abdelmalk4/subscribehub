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
import { Settings, CreditCard, Wallet, Loader2, Trash2, Webhook, Check, Copy, ExternalLink, Info, Zap, CheckCircle2, XCircle } from "lucide-react";
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
import { Alert, AlertDescription } from "@/components/ui/alert";

const projectSchema = z.object({
  project_name: z.string().min(3).max(50),
  support_contact: z.string().optional(),
  stripe_enabled: z.boolean(),
  stripe_public_key: z.string().optional(),
  stripe_secret_key: z.string().optional(),
  stripe_webhook_secret: z.string().optional(),
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
  const [copiedStripeWebhook, setCopiedStripeWebhook] = useState(false);
  const [isTestingStripe, setIsTestingStripe] = useState(false);
  const [stripeTestStatus, setStripeTestStatus] = useState<"idle" | "success" | "error">("idle");
  const [stripeAccountName, setStripeAccountName] = useState<string | null>(null);

  const webhookUrl = project
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/telegram-bot-handler?project_id=${project.id}`
    : "";

  // Project-specific Stripe webhook URL
  const stripeWebhookUrl = project
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-webhook?project_id=${project.id}`
    : "";

  const form = useForm<ProjectFormData>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      project_name: "",
      support_contact: "",
      stripe_enabled: false,
      stripe_public_key: "",
      stripe_secret_key: "",
      stripe_webhook_secret: "",
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
        stripe_public_key: project.stripe_config?.public_key || "",
        stripe_secret_key: "",
        stripe_webhook_secret: "",
        manual_enabled: project.manual_payment_config?.enabled ?? true,
        manual_instructions: project.manual_payment_config?.instructions || "",
      });
    }
  }, [project, form]);

  const onSubmit = async (data: ProjectFormData) => {
    if (!project) return;

    setIsSubmitting(true);

    try {
      // Build stripe_config preserving existing secrets if not updated
      const stripeConfig: Record<string, any> = {
        enabled: data.stripe_enabled,
        public_key: data.stripe_public_key || "",
      };
      
      // Only update secret_key if a new one was provided
      if (data.stripe_secret_key) {
        stripeConfig.secret_key = data.stripe_secret_key;
      } else if (project.stripe_config?.secret_key) {
        stripeConfig.secret_key = project.stripe_config.secret_key;
      }
      
      // Only update webhook_secret if a new one was provided
      if (data.stripe_webhook_secret) {
        stripeConfig.webhook_secret = data.stripe_webhook_secret;
      } else if (project.stripe_config?.webhook_secret) {
        stripeConfig.webhook_secret = project.stripe_config.webhook_secret;
      }

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

  const copyStripeWebhookUrl = () => {
    navigator.clipboard.writeText(stripeWebhookUrl);
    setCopiedStripeWebhook(true);
    toast.success("Stripe webhook URL copied!");
    setTimeout(() => setCopiedStripeWebhook(false), 2000);
  };

  const handleTestStripeConnection = async () => {
    const secretKey = form.getValues("stripe_secret_key");
    const existingKey = project?.stripe_config?.secret_key;
    
    const keyToTest = secretKey || existingKey;
    
    if (!keyToTest) {
      toast.error("Please enter a Stripe secret key to test");
      return;
    }

    setIsTestingStripe(true);
    setStripeTestStatus("idle");
    setStripeAccountName(null);

    try {
      const { data, error } = await supabase.functions.invoke("test-stripe-connection", {
        body: { secret_key: keyToTest },
      });

      if (error) throw error;

      if (data.valid) {
        setStripeTestStatus("success");
        setStripeAccountName(data.account_name);
        toast.success("Stripe connection successful!", {
          description: `Connected to: ${data.account_name}${data.livemode ? " (Live)" : " (Test)"}`,
        });
      } else {
        setStripeTestStatus("error");
        toast.error("Invalid Stripe key", { description: data.error });
      }
    } catch (error: any) {
      setStripeTestStatus("error");
      toast.error("Failed to test Stripe connection", { description: error.message });
    } finally {
      setIsTestingStripe(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            Project Settings
          </SheetTitle>
          <SheetDescription>
            Configure your project settings and payment methods.
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 mt-6">
            <Tabs defaultValue="general" className="w-full">
              <TabsList className="w-full grid grid-cols-3">
                <TabsTrigger value="general">General</TabsTrigger>
                <TabsTrigger value="stripe">Stripe</TabsTrigger>
                <TabsTrigger value="manual">Manual</TabsTrigger>
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
                <Card className="border-primary/30 bg-primary/5">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <Webhook className="h-5 w-5 text-primary" />
                      <CardTitle className="text-sm">Telegram Webhook</CardTitle>
                    </div>
                    <CardDescription>
                      Configure your bot to receive messages automatically
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Input
                        value={webhookUrl}
                        readOnly
                        className="text-xs font-mono bg-muted/50"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={copyWebhookUrl}
                      >
                        {copied ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
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
                          <Check className="h-4 w-4 text-green-500" />
                          Webhook Active
                        </>
                      ) : (
                        <>
                          <ExternalLink className="h-4 w-4" />
                          Setup Webhook
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>

                <Card className="border-destructive/30 bg-destructive/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-destructive text-sm">Danger Zone</CardTitle>
                  </CardHeader>
                  <CardContent>
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
                        <CreditCard className="h-5 w-5 text-primary" />
                        <CardTitle className="text-base">Stripe Payments</CardTitle>
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
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                    <CardDescription>
                      Accept credit card payments via your own Stripe account
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Important notice about payments going to client's account */}
                    <Alert>
                      <Info className="h-4 w-4" />
                      <AlertDescription>
                        Payments from your subscribers will go <strong>directly to your Stripe account</strong>. 
                        You need to set up your own Stripe account and enter the API keys below.
                      </AlertDescription>
                    </Alert>

                    <FormField
                      control={form.control}
                      name="stripe_public_key"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Publishable Key</FormLabel>
                          <FormControl>
                            <Input placeholder="pk_live_..." {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="stripe_secret_key"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Secret Key</FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              placeholder="sk_live_... (leave empty to keep existing)"
                              {...field}
                            />
                          </FormControl>
                          <FormDescription>
                            Your secret key is encrypted and stored securely
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Test Connection Button */}
                    <div className="flex items-center gap-3">
                      <Button
                        type="button"
                        variant={stripeTestStatus === "success" ? "outline" : "secondary"}
                        size="sm"
                        className="gap-2"
                        onClick={handleTestStripeConnection}
                        disabled={isTestingStripe || (!form.watch("stripe_secret_key") && !project?.stripe_config?.secret_key)}
                      >
                        {isTestingStripe ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Testing...
                          </>
                        ) : stripeTestStatus === "success" ? (
                          <>
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                            Connected
                          </>
                        ) : stripeTestStatus === "error" ? (
                          <>
                            <XCircle className="h-4 w-4 text-destructive" />
                            Test Connection
                          </>
                        ) : (
                          <>
                            <Zap className="h-4 w-4" />
                            Test Connection
                          </>
                        )}
                      </Button>
                      {stripeAccountName && stripeTestStatus === "success" && (
                        <span className="text-sm text-muted-foreground">
                          {stripeAccountName}
                        </span>
                      )}
                    </div>

                    {/* Stripe Webhook Configuration */}
                    <div className="border-t pt-4 mt-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <Webhook className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Stripe Webhook Configuration</span>
                      </div>
                      
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">
                          Add this URL as a webhook endpoint in your Stripe Dashboard:
                        </p>
                        <div className="flex items-center gap-2">
                          <Input
                            value={stripeWebhookUrl}
                            readOnly
                            className="text-xs font-mono bg-muted/50"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={copyStripeWebhookUrl}
                          >
                            {copiedStripeWebhook ? (
                              <Check className="h-4 w-4 text-green-500" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>

                      <FormField
                        control={form.control}
                        name="stripe_webhook_secret"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Webhook Signing Secret</FormLabel>
                            <FormControl>
                              <Input
                                type="password"
                                placeholder="whsec_... (leave empty to keep existing)"
                                {...field}
                              />
                            </FormControl>
                            <FormDescription>
                              Find this in Stripe Dashboard → Developers → Webhooks → Your endpoint → Signing secret
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <Alert className="bg-muted/50">
                        <Info className="h-4 w-4" />
                        <AlertDescription className="text-xs">
                          <strong>Setup steps:</strong>
                          <ol className="list-decimal ml-4 mt-1 space-y-1">
                            <li>Go to Stripe Dashboard → Developers → Webhooks</li>
                            <li>Click "Add endpoint" and paste the webhook URL above</li>
                            <li>Select event: <code className="bg-background px-1 rounded">checkout.session.completed</code></li>
                            <li>Copy the "Signing secret" and paste it above</li>
                          </ol>
                        </AlertDescription>
                      </Alert>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="manual" className="space-y-4 mt-4">
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Wallet className="h-5 w-5 text-primary" />
                        <CardTitle className="text-base">Manual Payments</CardTitle>
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
                    <CardDescription>
                      Accept bank transfers, crypto, or other manual payments
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <FormField
                      control={form.control}
                      name="manual_instructions"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Payment Instructions</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Enter payment instructions that will be shown to subscribers...&#10;&#10;Example:&#10;Bank: XYZ Bank&#10;Account: 1234567890&#10;&#10;Or send USDT to: 0x..."
                              className="min-h-[150px]"
                              {...field}
                            />
                          </FormControl>
                          <FormDescription>
                            Markdown formatting is supported
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="gradient"
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
