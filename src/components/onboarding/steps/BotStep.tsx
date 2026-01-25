import { useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle, XCircle, Loader2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import type { OnboardingData } from "../OnboardingWizard";

interface BotStepProps {
  data: OnboardingData;
  updateData: (updates: Partial<OnboardingData>) => void;
  onNext: () => void;
  onBack: () => void;
}

interface ValidationResult {
  valid: boolean;
  error?: string;
  bot?: { username: string };
  channel?: { title: string };
}

export function BotStep({ data, updateData, onNext, onBack }: BotStepProps) {
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);

  const handleValidate = async () => {
    if (!data.botToken || !data.channelId) return;

    setIsValidating(true);
    setValidationResult(null);

    try {
      const { data: result, error } = await supabase.functions.invoke("validate-project-setup", {
        body: {
          bot_token: data.botToken,
          channel_id: data.channelId,
        },
      });

      if (error) {
        setValidationResult({ valid: false, error: error.message });
        return;
      }

      setValidationResult(result);

      if (result?.valid) {
        updateData({
          botUsername: result.bot?.username || "",
          channelTitle: result.channel?.title || "",
        });
      }
    } catch (err: any) {
      setValidationResult({ valid: false, error: err.message || "Validation failed" });
    } finally {
      setIsValidating(false);
    }
  };

  const handleContinue = () => {
    if (validationResult?.valid) {
      onNext();
    }
  };

  const canContinue = validationResult?.valid === true;

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-semibold text-foreground">Connect your bot</h2>
        <p className="text-muted-foreground text-sm">
          We'll use this bot to manage subscriptions for your channel.
        </p>
      </div>

      <div className="space-y-4">
        {/* Bot Token */}
        <div className="space-y-2">
          <Label htmlFor="botToken">Bot Token *</Label>
          <Input
            id="botToken"
            type="password"
            placeholder="123456789:ABCdefGHIjklMNOpqrSTUvwxYZ"
            value={data.botToken}
            onChange={(e) => {
              updateData({ botToken: e.target.value });
              setValidationResult(null);
            }}
          />
          <a
            href="https://t.me/BotFather"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            Get a token from @BotFather
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        {/* Channel ID */}
        <div className="space-y-2">
          <Label htmlFor="channelId">Channel ID *</Label>
          <Input
            id="channelId"
            placeholder="-1001234567890"
            value={data.channelId}
            onChange={(e) => {
              updateData({ channelId: e.target.value });
              setValidationResult(null);
            }}
          />
          <p className="text-xs text-muted-foreground">
            Starts with -100 for channels and supergroups
          </p>
        </div>

        {/* Validate Button */}
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={handleValidate}
          disabled={!data.botToken || !data.channelId || isValidating}
        >
          {isValidating ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Validating...
            </>
          ) : (
            "Validate Connection"
          )}
        </Button>

        {/* Validation Result */}
        {validationResult && (
          <div
            className={`p-3 rounded-lg border ${
              validationResult.valid
                ? "bg-success/10 border-success/30"
                : "bg-destructive/10 border-destructive/30"
            }`}
          >
            <div className="flex items-start gap-2">
              {validationResult.valid ? (
                <CheckCircle className="h-5 w-5 text-success flex-shrink-0" />
              ) : (
                <XCircle className="h-5 w-5 text-destructive flex-shrink-0" />
              )}
              <div>
                {validationResult.valid ? (
                  <>
                    <p className="font-medium text-sm text-foreground">Connection successful!</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Bot: @{data.botUsername || validationResult.bot?.username}
                      <br />
                      Channel: {data.channelTitle || validationResult.channel?.title}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-medium text-sm text-foreground">Validation failed</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {validationResult.error}
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Help Text */}
        <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground space-y-2">
          <p className="font-medium text-foreground">Before continuing, make sure:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>The bot is added to your channel as an administrator</li>
            <li>The bot has "Invite Users via Link" permission</li>
          </ul>
        </div>
      </div>

      <div className="flex gap-3">
        <Button type="button" variant="outline" onClick={onBack} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <Button onClick={handleContinue} disabled={!canContinue} className="flex-1 gap-1.5">
          Continue
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
