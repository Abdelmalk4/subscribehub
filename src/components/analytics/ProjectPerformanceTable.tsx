import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProjectStats } from "@/hooks/useAnalytics";

interface ProjectPerformanceTableProps {
  data: ProjectStats[];
}

export function ProjectPerformanceTable({ data }: ProjectPerformanceTableProps) {
  if (data.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2 pt-3 px-3">
        <CardTitle className="text-sm">Project Performance</CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/30">
                <th className="text-left py-2 px-3 text-muted-foreground font-medium text-xs">Project</th>
                <th className="text-right py-2 px-3 text-muted-foreground font-medium text-xs">Subscribers</th>
                <th className="text-right py-2 px-3 text-muted-foreground font-medium text-xs">Revenue</th>
                <th className="text-right py-2 px-3 text-muted-foreground font-medium text-xs">Avg/Sub</th>
              </tr>
            </thead>
            <tbody>
              {data.map((project, index) => (
                <tr key={project.name} className={index !== data.length - 1 ? "border-b border-border/20" : ""}>
                  <td className="py-2 px-3 text-foreground font-medium text-xs">{project.name}</td>
                  <td className="py-2 px-3 text-right text-foreground text-xs">{project.subscribers}</td>
                  <td className="py-2 px-3 text-right text-success font-medium text-xs">
                    ${project.revenue.toFixed(2)}
                  </td>
                  <td className="py-2 px-3 text-right text-muted-foreground text-xs">
                    ${project.subscribers > 0 ? (project.revenue / project.subscribers).toFixed(2) : "0.00"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
