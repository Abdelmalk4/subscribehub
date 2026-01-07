import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export type AuditAction =
  | "payment_approved"
  | "payment_rejected"
  | "subscription_created"
  | "subscription_updated"
  | "subscription_cancelled"
  | "subscriber_approved"
  | "subscriber_rejected"
  | "subscriber_suspended"
  | "project_created"
  | "project_updated"
  | "project_deleted"
  | "plan_created"
  | "plan_updated"
  | "plan_deleted"
  | "settings_updated"
  | "user_role_changed";

export type ResourceType =
  | "payment"
  | "subscription"
  | "subscriber"
  | "project"
  | "plan"
  | "settings"
  | "user";

interface AuditLogParams {
  action: AuditAction;
  resourceType: ResourceType;
  resourceId?: string;
  changes?: Json;
}

/**
 * Log an audit event for tracking critical operations
 * This function logs actions to the audit_logs table for compliance and debugging
 */
export async function logAuditEvent({
  action,
  resourceType,
  resourceId,
  changes,
}: AuditLogParams): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    const { error } = await supabase.from("audit_logs").insert([{
      user_id: user?.id || null,
      action,
      resource_type: resourceType,
      resource_id: resourceId || null,
      changes: changes || null,
    }]);

    if (error) {
      console.error("Failed to log audit event:", error);
    }
  } catch (err) {
    // Don't throw - audit logging should never break the main flow
    console.error("Audit logging error:", err);
  }
}

/**
 * Helper to create a changes object for before/after comparison
 */
export function createChangesObject(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): Record<string, { before: unknown; after: unknown }> {
  const changes: Record<string, { before: unknown; after: unknown }> = {};
  
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  
  for (const key of allKeys) {
    if (before[key] !== after[key]) {
      changes[key] = {
        before: before[key],
        after: after[key],
      };
    }
  }
  
  return changes;
}