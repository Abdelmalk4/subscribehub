import { Wifi, WifiOff, Clock, HelpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatDistanceToNow } from "date-fns";

interface BotHealthBadgeProps {
  lastWebhookAt: string | null;
  webhookStatus: string | null;
  webhookError: string | null;
}

type HealthState = "healthy" | "idle" | "error" | "unknown";

function getHealthState(
  lastWebhookAt: string | null,
  webhookStatus: string | null
): HealthState {
  if (!lastWebhookAt) return "unknown";
  
  const lastActivity = new Date(lastWebhookAt);
  const now = new Date();
  const hoursAgo = (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60);

  if (webhookStatus === "error") return "error";
  if (hoursAgo < 24) return "healthy";
  if (hoursAgo < 72) return "idle";
  return "error";
}

const healthConfig: Record<HealthState, { label: string; icon: React.ElementType; className: string; description: string }> = {
  healthy: {
    label: "Bot OK",
    icon: Wifi,
    className: "bg-success/10 text-success border-success/30",
    description: "Bot is receiving updates normally",
  },
  idle: {
    label: "Idle",
    icon: Clock,
    className: "bg-warning/10 text-warning border-warning/30",
    description: "No activity in the last 24-72 hours",
  },
  error: {
    label: "Error",
    icon: WifiOff,
    className: "bg-destructive/10 text-destructive border-destructive/30",
    description: "Webhook may not be working correctly",
  },
  unknown: {
    label: "Unknown",
    icon: HelpCircle,
    className: "bg-muted text-muted-foreground border-border",
    description: "Bot hasn't received any updates yet",
  },
};

export function BotHealthBadge({ lastWebhookAt, webhookStatus, webhookError }: BotHealthBadgeProps) {
  const state = getHealthState(lastWebhookAt, webhookStatus);
  const config = healthConfig[state];
  const Icon = config.icon;

  const tooltipContent = (
    <div className="space-y-1">
      <p className="font-medium">{config.description}</p>
      {lastWebhookAt && (
        <p className="text-xs opacity-80">
          Last activity: {formatDistanceToNow(new Date(lastWebhookAt), { addSuffix: true })}
        </p>
      )}
      {webhookError && (
        <p className="text-xs text-destructive">{webhookError}</p>
      )}
    </div>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className={`gap-1 text-[10px] ${config.className}`}>
          <Icon className="h-3 w-3" />
          {config.label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[200px]">
        {tooltipContent}
      </TooltipContent>
    </Tooltip>
  );
}
