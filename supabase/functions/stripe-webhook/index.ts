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
    console.error("Signature verification error:", error);
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
    console.log("Create invite link result:", JSON.stringify(result));
    
    if (result.ok) {
      return result.result.invite_link;
    }
    return null;
  } catch (error) {
    console.error("Error creating invite link:", error);
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

    // CRITICAL: Webhook signature verification is MANDATORY
    if (!stripeWebhookSecret) {
      console.error("STRIPE_WEBHOOK_SECRET not configured - rejecting webhook");
      return new Response(JSON.stringify({ error: "Webhook secret not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!signature) {
      console.error("Missing stripe-signature header");
      return new Response(JSON.stringify({ error: "Missing signature" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isValid = await verifyStripeSignature(payload, signature, stripeWebhookSecret);
    if (!isValid) {
      console.error("Invalid Stripe signature");
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.log("Stripe signature verified");

    const event = JSON.parse(payload);
    console.log("Stripe event type:", event.type, "Event ID:", event.id);

    // IDEMPOTENCY CHECK: Prevent duplicate processing
    const { data: existingEvent } = await supabase
      .from("webhook_events")
      .select("id")
      .eq("event_source", "stripe")
      .eq("event_id", event.id)
      .single();

    if (existingEvent) {
      console.log(`Duplicate Stripe event ${event.id} - already processed`);
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      console.log("Checkout session completed:", JSON.stringify(session));

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

      // Fetch subscriber details with current expiry date
      const { data: subscriber, error: subError } = await supabase
        .from("subscribers")
        .select("*, plans(*)")
        .eq("id", subscriberId)
        .single();

      if (subError || !subscriber) {
        console.error("Subscriber not found:", subError);
        return new Response(JSON.stringify({ error: "Subscriber not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log("Found subscriber:", subscriber.id, "Current status:", subscriber.status, "Current expiry:", subscriber.expiry_date);

      // Fetch project
      const { data: project, error: projError } = await supabase
        .from("projects")
        .select("*")
        .eq("id", subscriber.project_id)
        .single();

      if (projError || !project) {
        console.error("Project not found:", projError);
        return new Response(JSON.stringify({ error: "Project not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Calculate dates - CRITICAL FIX: Extend from existing expiry if active and not expired
      const plan = subscriber.plans;
      const durationDays = plan?.duration_days || 30;
      
      let startDate: Date;
      let expiryDate: Date;
      
      // Check if this is an extension (subscriber is active with future expiry)
      const currentExpiryDate = subscriber.expiry_date ? new Date(subscriber.expiry_date) : null;
      const now = new Date();
      
      if (subscriber.status === "active" && currentExpiryDate && currentExpiryDate > now) {
        // EXTENSION: Add duration to existing expiry date
        startDate = new Date(subscriber.start_date || now);
        expiryDate = new Date(currentExpiryDate);
        expiryDate.setDate(expiryDate.getDate() + durationDays);
        
        console.log(`EXTENSION: Adding ${durationDays} days to existing expiry ${currentExpiryDate.toISOString()}`);
        console.log(`New expiry date: ${expiryDate.toISOString()}`);
      } else {
        // NEW SUBSCRIPTION or REACTIVATION: Start from now
        startDate = now;
        expiryDate = new Date(now);
        expiryDate.setDate(expiryDate.getDate() + durationDays);
        
        console.log(`NEW/REACTIVATION: Starting from ${startDate.toISOString()}, expiry: ${expiryDate.toISOString()}`);
      }

      // Create invite link (only needed for new subscriptions or reactivations)
      let inviteLink = subscriber.invite_link;
      if (!inviteLink || subscriber.status !== "active") {
        inviteLink = await createInviteLink(
          project.bot_token,
          project.channel_id,
          subscriber.first_name || `User ${subscriber.telegram_user_id}`
        );
      }

      // Update subscriber
      const { error: updateError } = await supabase
        .from("subscribers")
        .update({
          status: "active",
          start_date: startDate.toISOString(),
          expiry_date: expiryDate.toISOString(),
          payment_method: "stripe",
          invite_link: inviteLink,
          expiry_reminder_sent: false, // Reset reminders for extended subscriptions
          final_reminder_sent: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", subscriberId);

      if (updateError) {
        console.error("Error updating subscriber:", updateError);
      } else {
        console.log("Subscriber updated to active with expiry:", expiryDate.toISOString());
      }

      // Send confirmation to user via Telegram
      if (subscriber.telegram_user_id) {
        const isExtension = subscriber.status === "active" && currentExpiryDate && currentExpiryDate > now;
        
        let message = "";
        if (isExtension) {
          message = `🎉 <b>Subscription Extended!</b>\n\n`;
          message += `✅ Your subscription has been extended.\n`;
          message += `📦 Plan: ${plan?.plan_name || "Subscription"}\n`;
          message += `📅 New expiry date: ${expiryDate.toLocaleDateString()}\n\n`;
          message += `Thank you for your continued support! 🙏`;
        } else {
          message = `🎉 <b>Payment Successful!</b>\n\n`;
          message += `✅ Your subscription is now active!\n`;
          message += `📦 Plan: ${plan?.plan_name || "Subscription"}\n`;
          message += `📅 Valid until: ${expiryDate.toLocaleDateString()}\n\n`;

          if (inviteLink) {
            message += `🔗 <b>Join the channel:</b>\n${inviteLink}\n\n`;
            message += `⚠️ This link can only be used once.`;
          } else {
            message += `Our team will grant you access shortly.`;
          }
        }

        await sendTelegramMessage(project.bot_token, subscriber.telegram_user_id, message);
        console.log("Sent confirmation message to Telegram user");
      }

      // Record successful processing for idempotency
      await supabase.from("webhook_events").insert({
        event_source: "stripe",
        event_id: event.id,
        event_type: event.type,
        result: { status: "processed", subscriber_id: subscriberId }
      });
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error processing Stripe webhook:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
