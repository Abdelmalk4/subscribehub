import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export function useUserRole() {
  const { user } = useAuth();
  const [role, setRole] = useState<"super_admin" | "client" | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRole = async () => {
      if (!user) {
        setRole(null);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .single();

      if (error) {
        console.error("Error fetching user role:", error);
        setRole("client");
      } else {
        setRole(data?.role || "client");
      }
      setLoading(false);
    };

    fetchRole();
  }, [user]);

  return { role, isSuperAdmin: role === "super_admin", loading };
}
