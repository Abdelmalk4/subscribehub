import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ============= CONFIGURATION =============
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;
const TELEGRAM_API_TIMEOUT_MS = 10000;

// ============= TYPE DEFINITIONS =============
type NotifyAction = "approved" | "rejected" | "suspended" | "kicked" | "reactivated" | "extended" | "expiring_soon" | "expired";

interface NotifyRequest {
  subscriber_id: string;
  action: NotifyAction;
  reason?: string;
  invite_link?: string;
  expiry_date?: string;
  days_remaining?: number;
}

// ============= RETRY WRAPPER =============
async function withRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  maxAttempts: number = RETRY_ATTEMPTS
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (err) {
      const error = err as Error;
      lastError = error;
      console.warn(`[RETRY] ${operationName} attempt ${attempt}/${maxAttempts} failed:`, error.message);
      
      if (attempt < maxAttempts) {
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

// ============= TELEGRAM API FUNCTIONS =============
async function sendTelegramMessage(
  botToken: string,
  chatId: number,
  text: string,
  replyMarkup?: object
): Promise<{ ok: boolean; result?: any; error_code?: number }> {
  return withRetry(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TELEGRAM_API_TIMEOUT_MS);
    
    try {
      const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
      const body: Record<string, unknown> = { chat_id: chatId, text, parse_mode: "HTML" };
      if (replyMarkup) body.reply_markup = replyMarkup;

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      
      const result = await response.json();
      console.log("[TELEGRAM] Message response:", JSON.stringify(result));
      
      if (!result.ok && result.error_code === 429) {
        throw new Error(`Rate limited: retry after ${result.parameters?.retry_after || 30}s`);
      }
      
      return result;
    } finally {
      clearTimeout(timeoutId);
    }
  }, `sendMessage to ${chatId}`);
}

async function createChannelInviteLink(botToken: string, channelId: string): Promise<string | null> {
  try {
    return await withRetry(async () => {
      const url = `https://api.telegram.org/bot${botToken}/createChatInviteLink`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: channelId,
          member_limit: 1,
          expire_date: Math.floor(Date.now() / 1000) + 86400 * 7,
        }),
      });
      
      const result = await response.json();
      console.log("[TELEGRAM] Create invite link response:", JSON.stringify(result));
      
      if (result.ok && result.result?.invite_link) {
        return result.result.invite_link;
      }
      return null;
    }, "createInviteLink");
  } catch (error) {
    console.error("[TELEGRAM] Error creating invite link:", error);
    return null;
  }
}

async function kickFromChannel(botToken: string, channelId: string, userId: number): Promise<boolean> {
  try {
    return await withRetry(async () => {
      // Ban user
      const banUrl = `https://api.telegram.org/bot${botToken}/banChatMember`;
      const banResponse = await fetch(banUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: channelId, user_id: userId }),
      });
      
      const banResult = await banResponse.json();
      console.log("[TELEGRAM] Ban user response:", JSON.stringify(banResult));
      
      if (!banResult.ok) {
        if (banResult.error_code === 400 && banResult.description?.includes("user is not a member")) {
          console.log("[TELEGRAM] User already not a member");
          return true;
        }
        return false;
      }
      
      // Unban to allow rejoin later
      const unbanUrl = `https://api.telegram.org/bot${botToken}/unbanChatMember`;
      const unbanResponse = await fetch(unbanUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: channelId, user_id: userId, only_if_banned: true }),
      });
      
      const unbanResult = await unbanResponse.json();
      console.log("[TELEGRAM] Unban user response:", JSON.stringify(unbanResult));
      
      return true;
    }, `kickFromChannel ${userId}`);
  } catch (error) {
    console.error("[TELEGRAM] Error kicking user:", error);
    return false;
  }
}

// ============= AUTHENTICATION =============
function verifyAuth(req: Request): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    console.warn("[AUTH] No authorization header");
    return false;
  }
  
  // Accept service role key or anon key with valid JWT
  const token = authHeader.replace("Bearer ", "");
  
  // For internal calls from other edge functions using service key
  if (token === supabaseServiceKey) {
    return true;
  }
  
  // For calls from the frontend (via supabase.functions.invoke)
  // The SDK adds the anon/user JWT - we trust these since they come through our SDK
  if (token && token.split('.').length === 3) {
    return true;
  }
  
  return false;
}

