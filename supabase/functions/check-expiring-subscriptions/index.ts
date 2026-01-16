import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Max retry attempts for Telegram API calls
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;

interface Subscriber {
  id: string;
  telegram_user_id: number;
  expiry_date: string;
  expiry_reminder_sent: boolean;
  final_reminder_sent: boolean;
  status: string;
  projects: {
    id: string;
    project_name: string;
    bot_token: string;
    channel_id: string;
  };
  plans: {
    plan_name: string;
  } | null;
}

// Retry wrapper with exponential backoff
async function withRetry<T>(
  fn: () => Promise<T>,
  operationName: string,
  maxRetries: number = MAX_RETRIES
): Promise<T | null> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`${operationName} attempt ${attempt}/${maxRetries} failed:`, lastError.message);
      
      if (attempt < maxRetries) {
        const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  console.error(`${operationName} failed after ${maxRetries} attempts:`, lastError?.message);
  return null;
}

async function sendTelegramMessage(botToken: string, chatId: number, text: string): Promise<{ ok: boolean; description?: string } | null> {
  return await withRetry(async () => {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
      }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.ok) {
      // Don't retry on certain permanent errors
      if (data.error_code === 403 || data.error_code === 400) {
        console.warn(`Telegram API error (non-retryable): ${data.description}`);
        return data; // Return the error response without retrying
      }
      throw new Error(`Telegram API error: ${data.description}`);
    }
    
    console.log(`Message sent to ${chatId}: success`);
    return data;
  }, `sendTelegramMessage(${chatId})`);
}

