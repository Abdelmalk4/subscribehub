import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { OnboardingData } from "../OnboardingWizard";

interface ProjectStepProps {
  data: OnboardingData;
  updateData: (updates: Partial<OnboardingData>) => void;
  onNext: () => void;
  onBack: () => void;
}

export function ProjectStep({ data, updateData, onNext, onBack }: ProjectStepProps) {
  const isValid = data.projectName.trim().length >= 2;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isValid) onNext();
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-semibold text-foreground">Name your project</h2>
        <p className="text-muted-foreground text-sm">
          This is how you'll identify this channel in your dashboard.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="projectName">Project Name *</Label>
          <Input
            id="projectName"
            placeholder="e.g., Premium Trading Signals"
            value={data.projectName}
            onChange={(e) => updateData({ projectName: e.target.value })}
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            This won't be visible to your subscribers
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="supportContact">Support Contact (optional)</Label>
          <Input
            id="supportContact"
            placeholder="e.g., @yourusername or support@email.com"
            value={data.supportContact}
            onChange={(e) => updateData({ supportContact: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            Shown to subscribers when they need help
          </p>
        </div>

        <div className="flex gap-3 pt-4">
          <Button type="button" variant="outline" onClick={onBack} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <Button type="submit" disabled={!isValid} className="flex-1 gap-1.5">
            Continue
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}
