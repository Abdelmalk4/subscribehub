import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY")!;
const stripeWebhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

// Simple crypto verification for Stripe webhooks
async function verifyStripeSignature(payload: string, signature: string, secret: string): Promise<boolean> {
  try {
    const parts = signature.split(",");
    let timestamp = "";
    let v1Signature = "";
    
    for (const part of parts) {
      const [key, value] = part.split("=");
      if (key === "t") timestamp = value;
      if (key === "v1") v1Signature = value;
    }
    
    if (!timestamp || !v1Signature) return false;
    
    const signedPayload = `${timestamp}.${payload}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    
    const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(signedPayload));
    const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    
    return expectedSignature === v1Signature;
  } catch (error) {
    console.error("Signature verification error");
    return false;
  }
}

// Send message via Telegram API
async function sendTelegramMessage(botToken: string, chatId: number, text: string, replyMarkup?: object) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const body: Record<string, unknown> = { chat_id: chatId, text, parse_mode: "HTML" };
  if (replyMarkup) body.reply_markup = replyMarkup;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.json();
}

// Create invite link for Telegram channel
async function createInviteLink(botToken: string, channelId: string, subscriberName: string): Promise<string | null> {
  try {
    const url = `https://api.telegram.org/bot${botToken}/createChatInviteLink`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: channelId,
        name: `Subscription - ${subscriberName}`,
        member_limit: 1,
        creates_join_request: false,
      }),
    });
    const result = await response.json();
    // Log only success/failure, not the invite link itself
    console.log("Create invite link result", { success: result.ok });
    
    if (result.ok) {
      return result.result.invite_link;
    }
    return null;
  } catch (error) {
    console.error("Error creating invite link");
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const payload = await req.text();
    const signature = req.headers.get("stripe-signature");

    console.log("Received Stripe webhook");

    // Verify webhook signature if secret is configured
    if (stripeWebhookSecret && signature) {
      const isValid = await verifyStripeSignature(payload, signature, stripeWebhookSecret);
      if (!isValid) {
        console.error("Invalid Stripe signature");
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.log("Stripe signature verified");
    } else {
      console.log("Skipping signature verification (webhook secret not configured)");
    }

    const event = JSON.parse(payload);
    console.log("Stripe event type:", event.type);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      // Log only non-sensitive metadata
      console.log("Checkout session completed", { 
        has_subscriber: !!session.client_reference_id,
        has_metadata: !!session.metadata 
      });

      const subscriberId = session.client_reference_id;
      const metadata = session.metadata || {};
      const projectId = metadata.project_id;
      const planId = metadata.plan_id;
      const telegramUserId = metadata.telegram_user_id;

      if (!subscriberId) {
        console.error("Missing client_reference_id (subscriber_id)");
        return new Response(JSON.stringify({ error: "Missing subscriber ID" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch subscriber details
      const { data: subscriber, error: subError } = await supabase
        .from("subscribers")
        .select("*, plans(*)")
        .eq("id", subscriberId)
        .single();

      if (subError || !subscriber) {
        console.error("Subscriber not found");
        return new Response(JSON.stringify({ error: "Subscriber not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log("Found subscriber");

      // Fetch project
      const { data: project, error: projError } = await supabase
        .from("projects")
        .select("*")
        .eq("id", subscriber.project_id)
        .single();

      if (projError || !project) {
        console.error("Project not found");
        return new Response(JSON.stringify({ error: "Project not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Calculate dates
      const startDate = new Date();
      const plan = subscriber.plans;
      const durationDays = plan?.duration_days || 30;
      const expiryDate = new Date(startDate);
      expiryDate.setDate(expiryDate.getDate() + durationDays);

      // Create invite link
      const inviteLink = await createInviteLink(
        project.bot_token,
        project.channel_id,
        subscriber.first_name || `User ${subscriber.telegram_user_id}`
      );

      // Update subscriber
      const { error: updateError } = await supabase
        .from("subscribers")
        .update({
          status: "active",
          start_date: startDate.toISOString(),
          expiry_date: expiryDate.toISOString(),
          payment_method: "stripe",
          invite_link: inviteLink,
          updated_at: new Date().toISOString(),
        })
        .eq("id", subscriberId);

      if (updateError) {
        console.error("Error updating subscriber");
      } else {
        console.log("Subscriber updated to active");
      }

      // Send confirmation to user via Telegram
      if (subscriber.telegram_user_id) {
        let message = `🎉 <b>Payment Successful!</b>\n\n`;
        message += `✅ Your subscription is now active!\n`;
        message += `📦 Plan: ${plan?.plan_name || "Subscription"}\n`;
        message += `📅 Valid until: ${expiryDate.toLocaleDateString()}\n\n`;

        if (inviteLink) {
          message += `🔗 <b>Join the channel:</b>\n${inviteLink}\n\n`;
          message += `⚠️ This link can only be used once.`;
        } else {
          message += `Our team will grant you access shortly.`;
        }

        await sendTelegramMessage(project.bot_token, subscriber.telegram_user_id, message);
        console.log("Sent confirmation message to Telegram user");
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error processing Stripe webhook");
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
