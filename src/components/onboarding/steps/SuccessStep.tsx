import { CheckCircle, ExternalLink, Plus, LayoutDashboard, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import type { OnboardingData } from "../OnboardingWizard";
import confetti from "canvas-confetti";
import { useEffect } from "react";

interface SuccessStepProps {
  data: OnboardingData;
  projectId: string | null;
  onGoToDashboard: () => void;
}

export function SuccessStep({ data, projectId, onGoToDashboard }: SuccessStepProps) {
  const navigate = useNavigate();
  const botLink = data.botUsername ? `https://t.me/${data.botUsername}` : null;

  useEffect(() => {
    // Celebration confetti
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
    });
  }, []);

  const handleCopyLink = () => {
    if (botLink) {
      navigator.clipboard.writeText(botLink);
      toast.success("Bot link copied!");
    }
  };

  const handleOpenBot = () => {
    if (botLink) {
      window.open(botLink, "_blank");
    }
  };

  const handleAddMorePlans = () => {
    navigate("/projects");
  };

  return (
    <div className="text-center space-y-6">
      {/* Success Icon */}
      <div className="mx-auto h-16 w-16 rounded-full bg-success/10 flex items-center justify-center">
        <CheckCircle className="h-8 w-8 text-success" />
      </div>

      {/* Headline */}
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-foreground">You're all set! 🎉</h1>
        <p className="text-muted-foreground text-sm">
          Your subscription bot is ready to start accepting payments.
        </p>
      </div>

      {/* Project Summary */}
      <div className="bg-card border rounded-lg p-4 text-left space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Project</span>
          <span className="text-sm font-medium text-foreground">{data.projectName}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Bot</span>
          <span className="text-sm font-medium text-foreground">@{data.botUsername}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">First Plan</span>
          <span className="text-sm font-medium text-foreground">
            {data.planName} - ${data.price}/{data.durationDays}d
          </span>
        </div>
      </div>

      {/* Bot Link */}
      {botLink && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Share your bot link:</p>
          <div className="flex items-center gap-2 bg-muted rounded-lg p-2">
            <code className="flex-1 text-sm text-foreground truncate">{botLink}</code>
            <Button variant="ghost" size="icon" onClick={handleCopyLink}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="space-y-3 pt-2">
        {botLink && (
          <Button onClick={handleOpenBot} size="lg" className="w-full gap-2">
            <ExternalLink className="h-4 w-4" />
            Open Bot in Telegram
          </Button>
        )}
        
        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" onClick={handleAddMorePlans} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Add More Plans
          </Button>
          <Button variant="outline" onClick={onGoToDashboard} className="gap-1.5">
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </Button>
        </div>
      </div>

      {/* Next Steps */}
      <div className="text-left bg-muted/50 rounded-lg p-4">
        <p className="text-sm font-medium text-foreground mb-2">What's next?</p>
        <ul className="text-xs text-muted-foreground space-y-1.5">
          <li>• Share your bot link with potential subscribers</li>
          <li>• Users will /start the bot to see your plans</li>
          <li>• You'll be notified when someone submits a payment</li>
          <li>• Approve payments to grant channel access automatically</li>
        </ul>
      </div>
    </div>
  );
}
