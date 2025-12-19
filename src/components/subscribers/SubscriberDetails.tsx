import { useState } from "react";
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
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { PaymentProofUpload } from "./PaymentProofUpload";
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
  status: "active" | "pending_payment" | "pending_approval" | "awaiting_proof" | "expired" | "rejected";
  plan_id: string | null;
  payment_method: string | null;
  payment_proof_url: string | null;
  invite_link: string | null;
  start_date: string | null;
  expiry_date: string | null;
  notes: string | null;
  created_at: string | null;
  project_id: string;
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
  const [isExtending, setIsExtending] = useState(false);
  const [extensionDays, setExtensionDays] = useState("30");
  const [showProofDialog, setShowProofDialog] = useState(false);
  const [showUploadSection, setShowUploadSection] = useState(false);
  const [currentProofUrl, setCurrentProofUrl] = useState<string | null>(null);

  // Update current proof URL when subscriber changes (only if valid URL)
  if (subscriber && subscriber.payment_proof_url !== currentProofUrl) {
    setCurrentProofUrl(isValidUrl(subscriber.payment_proof_url) ? subscriber.payment_proof_url : null);
  }

  if (!subscriber) return null;

  const status = statusConfig[subscriber.status] || { label: subscriber.status, variant: "muted" };
  const hasValidProofUrl = isValidUrl(currentProofUrl);
  const hasProofText = !hasValidProofUrl && subscriber.payment_proof_url;

  const handleApprove = async () => {
    setIsApproving(true);
    try {
      const plan = subscriber.plans;
      const durationDays = plan?.duration_days || 30;
      const startDate = new Date();
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + durationDays);

      const { error } = await supabase
        .from("subscribers")
        .update({
          status: "active",
          start_date: startDate.toISOString(),
          expiry_date: expiryDate.toISOString(),
          expiry_reminder_sent: false,
          final_reminder_sent: false,
        })
        .eq("id", subscriber.id);

      if (error) throw error;

      toast.success("Subscriber approved!", {
        description: `Subscription active until ${format(expiryDate, "MMM d, yyyy")}`,
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
        .update({ status: "rejected" })
        .eq("id", subscriber.id);

      if (error) throw error;

      toast.success("Subscriber rejected");
      onUpdate();
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Failed to reject", { description: error.message });
    } finally {
      setIsRejecting(false);
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
      const currentExpiry = subscriber.expiry_date ? new Date(subscriber.expiry_date) : new Date();
      const newExpiry = new Date(Math.max(currentExpiry.getTime(), Date.now()));
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

      toast.success("Subscription extended!", {
        description: `New expiry: ${format(newExpiry, "MMM d, yyyy")}`,
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

      toast.success("Access revoked");
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

            {/* Quick Actions for Pending */}
            {(subscriber.status === "pending_approval" || subscriber.status === "awaiting_proof") && (
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
                      onClick={handleReject}
                      disabled={isRejecting}
                    >
                      {isRejecting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <XCircle className="h-4 w-4" />
                      )}
                      Reject
                    </Button>
                  </div>
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

            {/* Payment Proof Upload Section */}
            <Card variant="glass">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <ImageIcon className="h-4 w-4" />
                    Payment Proof
                  </CardTitle>
                  {!showUploadSection && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowUploadSection(true)}
                    >
                      <Upload className="h-4 w-4 mr-1" />
                      Upload
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {showUploadSection ? (
                  <PaymentProofUpload
                    projectId={subscriber.project_id}
                    subscriberId={subscriber.id}
                    currentProofUrl={currentProofUrl}
                    onUploadComplete={(url) => {
                      setCurrentProofUrl(url);
                      setShowUploadSection(false);
                      onUpdate();
                    }}
                  />
                ) : hasValidProofUrl ? (
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
                    No payment proof uploaded
                  </p>
                )}
              </CardContent>
            </Card>

            <Separator />

            {/* Actions */}
            <div className="space-y-4">
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

              {subscriber.status === "active" && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="w-full">
                      Revoke Access
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
    </>
  );
}
