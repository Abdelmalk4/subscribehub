export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      admin_notifications: {
        Row: {
          created_at: string | null
          id: string
          is_read: boolean | null
          message: string | null
          notification_type: string
          project_id: string | null
          reference_id: string | null
          reference_type: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string | null
          notification_type: string
          project_id?: string | null
          reference_id?: string | null
          reference_type?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string | null
          notification_type?: string
          project_id?: string | null
          reference_id?: string | null
          reference_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_notifications_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          changes: Json | null
          created_at: string
          id: string
          ip_address: string | null
          resource_id: string | null
          resource_type: string
          user_id: string | null
        }
        Insert: {
          action: string
          changes?: Json | null
          created_at?: string
          id?: string
          ip_address?: string | null
          resource_id?: string | null
          resource_type: string
          user_id?: string | null
        }
        Update: {
          action?: string
          changes?: Json | null
          created_at?: string
          id?: string
          ip_address?: string | null
          resource_id?: string | null
          resource_type?: string
          user_id?: string | null
        }
        Relationships: []
      }
      client_payment_methods: {
        Row: {
          created_at: string | null
          details: Json
          display_order: number | null
          id: string
          instructions: string | null
          is_active: boolean | null
          method_name: string
          method_type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          details?: Json
          display_order?: number | null
          id?: string
          instructions?: string | null
          is_active?: boolean | null
          method_name: string
          method_type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          details?: Json
          display_order?: number | null
          id?: string
          instructions?: string | null
          is_active?: boolean | null
          method_name?: string
          method_type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      client_subscription_payments: {
        Row: {
          amount: number
          client_id: string
          created_at: string | null
          id: string
          notes: string | null
          payment_method: string | null
          payment_proof_url: string | null
          plan_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
          subscription_id: string | null
        }
        Insert: {
          amount: number
          client_id: string
          created_at?: string | null
          id?: string
          notes?: string | null
          payment_method?: string | null
          payment_proof_url?: string | null
          plan_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          subscription_id?: string | null
        }
        Update: {
          amount?: number
          client_id?: string
          created_at?: string | null
          id?: string
          notes?: string | null
          payment_method?: string | null
          payment_proof_url?: string | null
          plan_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_subscription_payments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_subscription_payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "client_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      client_subscriptions: {
        Row: {
          client_id: string
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan_id: string | null
          status: Database["public"]["Enums"]["subscription_status"] | null
          trial_ends_at: string | null
        }
        Insert: {
          client_id: string
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id?: string | null
          status?: Database["public"]["Enums"]["subscription_status"] | null
          trial_ends_at?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id?: string | null
          status?: Database["public"]["Enums"]["subscription_status"] | null
          trial_ends_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      extend_requests: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          payment_method: string | null
          payment_proof_url: string | null
          project_id: string
          requested_days: number
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          subscriber_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          payment_method?: string | null
          payment_proof_url?: string | null
          project_id: string
          requested_days?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          subscriber_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          payment_method?: string | null
          payment_proof_url?: string | null
          project_id?: string
          requested_days?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          subscriber_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "extend_requests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extend_requests_subscriber_id_fkey"
            columns: ["subscriber_id"]
            isOneToOne: false
            referencedRelation: "subscribers"
            referencedColumns: ["id"]
          },
        ]
      }
      failed_notifications: {
        Row: {
          action: string
          created_at: string
          error_message: string | null
          id: string
          max_retries: number
          next_retry_at: string
          payload: Json
          processed_at: string | null
          retry_count: number
          subscriber_id: string
        }
        Insert: {
          action: string
          created_at?: string
          error_message?: string | null
          id?: string
          max_retries?: number
          next_retry_at?: string
          payload?: Json
          processed_at?: string | null
          retry_count?: number
          subscriber_id: string
        }
        Update: {
          action?: string
          created_at?: string
          error_message?: string | null
          id?: string
          max_retries?: number
          next_retry_at?: string
          payload?: Json
          processed_at?: string | null
          retry_count?: number
          subscriber_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "failed_notifications_subscriber_id_fkey"
            columns: ["subscriber_id"]
            isOneToOne: false
            referencedRelation: "subscribers"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          admin_notes: string | null
          amount: number
          client_id: string
          created_at: string | null
          due_date: string | null
          id: string
          invoice_number: string
          notes: string | null
          paid_at: string | null
          payment_method: string | null
          payment_proof_url: string | null
          plan_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
          subscription_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          amount: number
          client_id: string
          created_at?: string | null
          due_date?: string | null
          id?: string
          invoice_number: string
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          payment_proof_url?: string | null
          plan_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          subscription_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          amount?: number
          client_id?: string
          created_at?: string | null
          due_date?: string | null
          id?: string
          invoice_number?: string
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          payment_proof_url?: string | null
          plan_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "client_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string | null
          currency: string | null
          description: string | null
          duration_days: number
          id: string
          is_active: boolean | null
          plan_name: string
          price: number
          project_id: string
          stripe_price_id: string | null
        }
        Insert: {
          created_at?: string | null
          currency?: string | null
          description?: string | null
          duration_days: number
          id?: string
          is_active?: boolean | null
          plan_name: string
          price: number
          project_id: string
          stripe_price_id?: string | null
        }
        Update: {
          created_at?: string | null
          currency?: string | null
          description?: string | null
          duration_days?: number
          id?: string
          is_active?: boolean | null
          plan_name?: string
          price?: number
          project_id?: string
          stripe_price_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plans_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_config: {
        Row: {
          id: string
          key: string
          updated_at: string | null
          value: Json
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string | null
          value: Json
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string | null
          value?: Json
        }
        Relationships: []
      }
      platform_payment_methods: {
        Row: {
          created_at: string | null
          details: Json
          display_order: number | null
          id: string
          instructions: string | null
          is_active: boolean | null
          method_name: string
          method_type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          details?: Json
          display_order?: number | null
          id?: string
          instructions?: string | null
          is_active?: boolean | null
          method_name: string
          method_type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          details?: Json
          display_order?: number | null
          id?: string
          instructions?: string | null
          is_active?: boolean | null
          method_name?: string
          method_type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          admin_telegram_id: number | null
          admin_username: string | null
          bot_token: string
          channel_id: string
          created_at: string | null
          id: string
          manual_payment_config: Json | null
          project_name: string
          status: string | null
          stripe_config: Json | null
          support_contact: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          admin_telegram_id?: number | null
          admin_username?: string | null
          bot_token: string
          channel_id: string
          created_at?: string | null
          id?: string
          manual_payment_config?: Json | null
          project_name: string
          status?: string | null
          stripe_config?: Json | null
          support_contact?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          admin_telegram_id?: number | null
          admin_username?: string | null
          bot_token?: string
          channel_id?: string
          created_at?: string | null
          id?: string
          manual_payment_config?: Json | null
          project_name?: string
          status?: string | null
          stripe_config?: Json | null
          support_contact?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          created_at: string
          endpoint: string
          id: string
          identifier: string
          request_count: number
          window_start: string
        }
        Insert: {
          created_at?: string
          endpoint: string
          id?: string
          identifier: string
          request_count?: number
          window_start?: string
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: string
          identifier?: string
          request_count?: number
          window_start?: string
        }
        Relationships: []
      }
      sales_inquiries: {
        Row: {
          company: string | null
          created_at: string
          email: string
          id: string
          message: string | null
          name: string
          plan_interest: string | null
          responded_at: string | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          company?: string | null
          created_at?: string
          email: string
          id?: string
          message?: string | null
          name: string
          plan_interest?: string | null
          responded_at?: string | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string
          id?: string
          message?: string | null
          name?: string
          plan_interest?: string | null
          responded_at?: string | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      subscribers: {
        Row: {
          approved_by_admin_id: string | null
          channel_joined: boolean | null
          channel_joined_at: string | null
          channel_membership_status: string | null
          created_at: string | null
          expiry_date: string | null
          expiry_reminder_sent: boolean | null
          final_reminder_sent: boolean | null
          first_name: string | null
          id: string
          invite_link: string | null
          last_membership_check: string | null
          notes: string | null
          payment_method: string | null
          payment_proof_url: string | null
          plan_id: string | null
          project_id: string
          rejection_reason: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["subscriber_status"]
          suspended_at: string | null
          suspended_by: string | null
          telegram_user_id: number
          updated_at: string | null
          username: string | null
        }
        Insert: {
          approved_by_admin_id?: string | null
          channel_joined?: boolean | null
          channel_joined_at?: string | null
          channel_membership_status?: string | null
          created_at?: string | null
          expiry_date?: string | null
          expiry_reminder_sent?: boolean | null
          final_reminder_sent?: boolean | null
          first_name?: string | null
          id?: string
          invite_link?: string | null
          last_membership_check?: string | null
          notes?: string | null
          payment_method?: string | null
          payment_proof_url?: string | null
          plan_id?: string | null
          project_id: string
          rejection_reason?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["subscriber_status"]
          suspended_at?: string | null
          suspended_by?: string | null
          telegram_user_id: number
          updated_at?: string | null
          username?: string | null
        }
        Update: {
          approved_by_admin_id?: string | null
          channel_joined?: boolean | null
          channel_joined_at?: string | null
          channel_membership_status?: string | null
          created_at?: string | null
          expiry_date?: string | null
          expiry_reminder_sent?: boolean | null
          final_reminder_sent?: boolean | null
          first_name?: string | null
          id?: string
          invite_link?: string | null
          last_membership_check?: string | null
          notes?: string | null
          payment_method?: string | null
          payment_proof_url?: string | null
          plan_id?: string | null
          project_id?: string
          rejection_reason?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["subscriber_status"]
          suspended_at?: string | null
          suspended_by?: string | null
          telegram_user_id?: number
          updated_at?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscribers_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscribers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          billing_cycle: string | null
          created_at: string | null
          features: Json | null
          id: string
          is_active: boolean | null
          max_projects: number
          max_subscribers: number
          plan_name: string
          plan_slug: string
          price: number
        }
        Insert: {
          billing_cycle?: string | null
          created_at?: string | null
          features?: Json | null
          id?: string
          is_active?: boolean | null
          max_projects?: number
          max_subscribers?: number
          plan_name: string
          plan_slug: string
          price?: number
        }
        Update: {
          billing_cycle?: string | null
          created_at?: string | null
          features?: Json | null
          id?: string
          is_active?: boolean | null
          max_projects?: number
          max_subscribers?: number
          plan_name?: string
          plan_slug?: string
          price?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      webhook_events: {
        Row: {
          event_id: string
          event_source: string
          event_type: string | null
          id: string
          processed_at: string | null
          result: Json | null
        }
        Insert: {
          event_id: string
          event_source: string
          event_type?: string | null
          id?: string
          processed_at?: string | null
          result?: Json | null
        }
        Update: {
          event_id?: string
          event_source?: string
          event_type?: string | null
          id?: string
          processed_at?: string | null
          result?: Json | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_rate_limit: {
        Args: {
          p_endpoint: string
          p_identifier: string
          p_limit: number
          p_window_seconds: number
        }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      log_audit_event: {
        Args: {
          p_action: string
          p_changes?: Json
          p_ip_address?: string
          p_resource_id?: string
          p_resource_type: string
          p_user_id: string
        }
        Returns: string
      }
      process_stripe_payment: {
        Args: { p_duration_days?: number; p_subscriber_id: string }
        Returns: Json
      }
    }
    Enums: {
      app_role: "super_admin" | "client"
      subscriber_status:
        | "active"
        | "pending_payment"
        | "pending_approval"
        | "awaiting_proof"
        | "expired"
        | "rejected"
        | "suspended"
      subscription_status: "trial" | "active" | "pending_payment" | "expired"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["super_admin", "client"],
      subscriber_status: [
        "active",
        "pending_payment",
        "pending_approval",
        "awaiting_proof",
        "expired",
        "rejected",
        "suspended",
      ],
      subscription_status: ["trial", "active", "pending_payment", "expired"],
    },
  },
} as const
