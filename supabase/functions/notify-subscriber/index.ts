import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface NotifyRequest {
  subscriber_id: string;
  action: "approved" | "rejected" | "suspended" | "kicked" | "reactivated";
  reason?: string;
  invite_link?: string;
  expiry_date?: string;
}

// Send message via Telegram API
async function sendTelegramMessage(
  botToken: string,
  chatId: number,
  text: string,
  replyMarkup?: object
) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const body: Record<string, unknown> = { chat_id: chatId, text, parse_mode: "HTML" };
  if (replyMarkup) body.reply_markup = replyMarkup;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  
  const result = await response.json();
  console.log("Telegram message response:", JSON.stringify(result));
  return result;
}

// Create invite link for the channel
async function createChannelInviteLink(botToken: string, channelId: string): Promise<string | null> {
  try {
    const url = `https://api.telegram.org/bot${botToken}/createChatInviteLink`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: channelId,
        member_limit: 1, // Single-use invite link
        expire_date: Math.floor(Date.now() / 1000) + 86400 * 7, // Expires in 7 days
      }),
    });
    
    const result = await response.json();
    console.log("Create invite link response:", JSON.stringify(result));
    
    if (result.ok && result.result?.invite_link) {
      return result.result.invite_link;
    }
    return null;
  } catch (error) {
    console.error("Error creating invite link:", error);
    return null;
  }
}

// Kick user from channel (ban then unban to allow rejoin later)
async function kickFromChannel(botToken: string, channelId: string, userId: number): Promise<boolean> {
  try {
    // First ban the user
    const banUrl = `https://api.telegram.org/bot${botToken}/banChatMember`;
    const banResponse = await fetch(banUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: channelId,
        user_id: userId,
      }),
    });
    
    const banResult = await banResponse.json();
    console.log("Ban user response:", JSON.stringify(banResult));
    
    if (!banResult.ok) {
      return false;
    }
    
    // Then unban to allow rejoin later (but they're removed from channel)
    const unbanUrl = `https://api.telegram.org/bot${botToken}/unbanChatMember`;
    const unbanResponse = await fetch(unbanUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: channelId,
        user_id: userId,
        only_if_banned: true,
      }),
    });
    
    const unbanResult = await unbanResponse.json();
    console.log("Unban user response:", JSON.stringify(unbanResult));
    
    return true;
  } catch (error) {
    console.error("Error kicking user from channel:", error);
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body: NotifyRequest = await req.json();
    
    const { subscriber_id, action, reason, invite_link, expiry_date } = body;
    
    if (!subscriber_id || !action) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
      console.error("Subscriber not found:", subError);
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

    switch (action) {
      case "approved":
        // Create invite link if not provided
        generatedInviteLink = invite_link || await createChannelInviteLink(botToken, channelId);
        
        if (generatedInviteLink) {
          // Update subscriber with invite link
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
            `👇 Click the button below to join the channel:`;
          
          replyMarkup = {
            inline_keyboard: [[
              { text: "🔗 Join Channel", url: generatedInviteLink }
            ]]
          };
        } else {
          message = `🎉 <b>Payment Approved!</b>\n\n` +
            `Your subscription to <b>${projectName}</b> has been activated.\n\n` +
            `📦 Plan: <b>${planName}</b>\n\n` +
            `⚠️ There was an issue generating your invite link. Please contact support.`;
          
          if (supportContact) {
            message += `\n\n📞 Support: ${supportContact}`;
          }
        }
        break;

      case "rejected":
        message = `❌ <b>Payment Not Approved</b>\n\n` +
          `Unfortunately, your payment for <b>${projectName}</b> could not be verified.\n\n`;
        
        if (reason) {
          message += `📝 Reason: ${reason}\n\n`;
        }
        
        message += `Please try again with a valid payment proof using /start.`;
        
        if (supportContact) {
          message += `\n\n📞 Need help? Contact: ${supportContact}`;
        }
        break;

      case "suspended":
        // Kick user from channel
        await kickFromChannel(botToken, channelId, chatId);
        
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
        // Force kick user from channel
        await kickFromChannel(botToken, channelId, chatId);
        
        message = `🚫 <b>Access Revoked</b>\n\n` +
          `Your access to <b>${projectName}</b> has been revoked.\n\n`;
        
        if (reason) {
          message += `📝 Reason: ${reason}\n\n`;
        }
        
        message += `Use /start to subscribe again.`;
        break;

      case "reactivated":
        // Create new invite link for reactivated user
        generatedInviteLink = await createChannelInviteLink(botToken, channelId);
        
        if (generatedInviteLink) {
          await supabase
            .from("subscribers")
            .update({ invite_link: generatedInviteLink })
            .eq("id", subscriber_id);
          
          message = `✅ <b>Subscription Reactivated!</b>\n\n` +
            `Your access to <b>${projectName}</b> has been restored.\n\n` +
            `👇 Click the button below to rejoin the channel:`;
          
          replyMarkup = {
            inline_keyboard: [[
              { text: "🔗 Join Channel", url: generatedInviteLink }
            ]]
          };
        } else {
          message = `✅ <b>Subscription Reactivated!</b>\n\n` +
            `Your access to <b>${projectName}</b> has been restored.\n\n` +
            `⚠️ There was an issue generating your invite link. Please contact support.`;
        }
        break;
    }

    // Send the notification message
    const sendResult = await sendTelegramMessage(botToken, chatId, message, replyMarkup);

    return new Response(JSON.stringify({ 
      success: true, 
      message_sent: sendResult.ok,
      invite_link: generatedInviteLink
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error in notify-subscriber:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