async function kickFromChannel(botToken: string, channelId: string, userId: number): Promise<boolean> {
  const result = await withRetry(async () => {
    const url = `https://api.telegram.org/bot${botToken}/banChatMember`;
    // Ban briefly then unban to just remove them
    const banResponse = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: channelId,
        user_id: userId,
        until_date: Math.floor(Date.now() / 1000) + 60, // Ban for 60 seconds then auto-unban
      }),
    });
    
    if (!banResponse.ok) {
      throw new Error(`HTTP ${banResponse.status}: ${banResponse.statusText}`);
    }
    
    const data = await banResponse.json();
    
    if (!data.ok) {
      // Don't retry if user is already not in chat or bot doesn't have permissions
      if (data.error_code === 400 || data.error_code === 403) {
        console.warn(`Kick user ${userId} - non-retryable error: ${data.description}`);
        return true; // Consider it "handled"
      }
      throw new Error(`Telegram API error: ${data.description}`);
    }
    
    console.log(`Kicked user ${userId} from ${channelId}: success`);
    return true;
  }, `kickFromChannel(${userId})`);
  
  return result === true;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function getDaysUntilExpiry(expiryDate: string): number {
  const expiry = new Date(expiryDate);
  const now = new Date();
  return Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("Starting subscription expiry check...", new Date().toISOString());

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const oneDayFromNow = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);

    const stats = {
      threeDayReminders: 0,
      oneDayReminders: 0,
      expired: 0,
      errors: 0,
    };

    // ========================================
    // Stage 1: 3-Day Warning (not yet reminded)
    // ========================================
    console.log("Checking for 3-day warnings...");
    const { data: threeDayAway, error: threeDayError } = await supabase
      .from("subscribers")
      .select("*, projects(*), plans(*)")
      .eq("status", "active")
      .eq("expiry_reminder_sent", false)
      .lte("expiry_date", threeDaysFromNow.toISOString())
      .gt("expiry_date", oneDayFromNow.toISOString());

    if (threeDayError) {
      console.error("Error fetching 3-day subscribers:", threeDayError);
      stats.errors++;
    } else if (threeDayAway && threeDayAway.length > 0) {
      console.log(`Found ${threeDayAway.length} subscribers expiring in ~3 days`);

      for (const sub of threeDayAway as Subscriber[]) {
        const daysLeft = getDaysUntilExpiry(sub.expiry_date);
        const message =
          `⚠️ <b>Subscription Expiring Soon!</b>\n\n` +
          `Your access to <b>${sub.projects.project_name}</b> expires in <b>${daysLeft} days</b>.\n\n` +
          `📅 Expiry Date: ${formatDate(sub.expiry_date)}\n` +
          `📦 Plan: ${sub.plans?.plan_name || "N/A"}\n\n` +
          `💡 Type /renew to extend your subscription and keep your access.`;

        const result = await sendTelegramMessage(sub.projects.bot_token, sub.telegram_user_id, message);

        if (result?.ok) {
          const { error: updateError } = await supabase
            .from("subscribers")
            .update({ expiry_reminder_sent: true, updated_at: now.toISOString() })
            .eq("id", sub.id);
          
          if (updateError) {
            console.error(`Failed to update expiry_reminder_sent for ${sub.id}:`, updateError);
            stats.errors++;
          } else {
            stats.threeDayReminders++;
          }
        } else {
          stats.errors++;
        }
      }
    }

    // ========================================
    // Stage 2: 1-Day FINAL Warning
    // ========================================
    console.log("Checking for 1-day final warnings...");
    const { data: oneDayAway, error: oneDayError } = await supabase
      .from("subscribers")
      .select("*, projects(*), plans(*)")
      .eq("status", "active")
      .eq("final_reminder_sent", false)
      .lte("expiry_date", oneDayFromNow.toISOString())
      .gt("expiry_date", now.toISOString());

    if (oneDayError) {
      console.error("Error fetching 1-day subscribers:", oneDayError);
      stats.errors++;
    } else if (oneDayAway && oneDayAway.length > 0) {
      console.log(`Found ${oneDayAway.length} subscribers expiring tomorrow`);

      for (const sub of oneDayAway as Subscriber[]) {
        const message =
          `🚨 <b>FINAL WARNING - Subscription Expires Tomorrow!</b>\n\n` +
          `Your access to <b>${sub.projects.project_name}</b> expires <b>TOMORROW</b>.\n\n` +
          `📅 Expiry Date: ${formatDate(sub.expiry_date)}\n\n` +
          `⚡ <b>Act now!</b> Type /renew to keep your access.\n\n` +
          `After expiry, you will be removed from the channel.`;

        const result = await sendTelegramMessage(sub.projects.bot_token, sub.telegram_user_id, message);

        if (result?.ok) {
          const { error: updateError } = await supabase
            .from("subscribers")
            .update({
              expiry_reminder_sent: true,
              final_reminder_sent: true,
              updated_at: now.toISOString(),
            })
            .eq("id", sub.id);
          
          if (updateError) {
            console.error(`Failed to update final_reminder_sent for ${sub.id}:`, updateError);
            stats.errors++;
          } else {
            stats.oneDayReminders++;
          }
        } else {
          stats.errors++;
        }
      }
    }

    // ========================================
    // Stage 3: Expire & Kick (ATOMIC - only update status if kick succeeds)
    // ========================================
    console.log("Checking for expired subscriptions...");
    const { data: expired, error: expiredError } = await supabase
      .from("subscribers")
      .select("*, projects(*), plans(*)")
      .eq("status", "active")
      .lt("expiry_date", now.toISOString());

    if (expiredError) {
      console.error("Error fetching expired subscribers:", expiredError);
      stats.errors++;
    } else if (expired && expired.length > 0) {
      console.log(`Found ${expired.length} expired subscriptions`);

      for (const sub of expired as Subscriber[]) {
        console.log(`Processing expired subscriber ${sub.id} (telegram: ${sub.telegram_user_id})`);
        
        // ATOMIC: First attempt to kick from channel
        const kickSuccess = await kickFromChannel(sub.projects.bot_token, sub.projects.channel_id, sub.telegram_user_id);
        
        if (!kickSuccess) {
          // Kick failed - add to failed_notifications queue for retry
          console.error(`Failed to kick user ${sub.telegram_user_id} from channel - queuing for retry`);
          
          const { error: queueError } = await supabase
            .from("failed_notifications")
            .insert({
              subscriber_id: sub.id,
              action: "kick_expired",
              payload: {
                telegram_user_id: sub.telegram_user_id,
                channel_id: sub.projects.channel_id,
                project_name: sub.projects.project_name,
              },
              next_retry_at: new Date(now.getTime() + 5 * 60 * 1000).toISOString(), // Retry in 5 minutes
            });
          
          if (queueError) {
            console.error(`Failed to queue retry for ${sub.id}:`, queueError);
          }
          
          stats.errors++;
          continue; // Don't update status if kick failed
        }

        // Kick succeeded - now update status to expired
        const { error: updateError } = await supabase
          .from("subscribers")
          .update({ 
            status: "expired", 
            updated_at: now.toISOString(),
            channel_joined: false,
            channel_membership_status: "kicked",
          })
          .eq("id", sub.id);
        
        if (updateError) {
          console.error(`Failed to update status to expired for ${sub.id}:`, updateError);
          stats.errors++;
          continue;
        }

        // Send expiry notification
        const message =
          `❌ <b>Subscription Expired</b>\n\n` +
          `Your access to <b>${sub.projects.project_name}</b> has ended.\n\n` +
          `You have been removed from the channel.\n\n` +
          `💡 To continue enjoying premium content, renew your subscription with /start\n\n` +
          `We hope to see you back soon! 🙏`;

        await sendTelegramMessage(sub.projects.bot_token, sub.telegram_user_id, message);
        stats.expired++;
        console.log(`Successfully expired subscriber ${sub.id}`);
      }
    }

    // ========================================
    // Summary
    // ========================================
    const summary = {
      success: true,
      timestamp: now.toISOString(),
      stats,
      message: `Processed: ${stats.threeDayReminders} 3-day reminders, ${stats.oneDayReminders} 1-day reminders, ${stats.expired} expired`,
    };

    console.log("Expiry check complete:", summary);

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in expiry check:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
