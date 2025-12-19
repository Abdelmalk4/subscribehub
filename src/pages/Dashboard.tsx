import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  FolderOpen,
  Users,
  DollarSign,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  Clock,
  Zap,
  Crown,
  AlertTriangle,
} from "lucide-react";
import { Link } from "react-router-dom";

// Mock data
const stats = {
  revenue: { value: "$1,240", change: "+12.5%", isPositive: true },
  subscribers: { value: "156", change: "+23", isPositive: true },
  projects: { value: "3", limit: 5 },
  expiringSoon: { value: "8", days: "next 7 days" },
};

const recentActivity = [
  { id: 1, type: "subscription", message: "New subscriber @john_doe", time: "2 min ago", project: "Crypto Signals" },
  { id: 2, type: "payment", message: "Payment received $10.00", time: "15 min ago", project: "Trading Academy" },
  { id: 3, type: "expired", message: "Subscription expired @alice_w", time: "1 hour ago", project: "Crypto Signals" },
  { id: 4, type: "subscription", message: "New subscriber @mike_trading", time: "3 hours ago", project: "VIP Access" },
];

export default function Dashboard() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Welcome back, John! 👋</h1>
          <p className="text-muted-foreground mt-1">Here's what's happening with your channels today.</p>
        </div>
        <Link to="/projects/new">
          <Button variant="gradient" className="gap-2">
            <Plus className="h-4 w-4" />
            New Project
          </Button>
        </Link>
      </div>

      {/* Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Subscription Status Card - Span 2 columns on large screens */}
        <Card variant="glow" className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Crown className="h-5 w-5 text-warning" />
                Your Subscription
              </CardTitle>
              <Badge variant="success">
                <span className="h-1.5 w-1.5 rounded-full bg-success mr-1.5 animate-pulse" />
                Pro Plan
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Trial ends in</span>
              <span className="font-semibold text-foreground">10 days</span>
            </div>
            <Progress value={40} className="h-2" />
            
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Projects Used</p>
                <p className="text-lg font-semibold text-foreground">
                  {stats.projects.value} <span className="text-muted-foreground text-sm font-normal">/ {stats.projects.limit}</span>
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Subscribers Used</p>
                <p className="text-lg font-semibold text-foreground">
                  156 <span className="text-muted-foreground text-sm font-normal">/ 500</span>
                </p>
              </div>
            </div>

            <Link to="/billing">
              <Button variant="glass-primary" className="w-full mt-2">
                <Zap className="h-4 w-4 mr-2" />
                Upgrade Plan
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card variant="glass">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link to="/projects/new" className="block">
              <Button variant="glass" className="w-full justify-start gap-3">
                <FolderOpen className="h-4 w-4 text-primary" />
                Create New Project
              </Button>
            </Link>
            <Link to="/subscribers" className="block">
              <Button variant="glass" className="w-full justify-start gap-3">
                <Users className="h-4 w-4 text-secondary" />
                Manage Subscribers
              </Button>
            </Link>
            <Link to="/analytics" className="block">
              <Button variant="glass" className="w-full justify-start gap-3">
                <TrendingUp className="h-4 w-4 text-success" />
                View Analytics
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Revenue Card */}
        <Card variant="glass-hover">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="h-12 w-12 rounded-xl bg-success/20 flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-success" />
              </div>
              <Badge variant={stats.revenue.isPositive ? "success" : "error"} className="gap-1">
                {stats.revenue.isPositive ? (
                  <ArrowUpRight className="h-3 w-3" />
                ) : (
                  <ArrowDownRight className="h-3 w-3" />
                )}
                {stats.revenue.change}
              </Badge>
            </div>
            <div className="mt-4">
              <p className="text-3xl font-bold text-foreground">{stats.revenue.value}</p>
              <p className="text-sm text-muted-foreground">Revenue this month</p>
            </div>
          </CardContent>
        </Card>

        {/* Active Subscribers Card */}
        <Card variant="glass-hover">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="h-12 w-12 rounded-xl bg-primary/20 flex items-center justify-center">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <Badge variant="info" className="gap-1">
                <ArrowUpRight className="h-3 w-3" />
                {stats.subscribers.change}
              </Badge>
            </div>
            <div className="mt-4">
              <p className="text-3xl font-bold text-foreground">{stats.subscribers.value}</p>
              <p className="text-sm text-muted-foreground">Active subscribers</p>
            </div>
          </CardContent>
        </Card>

        {/* Expiring Soon Card */}
        <Card variant="glass-hover">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="h-12 w-12 rounded-xl bg-warning/20 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-warning" />
              </div>
              <Badge variant="warning">
                <Clock className="h-3 w-3 mr-1" />
                {stats.expiringSoon.days}
              </Badge>
            </div>
            <div className="mt-4">
              <p className="text-3xl font-bold text-foreground">{stats.expiringSoon.value}</p>
              <p className="text-sm text-muted-foreground">Expiring soon</p>
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity - Span 2 columns */}
        <Card variant="glass" className="md:col-span-2 lg:col-span-3">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Recent Activity</CardTitle>
              <Link to="/subscribers">
                <Button variant="ghost" size="sm" className="text-primary">
                  View All
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivity.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={`h-2 w-2 rounded-full ${
                      activity.type === "subscription" ? "bg-success" :
                      activity.type === "payment" ? "bg-primary" :
                      "bg-warning"
                    }`} />
                    <div>
                      <p className="text-sm font-medium text-foreground">{activity.message}</p>
                      <p className="text-xs text-muted-foreground">{activity.project}</p>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">{activity.time}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
