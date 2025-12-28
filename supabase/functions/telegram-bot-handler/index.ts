import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-telegram-bot-api-secret-token",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Validate UUID format
function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id);
}

// Sanitize string for HTML display to prevent injection
function sanitizeForHTML(text: string | undefined | null): string {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Sanitize and limit username/name length
function sanitizeUserInput(text: string | undefined | null, maxLength: number = 100): string {
  if (!text) return "";
  // Remove control characters and limit length
  return text.replace(/[\x00-\x1F\x7F]/g, "").substring(0, maxLength);
}

// Verify webhook request authenticity using secret token
function verifyWebhookAuth(req: Request, botToken: string): boolean {
  // Get the secret token from header (set when configuring webhook)
  const providedToken = req.headers.get("x-telegram-bot-api-secret-token");
  
  // If no token provided in header, check if we're using IP-based verification
  // For now, we use the bot token hash as the expected secret
  // The webhook should be set up with this secret_token parameter
  if (!providedToken) {
    console.warn("No X-Telegram-Bot-Api-Secret-Token header provided");
    return false;
  }
  
  // The secret token should match what was set in setWebhook
  // We use a hash of the bot token as the secret for verification
  const expectedToken = generateWebhookSecret(botToken);
  return providedToken === expectedToken;
}

// Generate a webhook secret from bot token (deterministic)
function generateWebhookSecret(botToken: string): string {
  // Simple hash-like secret generation from bot token
  // This creates a consistent secret that can be used when setting up the webhook
  let hash = 0;
  for (let i = 0; i < botToken.length; i++) {
    const char = botToken.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `wh_${Math.abs(hash).toString(36)}`;
}

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
    photo?: Array<{
      file_id: string;
      file_unique_id: string;
      file_size?: number;
      width: number;
      height: number;
    }>;
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

// Get file path from Telegram
async function getTelegramFile(botToken: string, fileId: string): Promise<string | null> {
  try {
    const url = `https://api.telegram.org/bot${botToken}/getFile`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: fileId }),
    });
    const result = await response.json();
    
    if (result.ok && result.result?.file_path) {
      return result.result.file_path;
    }
    console.error("Failed to get file path:", result);
    return null;
  } catch (error) {
    console.error("Error getting file path:", error);
    return null;
  }
}

// Download file from Telegram servers
async function downloadTelegramFile(botToken: string, filePath: string): Promise<Uint8Array | null> {
  try {
    const url = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error("Failed to download file:", response.status, response.statusText);
      return null;
    }
    
    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  } catch (error) {
    console.error("Error downloading file:", error);
    return null;
  }
}

