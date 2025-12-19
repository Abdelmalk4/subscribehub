import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

async function sendTelegramMessage(botToken: string, chatId: number, text: string) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
      }),
    });
    const data = await response.json();
    console.log(`Message sent to ${chatId}:`, data.ok ? "success" : data.description);
    return data;
  } catch (error) {
    console.error(`Failed to send message to ${chatId}:`, error);
    return null;
  }
}

async function kickFromChannel(botToken: string, channelId: string, userId: number) {
  const url = `https://api.telegram.org/bot${botToken}/banChatMember`;
  try {
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
    const data = await banResponse.json();
    console.log(`Kicked user ${userId} from ${channelId}:`, data.ok ? "success" : data.description);
    return data;
  } catch (error) {
    console.error(`Failed to kick user ${userId}:`, error);
    return null;
  }
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
          await supabase
            .from("subscribers")
            .update({ expiry_reminder_sent: true, updated_at: now.toISOString() })
            .eq("id", sub.id);
          stats.threeDayReminders++;
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
          await supabase
            .from("subscribers")
            .update({
              expiry_reminder_sent: true,
              final_reminder_sent: true,
              updated_at: now.toISOString(),
            })
            .eq("id", sub.id);
          stats.oneDayReminders++;
        } else {
          stats.errors++;
        }
      }
    }

    // ========================================
    // Stage 3: Expire & Kick
    // ========================================
    console.log("Checking for expired subscriptions...");
    const { data: expired, error: expiredError } = await supabase
      .from("subscribers")
      .select("*, projects(*), plans(*)")
      .eq("status", "active")
      .lt("expiry_date", now.toISOString());

    if (expiredError) {
      console.error("Error fetching expired subscribers:", expiredError);
    } else if (expired && expired.length > 0) {
      console.log(`Found ${expired.length} expired subscriptions`);

      for (const sub of expired as Subscriber[]) {
        // Update status to expired
        await supabase
          .from("subscribers")
          .update({ status: "expired", updated_at: now.toISOString() })
          .eq("id", sub.id);

        // Kick from channel
        await kickFromChannel(sub.projects.bot_token, sub.projects.channel_id, sub.telegram_user_id);

        // Send expiry notification
        const message =
          `❌ <b>Subscription Expired</b>\n\n` +
          `Your access to <b>${sub.projects.project_name}</b> has ended.\n\n` +
          `You have been removed from the channel.\n\n` +
          `💡 To continue enjoying premium content, renew your subscription with /renew\n\n` +
          `We hope to see you back soon! 🙏`;

        await sendTelegramMessage(sub.projects.bot_token, sub.telegram_user_id, message);
        stats.expired++;
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
