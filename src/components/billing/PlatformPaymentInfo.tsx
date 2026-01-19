import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, Wallet, Bitcoin, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface PaymentMethod {
  id: string;
  method_name: string;
  method_type: string;
  details: Record<string, string>;
  instructions: string | null;
}

const iconMap: Record<string, React.ElementType> = {
  bank_transfer: Building2,
  binance: Wallet,
  crypto: Bitcoin,
};

export function PlatformPaymentInfo() {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMethods();
  }, []);

  const fetchMethods = async () => {
    try {
      const { data, error } = await supabase
        .from("platform_payment_methods")
        .select("*")
        .eq("is_active", true)
        .order("display_order", { ascending: true });

      if (error) throw error;
      setMethods((data || []) as PaymentMethod[]);
    } catch (error) {
      console.error("Failed to fetch platform methods:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (methods.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <p>No platform payment methods available.</p>
          <p className="text-sm">Contact support for payment options.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Platform Payment Methods</CardTitle>
        <CardDescription>
          Use these methods to pay for your SubscribeHub subscription.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {methods.map((method) => {
          const Icon = iconMap[method.method_type] || Wallet;
          return (
            <div
              key={method.id}
              className="bg-muted/30 rounded-lg p-4 space-y-2"
            >
              <div className="flex items-center gap-2">
                <Icon className="h-5 w-5 text-primary" />
                <span className="font-medium">{method.method_name}</span>
                <Badge variant="outline" className="ml-auto">
                  {method.method_type.replace(/_/g, " ")}
                </Badge>
              </div>
              <div className="text-sm space-y-1 text-muted-foreground">
                {Object.entries(method.details).map(([key, value]) =>
                  value ? (
                    <p key={key}>
                      <span className="capitalize">{key.replace(/_/g, " ")}: </span>
                      <span className="font-mono text-foreground">{value}</span>
                    </p>
                  ) : null
                )}
              </div>
              {method.instructions && (
                <p className="text-sm text-muted-foreground border-t border-border/50 pt-2 mt-2">
                  {method.instructions}
                </p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
