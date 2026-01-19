import { cn } from "@/lib/utils";

interface BillingCycleToggleProps {
  value: "monthly" | "yearly";
  onChange: (value: "monthly" | "yearly") => void;
}

export function BillingCycleToggle({ value, onChange }: BillingCycleToggleProps) {
  return (
    <div className="flex items-center justify-center gap-2">
      <div className="flex bg-muted rounded-lg p-1">
        <button
          onClick={() => onChange("monthly")}
          className={cn(
            "px-4 py-1.5 text-xs font-medium rounded-md transition-all",
            value === "monthly"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Monthly
        </button>
        <button
          onClick={() => onChange("yearly")}
          className={cn(
            "px-4 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5",
            value === "yearly"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Yearly
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 font-semibold">
            -20%
          </span>
        </button>
      </div>
    </div>
  );
}
