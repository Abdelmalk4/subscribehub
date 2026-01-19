import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CreditCard, Calendar, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface CurrentPlanCardProps {
  planName: string | null;
  status: string;
  billingCycle: string;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  onCancelSubscription?: () => void;
  onReactivate?: () => void;
}

export function CurrentPlanCard({
  planName,
  status,
  billingCycle,
  currentPeriodEnd,
  trialEndsAt,
  onCancelSubscription,
  onReactivate,
}: CurrentPlanCardProps) {
  const getStatusBadge = () => {
    switch (status) {
      case "active":
        return <Badge variant="success">Active</Badge>;
      case "trial":
        return <Badge variant="info">Trial</Badge>;
      case "expired":
        return <Badge variant="destructive">Expired</Badge>;
      case "pending_payment":
        return <Badge variant="warning">Pending Payment</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getNextBillingDate = () => {
    if (status === "trial" && trialEndsAt) {
      return format(new Date(trialEndsAt), "MMM dd, yyyy");
    }
    if (currentPeriodEnd) {
      return format(new Date(currentPeriodEnd), "MMM dd, yyyy");
    }
    return "—";
  };

  const isActive = status === "active" || status === "trial";

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <CreditCard className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Current Plan</h3>
              <p className="text-xs text-muted-foreground">Your subscription details</p>
            </div>
          </div>
          {getStatusBadge()}
        </div>

        <div className="space-y-2.5">
          <div className="flex items-center justify-between py-2 border-b border-border">
            <span className="text-sm text-muted-foreground">Plan</span>
            <span className="text-sm font-medium text-foreground">{planName || "No Plan"}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-border">
            <span className="text-sm text-muted-foreground">Billing Cycle</span>
            <span className="text-sm font-medium text-foreground capitalize">{billingCycle}</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              {status === "trial" ? "Trial Ends" : "Next Billing"}
            </span>
            <span className="text-sm font-medium text-foreground">{getNextBillingDate()}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-4 pt-3 border-t border-border">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="w-full text-xs">
                Manage Subscription
                <ChevronDown className="h-3.5 w-3.5 ml-1.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {isActive && onCancelSubscription && (
                <DropdownMenuItem onClick={onCancelSubscription} className="text-destructive">
                  Cancel Subscription
                </DropdownMenuItem>
              )}
              {status === "expired" && onReactivate && (
                <DropdownMenuItem onClick={onReactivate}>
                  Reactivate Subscription
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  );
}
