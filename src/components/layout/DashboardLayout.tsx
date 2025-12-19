import { Outlet, Navigate } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

interface DashboardLayoutProps {
  isAdmin?: boolean;
}

export function DashboardLayout({ isAdmin = false }: DashboardLayoutProps) {
  const { user, loading } = useAuth();

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
      <Sidebar isAdmin={isAdmin} />
      <main className={cn(
        "transition-all duration-300 pl-[280px] min-h-screen",
        "p-6 md:p-8"
      )}>
        <div className="max-w-7xl mx-auto animate-fade-in">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
