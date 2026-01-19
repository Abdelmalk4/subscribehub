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
  Shield,
  FileText,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

const clientNavItems: NavItem[] = [
  { label: "Home", href: "/dashboard", icon: LayoutDashboard },
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
  onNavigate?: () => void;
}

export function Sidebar({ isAdmin = false, onNavigate }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  
  const navItems = isAdmin ? adminNavItems : clientNavItems;

  const handleSignOut = async () => {
    await signOut();
    toast.success("Signed out successfully");
    navigate("/login");
  };

  const handleNavClick = () => {
    if (onNavigate) {
      onNavigate();
    }
  };

  return (
    <aside className="h-full w-full md:w-52 shrink-0 border-r border-border bg-muted/30">
      <div className="h-full flex flex-col">
        {/* Logo Header */}
        <div className="h-11 flex items-center px-3 border-b border-border">
          <Link to="/dashboard" className="flex items-center gap-2" onClick={handleNavClick}>
            <div className="h-6 w-6 rounded-md bg-gradient-to-br from-pink-500 to-orange-400 flex items-center justify-center">
              <span className="font-bold text-white text-xs">S</span>
            </div>
            <span className="font-semibold text-foreground text-sm">SubscribeHub</span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
          {navItems.map((item) => {
            const isActive = location.pathname === item.href;
            const Icon = item.icon;
            
            return (
              <Link
                key={item.href}
                to={item.href}
                onClick={handleNavClick}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium transition-colors",
                  isActive
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-card hover:text-foreground"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Bottom Section */}
        <div className="p-2 border-t border-border">
          {/* Documentation Link */}
          <Link
            to="#"
            onClick={handleNavClick}
            className="w-full flex items-center gap-2 px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-card hover:text-foreground transition-colors rounded-md"
          >
            <FileText className="h-3.5 w-3.5" />
            <span>Documentation</span>
          </Link>

          {/* Sign Out */}
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-2 px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-card hover:text-foreground transition-colors rounded-md mt-0.5"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
