import { Outlet, Navigate, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import PageTransition from "@/components/PageTransition";
import { SubscriptionGuard } from "@/components/subscription/SubscriptionGuard";

interface DashboardLayoutProps {
  isAdmin?: boolean;
}

export function DashboardLayout({ isAdmin = false }: DashboardLayoutProps) {
  const { user, loading } = useAuth();
  const { role, loading: roleLoading } = useUserRole();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const location = useLocation();

  // Pages that should NOT show subscription guard (always accessible)
  const unprotectedPaths = ['/billing', '/settings'];
  const shouldShowGuard = !isAdmin && !unprotectedPaths.includes(location.pathname);

  if (loading || roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Server-verified admin route protection
  // If this is an admin route, verify the user has super_admin role from database
  if (isAdmin && role !== "super_admin") {
    return <Navigate to="/dashboard" replace />;
  }

  const content = (
    <PageTransition>
      <div className="min-h-screen flex w-full">
        <Sidebar
          isAdmin={isAdmin}
          collapsed={sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
        />
        <main className={cn(
          "flex-1 min-h-screen",
          "p-6 md:p-8"
        )}>
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </PageTransition>
  );

  // Wrap with subscription guard for protected routes
  if (shouldShowGuard) {
    return <SubscriptionGuard>{content}</SubscriptionGuard>;
  }

  return content;
}
