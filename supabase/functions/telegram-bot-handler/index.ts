import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: {
      id: number;
      is_bot: boolean;
      first_name: string;
      username?: string;
    };
    chat: { id: number; type: string };
    date: number;
    text?: string;
  };
  callback_query?: {
    id: string;
    from: { id: number; first_name: string; username?: string };
    message: { chat: { id: number } };
    data: string;
  };
}

interface Project {
  id: string;
  project_name: string;
  bot_token: string;
  channel_id: string;
  support_contact: string | null;
  manual_payment_config: { enabled: boolean; instructions: string } | null;
  stripe_config: { enabled: boolean } | null;
}

interface Plan {
  id: string;
  plan_name: string;
  price: number;
  duration_days: number;
  description: string | null;
}

interface Subscriber {
  id: string;
  status: string;
  plan_id: string | null;
  start_date: string | null;
  expiry_date: string | null;
  plans?: Plan;
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
  return response.json();
}

// Answer callback query
async function answerCallbackQuery(botToken: string, callbackQueryId: string, text?: string) {
  const url = `https://api.telegram.org/bot${botToken}/answerCallbackQuery`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const url = new URL(req.url);
    const projectId = url.searchParams.get("project_id");

    if (!projectId) {
      console.error("Missing project_id parameter");
      return new Response(JSON.stringify({ error: "Missing project_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch project
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .single();

    if (projectError || !project) {
      console.error("Project not found:", projectError);
      return new Response(JSON.stringify({ error: "Project not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const typedProject = project as Project;
    const botToken = typedProject.bot_token;
    const update: TelegramUpdate = await req.json();
    console.log("Received update:", JSON.stringify(update));

    // Handle callback queries (button clicks)
    if (update.callback_query) {
      const { callback_query } = update;
      const callbackData = callback_query.data;
      const userId = callback_query.from.id;
      const chatId = callback_query.message.chat.id;
      const firstName = callback_query.from.first_name;
      const username = callback_query.from.username;

      await answerCallbackQuery(botToken, callback_query.id);

      if (callbackData.startsWith("select_plan:")) {
        const planId = callbackData.split(":")[1];
        await handlePlanSelection(supabase, typedProject, planId, userId, chatId, firstName, username);
      } else if (callbackData.startsWith("pay_method:")) {
        const [, planId, method] = callbackData.split(":");
        await handlePaymentMethod(supabase, typedProject, planId, method, userId, chatId);
      } else if (callbackData === "confirm_payment") {
        await sendTelegramMessage(botToken, chatId, "✅ Your payment confirmation has been received!\n\nPlease wait while we verify your payment.");
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle regular messages
    if (update.message?.text) {
      const { message } = update;
      const text = message.text!;
      const userId = message.from.id;
      const chatId = message.chat.id;
      const firstName = message.from.first_name;
      const username = message.from.username;
      const command = text.split(" ")[0].toLowerCase();

      switch (command) {
        case "/start":
          await handleStart(supabase, typedProject, userId, chatId, firstName, username);
          break;
        case "/status":
          await handleStatus(supabase, typedProject, userId, chatId);
          break;
        case "/renew":
          await handleRenew(supabase, typedProject, userId, chatId);
          break;
        case "/help":
          await handleHelp(typedProject, chatId);
          break;
        default:
          if (text.startsWith("/")) {
            await sendTelegramMessage(botToken, chatId, "❓ Unknown command. Use /help to see available commands.");
          }
      }
    }

    // Handle photo messages (payment proof)
    if (update.message && !update.message.text) {
      const { message } = update;
      const userId = message.from.id;
      const chatId = message.chat.id;

      const { data: subscriber } = await supabase
        .from("subscribers")
        .select("*")
        .eq("project_id", projectId)
        .eq("telegram_user_id", userId)
        .eq("status", "awaiting_proof")
        .single();

      if (subscriber) {
        await sendTelegramMessage(
          botToken,
          chatId,
          "📸 Payment proof received!\n\nOur team will review your payment and activate your subscription shortly."
        );

        await supabase
          .from("subscribers")
          .update({ status: "pending_approval", payment_proof_url: "Photo received via Telegram", updated_at: new Date().toISOString() })
          .eq("id", (subscriber as Subscriber).id);
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error processing webhook:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Command handlers
async function handleStart(
  supabase: any,
  project: Project,
  userId: number,
  chatId: number,
  firstName: string,
  username?: string
) {
  const { data: existingSubscriber } = await supabase
    .from("subscribers")
    .select("*, plans(*)")
    .eq("project_id", project.id)
    .eq("telegram_user_id", userId)
    .single();

  const sub = existingSubscriber as Subscriber | null;

  if (sub && sub.status === "active") {
    const expiryDate = sub.expiry_date ? new Date(sub.expiry_date).toLocaleDateString() : "N/A";
    await sendTelegramMessage(
      project.bot_token,
      chatId,
      `👋 Welcome back, <b>${firstName}</b>!\n\n✅ You have an active subscription!\n📅 Expires: ${expiryDate}\n\nUse /status to check details.\nUse /renew to extend.`
    );
    return;
  }

  const { data: plans } = await supabase
    .from("plans")
    .select("*")
    .eq("project_id", project.id)
    .eq("is_active", true)
    .order("price", { ascending: true });

  const typedPlans = (plans || []) as Plan[];

  if (typedPlans.length === 0) {
    await sendTelegramMessage(
      project.bot_token,
      chatId,
      `👋 Welcome to <b>${project.project_name}</b>!\n\nSorry, no subscription plans available. Please check back later.`
    );
    return;
  }

  const keyboard = typedPlans.map((plan) => [{
    text: `${plan.plan_name} - $${plan.price} (${plan.duration_days} days)`,
    callback_data: `select_plan:${plan.id}`,
  }]);

  await sendTelegramMessage(
    project.bot_token,
    chatId,
    `👋 Welcome to <b>${project.project_name}</b>, ${firstName}!\n\n🎯 Choose a subscription plan:\n\n` +
      typedPlans.map((p) => `• <b>${p.plan_name}</b>\n  💰 $${p.price} for ${p.duration_days} days\n  ${p.description || ""}`).join("\n\n"),
    { inline_keyboard: keyboard }
  );

  if (sub) {
    await supabase
      .from("subscribers")
      .update({ first_name: firstName, username: username || null, updated_at: new Date().toISOString() })
      .eq("id", sub.id);
  } else {
    await supabase.from("subscribers").insert({
      project_id: project.id,
      telegram_user_id: userId,
      first_name: firstName,
      username: username || null,
      status: "pending_payment",
    });
  }
}

async function handleStatus(supabase: any, project: Project, userId: number, chatId: number) {
  const { data: subscriber } = await supabase
    .from("subscribers")
    .select("*, plans(*)")
    .eq("project_id", project.id)
    .eq("telegram_user_id", userId)
    .single();

  if (!subscriber) {
    await sendTelegramMessage(project.bot_token, chatId, "❌ You don't have a subscription yet.\n\nUse /start to view plans!");
    return;
  }

  const sub = subscriber as Subscriber;
  const statusEmoji: Record<string, string> = { active: "✅", pending_payment: "⏳", pending_approval: "🔄", awaiting_proof: "📤", expired: "❌", rejected: "🚫" };
  const statusText: Record<string, string> = { active: "Active", pending_payment: "Pending Payment", pending_approval: "Pending Approval", awaiting_proof: "Awaiting Payment Proof", expired: "Expired", rejected: "Rejected" };

  const emoji = statusEmoji[sub.status] || "❓";
  const status = statusText[sub.status] || sub.status;

  let message = `📊 <b>Subscription Status</b>\n\n${emoji} Status: <b>${status}</b>\n`;
  if (sub.plans) message += `📦 Plan: ${sub.plans.plan_name}\n`;
  if (sub.start_date) message += `📅 Started: ${new Date(sub.start_date).toLocaleDateString()}\n`;
  if (sub.expiry_date) {
    const expiry = new Date(sub.expiry_date);
    const daysLeft = Math.ceil((expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    message += `📅 Expires: ${expiry.toLocaleDateString()}\n`;
    if (sub.status === "active" && daysLeft <= 7 && daysLeft > 0) {
      message += `\n⚠️ Expires in <b>${daysLeft} days</b>! Use /renew to extend.`;
    } else if (daysLeft <= 0) {
      message += `\n⚠️ Subscription expired! Use /renew to reactivate.`;
    }
  }

  await sendTelegramMessage(project.bot_token, chatId, message);
}

async function handleRenew(supabase: any, project: Project, userId: number, chatId: number) {
  const { data: subscriber } = await supabase
    .from("subscribers")
    .select("*, plans(*)")
    .eq("project_id", project.id)
    .eq("telegram_user_id", userId)
    .single();

  const sub = subscriber as Subscriber | null;

  const { data: plans } = await supabase
    .from("plans")
    .select("*")
    .eq("project_id", project.id)
    .eq("is_active", true)
    .order("price", { ascending: true });

  const typedPlans = (plans || []) as Plan[];

  if (typedPlans.length === 0) {
    await sendTelegramMessage(project.bot_token, chatId, "Sorry, no plans available at the moment.");
    return;
  }

  const keyboard = typedPlans.map((plan) => [{
    text: `${plan.plan_name} - $${plan.price} (${plan.duration_days} days)`,
    callback_data: `select_plan:${plan.id}`,
  }]);

  let message = `🔄 <b>Renew Your Subscription</b>\n\n`;
  if (sub?.status === "active" && sub.expiry_date) {
    message += `Current subscription expires on ${new Date(sub.expiry_date).toLocaleDateString()}.\n\n`;
  }
  message += `Choose a plan to ${sub?.status === "active" ? "extend" : "reactivate"} your subscription:`;

  await sendTelegramMessage(project.bot_token, chatId, message, { inline_keyboard: keyboard });
}

async function handleHelp(project: Project, chatId: number) {
  const supportInfo = project.support_contact ? `\n\n📞 Support: ${project.support_contact}` : "";
  await sendTelegramMessage(
    project.bot_token,
    chatId,
    `📚 <b>Available Commands</b>\n\n/start - View plans and get started\n/status - Check your subscription\n/renew - Renew or extend subscription\n/help - Show this help message${supportInfo}`
  );
}

async function handlePlanSelection(
  supabase: any,
  project: Project,
  planId: string,
  userId: number,
  chatId: number,
  firstName: string,
  username?: string
) {
  const { data: plan } = await supabase.from("plans").select("*").eq("id", planId).single();

  if (!plan) {
    await sendTelegramMessage(project.bot_token, chatId, "❌ Plan not found. Please try /start again.");
    return;
  }

  const typedPlan = plan as Plan;

  await supabase
    .from("subscribers")
    .update({ plan_id: planId, status: "pending_payment", updated_at: new Date().toISOString() })
    .eq("project_id", project.id)
    .eq("telegram_user_id", userId);

  const paymentButtons: { text: string; callback_data: string }[][] = [];
  if (project.manual_payment_config?.enabled) {
    paymentButtons.push([{ text: "💳 Manual Payment", callback_data: `pay_method:${planId}:manual` }]);
  }
  if (project.stripe_config?.enabled) {
    paymentButtons.push([{ text: "💳 Pay with Card", callback_data: `pay_method:${planId}:stripe` }]);
  }
  if (paymentButtons.length === 0) {
    paymentButtons.push([{ text: "💳 Proceed to Payment", callback_data: `pay_method:${planId}:manual` }]);
  }

  await sendTelegramMessage(
    project.bot_token,
    chatId,
    `✅ Great choice!\n\n📦 <b>${typedPlan.plan_name}</b>\n💰 Price: $${typedPlan.price}\n⏱ Duration: ${typedPlan.duration_days} days\n\nSelect your payment method:`,
    { inline_keyboard: paymentButtons }
  );
}

async function handlePaymentMethod(
  supabase: any,
  project: Project,
  planId: string,
  method: string,
  userId: number,
  chatId: number
) {
  const { data: plan } = await supabase.from("plans").select("*").eq("id", planId).single();

  if (!plan) {
    await sendTelegramMessage(project.bot_token, chatId, "❌ Plan not found. Please try /start again.");
    return;
  }

  const typedPlan = plan as Plan;

  if (method === "manual") {
    await supabase
      .from("subscribers")
      .update({ status: "awaiting_proof", payment_method: "manual", updated_at: new Date().toISOString() })
      .eq("project_id", project.id)
      .eq("telegram_user_id", userId);

    const instructions = project.manual_payment_config?.instructions || "Please send your payment to complete the subscription.";

    await sendTelegramMessage(
      project.bot_token,
      chatId,
      `💳 <b>Manual Payment</b>\n\nAmount: <b>$${typedPlan.price}</b>\n\n📝 <b>Instructions:</b>\n${instructions}\n\nAfter payment, send a screenshot of your payment confirmation here.`
    );
  } else if (method === "stripe") {
    // Get subscriber ID
    const { data: subscriber } = await supabase
      .from("subscribers")
      .select("id")
      .eq("project_id", project.id)
      .eq("telegram_user_id", userId)
      .single();

    if (!subscriber) {
      await sendTelegramMessage(project.bot_token, chatId, "❌ Subscriber not found. Please try /start again.");
      return;
    }

    // Update subscriber status
    await supabase
      .from("subscribers")
      .update({ status: "pending_payment", payment_method: "stripe", updated_at: new Date().toISOString() })
      .eq("id", subscriber.id);

    // Call create-checkout-session edge function
    try {
      const checkoutResponse = await fetch(`${supabaseUrl}/functions/v1/create-checkout-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          project_id: project.id,
          plan_id: planId,
          subscriber_id: subscriber.id,
          telegram_user_id: userId,
        }),
      });

      const checkoutData = await checkoutResponse.json();
      console.log("Checkout session response:", JSON.stringify(checkoutData));

      if (checkoutData.checkout_url) {
        await sendTelegramMessage(
          project.bot_token,
          chatId,
          `💳 <b>Card Payment</b>\n\nAmount: <b>$${typedPlan.price}</b>\n\n🔗 Click the button below to complete your payment securely via Stripe:`,
          {
            inline_keyboard: [[
              { text: "💳 Pay Now", url: checkoutData.checkout_url }
            ]]
          }
        );
      } else {
        console.error("Failed to create checkout session:", checkoutData);
        await sendTelegramMessage(
          project.bot_token,
          chatId,
          `❌ Sorry, there was an error setting up the payment. Please try again or use manual payment.`
        );
      }
    } catch (error) {
      console.error("Error calling checkout session:", error);
      await sendTelegramMessage(
        project.bot_token,
        chatId,
        `❌ Sorry, there was an error setting up the payment. Please try again or use manual payment.`
      );
    }
  }
}