// Upload payment proof to Supabase Storage and return signed URL
async function uploadPaymentProof(
  supabase: any,
  projectId: string,
  subscriberId: string,
  fileData: Uint8Array,
  filePath: string
): Promise<string | null> {
  try {
    // Extract file extension from the path
    const extension = filePath.split('.').pop() || 'jpg';
    const fileName = `${projectId}/${subscriberId}/${Date.now()}.${extension}`;
    
    // Determine content type
    const contentTypeMap: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
    };
    const contentType = contentTypeMap[extension.toLowerCase()] || 'image/jpeg';
    
    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('payment-proofs')
      .upload(fileName, fileData, {
        contentType,
        upsert: false,
      });
    
    if (error) {
      console.error("Storage upload error:", error);
      return null;
    }
    
    console.log("File uploaded successfully:", data.path);
    
    // Create signed URL (valid for 1 year)
    const { data: signedData, error: signedError } = await supabase.storage
      .from('payment-proofs')
      .createSignedUrl(fileName, 60 * 60 * 24 * 365); // 1 year
    
    if (signedError) {
      console.error("Error creating signed URL:", signedError);
      return null;
    }
    
    return signedData.signedUrl;
  } catch (error) {
    console.error("Error uploading payment proof:", error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const url = new URL(req.url);
    const projectId = url.searchParams.get("project_id");

    // Validate project_id format
    if (!projectId) {
      console.error("Missing project_id parameter");
      return new Response(JSON.stringify({ error: "Missing project_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!isValidUUID(projectId)) {
      console.error("Invalid project_id format");
      return new Response(JSON.stringify({ error: "Invalid project_id format" }), {
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

    // Verify webhook authenticity
    if (!verifyWebhookAuth(req, botToken)) {
      console.error("Webhook authentication failed - invalid or missing secret token");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const update: TelegramUpdate = await req.json();
    console.log("Received update:", JSON.stringify(update));

    // Handle callback queries (button clicks)
    if (update.callback_query) {
      const { callback_query } = update;
      const callbackData = callback_query.data;
      const userId = callback_query.from.id;
      const chatId = callback_query.message.chat.id;
      const firstName = sanitizeUserInput(callback_query.from.first_name, 100);
      const username = sanitizeUserInput(callback_query.from.username, 50);

      await answerCallbackQuery(botToken, callback_query.id);

      if (callbackData.startsWith("select_plan:")) {
        const planId = callbackData.split(":")[1];
        
        // Validate planId is a valid UUID
        if (!isValidUUID(planId)) {
          console.error("Invalid plan ID format in callback:", planId);
          await sendTelegramMessage(botToken, chatId, "❌ Invalid plan selection. Please try /start again.");
          return new Response(JSON.stringify({ ok: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        
        await handlePlanSelection(supabase, typedProject, planId, userId, chatId, firstName, username);
      } else if (callbackData.startsWith("pay_method:")) {
        const parts = callbackData.split(":");
        if (parts.length !== 3) {
          console.error("Invalid pay_method callback format");
          await sendTelegramMessage(botToken, chatId, "❌ Invalid selection. Please try /start again.");
          return new Response(JSON.stringify({ ok: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        
        const [, planId, method] = parts;
        
        // Validate planId is a valid UUID
        if (!isValidUUID(planId)) {
          console.error("Invalid plan ID format in payment method:", planId);
          await sendTelegramMessage(botToken, chatId, "❌ Invalid plan selection. Please try /start again.");
          return new Response(JSON.stringify({ ok: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        
        // Validate payment method
        if (!["manual", "stripe"].includes(method)) {
          console.error("Invalid payment method:", method);
          await sendTelegramMessage(botToken, chatId, "❌ Invalid payment method. Please try again.");
          return new Response(JSON.stringify({ ok: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        
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
      const firstName = sanitizeUserInput(message.from.first_name, 100);
      const username = sanitizeUserInput(message.from.username, 50);
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
    if (update.message?.photo && update.message.photo.length > 0) {
      const { message } = update;
      const userId = message.from.id;
      const chatId = message.chat.id;
      const photos = message.photo!;
      
      // Get the largest photo (last in array)
      const largestPhoto = photos[photos.length - 1];
      const fileId = largestPhoto.file_id;

      const { data: subscriber } = await supabase
        .from("subscribers")
        .select("*")
        .eq("project_id", projectId)
        .eq("telegram_user_id", userId)
        .eq("status", "awaiting_proof")
        .single();

      if (subscriber) {
        const sub = subscriber as Subscriber;
        
        // Send processing message
        await sendTelegramMessage(
          botToken,
          chatId,
          "📸 Processing your payment proof..."
        );
        
        // Get file path from Telegram
        const filePath = await getTelegramFile(botToken, fileId);
        
        if (filePath) {
          // Download the file
          const fileData = await downloadTelegramFile(botToken, filePath);
          
          if (fileData) {
            // Upload to Supabase Storage
            const paymentProofUrl = await uploadPaymentProof(
              supabase,
              projectId,
              sub.id,
              fileData,
              filePath
            );
            
            if (paymentProofUrl) {
              // Update subscriber with the actual URL
              await supabase
                .from("subscribers")
                .update({ 
                  status: "pending_approval", 
                  payment_proof_url: paymentProofUrl, 
                  updated_at: new Date().toISOString() 
                })
                .eq("id", sub.id);
              
              await sendTelegramMessage(
                botToken,
                chatId,
                "✅ Payment proof uploaded successfully!\n\nOur team will review your payment and activate your subscription shortly."
              );
              
              console.log(`Payment proof stored for subscriber ${sub.id}: ${paymentProofUrl}`);
            } else {
              // Fallback: store placeholder and notify
              await supabase
                .from("subscribers")
                .update({ 
                  status: "pending_approval", 
                  payment_proof_url: `telegram_file:${fileId}`, 
                  updated_at: new Date().toISOString() 
                })
                .eq("id", sub.id);
              
              await sendTelegramMessage(
                botToken,
                chatId,
                "📸 Payment proof received!\n\nOur team will review your payment and activate your subscription shortly."
              );
              
              console.warn(`Failed to upload to storage, saved file_id reference for subscriber ${sub.id}`);
            }
          } else {
            // Download failed
            await supabase
              .from("subscribers")
              .update({ 
                status: "pending_approval", 
                payment_proof_url: `telegram_file:${fileId}`, 
                updated_at: new Date().toISOString() 
              })
              .eq("id", sub.id);
            
            await sendTelegramMessage(
              botToken,
              chatId,
              "📸 Payment proof received!\n\nOur team will review your payment and activate your subscription shortly."
            );
            
            console.warn(`Failed to download file, saved file_id reference for subscriber ${sub.id}`);
          }
        } else {
          // File path retrieval failed
          await supabase
            .from("subscribers")
            .update({ 
              status: "pending_approval", 
              payment_proof_url: `telegram_file:${fileId}`, 
              updated_at: new Date().toISOString() 
            })
            .eq("id", sub.id);
          
          await sendTelegramMessage(
            botToken,
            chatId,
            "📸 Payment proof received!\n\nOur team will review your payment and activate your subscription shortly."
          );
          
          console.warn(`Failed to get file path, saved file_id reference for subscriber ${sub.id}`);
        }
      } else {
        // No awaiting proof subscriber found
        await sendTelegramMessage(
          botToken,
          chatId,
          "❓ We received your photo, but you don't have a pending payment.\n\nUse /start to subscribe or /status to check your subscription."
        );
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error processing webhook:", error);
    // Return generic error to avoid information leakage
    return new Response(JSON.stringify({ error: "Internal server error" }), {
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
  const safeFirstName = sanitizeForHTML(firstName);

  if (sub && sub.status === "active") {
    const expiryDate = sub.expiry_date ? new Date(sub.expiry_date).toLocaleDateString() : "N/A";
    await sendTelegramMessage(
      project.bot_token,
      chatId,
      `👋 Welcome back, <b>${safeFirstName}</b>!\n\n✅ You have an active subscription!\n📅 Expires: ${expiryDate}\n\nUse /status to check details.\nUse /renew to extend.`
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
  const safeProjectName = sanitizeForHTML(project.project_name);

  if (typedPlans.length === 0) {
    await sendTelegramMessage(
      project.bot_token,
      chatId,
      `👋 Welcome to <b>${safeProjectName}</b>!\n\nSorry, no subscription plans available. Please check back later.`
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
    `👋 Welcome to <b>${safeProjectName}</b>, ${safeFirstName}!\n\n🎯 Choose a subscription plan:\n\n` +
      typedPlans.map((p) => `• <b>${sanitizeForHTML(p.plan_name)}</b>\n  💰 $${p.price} for ${p.duration_days} days\n  ${sanitizeForHTML(p.description)}`).join("\n\n"),
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
  const statusEmoji: Record<string, string> = { 
    active: "✅", 
    pending_payment: "⏳", 
    pending_approval: "🔄", 
    awaiting_proof: "📤", 
    expired: "❌", 
    rejected: "🚫",
    suspended: "⚠️"
  };
  const statusText: Record<string, string> = { 
    active: "Active", 
    pending_payment: "Pending Payment", 
    pending_approval: "Pending Approval", 
    awaiting_proof: "Awaiting Payment Proof", 
    expired: "Expired", 
    rejected: "Rejected",
    suspended: "Suspended"
  };

  const emoji = statusEmoji[sub.status] || "❓";
  const status = statusText[sub.status] || sub.status;

  let message = `📊 <b>Subscription Status</b>\n\n${emoji} Status: <b>${status}</b>\n`;
  if (sub.plans) message += `📦 Plan: ${sanitizeForHTML(sub.plans.plan_name)}\n`;
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
  
  // Handle suspended status message
  if (sub.status === "suspended") {
    message += `\n\n⚠️ Your subscription has been suspended. Please contact support for assistance.`;
    if (project.support_contact) {
      message += `\n📞 Support: ${sanitizeForHTML(project.support_contact)}`;
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

  // Extend/renew is only available for active subscribers
  if (!sub || sub.status !== "active") {
    await sendTelegramMessage(
      project.bot_token,
      chatId,
      "❌ You don't have an active subscription to extend.\n\nUse /start to subscribe to a plan!"
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
    await sendTelegramMessage(project.bot_token, chatId, "Sorry, no plans available at the moment.");
    return;
  }

  const keyboard = typedPlans.map((plan) => [{
    text: `${plan.plan_name} - $${plan.price} (${plan.duration_days} days)`,
    callback_data: `select_plan:${plan.id}`,
  }]);

  let message = `🔄 <b>Extend Your Subscription</b>\n\n`;
  if (sub.expiry_date) {
    message += `Current subscription expires on ${new Date(sub.expiry_date).toLocaleDateString()}.\n\n`;
  }
  message += `Choose a plan to extend your subscription:`;

  await sendTelegramMessage(project.bot_token, chatId, message, { inline_keyboard: keyboard });
}

async function handleHelp(project: Project, chatId: number) {
  const supportInfo = project.support_contact ? `\n\n📞 Support: ${sanitizeForHTML(project.support_contact)}` : "";
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
    `✅ Great choice!\n\n📦 <b>${sanitizeForHTML(typedPlan.plan_name)}</b>\n💰 Price: $${typedPlan.price}\n⏱ Duration: ${typedPlan.duration_days} days\n\nSelect your payment method:`,
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

    // Fetch platform payment methods
    const { data: paymentMethods } = await supabase
      .from("platform_payment_methods")
      .select("*")
      .eq("is_active", true)
      .order("display_order", { ascending: true });

    let paymentInstructions = "";
    
    if (paymentMethods && paymentMethods.length > 0) {
      paymentInstructions = "📝 <b>Payment Options:</b>\n\n";
      
      for (const pm of paymentMethods) {
        paymentInstructions += `<b>${pm.method_name}</b> (${pm.method_type})\n`;
        
        // Format details based on method type
        const details = pm.details as Record<string, string>;
        if (pm.method_type === "bank_transfer" && details) {
          if (details.bank_name) paymentInstructions += `🏦 Bank: ${details.bank_name}\n`;
          if (details.account_name) paymentInstructions += `👤 Name: ${details.account_name}\n`;
          if (details.account_number) paymentInstructions += `💳 Account: ${details.account_number}\n`;
          if (details.routing_number) paymentInstructions += `🔢 Routing: ${details.routing_number}\n`;
        } else if (pm.method_type === "crypto" && details) {
          if (details.network) paymentInstructions += `🔗 Network: ${details.network}\n`;
          if (details.address) paymentInstructions += `📍 Address: <code>${details.address}</code>\n`;
        } else if (pm.method_type === "mobile_money" && details) {
          if (details.provider) paymentInstructions += `📱 Provider: ${details.provider}\n`;
          if (details.phone_number) paymentInstructions += `📞 Number: ${details.phone_number}\n`;
          if (details.name) paymentInstructions += `👤 Name: ${details.name}\n`;
        } else if (details) {
          // Generic details display
          for (const [key, value] of Object.entries(details)) {
            if (value) {
              const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
              paymentInstructions += `${formattedKey}: ${value}\n`;
            }
          }
        }
        
        if (pm.instructions) {
          paymentInstructions += `📌 ${pm.instructions}\n`;
        }
        
        paymentInstructions += "\n";
      }
    } else {
      // Fallback to project-level instructions
      const instructions = sanitizeForHTML(project.manual_payment_config?.instructions) || "Please send your payment to complete the subscription.";
      paymentInstructions = `📝 <b>Instructions:</b>\n${instructions}`;
    }

    await sendTelegramMessage(
      project.bot_token,
      chatId,
      `💳 <b>Manual Payment</b>\n\nAmount: <b>$${typedPlan.price}</b>\n\n${paymentInstructions}\n✅ After payment, send a screenshot of your payment confirmation here.`
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

// Export helper for webhook setup - this secret should be used when calling setWebhook
export { generateWebhookSecret };
