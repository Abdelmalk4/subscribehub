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
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Mock data
const projects = [
  {
    id: "1",
    name: "Crypto Signals VIP",
    botUsername: "@crypto_signals_bot",
    status: "active",
    subscribers: 45,
    revenue: 1240,
    plans: 3,
  },
  {
    id: "2",
    name: "Trading Academy",
    botUsername: "@trading_academy_bot",
    status: "active",
    subscribers: 78,
    revenue: 2890,
    plans: 2,
  },
  {
    id: "3",
    name: "Premium Forex Tips",
    botUsername: "@forex_tips_bot",
    status: "active",
    subscribers: 33,
    revenue: 650,
    plans: 2,
  },
];

export default function Projects() {
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
        <Button variant="gradient" className="gap-2">
          <Plus className="h-4 w-4" />
          Create Project
        </Button>
      </div>

      {/* Projects Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects.map((project) => (
          <Card key={project.id} variant="glass-hover" className="group">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
                    <Bot className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{project.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">{project.botUsername}</p>
                  </div>
                </div>
                <Badge variant="success">
                  <span className="h-1.5 w-1.5 rounded-full bg-success mr-1.5 animate-pulse" />
                  Active
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-4 py-4 border-y border-border/30">
                <div className="text-center">
                  <p className="text-2xl font-bold text-foreground">{project.subscribers}</p>
                  <p className="text-xs text-muted-foreground">Subs</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-foreground">${project.revenue}</p>
                  <p className="text-xs text-muted-foreground">Revenue</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-foreground">{project.plans}</p>
                  <p className="text-xs text-muted-foreground">Plans</p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <Link to={`/projects/${project.id}/settings`} className="flex-1">
                  <Button variant="glass" className="w-full gap-2" size="sm">
                    <Settings className="h-4 w-4" />
                    Settings
                  </Button>
                </Link>
                <Link to={`/projects/${project.id}/analytics`} className="flex-1">
                  <Button variant="glass" className="w-full gap-2" size="sm">
                    <BarChart3 className="h-4 w-4" />
                    Analytics
                  </Button>
                </Link>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="glass">
                    <DropdownMenuItem>
                      <Users className="h-4 w-4 mr-2" />
                      View Subscribers
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Open Bot
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardContent>
          </Card>
        ))}

        {/* Add New Project Card */}
        <Card
          variant="glass"
          className="border-dashed border-2 hover:border-primary/50 transition-colors cursor-pointer group"
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
    </div>
  );
}
