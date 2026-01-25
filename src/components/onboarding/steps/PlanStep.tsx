import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { OnboardingData } from "../OnboardingWizard";

interface PlanStepProps {
  data: OnboardingData;
  updateData: (updates: Partial<OnboardingData>) => void;
  onComplete: () => void;
  onBack: () => void;
  isSubmitting: boolean;
}

const DURATION_PRESETS = [
  { label: "Week", days: 7 },
  { label: "Month", days: 30 },
  { label: "Quarter", days: 90 },
  { label: "Year", days: 365 },
];

export function PlanStep({ data, updateData, onComplete, onBack, isSubmitting }: PlanStepProps) {
  const isValid = data.planName.trim().length >= 2 && data.price > 0 && data.durationDays > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isValid && !isSubmitting) {
      onComplete();
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-semibold text-foreground">Create your first plan</h2>
        <p className="text-muted-foreground text-sm">
          You can add more plans later. Let's start with one.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Plan Name */}
        <div className="space-y-2">
          <Label htmlFor="planName">Plan Name *</Label>
          <Input
            id="planName"
            placeholder="e.g., Monthly Access"
            value={data.planName}
            onChange={(e) => updateData({ planName: e.target.value })}
          />
        </div>

        {/* Price */}
        <div className="space-y-2">
          <Label htmlFor="price">Price (USD) *</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
            <Input
              id="price"
              type="number"
              min="1"
              step="0.01"
              placeholder="29"
              value={data.price || ""}
              onChange={(e) => updateData({ price: parseFloat(e.target.value) || 0 })}
              className="pl-7"
            />
          </div>
        </div>

        {/* Duration */}
        <div className="space-y-2">
          <Label>Duration *</Label>
          <div className="grid grid-cols-4 gap-2">
            {DURATION_PRESETS.map((preset) => (
              <Button
                key={preset.days}
                type="button"
                variant={data.durationDays === preset.days ? "default" : "outline"}
                size="sm"
                onClick={() => updateData({ durationDays: preset.days })}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <Input
              type="number"
              min="1"
              placeholder="Custom days"
              value={DURATION_PRESETS.some((p) => p.days === data.durationDays) ? "" : data.durationDays || ""}
              onChange={(e) => updateData({ durationDays: parseInt(e.target.value) || 0 })}
              className="flex-1"
            />
            <span className="text-sm text-muted-foreground">days</span>
          </div>
        </div>

        {/* Preview */}
        <div className="bg-muted/50 rounded-lg p-4 mt-4">
          <p className="text-xs text-muted-foreground mb-2">Preview</p>
          <div className="flex items-center justify-between">
            <span className="font-medium text-foreground">{data.planName || "Plan Name"}</span>
            <span className="text-primary font-semibold">
              ${data.price || 0}/{data.durationDays} days
            </span>
          </div>
        </div>

        <div className="flex gap-3 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={onBack}
            disabled={isSubmitting}
            className="gap-1.5"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <Button type="submit" disabled={!isValid || isSubmitting} className="flex-1 gap-1.5">
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Create Project
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