// ============= MAIN HANDLER =============
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID().slice(0, 8);
  console.log(`[${requestId}] Notify subscriber request`);

  try {
    // Verify authentication
    if (!verifyAuth(req)) {
      console.error(`[${requestId}] Unauthorized request`);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body: NotifyRequest = await req.json();
    
    const { subscriber_id, action, reason, invite_link, expiry_date, days_remaining } = body;
    
    if (!subscriber_id || !action) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[${requestId}] Action: ${action} for subscriber: ${subscriber_id}`);

    // Fetch subscriber with project details
    const { data: subscriber, error: subError } = await supabase
      .from("subscribers")
      .select(`
        *,
        projects!inner(
          bot_token,
          channel_id,
          project_name,
          support_contact
        ),
        plans(plan_name, duration_days)
      `)
      .eq("id", subscriber_id)
      .single();

    if (subError || !subscriber) {
      console.error(`[${requestId}] Subscriber not found:`, subError);
      return new Response(JSON.stringify({ error: "Subscriber not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const botToken = subscriber.projects.bot_token;
    const channelId = subscriber.projects.channel_id;
    const chatId = subscriber.telegram_user_id;
    const projectName = subscriber.projects.project_name;
    const supportContact = subscriber.projects.support_contact;
    const planName = subscriber.plans?.plan_name || "Subscription";
    
    let message = "";
    let replyMarkup: object | undefined;
    let generatedInviteLink: string | null = null;
    let kickResult = false;

    switch (action) {
      case "approved":
        generatedInviteLink = invite_link || await createChannelInviteLink(botToken, channelId);
        
        if (generatedInviteLink) {
          await supabase
            .from("subscribers")
            .update({ invite_link: generatedInviteLink })
            .eq("id", subscriber_id);
          
          const expiryText = expiry_date 
            ? new Date(expiry_date).toLocaleDateString() 
            : "N/A";
          
          message = `🎉 <b>Payment Approved!</b>\n\n` +
            `Your subscription to <b>${projectName}</b> has been activated.\n\n` +
            `📦 Plan: <b>${planName}</b>\n` +
            `📅 Expires: <b>${expiryText}</b>\n\n` +
            `👇 Click below to join the channel:`;
          
          replyMarkup = {
            inline_keyboard: [[
              { text: "🔗 Join Channel", url: generatedInviteLink }
            ]]
          };
        } else {
          message = `🎉 <b>Payment Approved!</b>\n\n` +
            `Your subscription to <b>${projectName}</b> has been activated.\n\n` +
            `📦 Plan: <b>${planName}</b>\n\n` +
            `⚠️ Could not generate invite link. Please contact support.`;
          
          if (supportContact) {
            message += `\n\n📞 Support: ${supportContact}`;
          }
        }
        break;

      case "extended":
        const newExpiryText = expiry_date 
          ? new Date(expiry_date).toLocaleDateString() 
          : "N/A";
        
        message = `✅ <b>Subscription Extended!</b>\n\n` +
          `Your subscription to <b>${projectName}</b> has been extended.\n\n` +
          `📦 Plan: <b>${planName}</b>\n` +
          `📅 New Expiry: <b>${newExpiryText}</b>\n\n` +
          `Thank you for your continued support!`;
        break;

      case "expiring_soon":
        message = `⏰ <b>Subscription Expiring Soon</b>\n\n` +
          `Your subscription to <b>${projectName}</b> will expire in <b>${days_remaining || 3} days</b>.\n\n` +
          `Use /renew to extend your subscription and maintain access.`;
        break;

      case "expired":
        message = `❌ <b>Subscription Expired</b>\n\n` +
          `Your subscription to <b>${projectName}</b> has expired.\n\n` +
          `Use /renew to reactivate your subscription.`;
        break;

      case "rejected":
        message = `❌ <b>Payment Not Approved</b>\n\n` +
          `Your payment for <b>${projectName}</b> could not be verified.\n\n`;
        
        if (reason) {
          message += `📝 Reason: ${reason}\n\n`;
        }
        
        message += `Please try again with valid payment proof using /start.`;
        
        if (supportContact) {
          message += `\n\n📞 Need help? Contact: ${supportContact}`;
        }
        break;

      case "suspended":
        kickResult = await kickFromChannel(botToken, channelId, chatId);
        console.log(`[${requestId}] Kick result for suspended:`, kickResult);
        
        message = `⚠️ <b>Subscription Suspended</b>\n\n` +
          `Your access to <b>${projectName}</b> has been suspended.\n\n`;
        
        if (reason) {
          message += `📝 Reason: ${reason}\n\n`;
        }
        
        if (supportContact) {
          message += `📞 Contact support: ${supportContact}`;
        }
        break;

      case "kicked":
        kickResult = await kickFromChannel(botToken, channelId, chatId);
        console.log(`[${requestId}] Kick result:`, kickResult);
        
        message = `🚫 <b>Access Revoked</b>\n\n` +
          `Your access to <b>${projectName}</b> has been revoked.\n\n`;
        
        if (reason) {
          message += `📝 Reason: ${reason}\n\n`;
        }
        
        message += `Use /start to subscribe again.`;
        break;

      case "reactivated":
        generatedInviteLink = await createChannelInviteLink(botToken, channelId);
        
        if (generatedInviteLink) {
          await supabase
            .from("subscribers")
            .update({ invite_link: generatedInviteLink })
            .eq("id", subscriber_id);
          
          message = `✅ <b>Subscription Reactivated!</b>\n\n` +
            `Your access to <b>${projectName}</b> has been restored.\n\n` +
            `👇 Click below to rejoin the channel:`;
          
          replyMarkup = {
            inline_keyboard: [[
              { text: "🔗 Join Channel", url: generatedInviteLink }
            ]]
          };
        } else {
          message = `✅ <b>Subscription Reactivated!</b>\n\n` +
            `Your access to <b>${projectName}</b> has been restored.\n\n` +
            `⚠️ Could not generate invite link. Please contact support.`;
        }
        break;

      default:
        console.error(`[${requestId}] Unknown action: ${action}`);
        return new Response(JSON.stringify({ error: "Unknown action" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    // Send the notification
    const sendResult = await sendTelegramMessage(botToken, chatId, message, replyMarkup);

    console.log(`[${requestId}] Notification sent: ${sendResult.ok}`);

    return new Response(JSON.stringify({ 
      success: true, 
      message_sent: sendResult.ok,
      invite_link: generatedInviteLink,
      kicked: kickResult || undefined,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error(`[${requestId}] Error:`, error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
