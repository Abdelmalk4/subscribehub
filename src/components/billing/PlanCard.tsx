import React from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PlanCardProps {
  planName: string;
  price: number;
  period?: string;
  features: string[];
  iconColor?: "pink" | "purple" | "orange";
  isCurrentPlan?: boolean;
  onSelectPlan?: () => void;
  disabled?: boolean;
}

const iconColors = {
  pink: "bg-pink-100 text-pink-600",
  purple: "bg-purple-100 text-purple-600",
  orange: "bg-orange-100 text-orange-600",
};

export function PlanCard({
  planName,
  price,
  period = "/mth",
  features,
  iconColor = "pink",
  isCurrentPlan = false,
  onSelectPlan,
  disabled = false,
}: PlanCardProps) {
  return (
    <div className="flex flex-col h-full p-5 border border-gray-200 rounded-xl bg-white">
      {/* Header with icon and price */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", iconColors[iconColor])}>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18" />
              <path d="M9 21V9" />
            </svg>
          </div>
          <span className="font-semibold text-gray-900">{planName}</span>
        </div>
        <span className="text-gray-900 font-medium">
          ${price}{period}
        </span>
      </div>

      {/* Features */}
      <ul className="space-y-2.5 flex-1 mb-5">
        {features.slice(0, 5).map((feature, index) => (
          <li key={index} className="flex items-start gap-2 text-sm text-gray-600">
            <Check className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      {/* CTA Button */}
      <Button
        variant="outline"
        className="w-full"
        disabled={isCurrentPlan || disabled}
        onClick={onSelectPlan}
      >
        {isCurrentPlan ? "Current plan" : "Switch to this plan"}
      </Button>
    </div>
  );
}