import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Building2, Wallet, Bitcoin, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface PaymentMethodCardProps {
  methodName: string;
  methodType: string;
  details: Record<string, string>;
  instructions?: string | null;
}

const iconMap: Record<string, React.ElementType> = {
  bank_transfer: Building2,
  binance: Wallet,
  crypto: Bitcoin,
};

export function PaymentMethodCard({
  methodName,
  methodType,
  details,
  instructions,
}: PaymentMethodCardProps) {
  const [copied, setCopied] = React.useState(false);
  const Icon = iconMap[methodType] || Wallet;

  const handleCopy = async () => {
    const detailsText = Object.entries(details)
      .filter(([_, value]) => value)
      .map(([key, value]) => `${key.replace(/_/g, " ")}: ${value}`)
      .join("\n");

    const fullText = `${methodName}\n${detailsText}${instructions ? `\n\nInstructions: ${instructions}` : ""}`;

    try {
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      toast.success("Payment details copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error("Failed to copy to clipboard");
    }
  };

  return (
    <Card
      className="cursor-pointer transition-all hover:shadow-md hover:border-gray-300 active:scale-[0.99]"
      onClick={handleCopy}
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-gray-100">
              <Icon className="h-4 w-4 text-gray-600" />
            </div>
            <div>
              <h3 className="text-xs font-medium text-gray-900">{methodName}</h3>
              <p className="text-[10px] text-gray-500 capitalize">
                {methodType.replace(/_/g, " ")}
              </p>
            </div>
          </div>
          <button
            className={cn(
              "p-1.5 rounded-md transition-colors",
              copied ? "bg-success-50 text-success-500" : "bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            )}
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>

        <div className="mt-2.5 space-y-1 text-xs">
          {Object.entries(details).map(([key, value]) =>
            value ? (
              <div key={key} className="flex justify-between">
                <span className="text-gray-500 capitalize">{key.replace(/_/g, " ")}</span>
                <span className="font-mono text-gray-900 text-right">{value}</span>
              </div>
            ) : null
          )}
        </div>

        {instructions && (
          <p className="mt-2 pt-2 border-t border-gray-100 text-[10px] text-gray-500">
            {instructions}
          </p>
        )}

        <p className="mt-2 text-[10px] text-gray-400 text-center">
          Click to copy details
        </p>
      </CardContent>
    </Card>
  );
}
