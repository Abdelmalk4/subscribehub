import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, ArrowRight, MessageSquare, Zap, Briefcase, Building2, Crown } from "lucide-react";
import { cn } from "@/lib/utils";

interface PlanCardProps {
  planName: string;
  price: number;
  period?: string;
  features: string[];
  maxProjects: number;
  maxSubscribers: number;
  accentColor: "primary" | "cyan" | "accent";
  isCurrentPlan?: boolean;
  isPopular?: boolean;
  isUnlimited?: boolean;
  onSelectPlan?: () => void;
  onContactSales?: () => void;
  disabled?: boolean;
}

const accentStyles = {
  primary: {
    iconBg: "bg-primary-50",
    iconGradient: "from-primary-400 to-primary-600",
    ring: "ring-primary-200",
  },
  cyan: {
    iconBg: "bg-cyan-50",
    iconGradient: "from-cyan-400 to-cyan-600",
    ring: "ring-cyan-200",
  },
  accent: {
    iconBg: "bg-pink-50",
    iconGradient: "from-accent-400 to-accent-600",
    ring: "ring-accent-200",
  },
};

const planIcons: Record<string, React.ElementType> = {
  starter: Zap,
  pro: Briefcase,
  premium: Building2,
  unlimited: Crown,
};

export function PlanCard({
  planName,
  price,
  period = "/mth",
  features,
  maxProjects,
  maxSubscribers,
  accentColor = "primary",
  isCurrentPlan = false,
  isPopular = false,
  isUnlimited = false,
  onSelectPlan,
  onContactSales,
  disabled = false,
}: PlanCardProps) {
  const styles = accentStyles[accentColor];
  const planSlug = planName.toLowerCase().replace(/\s+/g, "");
  const Icon = planIcons[planSlug] || Zap;

  return (
    <Card
      className={cn(
        "relative flex flex-col h-full transition-shadow hover:shadow-md",
        isPopular && "ring-2 ring-primary-500"
      )}
    >
      {isPopular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="bg-primary-500 text-white text-xs font-medium px-3 py-1 rounded-full">
            Most Popular
          </span>
        </div>
      )}

      <CardContent className="flex flex-col flex-1 p-6">
        {/* Header */}
        <div className="mb-5">
          <div className="flex items-center gap-3 mb-3">
            {/* Icon with gradient */}
            <div className={cn("p-2.5 rounded-lg", styles.iconBg)}>
              <div
                className={cn(
                  "h-5 w-5 bg-gradient-to-br bg-clip-text text-transparent",
                  styles.iconGradient
                )}
              >
                <Icon className={cn("h-5 w-5", `text-${accentColor}-500`)} />
              </div>
            </div>
            <h3 className="text-lg font-semibold text-gray-900">{planName}</h3>
          </div>

          <div className="flex items-baseline gap-1">
            {isUnlimited ? (
              <span className="text-3xl font-bold text-gray-900">Contact Us</span>
            ) : (
              <>
                <span className="text-3xl font-bold text-gray-900">${price}</span>
                <span className="text-gray-500 text-sm">{period}</span>
              </>
            )}
          </div>

          <p className="text-sm text-gray-500 mt-1">
            {maxProjects < 0 ? "Unlimited" : maxProjects} projects,{" "}
            {maxSubscribers < 0 ? "Unlimited" : maxSubscribers.toLocaleString()} subscribers
          </p>
        </div>

        {/* Features List */}
        <ul className="space-y-3 flex-1">
          {features.map((feature, index) => (
            <li key={index} className="flex items-start gap-2.5 text-sm">
              <Check className="h-4 w-4 text-success-500 flex-shrink-0 mt-0.5" />
              <span className="text-gray-600">{feature}</span>
            </li>
          ))}
        </ul>

        {/* CTA Button */}
        <div className="mt-6">
          {isUnlimited ? (
            <Button
              variant="secondary"
              className="w-full"
              onClick={onContactSales}
            >
              <MessageSquare className="h-4 w-4 mr-2" />
              Talk to Sales
            </Button>
          ) : (
            <Button
              variant={isCurrentPlan ? "outline" : isPopular ? "default" : "secondary"}
              className="w-full"
              disabled={isCurrentPlan || disabled}
              onClick={onSelectPlan}
            >
              {isCurrentPlan ? (
                "Current plan"
              ) : (
                <>
                  Switch to this plan
                  <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
