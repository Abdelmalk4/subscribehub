import { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  User,
  Calendar,
  CreditCard,
  MessageSquare,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Clock,
  ImageIcon,
  Loader2,
  Link2,
  Ban,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Subscriber {
  id: string;
  telegram_user_id: number;
  username: string | null;
  first_name: string | null;
  status: "active" | "pending_payment" | "pending_approval" | "awaiting_proof" | "expired" | "rejected" | "suspended";
  plan_id: string | null;
  payment_method: string | null;
  payment_proof_url: string | null;
  invite_link: string | null;
  start_date: string | null;
  expiry_date: string | null;
  notes: string | null;
  created_at: string | null;
  project_id: string;
  rejection_reason?: string | null;
  suspended_at?: string | null;
  suspended_by?: string | null;
  projects?: { project_name: string } | null;
  plans?: { plan_name: string; price: number; currency: string | null; duration_days: number } | null;
}

interface SubscriberDetailsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscriber: Subscriber | null;
  onUpdate: () => void;
}

const statusConfig: Record<string, { label: string; variant: "success" | "warning" | "pending" | "muted" | "destructive" }> = {
  active: { label: "Active", variant: "success" },
  pending_approval: { label: "Pending Approval", variant: "pending" },
  pending_payment: { label: "Pending Payment", variant: "warning" },
  awaiting_proof: { label: "Awaiting Proof", variant: "pending" },
  expired: { label: "Expired", variant: "muted" },
  rejected: { label: "Rejected", variant: "destructive" },
  suspended: { label: "Suspended", variant: "destructive" },
};

// Helper to check if a string is a valid URL
const isValidUrl = (str: string | null): boolean => {
  if (!str) return false;
  try {
    new URL(str);
    return str.startsWith('http://') || str.startsWith('https://');
  } catch {
    return false;
  }
};

