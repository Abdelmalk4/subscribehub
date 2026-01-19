import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { BarChart3, FolderKanban, Users } from "lucide-react";

interface UsageSummaryCardProps {
  projectsUsed: number;
  maxProjects: number;
  subscribersUsed: number;
  maxSubscribers: number;
}

export function UsageSummaryCard({
  projectsUsed,
  maxProjects,
  subscribersUsed,
  maxSubscribers,
}: UsageSummaryCardProps) {
  const projectPercentage = maxProjects > 0 ? Math.min((projectsUsed / maxProjects) * 100, 100) : 0;
  const subscriberPercentage = maxSubscribers > 0 ? Math.min((subscribersUsed / maxSubscribers) * 100, 100) : 0;

  const getProgressColor = (percentage: number) => {
    if (percentage >= 90) return "bg-destructive";
    if (percentage >= 75) return "bg-amber-500";
    return "bg-primary";
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
            <BarChart3 className="h-4 w-4 text-emerald-500" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Usage Summary</h3>
            <p className="text-xs text-muted-foreground">Resource utilization</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Projects Usage */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <FolderKanban className="h-3.5 w-3.5" />
                Projects
              </span>
              <span className="font-medium text-foreground">
                {projectsUsed} of {maxProjects < 0 ? "∞" : maxProjects}
              </span>
            </div>
            {maxProjects > 0 && (
              <div className="relative">
                <Progress value={projectPercentage} className="h-2" />
                <div
                  className={`absolute inset-0 h-2 rounded-full ${getProgressColor(projectPercentage)}`}
                  style={{ width: `${projectPercentage}%` }}
                />
              </div>
            )}
          </div>

          {/* Subscribers Usage */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Users className="h-3.5 w-3.5" />
                Subscribers
              </span>
              <span className="font-medium text-foreground">
                {subscribersUsed.toLocaleString()} of {maxSubscribers < 0 ? "∞" : maxSubscribers.toLocaleString()}
              </span>
            </div>
            {maxSubscribers > 0 && (
              <div className="relative">
                <Progress value={subscriberPercentage} className="h-2" />
                <div
                  className={`absolute inset-0 h-2 rounded-full ${getProgressColor(subscriberPercentage)}`}
                  style={{ width: `${subscriberPercentage}%` }}
                />
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
