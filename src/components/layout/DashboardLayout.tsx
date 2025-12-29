import { Outlet, Navigate } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";
import PageTransition from "@/components/PageTransition";

interface DashboardLayoutProps {
  isAdmin?: boolean;
}

export function DashboardLayout({ isAdmin = false }: DashboardLayoutProps) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-foreground" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <PageTransition>
      <div className="min-h-screen flex w-full bg-background">
        <Sidebar isAdmin={isAdmin} />
        <main className="flex-1 min-h-screen overflow-y-auto custom-scrollbar">
          <div className="p-4 md:p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </PageTransition>
  );
}