export function SubscriberDetails({ open, onOpenChange, subscriber, onUpdate }: SubscriberDetailsProps) {
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [isSuspending, setIsSuspending] = useState(false);
  const [isExtending, setIsExtending] = useState(false);
  const [extensionDays, setExtensionDays] = useState("30");
  const [rejectionReason, setRejectionReason] = useState("");
  const [suspendReason, setSuspendReason] = useState("");
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showSuspendDialog, setShowSuspendDialog] = useState(false);
  const [showProofDialog, setShowProofDialog] = useState(false);
  const [currentProofUrl, setCurrentProofUrl] = useState<string | null>(null);

  // Update current proof URL when subscriber changes (only if valid URL)
  useEffect(() => {
    if (subscriber) {
      const validUrl = isValidUrl(subscriber.payment_proof_url) ? subscriber.payment_proof_url : null;
      setCurrentProofUrl(validUrl);
    }
  }, [subscriber?.id, subscriber?.payment_proof_url]);

  if (!subscriber) return null;

  const status = statusConfig[subscriber.status] || { label: subscriber.status, variant: "muted" };
  const hasValidProofUrl = isValidUrl(currentProofUrl);
  const hasProofText = !hasValidProofUrl && subscriber.payment_proof_url;

  // Helper to notify subscriber via bot
  const notifySubscriber = async (
    action: "approved" | "rejected" | "suspended" | "kicked" | "reactivated" | "extended",
    options?: { reason?: string; expiry_date?: string; days_remaining?: number }
  ) => {
    try {
      const { error } = await supabase.functions.invoke("notify-subscriber", {
        body: {
          subscriber_id: subscriber.id,
          action,
          reason: options?.reason,
          expiry_date: options?.expiry_date,
          days_remaining: options?.days_remaining,
        },
      });
      if (error) {
        console.error("Failed to notify subscriber:", error);
        toast.error("Failed to send notification to subscriber");
      }
    } catch (err) {
      console.error("Error calling notify-subscriber:", err);
    }
  };

  const handleApprove = async () => {
    setIsApproving(true);
    try {
      const plan = subscriber.plans;
      const durationDays = plan?.duration_days || 30;
      
      // For renewals: if subscriber is active with future expiry, extend from current expiry
      // Otherwise start from today
      let startDate = new Date();
      let expiryDate: Date;
      
      if (subscriber.status === "active" && subscriber.expiry_date) {
        const currentExpiry = new Date(subscriber.expiry_date);
        if (currentExpiry > new Date()) {
          // Active with future expiry - extend from current expiry
          expiryDate = new Date(currentExpiry);
          expiryDate.setDate(expiryDate.getDate() + durationDays);
        } else {
          // Expired - start fresh from today
          expiryDate = new Date();
          expiryDate.setDate(expiryDate.getDate() + durationDays);
        }
      } else {
        // New subscription or other status - start from today
        expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + durationDays);
      }

      const { error } = await supabase
        .from("subscribers")
        .update({
          status: "active",
          start_date: startDate.toISOString(),
          expiry_date: expiryDate.toISOString(),
          expiry_reminder_sent: false,
          final_reminder_sent: false,
          rejection_reason: null,
          suspended_at: null,
        })
        .eq("id", subscriber.id);

      if (error) throw error;

      // Notify subscriber with invite link
      await notifySubscriber("approved", { expiry_date: expiryDate.toISOString() });

      toast.success("Subscriber approved!", {
        description: `Subscription active until ${format(expiryDate, "MMM d, yyyy")}. Invite link sent via bot.`,
      });
      onUpdate();
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Failed to approve", { description: error.message });
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    setIsRejecting(true);
    try {
      const { error } = await supabase
        .from("subscribers")
        .update({ 
          status: "rejected",
          rejection_reason: rejectionReason || null,
        })
        .eq("id", subscriber.id);

      if (error) throw error;

      // Notify subscriber via bot
      await notifySubscriber("rejected", { reason: rejectionReason });

      toast.success("Subscriber rejected and notified via bot");
      setShowRejectDialog(false);
      setRejectionReason("");
      onUpdate();
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Failed to reject", { description: error.message });
    } finally {
      setIsRejecting(false);
    }
  };

  const handleSuspend = async () => {
    setIsSuspending(true);
    try {
      const { error } = await supabase
        .from("subscribers")
        .update({ 
          status: "suspended",
          suspended_at: new Date().toISOString(),
          rejection_reason: suspendReason || null,
        })
        .eq("id", subscriber.id);

      if (error) throw error;

      // Notify subscriber and kick from channel
      await notifySubscriber("suspended", { reason: suspendReason });

      toast.success("Subscriber suspended and removed from channel");
      setShowSuspendDialog(false);
      setSuspendReason("");
      onUpdate();
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Failed to suspend", { description: error.message });
    } finally {
      setIsSuspending(false);
    }
  };

  const handleReactivate = async () => {
    try {
      const { error } = await supabase
        .from("subscribers")
        .update({ 
          status: "active",
          suspended_at: null,
          rejection_reason: null,
        })
        .eq("id", subscriber.id);

      if (error) throw error;

      // Notify subscriber with new invite link
      await notifySubscriber("reactivated");

      toast.success("Subscriber reactivated and invite link sent");
      onUpdate();
    } catch (error: any) {
      toast.error("Failed to reactivate", { description: error.message });
    }
  };

  const handleExtend = async () => {
    const days = parseInt(extensionDays);
    if (isNaN(days) || days <= 0) {
      toast.error("Please enter a valid number of days");
      return;
    }

    setIsExtending(true);
    try {
      // Always extend from current expiry if it exists and is in the future
      // Otherwise extend from today
      let baseDate: Date;
      if (subscriber.expiry_date) {
        const currentExpiry = new Date(subscriber.expiry_date);
        baseDate = currentExpiry > new Date() ? currentExpiry : new Date();
      } else {
        baseDate = new Date();
      }
      
      const newExpiry = new Date(baseDate);
      newExpiry.setDate(newExpiry.getDate() + days);

      const { error } = await supabase
        .from("subscribers")
        .update({
          expiry_date: newExpiry.toISOString(),
          status: "active",
          expiry_reminder_sent: false,
          final_reminder_sent: false,
        })
        .eq("id", subscriber.id);

      if (error) throw error;

      // Notify subscriber about the extension
      await notifySubscriber("extended", { expiry_date: newExpiry.toISOString() });

      toast.success("Subscription extended!", {
        description: `New expiry: ${format(newExpiry, "MMM d, yyyy")}. Subscriber notified.`,
      });
      onUpdate();
    } catch (error: any) {
      toast.error("Failed to extend", { description: error.message });
    } finally {
      setIsExtending(false);
    }
  };

  const handleRevoke = async () => {
    try {
      const { error } = await supabase
        .from("subscribers")
        .update({ status: "expired" })
        .eq("id", subscriber.id);

      if (error) throw error;

      // Kick from channel
      await notifySubscriber("kicked", { reason: "Subscription revoked by admin" });

      toast.success("Access revoked and user removed from channel");
      onUpdate();
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Failed to revoke", { description: error.message });
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary/30 to-secondary/30 flex items-center justify-center">
                <span className="text-lg font-semibold text-foreground">
                  {subscriber.first_name?.[0] || subscriber.username?.[0] || "?"}
                </span>
              </div>
              <div>
                <SheetTitle className="text-left">
                  {subscriber.first_name || subscriber.username || "Unknown User"}
                </SheetTitle>
                <SheetDescription className="text-left">
                  {subscriber.username && `@${subscriber.username}`}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            {/* Status Badge */}
            <div className="flex items-center gap-2">
              <Badge variant={status.variant} className="text-sm">
                {subscriber.status === "active" && (
                  <span className="h-2 w-2 rounded-full bg-current mr-1.5 animate-pulse" />
                )}
                {status.label}
              </Badge>
              {subscriber.payment_method && (
                <Badge variant="glass" className="text-sm">
                  <CreditCard className="h-3 w-3 mr-1" />
                  {subscriber.payment_method}
                </Badge>
              )}
            </div>

            {/* Quick Actions for Pending Approval Only */}
            {subscriber.status === "pending_approval" && (
              <Card className="border-warning/30 bg-warning/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-warning">Action Required</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {hasValidProofUrl && (
                    <Button
                      variant="outline"
                      className="w-full gap-2"
                      onClick={() => setShowProofDialog(true)}
                    >
                      <ImageIcon className="h-4 w-4" />
                      View Payment Proof
                    </Button>
                  )}
                  {hasProofText && (
                    <div className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-lg">
                      <p className="font-medium mb-1">Payment Note:</p>
                      <p>{subscriber.payment_proof_url}</p>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button
                      variant="default"
                      className="flex-1 gap-2 bg-success hover:bg-success/90"
                      onClick={handleApprove}
                      disabled={isApproving}
                    >
                      {isApproving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      Approve
                    </Button>
                    <Button
                      variant="destructive"
                      className="flex-1 gap-2"
                      onClick={() => setShowRejectDialog(true)}
                      disabled={isRejecting}
                    >
                      <XCircle className="h-4 w-4" />
                      Reject
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Suspended/Rejected Status Info */}
            {(subscriber.status === "suspended" || subscriber.status === "rejected") && (
              <Card className="border-destructive/30 bg-destructive/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-destructive flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    {subscriber.status === "suspended" ? "Subscriber Suspended" : "Payment Rejected"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {subscriber.rejection_reason && (
                    <div className="text-sm bg-muted/30 p-3 rounded-lg">
                      <p className="font-medium text-muted-foreground mb-1">Reason:</p>
                      <p className="text-foreground">{subscriber.rejection_reason}</p>
                    </div>
                  )}
                  {subscriber.suspended_at && (
                    <p className="text-xs text-muted-foreground">
                      Suspended on: {format(new Date(subscriber.suspended_at), "MMM d, yyyy HH:mm")}
                    </p>
                  )}
                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    onClick={handleReactivate}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Reactivate Subscriber
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Info Cards */}
            <div className="grid grid-cols-2 gap-4">
              <Card variant="glass">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <User className="h-4 w-4" />
                    <span className="text-xs">Telegram ID</span>
                  </div>
                  <p className="font-mono text-sm text-foreground">{subscriber.telegram_user_id}</p>
                </CardContent>
              </Card>

              <Card variant="glass">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <MessageSquare className="h-4 w-4" />
                    <span className="text-xs">Project</span>
                  </div>
                  <p className="text-sm text-foreground">{subscriber.projects?.project_name || "—"}</p>
                </CardContent>
              </Card>

              <Card variant="glass">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <CreditCard className="h-4 w-4" />
                    <span className="text-xs">Plan</span>
                  </div>
                  <p className="text-sm text-foreground">
                    {subscriber.plans ? (
                      <>
                        {subscriber.plans.plan_name} - {subscriber.plans.currency} {subscriber.plans.price}
                      </>
                    ) : (
                      "—"
                    )}
                  </p>
                </CardContent>
              </Card>

              <Card variant="glass">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Calendar className="h-4 w-4" />
                    <span className="text-xs">Expires</span>
                  </div>
                  <p className="text-sm text-foreground">
                    {subscriber.expiry_date
                      ? format(new Date(subscriber.expiry_date), "MMM d, yyyy")
                      : "—"}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Invite Link */}
            {subscriber.invite_link && (
              <Card variant="glass">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-2">
                    <Link2 className="h-4 w-4" />
                    <span className="text-xs">Invite Link</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs bg-muted/30 p-2 rounded truncate">
                      {subscriber.invite_link}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => window.open(subscriber.invite_link!, "_blank")}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Notes */}
            {subscriber.notes && (
              <Card variant="glass">
                <CardContent className="pt-4 pb-4">
                  <div className="text-xs text-muted-foreground mb-2">Notes</div>
                  <p className="text-sm text-foreground">{subscriber.notes}</p>
                </CardContent>
              </Card>
            )}

            {/* Payment Proof Section */}
            <Card variant="glass">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ImageIcon className="h-4 w-4" />
                  Payment Proof
                </CardTitle>
              </CardHeader>
              <CardContent>
                {hasValidProofUrl ? (
                  <div className="space-y-2">
                    <img
                      src={currentProofUrl!}
                      alt="Payment proof"
                      className="w-full max-h-48 object-contain rounded-lg bg-muted/30 cursor-pointer"
                      onClick={() => setShowProofDialog(true)}
                    />
                    <p className="text-xs text-muted-foreground text-center">
                      Click to view full size
                    </p>
                  </div>
                ) : hasProofText ? (
                  <div className="bg-muted/30 p-4 rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Payment Note:</p>
                    <p className="text-sm text-foreground">{subscriber.payment_proof_url}</p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No payment proof submitted
                  </p>
                )}
              </CardContent>
            </Card>

            <Separator />

            {/* Actions */}
            <div className="space-y-4">
              {/* Extend - Only for active subscribers */}
              {subscriber.status === "active" && (
                <div className="space-y-2">
                  <Label className="text-sm">Extend Subscription</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      value={extensionDays}
                      onChange={(e) => setExtensionDays(e.target.value)}
                      placeholder="Days"
                      className="w-24"
                    />
                    <Button
                      variant="outline"
                      className="flex-1 gap-2"
                      onClick={handleExtend}
                      disabled={isExtending}
                    >
                      {isExtending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Clock className="h-4 w-4" />
                      )}
                      Extend
                    </Button>
                  </div>
                </div>
              )}

              {subscriber.status === "active" && (
                <div className="flex gap-2">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" className="flex-1 gap-2">
                        <Ban className="h-4 w-4" />
                        Suspend
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Suspend Subscriber?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will immediately suspend the subscriber's access. They will be notified via bot.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <div className="py-4">
                        <Label className="text-sm">Reason (optional)</Label>
                        <Textarea
                          value={suspendReason}
                          onChange={(e) => setSuspendReason(e.target.value)}
                          placeholder="Reason for suspension..."
                          className="mt-2"
                        />
                      </div>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction 
                          onClick={handleSuspend} 
                          className="bg-destructive"
                          disabled={isSuspending}
                        >
                          {isSuspending ? "Suspending..." : "Suspend"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" className="flex-1">
                        Revoke
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Revoke Access?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will immediately expire the subscription. The user will lose access to the channel.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleRevoke} className="bg-destructive">
                          Revoke
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}

              {subscriber.username && (
                <Button
                  variant="glass"
                  className="w-full gap-2"
                  onClick={() => window.open(`https://t.me/${subscriber.username}`, "_blank")}
                >
                  <ExternalLink className="h-4 w-4" />
                  Open in Telegram
                </Button>
              )}
            </div>

            {/* Timestamps */}
            <div className="text-xs text-muted-foreground space-y-1">
              {subscriber.created_at && (
                <p>Created: {format(new Date(subscriber.created_at), "MMM d, yyyy HH:mm")}</p>
              )}
              {subscriber.start_date && (
                <p>Started: {format(new Date(subscriber.start_date), "MMM d, yyyy HH:mm")}</p>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Payment Proof Dialog */}
      <Dialog open={showProofDialog} onOpenChange={setShowProofDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Payment Proof</DialogTitle>
            <DialogDescription>
              Submitted by {subscriber.username || subscriber.first_name || "Unknown"}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            {hasValidProofUrl && (
              <img
                src={currentProofUrl!}
                alt="Payment proof"
                className="w-full rounded-lg"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Payment</DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting this payment (will be shown to user via bot).
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>Rejection Reason</Label>
            <Textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g., Payment proof unclear, amount mismatch..."
              className="mt-2"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleReject}
              disabled={isRejecting}
            >
              {isRejecting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Reject Payment
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
