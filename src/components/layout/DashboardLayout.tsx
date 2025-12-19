import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { cn } from "@/lib/utils";

interface DashboardLayoutProps {
  isAdmin?: boolean;
}

export function DashboardLayout({ isAdmin = false }: DashboardLayoutProps) {
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
