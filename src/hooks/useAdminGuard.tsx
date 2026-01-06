import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

/**
 * Hook to verify admin authorization before performing sensitive operations.
 * This provides an additional layer of security on top of RLS policies.
 */
export function useAdminGuard() {
  const { user } = useAuth();

  const verifyAdminRole = useCallback(async (): Promise<boolean> => {
    if (!user) {
      toast.error("Authentication required");
      return false;
    }

    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "super_admin")
      .single();

    if (error || !data) {
      toast.error("Unauthorized - Admin access required");
      console.error("Admin verification failed:", error);
      return false;
    }

    return true;
  }, [user]);

  /**
   * Wraps an async operation with admin verification.
   * Returns early if user is not an admin.
   */
  const withAdminGuard = useCallback(
    async <T,>(operation: () => Promise<T>): Promise<T | null> => {
      const isAdmin = await verifyAdminRole();
      if (!isAdmin) return null;
      return operation();
    },
    [verifyAdminRole]
  );

  return { verifyAdminRole, withAdminGuard };
}
