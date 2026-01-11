import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Rate limiting configuration
const RATE_LIMIT_REQUESTS = 100; // requests per window
const RATE_LIMIT_WINDOW_SECONDS = 60; // 1 minute window

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

// Rate limit check function
async function checkRateLimit(supabase: any, identifier: string): Promise<{ allowed: boolean; retryAfter?: number }> {
  try {
    const { data, error } = await supabase.rpc("check_rate_limit", {
      p_identifier: identifier,
      p_endpoint: "stripe-webhook",
      p_limit: RATE_LIMIT_REQUESTS,
      p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
    });

    if (error) {
      console.error("Rate limit check error:", error);
      return { allowed: true }; // Fail open
    }

    return {
      allowed: data.allowed,
      retryAfter: data.retry_after,
    };
  } catch (err) {
    console.error("Rate limit exception:", err);
    return { allowed: true };
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

    // PHASE 10: Get project_id from URL query params
    const url = new URL(req.url);
    const projectId = url.searchParams.get("project_id");

    console.log("Received Stripe webhook for project:", projectId);

    // PHASE 6: Rate limiting check (using IP or a general identifier)
    const clientIP = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const rateLimitResult = await checkRateLimit(supabase, `stripe:${clientIP}`);
    if (!rateLimitResult.allowed) {
      console.warn(`Rate limit exceeded for IP ${clientIP}`);
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(rateLimitResult.retryAfter || 60) },
      });
    }

    // PHASE 10: Validate project_id is provided
    if (!projectId) {
      console.error("Missing project_id in webhook URL");
      return new Response(JSON.stringify({ error: "Missing project_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // PHASE 10: Fetch project's webhook secret
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("*, stripe_config")
      .eq("id", projectId)
      .single();

    if (projectError || !project) {
      console.error("Project not found:", projectId, projectError);
      return new Response(JSON.stringify({ error: "Project not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // PHASE 10: Get project-specific webhook secret
    const stripeWebhookSecret = project.stripe_config?.webhook_secret;
    
    // CRITICAL: Webhook signature verification is MANDATORY
    if (!stripeWebhookSecret) {
      console.error("Stripe webhook secret not configured for project:", projectId);
      return new Response(JSON.stringify({ error: "Webhook secret not configured for this project" }), {
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
      console.error("Invalid Stripe signature for project:", projectId);
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.log("Stripe signature verified for project:", projectId);

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
      const metaProjectId = metadata.project_id;
      const planId = metadata.plan_id;
      const telegramUserId = metadata.telegram_user_id;

      // Security: Verify project_id from URL matches metadata
      if (metaProjectId && metaProjectId !== projectId) {
        console.error("Project ID mismatch:", { urlProjectId: projectId, metaProjectId });
        return new Response(JSON.stringify({ error: "Project ID mismatch" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

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

      // Security: Verify subscriber belongs to the project
      if (subscriber.project_id !== projectId) {
        console.error("Subscriber does not belong to project:", { subscriberProjectId: subscriber.project_id, projectId });
        return new Response(JSON.stringify({ error: "Subscriber-project mismatch" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log("Found subscriber:", subscriber.id, "Current status:", subscriber.status, "Current expiry:", subscriber.expiry_date);

      // Get plan duration
      const plan = subscriber.plans;
      const durationDays = plan?.duration_days || 30;
      
      // Store pre-update state for message logic
      const wasActive = subscriber.status === "active";
      const currentExpiryDate = subscriber.expiry_date ? new Date(subscriber.expiry_date) : null;
      const now = new Date();
      const isExtension = wasActive && currentExpiryDate && currentExpiryDate > now;

      // PHASE 4: Use atomic function with row locking to prevent race conditions
      console.log(`Processing payment atomically for subscriber ${subscriberId}, duration: ${durationDays} days`);
      
      const { data: paymentResult, error: rpcError } = await supabase.rpc("process_stripe_payment", {
        p_subscriber_id: subscriberId,
        p_duration_days: durationDays,
      });

      if (rpcError) {
        console.error("Error in atomic payment processing:", rpcError);
        return new Response(JSON.stringify({ error: "Payment processing failed" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log("Atomic payment result:", JSON.stringify(paymentResult));
      
      const startDate = new Date(paymentResult.start_date);
      const expiryDate = new Date(paymentResult.expiry_date);

      // Create invite link (only needed for new subscriptions or reactivations)
      let inviteLink = subscriber.invite_link;
      if (!inviteLink || !wasActive) {
        inviteLink = await createInviteLink(
          project.bot_token,
          project.channel_id,
          subscriber.first_name || `User ${subscriber.telegram_user_id}`
        );
        
        // Update invite link separately (atomic function handles core fields)
        if (inviteLink) {
          await supabase
            .from("subscribers")
            .update({ invite_link: inviteLink })
            .eq("id", subscriberId);
        }
      }

      console.log("Subscriber updated to active with expiry:", expiryDate.toISOString());

      // Send confirmation to user via Telegram
      if (subscriber.telegram_user_id) {
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

      // PHASE 5: Log audit event for payment completion
      await supabase.rpc("log_audit_event", {
        p_user_id: null,
        p_action: "stripe_payment_completed",
        p_resource_type: "subscriber",
        p_resource_id: subscriberId,
        p_changes: {
          stripe_event_id: event.id,
          session_id: session.id,
          project_id: projectId,
          plan_id: planId,
          amount_total: session.amount_total,
          currency: session.currency,
          is_extension: isExtension,
          old_expiry_date: subscriber.expiry_date,
          new_expiry_date: expiryDate.toISOString(),
          duration_days: durationDays,
        },
      });

      // Record successful processing for idempotency
      await supabase.from("webhook_events").insert({
        event_source: "stripe",
        event_id: event.id,
        event_type: event.type,
        result: { status: "processed", subscriber_id: subscriberId, project_id: projectId }
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
