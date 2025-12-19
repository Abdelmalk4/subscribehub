import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface ClientSubscription {
  id: string;
  client_id: string;
  status: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
  profiles: {
    email: string | null;
    full_name: string | null;
  } | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("Starting client subscription expiry check...", new Date().toISOString());

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const now = new Date();

    const stats = {
      trialsExpired: 0,
      subscriptionsExpired: 0,
      errors: 0,
    };

    // ========================================
    // Stage 1: Check expired trials
    // ========================================
    console.log("Checking for expired trials...");
    const { data: expiredTrials, error: trialError } = await supabase
      .from("client_subscriptions")
      .select(`
        id,
        client_id,
        status,
        trial_ends_at,
        current_period_end,
        profiles!client_subscriptions_client_id_fkey (
          email,
          full_name
        )
      `)
      .eq("status", "trial")
      .lt("trial_ends_at", now.toISOString());

    if (trialError) {
      console.error("Error fetching expired trials:", trialError);
      stats.errors++;
    } else if (expiredTrials && expiredTrials.length > 0) {
      console.log(`Found ${expiredTrials.length} expired trials`);

      for (const sub of expiredTrials as unknown as ClientSubscription[]) {
        try {
          // Update status to expired
          const { error: updateError } = await supabase
            .from("client_subscriptions")
            .update({ 
              status: "expired",
              current_period_end: now.toISOString()
            })
            .eq("id", sub.id);

          if (updateError) {
            console.error(`Error updating trial ${sub.id}:`, updateError);
            stats.errors++;
          } else {
            console.log(`Expired trial for client ${sub.client_id}`);
            stats.trialsExpired++;
          }
        } catch (err) {
          console.error(`Error processing trial ${sub.id}:`, err);
          stats.errors++;
        }
      }
    }

    // ========================================
    // Stage 2: Check expired paid subscriptions
    // ========================================
    console.log("Checking for expired paid subscriptions...");
    const { data: expiredSubs, error: subError } = await supabase
      .from("client_subscriptions")
      .select(`
        id,
        client_id,
        status,
        trial_ends_at,
        current_period_end,
        profiles!client_subscriptions_client_id_fkey (
          email,
          full_name
        )
      `)
      .eq("status", "active")
      .lt("current_period_end", now.toISOString());

    if (subError) {
      console.error("Error fetching expired subscriptions:", subError);
      stats.errors++;
    } else if (expiredSubs && expiredSubs.length > 0) {
      console.log(`Found ${expiredSubs.length} expired subscriptions`);

      for (const sub of expiredSubs as unknown as ClientSubscription[]) {
        try {
          // Update status to expired
          const { error: updateError } = await supabase
            .from("client_subscriptions")
            .update({ status: "expired" })
            .eq("id", sub.id);

          if (updateError) {
            console.error(`Error updating subscription ${sub.id}:`, updateError);
            stats.errors++;
          } else {
            console.log(`Expired subscription for client ${sub.client_id}`);
            stats.subscriptionsExpired++;
          }
        } catch (err) {
          console.error(`Error processing subscription ${sub.id}:`, err);
          stats.errors++;
        }
      }
    }

    // ========================================
    // Summary
    // ========================================
    const summary = {
      success: true,
      timestamp: now.toISOString(),
      stats,
      message: `Processed: ${stats.trialsExpired} trials expired, ${stats.subscriptionsExpired} subscriptions expired, ${stats.errors} errors`,
    };

    console.log("Client subscription check complete:", summary);

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in client subscription check:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
