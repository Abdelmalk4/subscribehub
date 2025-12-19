import { Link, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useState, useEffect, useCallback } from "react";
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
  const [isHovered, setIsHovered] = useState(false);
  
  const navItems = isAdmin ? adminNavItems : clientNavItems;

  // Keyboard shortcut: Ctrl/Cmd + B to toggle sidebar
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
      e.preventDefault();
      onCollapsedChange?.(!collapsed);
    }
  }, [collapsed, onCollapsedChange]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

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

  // Determine if sidebar should show expanded content
  const showExpanded = !collapsed || isHovered;

  return (
    <aside
      className={cn(
        "sticky top-0 z-30 h-screen transition-all duration-300 shrink-0",
        collapsed && !isHovered ? "w-20" : "w-64"
      )}
      onMouseEnter={() => collapsed && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="h-full m-3 flex flex-col bg-card backdrop-blur-2xl border border-border/30 rounded-2xl shadow-2xl overflow-hidden relative">
        {/* Logo Section */}
        <div className="p-4 border-b border-border/30">
          <Link to="/dashboard" className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-glow-sm shrink-0">
              <Zap className="h-5 w-5 text-primary-foreground" />
            </div>
            {showExpanded && (
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
                  !showExpanded && "justify-center px-2",
                  isActive
                    ? "bg-primary/10 text-primary border-l-2 border-primary"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
                title={!showExpanded ? item.label : undefined}
              >
                <Icon className={cn(
                  "h-5 w-5 transition-transform duration-200 shrink-0",
                  isActive && "scale-110"
                )} />
                {showExpanded && (
                  <span className="font-medium whitespace-nowrap">{item.label}</span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Keyboard Shortcut Hint */}
        {showExpanded && (
          <div className="px-4 pb-2">
            <p className="text-xs text-muted-foreground/60 text-center">
              Press <kbd className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px] font-mono">⌘B</kbd> to toggle
            </p>
          </div>
        )}

        {/* User Section */}
        <div className="p-4 border-t border-border/30">
          <div className={cn(
            "flex items-center gap-3 p-3 rounded-xl bg-muted/30",
            !showExpanded && "justify-center p-2"
          )}>
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/50 to-secondary/50 flex items-center justify-center shrink-0">
              <span className="text-sm font-semibold text-foreground">{getInitials()}</span>
            </div>
            {showExpanded && (
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
              !showExpanded && "px-0"
            )}
            onClick={handleSignOut}
            title={!showExpanded ? "Sign Out" : undefined}
          >
            <LogOut className="h-4 w-4" />
            {showExpanded && <span className="ml-2">Sign Out</span>}
          </Button>
        </div>

        {/* Collapse Toggle - Always visible */}
        <Button
          variant="outline"
          size="icon"
          onClick={() => onCollapsedChange?.(!collapsed)}
          className="absolute -right-4 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-card border-2 border-border shadow-lg hover:bg-muted z-50"
          title={collapsed ? "Expand sidebar (⌘B)" : "Collapse sidebar (⌘B)"}
        >
          <ChevronLeft className={cn(
            "h-4 w-4 transition-transform duration-200",
            collapsed && "rotate-180"
          )} />
        </Button>
      </div>
    </aside>
  );
}
