import { Bot, Zap, Shield, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";

interface WelcomeStepProps {
  onNext: () => void;
  onSkip: () => void;
}

export function WelcomeStep({ onNext, onSkip }: WelcomeStepProps) {
  return (
    <div className="text-center space-y-6">
      {/* Logo/Icon */}
      <div className="mx-auto h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
        <Bot className="h-8 w-8 text-primary" />
      </div>

      {/* Headline */}
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-foreground">
          Turn your Telegram channel into a revenue machine
        </h1>
        <p className="text-muted-foreground text-sm">
          Set up your subscription bot in under 5 minutes. No coding required.
        </p>
      </div>

      {/* Benefits */}
      <div className="grid gap-3 text-left">
        <div className="flex items-start gap-3 p-3 rounded-lg bg-card border">
          <div className="h-8 w-8 rounded-md bg-success/10 flex items-center justify-center flex-shrink-0">
            <DollarSign className="h-4 w-4 text-success" />
          </div>
          <div>
            <p className="font-medium text-sm text-foreground">Automated Payments</p>
            <p className="text-xs text-muted-foreground">
              Accept payments 24/7, manually or via Stripe
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 p-3 rounded-lg bg-card border">
          <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Shield className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="font-medium text-sm text-foreground">Access Control</p>
            <p className="text-xs text-muted-foreground">
              Auto-kick expired users, protect your content
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 p-3 rounded-lg bg-card border">
          <div className="h-8 w-8 rounded-md bg-warning/10 flex items-center justify-center flex-shrink-0">
            <Zap className="h-4 w-4 text-warning" />
          </div>
          <div>
            <p className="font-medium text-sm text-foreground">Zero Maintenance</p>
            <p className="text-xs text-muted-foreground">
              Renewals, reminders, and kicks happen automatically
            </p>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="space-y-3 pt-2">
        <Button onClick={onNext} size="lg" className="w-full">
          Get Started
        </Button>
        <button
          onClick={onSkip}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          I'll set this up later
        </button>
      </div>
    </div>
  );
}
