import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Exponential backoff calculation (in minutes)
// Retry 1: 1 min, Retry 2: 2 min, Retry 3: 4 min, Retry 4: 8 min, Retry 5: 16 min
function calculateNextRetryDelay(retryCount: number): number {
  return Math.pow(2, retryCount) * 60 * 1000; // milliseconds
}

serve(async (req) => {
  console.log("[RETRY] Incoming request:", req.method);
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID().slice(0, 8);
  console.log(`[${requestId}] ========== RETRY FAILED NOTIFICATIONS START ==========`);

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch failed notifications that are ready for retry
    const { data: failedNotifications, error: fetchError } = await supabase
      .from("failed_notifications")
      .select("*")
      .is("processed_at", null)
      .lt("retry_count", 5) // max_retries column defaults to 5
      .lte("next_retry_at", new Date().toISOString())
      .order("next_retry_at", { ascending: true })
      .limit(50); // Process in batches

    if (fetchError) {
      console.error(`[${requestId}] Error fetching failed notifications:`, fetchError);
      throw fetchError;
    }

    console.log(`[${requestId}] Found ${failedNotifications?.length || 0} notifications to retry`);

    if (!failedNotifications || failedNotifications.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        processed: 0,
        message: "No pending retries" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let successCount = 0;
    let failCount = 0;
    let permanentFailCount = 0;

    for (const notification of failedNotifications) {
      console.log(`[${requestId}] Processing notification ${notification.id}, retry ${notification.retry_count + 1}`);

      try {
        // Call notify-subscriber function
        const { data, error: invokeError } = await supabase.functions.invoke("notify-subscriber", {
          body: {
            subscriber_id: notification.subscriber_id,
            action: notification.action,
            ...notification.payload,
          },
        });

        if (invokeError) {
          throw new Error(invokeError.message || "Invoke failed");
        }

        // Success - mark as processed
        await supabase
          .from("failed_notifications")
          .update({
            processed_at: new Date().toISOString(),
            error_message: null,
          })
          .eq("id", notification.id);

        successCount++;
        console.log(`[${requestId}] Successfully retried notification ${notification.id}`);

      } catch (retryError: any) {
        const newRetryCount = notification.retry_count + 1;
        const errorMessage = retryError.message || "Unknown error";

        console.warn(`[${requestId}] Retry failed for ${notification.id}:`, errorMessage);

        if (newRetryCount >= notification.max_retries) {
          // Max retries reached - mark as permanently failed
          await supabase
            .from("failed_notifications")
            .update({
              retry_count: newRetryCount,
              error_message: `Permanently failed after ${newRetryCount} attempts: ${errorMessage}`,
              processed_at: new Date().toISOString(),
            })
            .eq("id", notification.id);

          permanentFailCount++;
          console.error(`[${requestId}] Permanently failed notification ${notification.id}`);
        } else {
          // Schedule next retry with exponential backoff
          const nextRetryDelay = calculateNextRetryDelay(newRetryCount);
          const nextRetryAt = new Date(Date.now() + nextRetryDelay);

          await supabase
            .from("failed_notifications")
            .update({
              retry_count: newRetryCount,
              next_retry_at: nextRetryAt.toISOString(),
              error_message: errorMessage,
            })
            .eq("id", notification.id);

          failCount++;
          console.log(`[${requestId}] Scheduled retry ${newRetryCount + 1} for ${notification.id} at ${nextRetryAt.toISOString()}`);
        }
      }
    }

    console.log(`[${requestId}] ========== SUMMARY ==========`);
    console.log(`[${requestId}] Success: ${successCount}, Rescheduled: ${failCount}, Permanently failed: ${permanentFailCount}`);
    console.log(`[${requestId}] ========== RETRY FAILED NOTIFICATIONS END ==========`);

    return new Response(JSON.stringify({
      success: true,
      processed: failedNotifications.length,
      succeeded: successCount,
      rescheduled: failCount,
      permanently_failed: permanentFailCount,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error(`[${requestId}] FATAL ERROR:`, error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
