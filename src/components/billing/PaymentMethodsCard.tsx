import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Building2, Wallet, Bitcoin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface PaymentMethod {
  id: string;
  method_name: string;
  method_type: string;
}

const methodIcons: Record<string, React.ElementType> = {
  bank_transfer: Building2,
  binance: Wallet,
  crypto: Bitcoin,
};

const methodLabels: Record<string, string> = {
  bank_transfer: "Bank Transfer",
  binance: "Binance Pay",
  crypto: "Cryptocurrency",
};

export function PaymentMethodsCard() {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMethods();
  }, []);

  const fetchMethods = async () => {
    const { data } = await supabase
      .from("platform_payment_methods")
      .select("id, method_name, method_type")
      .eq("is_active", true)
      .order("display_order", { ascending: true });

    setMethods(data || []);
    setLoading(false);
  };

  // Group methods by type
  const groupedMethods = methods.reduce((acc, method) => {
    if (!acc[method.method_type]) {
      acc[method.method_type] = [];
    }
    acc[method.method_type].push(method);
    return acc;
  }, {} as Record<string, PaymentMethod[]>);

  const uniqueTypes = Object.keys(groupedMethods);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-1/3"></div>
            <div className="flex gap-3">
              <div className="h-12 w-12 bg-muted rounded-lg"></div>
              <div className="h-12 w-12 bg-muted rounded-lg"></div>
              <div className="h-12 w-12 bg-muted rounded-lg"></div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Payment Methods</h3>
            <p className="text-xs text-muted-foreground">Available payment options for upgrades</p>
          </div>
        </div>

        {uniqueTypes.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No payment methods configured.
          </p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {uniqueTypes.map((type) => {
              const Icon = methodIcons[type] || Wallet;
              const count = groupedMethods[type].length;
              return (
                <div
                  key={type}
                  className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg border border-border"
                >
                  <div className="w-8 h-8 rounded-md bg-background flex items-center justify-center">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-foreground">
                      {methodLabels[type] || type}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {count} {count === 1 ? "option" : "options"} available
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
