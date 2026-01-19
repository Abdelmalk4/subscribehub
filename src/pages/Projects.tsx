import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Settings,
  BarChart3,
  Users,
  Bot,
  MoreVertical,
  ExternalLink,
  Package,
  Loader2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { CreateProjectDialog } from "@/components/projects/CreateProjectDialog";
import { EditProjectDialog } from "@/components/projects/EditProjectDialog";
import { PlansDialog } from "@/components/projects/PlansDialog";

interface Project {
  id: string;
  project_name: string;
  bot_token: string;
  channel_id: string;
  support_contact: string | null;
  status: string | null;
  admin_telegram_id: number | null;
  admin_username: string | null;
  stripe_config: any;
  manual_payment_config: any;
  created_at: string | null;
}

interface ProjectStats {
  [projectId: string]: {
    subscribers: number;
    revenue: number;
    lifetimeRevenue: number;
    plans: number;
  };
}

export default function Projects() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectStats, setProjectStats] = useState<ProjectStats>({});
  const [isLoading, setIsLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [plansDialogOpen, setPlansDialogOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  const fetchProjects = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      setProjects(data || []);

      // Fetch stats for each project
      const stats: ProjectStats = {};
      for (const project of data || []) {
        // Get active subscribers count
        const { count: subsCount } = await supabase
          .from("subscribers")
          .select("*", { count: "exact", head: true })
          .eq("project_id", project.id)
          .eq("status", "active");

        // Get all subscribers who have ever paid (active + expired) for lifetime revenue
        const { data: paidSubscribers } = await supabase
          .from("subscribers")
          .select("plan_id, plans(price)")
          .eq("project_id", project.id)
          .in("status", ["active", "expired"]);

        // Calculate lifetime revenue from all paid subscribers
        const lifetimeRevenue = (paidSubscribers || []).reduce((total, sub) => {
          const planPrice = (sub.plans as { price: number } | null)?.price || 0;
          return total + Number(planPrice);
        }, 0);

        // Calculate current month revenue (active subscribers only)
        const { data: activeSubscribers } = await supabase
          .from("subscribers")
          .select("plan_id, plans(price)")
          .eq("project_id", project.id)
          .eq("status", "active");

        const currentRevenue = (activeSubscribers || []).reduce((total, sub) => {
          const planPrice = (sub.plans as { price: number } | null)?.price || 0;
          return total + Number(planPrice);
        }, 0);

        // Get plan count
        const { count: plansCount } = await supabase
          .from("plans")
          .select("*", { count: "exact", head: true })
          .eq("project_id", project.id)
          .eq("is_active", true);

        stats[project.id] = {
          subscribers: subsCount || 0,
          revenue: currentRevenue,
          lifetimeRevenue: lifetimeRevenue,
          plans: plansCount || 0,
        };
      }
      setProjectStats(stats);
    } catch (error: any) {
      toast.error("Failed to load projects", { description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, [user]);

  const handleEditProject = (project: Project) => {
    setSelectedProject(project);
    setEditDialogOpen(true);
  };

  const handleManagePlans = (project: Project) => {
    setSelectedProject(project);
    setPlansDialogOpen(true);
  };

  const getStatusBadge = (status: string | null) => {
    if (status === "active") {
      return (
        <Badge variant="success">
          <span className="h-1.5 w-1.5 rounded-full bg-success mr-1.5 animate-pulse" />
          Active
        </Badge>
      );
    }
    if (status === "suspended") {
      return (
        <Badge variant="destructive">
          Suspended
        </Badge>
      );
    }
    return <Badge variant="secondary">{status || "Unknown"}</Badge>;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Projects</h1>
          <p className="text-muted-foreground mt-1">
            Manage your Telegram channels and subscription bots.
          </p>
        </div>
        <Button className="gap-2" onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          Create Project
        </Button>
      </div>

      {/* Projects Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects.map((project) => {
          const stats = projectStats[project.id] || { subscribers: 0, revenue: 0, lifetimeRevenue: 0, plans: 0 };
          
          return (
            <Card key={project.id} className="group hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
                      <Bot className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{project.project_name}</CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {project.admin_username ? `@${project.admin_username}` : "Bot connected"}
                      </p>
                    </div>
                  </div>
                  {getStatusBadge(project.status)}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Stats */}
                <div className="grid grid-cols-2 gap-4 py-4 border-y border-border/30">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-foreground">{stats.subscribers}</p>
                    <p className="text-xs text-muted-foreground">Active Subs</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-foreground">{stats.plans}</p>
                    <p className="text-xs text-muted-foreground">Plans</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 pb-2">
                  <div className="text-center p-3 rounded-lg bg-muted/30">
                    <p className="text-lg font-bold text-foreground">
                      ${stats.revenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </p>
                    <p className="text-xs text-muted-foreground">Current</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-primary/10">
                    <p className="text-lg font-bold text-primary">
                      ${stats.lifetimeRevenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </p>
                    <p className="text-xs text-muted-foreground">Lifetime</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    className="flex-1 gap-2"
                    size="sm"
                    onClick={() => handleEditProject(project)}
                  >
                    <Settings className="h-4 w-4" />
                    Settings
                  </Button>
                  <Button
                    variant="secondary"
                    className="flex-1 gap-2"
                    size="sm"
                    onClick={() => handleManagePlans(project)}
                  >
                    <Package className="h-4 w-4" />
                    Plans
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>
                        <Users className="h-4 w-4 mr-2" />
                        View Subscribers
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <BarChart3 className="h-4 w-4 mr-2" />
                        Analytics
                      </DropdownMenuItem>
                      {project.admin_username && (
                        <DropdownMenuItem
                          onClick={() => window.open(`https://t.me/${project.admin_username}`, "_blank")}
                        >
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Open Bot
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {/* Add New Project Card */}
        <Card
          className="border-dashed border-2 hover:border-primary/50 transition-colors cursor-pointer group"
          onClick={() => setCreateDialogOpen(true)}
        >
          <CardContent className="flex flex-col items-center justify-center h-full min-h-[280px] text-center">
            <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4 group-hover:bg-primary/10 transition-colors">
              <Plus className="h-8 w-8 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Create New Project</h3>
            <p className="text-sm text-muted-foreground">
              Set up a new Telegram channel with subscription management
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Dialogs */}
      <CreateProjectDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={fetchProjects}
      />

      <EditProjectDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        project={selectedProject}
        onSuccess={fetchProjects}
      />

      <PlansDialog
        open={plansDialogOpen}
        onOpenChange={setPlansDialogOpen}
        projectId={selectedProject?.id || null}
        projectName={selectedProject?.project_name || ""}
      />
    </div>
  );
}
