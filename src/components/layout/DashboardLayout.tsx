import { Outlet, Navigate } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";
import { useState } from "react";

interface DashboardLayoutProps {
  isAdmin?: boolean;
}

export function DashboardLayout({ isAdmin = false }: DashboardLayoutProps) {
  const { user, loading } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen">
      <Sidebar isAdmin={isAdmin} collapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} />
      <main className={cn(
        "transition-all duration-300 min-h-screen",
        "p-6 md:p-8",
        sidebarCollapsed ? "pl-[92px]" : "pl-[280px]"
      )}>
        <div className="max-w-7xl mx-auto animate-fade-in">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
