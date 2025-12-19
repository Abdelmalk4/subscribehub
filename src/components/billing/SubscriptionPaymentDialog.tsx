import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, CheckCircle, Copy, Building, CreditCard, Bitcoin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface PaymentSettings {
  bankName: string;
  accountName: string;
  accountNumber: string;
  routingNumber: string;
  swiftCode: string;
  paypalEmail: string;
  cryptoAddress: string;
  cryptoNetwork: string;
  paymentInstructions: string;
}

interface SubscriptionPlan {
  id: string;
  plan_name: string;
  price: number;
}

interface SubscriptionPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedPlan: SubscriptionPlan | null;
  subscriptionId: string | null;
  onPaymentSubmitted: () => void;
}

export function SubscriptionPaymentDialog({
  open,
  onOpenChange,
  selectedPlan,
  subscriptionId,
  onPaymentSubmitted,
}: SubscriptionPaymentDialogProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("bank");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (open) {
      fetchPaymentSettings();
      setSubmitted(false);
      setProofFile(null);
    }
  }, [open]);

  const fetchPaymentSettings = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("platform_config")
      .select("value")
      .eq("key", "payment_addresses")
      .maybeSingle();

    if (data?.value) {
      setPaymentSettings(data.value as unknown as PaymentSettings);
    }
    setLoading(false);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 5 * 1024 * 1024) {
        toast.error("File size must be less than 5MB");
        return;
      }
      setProofFile(file);
    }
  };

  const handleSubmitPayment = async () => {
    if (!user || !selectedPlan || !subscriptionId) return;

    setSubmitting(true);
    try {
      let proofUrl: string | null = null;

      // Upload proof if provided
      if (proofFile) {
        setUploading(true);
        const fileExt = proofFile.name.split(".").pop();
        const fileName = `${user.id}/${Date.now()}.${fileExt}`;

        const { error: uploadError, data: uploadData } = await supabase.storage
          .from("payment-proofs")
          .upload(fileName, proofFile);

        if (uploadError) throw uploadError;
        proofUrl = uploadData.path;
        setUploading(false);
      }

      // Create payment record
      const { error } = await supabase.from("client_subscription_payments").insert({
        client_id: user.id,
        subscription_id: subscriptionId,
        plan_id: selectedPlan.id,
        amount: selectedPlan.price,
        payment_method: paymentMethod,
        payment_proof_url: proofUrl,
        status: "pending",
      });

      if (error) throw error;

      // Update subscription status to pending_payment
      await supabase
        .from("client_subscriptions")
        .update({ status: "pending_payment", plan_id: selectedPlan.id })
        .eq("id", subscriptionId);

      setSubmitted(true);
      onPaymentSubmitted();
    } catch (error) {
      console.error("Error submitting payment:", error);
      toast.error("Failed to submit payment. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  const hasBank = paymentSettings?.bankName || paymentSettings?.accountNumber;
  const hasPaypal = paymentSettings?.paypalEmail;
  const hasCrypto = paymentSettings?.cryptoAddress;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        {submitted ? (
          <div className="flex flex-col items-center py-8 text-center">
            <CheckCircle className="h-16 w-16 text-success mb-4" />
            <DialogTitle className="text-2xl mb-2">Payment Submitted!</DialogTitle>
            <DialogDescription className="text-base">
              Your payment is being reviewed. We'll activate your {selectedPlan?.plan_name} plan once confirmed.
            </DialogDescription>
            <Button variant="gradient" className="mt-6" onClick={handleClose}>
              Close
            </Button>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !paymentSettings || (!hasBank && !hasPaypal && !hasCrypto) ? (
          <div className="text-center py-8">
            <DialogTitle className="text-xl mb-2">Payment Not Available</DialogTitle>
            <DialogDescription>
              Payment methods have not been configured yet. Please contact support.
            </DialogDescription>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Subscribe to {selectedPlan?.plan_name}</DialogTitle>
              <DialogDescription>
                Complete your payment of <strong>${selectedPlan?.price}/month</strong>
              </DialogDescription>
            </DialogHeader>

            <Tabs value={paymentMethod} onValueChange={setPaymentMethod} className="mt-4">
              <TabsList className="w-full">
                {hasBank && (
                  <TabsTrigger value="bank" className="flex-1">
                    <Building className="h-4 w-4 mr-2" />
                    Bank
                  </TabsTrigger>
                )}
                {hasPaypal && (
                  <TabsTrigger value="paypal" className="flex-1">
                    <CreditCard className="h-4 w-4 mr-2" />
                    PayPal
                  </TabsTrigger>
                )}
                {hasCrypto && (
                  <TabsTrigger value="crypto" className="flex-1">
                    <Bitcoin className="h-4 w-4 mr-2" />
                    Crypto
                  </TabsTrigger>
                )}
              </TabsList>

              {hasBank && (
                <TabsContent value="bank" className="mt-4">
                  <Card variant="glass">
                    <CardContent className="pt-4 space-y-3">
                      {paymentSettings.bankName && (
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="text-sm text-muted-foreground">Bank Name</p>
                            <p className="font-medium">{paymentSettings.bankName}</p>
                          </div>
                        </div>
                      )}
                      {paymentSettings.accountName && (
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="text-sm text-muted-foreground">Account Name</p>
                            <p className="font-medium">{paymentSettings.accountName}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(paymentSettings.accountName, "Account name")}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                      {paymentSettings.accountNumber && (
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="text-sm text-muted-foreground">Account Number</p>
                            <p className="font-medium font-mono">{paymentSettings.accountNumber}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(paymentSettings.accountNumber, "Account number")}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                      {paymentSettings.routingNumber && (
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="text-sm text-muted-foreground">Routing Number</p>
                            <p className="font-medium font-mono">{paymentSettings.routingNumber}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(paymentSettings.routingNumber, "Routing number")}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                      {paymentSettings.swiftCode && (
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="text-sm text-muted-foreground">SWIFT/BIC</p>
                            <p className="font-medium font-mono">{paymentSettings.swiftCode}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(paymentSettings.swiftCode, "SWIFT code")}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              )}

              {hasPaypal && (
                <TabsContent value="paypal" className="mt-4">
                  <Card variant="glass">
                    <CardContent className="pt-4">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-sm text-muted-foreground">PayPal Email</p>
                          <p className="font-medium">{paymentSettings.paypalEmail}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(paymentSettings.paypalEmail, "PayPal email")}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              )}

              {hasCrypto && (
                <TabsContent value="crypto" className="mt-4">
                  <Card variant="glass">
                    <CardContent className="pt-4 space-y-3">
                      {paymentSettings.cryptoNetwork && (
                        <div>
                          <p className="text-sm text-muted-foreground">Network</p>
                          <Badge variant="secondary">{paymentSettings.cryptoNetwork}</Badge>
                        </div>
                      )}
                      <div className="flex justify-between items-center">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-muted-foreground">Wallet Address</p>
                          <p className="font-medium font-mono text-sm truncate">{paymentSettings.cryptoAddress}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(paymentSettings.cryptoAddress, "Wallet address")}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              )}
            </Tabs>

            {paymentSettings.paymentInstructions && (
              <div className="mt-4 p-3 bg-muted/30 rounded-lg">
                <p className="text-sm text-muted-foreground">{paymentSettings.paymentInstructions}</p>
              </div>
            )}

            <div className="mt-4 space-y-2">
              <Label htmlFor="proof">Payment Proof (optional)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="proof"
                  type="file"
                  accept="image/*,.pdf"
                  onChange={handleFileChange}
                  className="flex-1"
                />
                {proofFile && (
                  <Badge variant="success" className="whitespace-nowrap">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Selected
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Upload a screenshot or PDF of your payment confirmation</p>
            </div>

            <Button
              variant="gradient"
              className="w-full mt-6"
              onClick={handleSubmitPayment}
              disabled={submitting || uploading}
            >
              {submitting || uploading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              {uploading ? "Uploading..." : "Submit Payment"}
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
