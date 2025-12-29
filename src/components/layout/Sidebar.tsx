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
  MessageSquare,
  Shield,
  ChevronRight,
  ChevronLeft,
  Info,
  X,
  ChevronDown,
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

export function Sidebar({ isAdmin = false }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [isOpen, setIsOpen] = useState(true);
  const [showPromo, setShowPromo] = useState(true);
  
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

  const { daysLeft } = getSubscriptionInfo();

  const favorites = [
    { id: 'subscribers-fav', label: 'Active Subscribers' },
    { id: 'analytics-fav', label: 'Monthly Report' },
    { id: 'projects-fav', label: 'Main Project' },
  ];

  return (
    <aside className={cn(
      "sticky top-0 z-30 h-screen shrink-0 border-r border-border bg-card transition-all duration-300",
      isOpen ? "w-64" : "w-20"
    )}>
      <div className="h-full flex flex-col">
        {/* Logo Header */}
        <div className="h-14 flex items-center justify-between px-4 border-b border-border">
          <Link to="/dashboard" className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-foreground flex items-center justify-center">
              <span className="font-bold text-background text-sm">S</span>
            </div>
            {isOpen && <span className="font-bold text-foreground tracking-tight">SubscribeHub</span>}
          </Link>
          <button 
            onClick={() => setIsOpen(!isOpen)} 
            className="p-1 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground transition-colors"
          >
            {isOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3">
          <div className="relative group">
            <Search size={16} className="absolute left-3 top-2.5 text-muted-foreground" />
            {isOpen ? (
              <input
                type="text"
                placeholder="Search..."
                className="w-full bg-muted border border-border rounded-lg py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-foreground placeholder:text-muted-foreground"
              />
            ) : (
              <button className="w-full flex items-center justify-center py-2 hover:bg-muted rounded-lg transition-colors">
                <Search size={16} className="text-muted-foreground" />
              </button>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-4 py-2 space-y-6 custom-scrollbar">
          {/* Main Menu */}
          <div className="space-y-1">
            {navItems.map((item) => {
              const isActive = location.pathname === item.href;
              const Icon = item.icon;
              
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    isActive
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon size={18} />
                  {isOpen && (
                    <>
                      <span className="flex-1 text-left">{item.label}</span>
                      {item.label === "Dashboard" && (
                        <div className="w-2 h-2 bg-destructive rounded-full" />
                      )}
                    </>
                  )}
                </Link>
              );
            })}
          </div>

          {/* Favorites */}
          {isOpen && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-3">
                Favorites
                <ChevronDown size={12} />
              </div>
              <div className="space-y-1">
                {favorites.map((fav) => (
                  <button 
                    key={fav.id} 
                    className="w-full flex items-center gap-3 px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <div className="w-2 h-2 rounded-sm bg-foreground" />
                    {fav.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </nav>

        {/* Bottom Section */}
        <div className="p-4 border-t border-border space-y-4">
          {/* Subscription Promo Card */}
          {!isAdmin && isOpen && showPromo && (
            <div className="bg-muted border border-border rounded-xl p-4 space-y-3 relative">
              <button 
                onClick={() => setShowPromo(false)}
                className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
              >
                <X size={14} />
              </button>
              <div className="font-bold text-sm text-foreground">{daysLeft} Days Left!</div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Select a plan and unlock unlimited premium features.
              </p>
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full justify-between text-xs font-semibold"
                onClick={() => navigate("/billing")}
              >
                Select plan
                <ChevronRight size={14} />
              </Button>
            </div>
          )}

          {/* Footer Links */}
          <div className="space-y-1">
            <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted">
              <MessageSquare size={18} />
              {isOpen && <span>Feedback</span>}
            </button>
            <Link
              to="/settings"
              className="w-full flex items-center gap-3 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted"
            >
              <Settings size={18} />
              {isOpen && <span>Settings</span>}
            </Link>
            <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted">
              <Info size={18} />
              {isOpen && <span>Help Center</span>}
            </button>
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm text-muted-foreground hover:text-destructive transition-colors rounded-lg hover:bg-destructive/10"
            >
              <LogOut size={18} />
              {isOpen && <span>Sign Out</span>}
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
