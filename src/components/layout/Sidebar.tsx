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
  ChevronLeft,
  Zap,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
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

export function Sidebar({ isAdmin = false, collapsed = false, onCollapsedChange }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  
  const navItems = isAdmin ? adminNavItems : clientNavItems;

  const handleSignOut = async () => {
    await signOut();
    toast.success("Signed out successfully");
    navigate("/login");
  };

  // Get user initials
  const getInitials = () => {
    const email = user?.email || "";
    const name = user?.user_metadata?.full_name || email;
    if (name.includes(" ")) {
      const parts = name.split(" ");
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const getDisplayName = () => {
    return user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";
  };

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 h-screen transition-all duration-300",
        collapsed ? "w-20" : "w-64"
      )}
    >
      <div className="h-full m-3 flex flex-col bg-card/40 backdrop-blur-2xl border border-border/30 rounded-2xl shadow-2xl overflow-hidden">
        {/* Logo Section */}
        <div className="p-4 border-b border-border/30">
          <Link to="/dashboard" className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-glow-sm">
              <Zap className="h-5 w-5 text-primary-foreground" />
            </div>
            {!collapsed && (
              <div className="flex flex-col">
                <span className="text-lg font-bold text-foreground">SubscribeHub</span>
                <span className="text-xs text-muted-foreground">Telegram Monetization</span>
              </div>
            )}
          </Link>
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
                  "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group",
                  isActive
                    ? "bg-primary/10 text-primary border-l-2 border-primary"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
              >
                <Icon className={cn(
                  "h-5 w-5 transition-transform duration-200",
                  isActive && "scale-110"
                )} />
                {!collapsed && (
                  <span className="font-medium">{item.label}</span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* User Section */}
        <div className="p-4 border-t border-border/30">
          <div className={cn(
            "flex items-center gap-3 p-3 rounded-xl bg-muted/30",
            collapsed && "justify-center"
          )}>
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/50 to-secondary/50 flex items-center justify-center">
              <span className="text-sm font-semibold text-foreground">{getInitials()}</span>
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{getDisplayName()}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>
            )}
          </div>
          
          <Button
            variant="ghost"
            className={cn(
              "w-full mt-2 text-muted-foreground hover:text-destructive",
              collapsed && "px-0"
            )}
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4" />
            {!collapsed && <span className="ml-2">Sign Out</span>}
          </Button>
        </div>

        {/* Collapse Toggle */}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onCollapsedChange?.(!collapsed)}
          className="absolute -right-3 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full bg-card border border-border shadow-md"
        >
          <ChevronLeft className={cn(
            "h-3 w-3 transition-transform duration-200",
            collapsed && "rotate-180"
          )} />
        </Button>
      </div>
    </aside>
  );
}
