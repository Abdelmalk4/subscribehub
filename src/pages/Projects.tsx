import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Settings,
  Users,
  Bot,
  MoreVertical,
  ExternalLink,
  Package,
  Loader2,
  BarChart3,
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
        const { count: subsCount } = await supabase
          .from("subscribers")
          .select("*", { count: "exact", head: true })
          .eq("project_id", project.id)
          .eq("status", "active");

        const { data: paidSubscribers } = await supabase
          .from("subscribers")
          .select("plan_id, plans(price)")
          .eq("project_id", project.id)
          .in("status", ["active", "expired"]);

        const lifetimeRevenue = (paidSubscribers || []).reduce((total, sub) => {
          const planPrice = (sub.plans as { price: number } | null)?.price || 0;
          return total + Number(planPrice);
        }, 0);

        const { data: activeSubscribers } = await supabase
          .from("subscribers")
          .select("plan_id, plans(price)")
          .eq("project_id", project.id)
          .eq("status", "active");

        const currentRevenue = (activeSubscribers || []).reduce((total, sub) => {
          const planPrice = (sub.plans as { price: number } | null)?.price || 0;
          return total + Number(planPrice);
        }, 0);

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
          <span className="h-1.5 w-1.5 rounded-full bg-green-500 mr-1.5" />
          Active
        </Badge>
      );
    }
    if (status === "suspended") {
      return <Badge variant="destructive">Suspended</Badge>;
    }
    return <Badge variant="secondary">{status || "Unknown"}</Badge>;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 w-full">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Projects</h1>
          <p className="text-gray-500 text-xs">Manage your Telegram channels and subscription bots.</p>
        </div>
        <Button size="sm" className="gap-1.5 h-7 text-xs" onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-3 w-3" />
          Create Project
        </Button>
      </div>

      {/* Projects Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-3">
        {projects.map((project) => {
          const stats = projectStats[project.id] || { subscribers: 0, revenue: 0, lifetimeRevenue: 0, plans: 0 };
          
          return (
            <div key={project.id} className="p-3 bg-white border border-gray-200 rounded-lg hover:shadow-sm transition-shadow">
              {/* Header */}
              <div className="flex items-start justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-md bg-purple-100 flex items-center justify-center">
                    <Bot className="h-3.5 w-3.5 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900 text-sm">{project.project_name}</h3>
                    <p className="text-[10px] text-gray-500">
                      {project.admin_username ? `@${project.admin_username}` : "Bot connected"}
                    </p>
                  </div>
                </div>
                {getStatusBadge(project.status)}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-2 py-2.5 border-y border-gray-100">
                <div className="text-center">
                  <p className="text-lg font-bold text-gray-900">{stats.subscribers}</p>
                  <p className="text-[10px] text-gray-500">Active Subs</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-gray-900">{stats.plans}</p>
                  <p className="text-[10px] text-gray-500">Plans</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 py-2.5">
                <div className="text-center p-1.5 rounded-md bg-gray-50">
                  <p className="text-xs font-semibold text-gray-900">${stats.revenue}</p>
                  <p className="text-[10px] text-gray-500">Current</p>
                </div>
                <div className="text-center p-1.5 rounded-md bg-purple-50">
                  <p className="text-xs font-semibold text-purple-600">${stats.lifetimeRevenue}</p>
                  <p className="text-[10px] text-gray-500">Lifetime</p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5 pt-1.5">
                <Button
                  variant="outline"
                  className="flex-1 gap-1.5 h-6 text-[10px]"
                  size="sm"
                  onClick={() => handleEditProject(project)}
                >
                  <Settings className="h-3 w-3" />
                  Settings
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 gap-1.5 h-6 text-[10px]"
                  size="sm"
                  onClick={() => handleManagePlans(project)}
                >
                  <Package className="h-3 w-3" />
                  Plans
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6">
                      <MoreVertical className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem className="text-xs">
                      <Users className="h-3 w-3 mr-1.5" />
                      View Subscribers
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-xs">
                      <BarChart3 className="h-3 w-3 mr-1.5" />
                      Analytics
                    </DropdownMenuItem>
                    {project.admin_username && (
                      <DropdownMenuItem
                        className="text-xs"
                        onClick={() => window.open(`https://t.me/${project.admin_username}`, "_blank")}
                      >
                        <ExternalLink className="h-3 w-3 mr-1.5" />
                        Open Bot
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          );
        })}

        {/* Add New Project Card */}
        <div
          className="p-3 border-2 border-dashed border-gray-200 rounded-lg hover:border-purple-300 transition-colors cursor-pointer flex flex-col items-center justify-center min-h-[200px] text-center"
          onClick={() => setCreateDialogOpen(true)}
        >
          <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center mb-2.5">
            <Plus className="h-5 w-5 text-gray-400" />
          </div>
          <h3 className="font-medium text-gray-900 text-sm mb-0.5">Create New Project</h3>
          <p className="text-[10px] text-gray-500">
            Set up a new Telegram channel with subscription management
          </p>
        </div>
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
