import { Link, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FolderOpen,
  Users,
  BarChart3,
  Settings,
  CreditCard,
  LogOut,
  Search,
  Bell,
  Sparkles,
  MessageSquare,
  Shield,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { differenceInDays } from "date-fns";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: number;
}

const clientNavItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Projects", href: "/projects", icon: FolderOpen },
  { label: "Subscribers", href: "/subscribers", icon: Users },
  { label: "Analytics", href: "/analytics", icon: BarChart3 },
  { label: "Billing", href: "/billing", icon: CreditCard },
  { label: "Settings", href: "/settings", icon: Settings },
];

const adminNavItems: NavItem[] = [
  { label: "Overview", href: "/super-admin", icon: Shield },
  { label: "Clients", href: "/super-admin/clients", icon: Users },
  { label: "Payments", href: "/super-admin/payments", icon: CreditCard },
  { label: "Settings", href: "/super-admin/settings", icon: Settings },
];

interface SidebarProps {
  isAdmin?: boolean;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

interface Subscription {
  status: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
  subscription_plans: {
    plan_name: string;
    max_projects: number;
    max_subscribers: number;
  } | null;
}

export function Sidebar({ isAdmin = false, collapsed = false, onCollapsedChange }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  
  const navItems = isAdmin ? adminNavItems : clientNavItems;

  useEffect(() => {
    if (user && !isAdmin) {
      fetchSubscription();
    }
  }, [user, isAdmin]);

  const fetchSubscription = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("client_subscriptions")
      .select(`
        status,
        trial_ends_at,
        current_period_end,
        subscription_plans (
          plan_name,
          max_projects,
          max_subscribers
        )
      `)
      .eq("client_id", user.id)
      .maybeSingle();
    setSubscription(data as Subscription | null);
  };

  const handleSignOut = async () => {
    await signOut();
    toast.success("Signed out successfully");
    navigate("/login");
  };

  const getSubscriptionInfo = () => {
    if (!subscription) {
      return { planName: "Free Trial", daysLeft: 14, progress: 0 };
    }
    const planName = subscription.subscription_plans?.plan_name || "Free Trial";
    const endDate = subscription.trial_ends_at || subscription.current_period_end;
    if (!endDate) {
      return { planName, daysLeft: 0, progress: 100 };
    }
    const daysLeft = Math.max(0, differenceInDays(new Date(endDate), new Date()));
    const totalDays = subscription.status === "trial" ? 14 : 30;
    const progress = Math.round(((totalDays - daysLeft) / totalDays) * 100);
    return { planName, daysLeft, progress };
  };

  const { daysLeft, progress } = getSubscriptionInfo();

  return (
    <aside className="sticky top-0 z-30 h-screen w-60 shrink-0 border-r border-border bg-card">
      <div className="h-full flex flex-col">
        {/* Logo */}
        <div className="h-14 flex items-center px-4 border-b border-border">
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-foreground flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-background" />
            </div>
            <span className="font-semibold text-foreground">SubscribeHub</span>
          </Link>
        </div>

        {/* Search */}
        <div className="p-3">
          <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground bg-muted/50 rounded-lg hover:bg-muted transition-colors">
            <Search className="h-4 w-4" />
            <span>Search...</span>
            <kbd className="ml-auto text-xs bg-background px-1.5 py-0.5 rounded border border-border">⌘K</kbd>
          </button>
        </div>

        {/* Quick Links */}
        <div className="px-3 space-y-1">
          <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors">
            <Bell className="h-4 w-4" />
            <span>Notifications</span>
          </button>
          <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors">
            <MessageSquare className="h-4 w-4" />
            <span>AI Assistant</span>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto custom-scrollbar">
          {navItems.map((item) => {
            const isActive = location.pathname === item.href;
            const Icon = item.icon;
            
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                  isActive
                    ? "bg-muted text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
                {item.badge && (
                  <span className="ml-auto bg-destructive text-destructive-foreground text-xs px-1.5 py-0.5 rounded-full">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Subscription Card */}
        {!isAdmin && (
          <div className="p-3">
            <div className="p-3 bg-muted/50 rounded-lg border border-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-foreground">{daysLeft} Days Left!</span>
                <button 
                  onClick={() => navigate("/billing")}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <span className="sr-only">Close</span>
                  ×
                </button>
              </div>
              <Progress value={100 - progress} className="h-1.5 mb-2" />
              <p className="text-xs text-muted-foreground mb-3">
                Select a plan and unlock unlimited premium features.
              </p>
              <Button 
                variant="default" 
                size="sm" 
                className="w-full justify-between"
                onClick={() => navigate("/billing")}
              >
                Select plan
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Footer Links */}
        <div className="p-3 border-t border-border space-y-1">
          <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors">
            <MessageSquare className="h-4 w-4" />
            <span>Feedback</span>
          </button>
          <Link
            to="/settings"
            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors"
          >
            <Settings className="h-4 w-4" />
            <span>Settings</span>
          </Link>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
          >
            <LogOut className="h-4 w-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
