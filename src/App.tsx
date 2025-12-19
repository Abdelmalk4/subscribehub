import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";

// Auth
import { AuthProvider } from "@/hooks/useAuth";

// Layouts
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { AuthLayout } from "@/components/layout/AuthLayout";

// Pages
import Landing from "@/pages/Landing";
import Login from "@/pages/auth/Login";
import Signup from "@/pages/auth/Signup";
import ForgotPassword from "@/pages/auth/ForgotPassword";
import ResetPassword from "@/pages/auth/ResetPassword";
import Dashboard from "@/pages/Dashboard";
import Projects from "@/pages/Projects";
import Subscribers from "@/pages/Subscribers";
import Analytics from "@/pages/Analytics";
import Billing from "@/pages/Billing";
import Settings from "@/pages/Settings";
import NotFound from "@/pages/NotFound";

// Admin Pages
import AdminOverview from "@/pages/admin/AdminOverview";
import AdminClients from "@/pages/admin/AdminClients";
import AdminPayments from "@/pages/admin/AdminPayments";
import AdminSettings from "@/pages/admin/AdminSettings";

const queryClient = new QueryClient();

function AnimatedRoutes() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        {/* Public Routes */}
        <Route path="/" element={<Landing />} />
        
        {/* Auth Routes */}
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
        </Route>

        {/* Dashboard Routes */}
        <Route element={<DashboardLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/subscribers" element={<Subscribers />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/billing" element={<Billing />} />
          <Route path="/settings" element={<Settings />} />
        </Route>

        {/* Super Admin Routes */}
        <Route element={<DashboardLayout isAdmin />}>
          <Route path="/super-admin" element={<AdminOverview />} />
          <Route path="/super-admin/clients" element={<AdminClients />} />
          <Route path="/super-admin/payments" element={<AdminPayments />} />
          <Route path="/super-admin/settings" element={<AdminSettings />} />
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AnimatePresence>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AnimatedRoutes />
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
