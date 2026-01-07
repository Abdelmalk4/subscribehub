import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-telegram-bot-api-secret-token",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ============= CONFIGURATION =============
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;
const TELEGRAM_API_TIMEOUT_MS = 10000;
const MAX_FILE_SIZE_MB = 20;

// Rate limiting configuration
const RATE_LIMIT_REQUESTS = 100; // requests per window
const RATE_LIMIT_WINDOW_SECONDS = 60; // 1 minute window

// ============= TYPE DEFINITIONS =============
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    message: { chat: { id: number }; message_id: number };
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

// ============= UTILITY FUNCTIONS =============

function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id);
}

function sanitizeForHTML(text: string | undefined | null): string {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function sanitizeUserInput(text: string | undefined | null, maxLength: number = 100): string {
  if (!text) return "";
  return text.replace(/[\x00-\x1F\x7F]/g, "").substring(0, maxLength);
}

function generateWebhookSecret(botToken: string): string {
  let hash = 0;
  for (let i = 0; i < botToken.length; i++) {
    const char = botToken.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `wh_${Math.abs(hash).toString(36)}`;
}

function verifyWebhookAuth(req: Request, botToken: string): boolean {
  const providedToken = req.headers.get("x-telegram-bot-api-secret-token");
  if (!providedToken) {
    console.warn("[AUTH] No X-Telegram-Bot-Api-Secret-Token header provided");
    return false;
  }
  const expectedToken = generateWebhookSecret(botToken);
  return providedToken === expectedToken;
}

// ============= RATE LIMITING =============

async function checkRateLimit(supabase: any, identifier: string, endpoint: string): Promise<{ allowed: boolean; retryAfter?: number }> {
  try {
    const { data, error } = await supabase.rpc("check_rate_limit", {
      p_identifier: identifier,
      p_endpoint: endpoint,
      p_limit: RATE_LIMIT_REQUESTS,
      p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
    });

    if (error) {
      console.error("[RATE_LIMIT] Error checking rate limit:", error);
      // Allow request if rate limit check fails (fail open)
      return { allowed: true };
    }

    return {
      allowed: data.allowed,
      retryAfter: data.retry_after,
    };
  } catch (err) {
    console.error("[RATE_LIMIT] Exception:", err);
    return { allowed: true };
  }
}

// ============= IDEMPOTENCY CHECK =============

async function checkIdempotency(supabase: any, updateId: number): Promise<boolean> {
  try {
    const { data: existing } = await supabase
      .from("webhook_events")
      .select("id")
      .eq("event_source", "telegram")
      .eq("event_id", updateId.toString())
      .single();

    return !!existing;
  } catch {
    return false;
  }
}

async function recordWebhookEvent(supabase: any, updateId: number, eventType: string, result: object): Promise<void> {
  try {
    await supabase.from("webhook_events").insert({
      event_source: "telegram",
      event_id: updateId.toString(),
      event_type: eventType,
      result,
    });
  } catch (err) {
    console.error("[IDEMPOTENCY] Error recording event:", err);
  }
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
): Promise<{ ok: boolean; result?: any; error?: string }> {
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
      
      if (!result.ok) {
        if (result.error_code === 403) {
          console.warn(`[TELEGRAM] User ${chatId} has blocked the bot`);
        } else if (result.error_code === 429) {
          const retryAfter = result.parameters?.retry_after || 30;
          console.warn(`[TELEGRAM] Rate limited, retry after ${retryAfter}s`);
          throw new Error(`Rate limited: retry after ${retryAfter}s`);
        }
      }
      
      return result;
    } finally {
      clearTimeout(timeoutId);
    }
  }, `sendMessage to ${chatId}`);
}

async function answerCallbackQuery(
  botToken: string,
  callbackQueryId: string,
  text?: string
): Promise<void> {
  try {
    const url = `https://api.telegram.org/bot${botToken}/answerCallbackQuery`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
    });
  } catch (err) {
    const error = err as Error;
    console.warn("[TELEGRAM] Failed to answer callback query:", error.message);
  }
}

async function getTelegramFile(botToken: string, fileId: string): Promise<{ filePath: string | null; fileSize: number }> {
  try {
    const url = `https://api.telegram.org/bot${botToken}/getFile`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: fileId }),
    });
    const result = await response.json();
    
    if (result.ok && result.result?.file_path) {
      return {
        filePath: result.result.file_path,
        fileSize: result.result.file_size || 0,
      };
    }
    console.error("[TELEGRAM] Failed to get file path:", result);
    return { filePath: null, fileSize: 0 };
  } catch (error) {
    console.error("[TELEGRAM] Error getting file path:", error);
    return { filePath: null, fileSize: 0 };
  }
}

async function downloadTelegramFile(botToken: string, filePath: string): Promise<Uint8Array | null> {
  return withRetry(async () => {
    const url = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }, `downloadFile ${filePath}`);
}

// ============= STORAGE FUNCTIONS =============

async function uploadPaymentProof(
  supabase: any,
  projectId: string,
  subscriberId: string,
  fileData: Uint8Array,
  filePath: string
): Promise<string | null> {
  try {
    const extension = filePath.split('.').pop() || 'jpg';
    const fileName = `${projectId}/${subscriberId}/${Date.now()}.${extension}`;
    
    const contentTypeMap: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
    };
    const contentType = contentTypeMap[extension.toLowerCase()] || 'image/jpeg';
    
    const { data, error } = await supabase.storage
      .from('payment-proofs')
      .upload(fileName, fileData, { contentType, upsert: false });
    
    if (error) {
      console.error("[STORAGE] Upload error:", error);
      return null;
    }
    
    console.log("[STORAGE] File uploaded:", data.path);
    
    const { data: signedData, error: signedError } = await supabase.storage
      .from('payment-proofs')
      .createSignedUrl(fileName, 60 * 60 * 24 * 365);
    
    if (signedError) {
      console.error("[STORAGE] Signed URL error:", signedError);
      return null;
    }
    
    return signedData.signedUrl;
  } catch (error) {
    console.error("[STORAGE] Error uploading payment proof:", error);
    return null;
  }
}

// ============= MAIN HANDLER =============

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID().slice(0, 8);
  console.log(`[${requestId}] Incoming webhook request`);

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const url = new URL(req.url);
    const projectId = url.searchParams.get("project_id");

    // Validate project_id
    if (!projectId) {
      console.error(`[${requestId}] Missing project_id`);
      return new Response(JSON.stringify({ error: "Missing project_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!isValidUUID(projectId)) {
      console.error(`[${requestId}] Invalid project_id format`);
      return new Response(JSON.stringify({ error: "Invalid project_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // PHASE 6: Rate limiting check
    const rateLimitResult = await checkRateLimit(supabase, `telegram:${projectId}`, "telegram-bot-handler");
    if (!rateLimitResult.allowed) {
      console.warn(`[${requestId}] Rate limit exceeded for project ${projectId}`);
      return new Response(JSON.stringify({ error: "Rate limit exceeded", retry_after: rateLimitResult.retryAfter }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(rateLimitResult.retryAfter || 60) },
      });
    }

    // Fetch project
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .single();

    if (projectError || !project) {
      console.error(`[${requestId}] Project not found:`, projectError);
      return new Response(JSON.stringify({ error: "Project not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const typedProject = project as Project;
    const botToken = typedProject.bot_token;

    // Verify webhook authenticity
    if (!verifyWebhookAuth(req, botToken)) {
      console.error(`[${requestId}] Webhook auth failed`);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const update: TelegramUpdate = await req.json();
    console.log(`[${requestId}] Update ID: ${update.update_id}`);

    // PHASE 2: Idempotency check
    const isDuplicate = await checkIdempotency(supabase, update.update_id);
    if (isDuplicate) {
      console.log(`[${requestId}] Duplicate update_id ${update.update_id} - already processed`);
      return new Response(JSON.stringify({ ok: true, duplicate: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine event type for logging
    let eventType = "unknown";
    if (update.callback_query) {
      eventType = `callback:${update.callback_query.data?.split(":")[0] || "unknown"}`;
    } else if (update.message?.photo) {
      eventType = "photo";
    } else if (update.message?.text) {
      eventType = `command:${update.message.text.split(" ")[0]}`;
    }

    // Route to appropriate handler
    if (update.callback_query) {
      await handleCallbackQuery(supabase, typedProject, update.callback_query, requestId);
    } else if (update.message?.photo && update.message.photo.length > 0) {
      await handlePhotoMessage(supabase, typedProject, update.message, requestId);
    } else if (update.message?.text) {
      await handleTextMessage(supabase, typedProject, update.message, requestId);
    }

    // Record successful processing
    await recordWebhookEvent(supabase, update.update_id, eventType, { status: "processed", project_id: projectId });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error(`[${requestId}] Error processing webhook:`, error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ============= MESSAGE HANDLERS =============

async function handleCallbackQuery(
  supabase: any,
  project: Project,
  callbackQuery: NonNullable<TelegramUpdate["callback_query"]>,
  requestId: string
) {
  const callbackData = callbackQuery.data;
  const userId = callbackQuery.from.id;
  const chatId = callbackQuery.message.chat.id;
  const firstName = sanitizeUserInput(callbackQuery.from.first_name, 100);
  const username = sanitizeUserInput(callbackQuery.from.username, 50);

  console.log(`[${requestId}] Callback: ${callbackData} from ${userId}`);
  
  // Answer callback immediately to remove loading state
  await answerCallbackQuery(project.bot_token, callbackQuery.id);

  if (callbackData.startsWith("select_plan:")) {
    const planId = callbackData.split(":")[1];
    if (!isValidUUID(planId)) {
      console.error(`[${requestId}] Invalid plan ID: ${planId}`);
      await sendTelegramMessage(project.bot_token, chatId, "❌ Invalid plan. Please use /start again.");
      return;
    }
    await handlePlanSelection(supabase, project, planId, userId, chatId, firstName, username, requestId);
  } else if (callbackData.startsWith("pay_method:")) {
    const parts = callbackData.split(":");
    if (parts.length !== 3) {
      await sendTelegramMessage(project.bot_token, chatId, "❌ Invalid selection. Please use /start again.");
      return;
    }
    const [, planId, method] = parts;
    if (!isValidUUID(planId) || !["manual", "stripe"].includes(method)) {
      await sendTelegramMessage(project.bot_token, chatId, "❌ Invalid selection. Please use /start again.");
      return;
    }
    await handlePaymentMethod(supabase, project, planId, method, userId, chatId, requestId);
  } else if (callbackData === "confirm_payment") {
    await sendTelegramMessage(project.bot_token, chatId, "✅ Payment confirmation received! Please wait for verification.");
  }
}

async function handleTextMessage(
  supabase: any,
  project: Project,
  message: NonNullable<TelegramUpdate["message"]>,
  requestId: string
) {
  const text = message.text!;
  const userId = message.from.id;
  const chatId = message.chat.id;
  const firstName = sanitizeUserInput(message.from.first_name, 100);
  const username = sanitizeUserInput(message.from.username, 50);
  const command = text.split(" ")[0].toLowerCase();

  console.log(`[${requestId}] Command: ${command} from ${userId}`);

  switch (command) {
    case "/start":
      await handleStart(supabase, project, userId, chatId, firstName, username, requestId);
      break;
    case "/status":
      await handleStatus(supabase, project, userId, chatId, requestId);
      break;
    case "/renew":
      await handleRenew(supabase, project, userId, chatId, requestId);
      break;
    case "/help":
      await handleHelp(project, chatId);
      break;
    default:
      if (text.startsWith("/")) {
        await sendTelegramMessage(project.bot_token, chatId, "❓ Unknown command. Use /help to see available commands.");
      }
  }
}

async function handlePhotoMessage(
  supabase: any,
  project: Project,
  message: NonNullable<TelegramUpdate["message"]>,
  requestId: string
) {
  const userId = message.from.id;
  const chatId = message.chat.id;
  const photos = message.photo!;
  const largestPhoto = photos[photos.length - 1];
  const fileId = largestPhoto.file_id;
  const fileSize = largestPhoto.file_size || 0;

  console.log(`[${requestId}] Photo from ${userId}, size: ${fileSize}`);

  // Check file size
  if (fileSize > MAX_FILE_SIZE_MB * 1024 * 1024) {
    await sendTelegramMessage(project.bot_token, chatId, `❌ File too large. Maximum size is ${MAX_FILE_SIZE_MB}MB.`);
    return;
  }

  const { data: subscriber, error } = await supabase
    .from("subscribers")
    .select("*")
    .eq("project_id", project.id)
    .eq("telegram_user_id", userId)
    .eq("status", "awaiting_proof")
    .single();

  if (error || !subscriber) {
    await sendTelegramMessage(
      project.bot_token,
      chatId,
      "❓ We received your photo, but you don't have a pending payment.\n\nUse /start to subscribe or /status to check your subscription."
    );
    return;
  }

  const sub = subscriber as Subscriber;
  await sendTelegramMessage(project.bot_token, chatId, "📸 Processing your payment proof...");

  // Get and download file
  const { filePath } = await getTelegramFile(project.bot_token, fileId);
  let paymentProofUrl: string | null = null;

  if (filePath) {
    const fileData = await downloadTelegramFile(project.bot_token, filePath);
    if (fileData) {
      paymentProofUrl = await uploadPaymentProof(supabase, project.id, sub.id, fileData, filePath);
    }
  }

  // Update subscriber status
  const { error: updateError } = await supabase
    .from("subscribers")
    .update({
      status: "pending_approval",
      payment_proof_url: paymentProofUrl,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sub.id);

  if (updateError) {
    console.error(`[${requestId}] Error updating subscriber:`, updateError);
    await sendTelegramMessage(project.bot_token, chatId, "❌ Error processing your payment. Please try again later.");
    return;
  }

  await sendTelegramMessage(
    project.bot_token,
    chatId,
    "✅ <b>Payment proof received!</b>\n\nYour payment is now pending approval. You'll receive a notification once it's verified.\n\nThank you for your patience! 🙏"
  );
}

// ============= COMMAND HANDLERS =============

async function handleStart(
  supabase: any,
  project: Project,
  userId: number,
  chatId: number,
  firstName: string,
  username: string,
  requestId: string
) {
  console.log(`[${requestId}] /start from ${userId} (${firstName})`);

  // Check for existing subscriber
  const { data: existingSub } = await supabase
    .from("subscribers")
    .select("*, plans(*)")
    .eq("project_id", project.id)
    .eq("telegram_user_id", userId)
    .single();

  if (existingSub) {
    const sub = existingSub as Subscriber & { plans: Plan };
    if (sub.status === "active") {
      const expiryDate = sub.expiry_date ? new Date(sub.expiry_date).toLocaleDateString() : "N/A";
      await sendTelegramMessage(
        project.bot_token,
        chatId,
        `✅ <b>You already have an active subscription!</b>\n\n📦 Plan: ${sanitizeForHTML(sub.plans?.plan_name || "Subscription")}\n📅 Valid until: ${expiryDate}\n\nUse /renew to extend your subscription.`
      );
      return;
    } else if (sub.status === "pending_approval") {
      await sendTelegramMessage(
        project.bot_token,
        chatId,
        "⏳ <b>Your payment is pending approval.</b>\n\nPlease wait while we verify your payment. You'll receive a notification once it's approved."
      );
      return;
    } else if (sub.status === "awaiting_proof") {
      await sendTelegramMessage(
        project.bot_token,
        chatId,
        "📸 <b>We're waiting for your payment proof.</b>\n\nPlease send a photo of your payment receipt to complete the subscription process."
      );
      return;
    }
  }

  // Fetch available plans
  const { data: plans, error: plansError } = await supabase
    .from("plans")
    .select("*")
    .eq("project_id", project.id)
    .eq("is_active", true)
    .order("price", { ascending: true });

  if (plansError || !plans || plans.length === 0) {
    await sendTelegramMessage(
      project.bot_token,
      chatId,
      "❌ No subscription plans are currently available. Please contact support."
    );
    return;
  }

  // Build plan selection message
  let message = `👋 <b>Welcome to ${sanitizeForHTML(project.project_name)}!</b>\n\n`;
  message += "📋 <b>Available Plans:</b>\n\n";

  const buttons: Array<Array<{ text: string; callback_data: string }>> = [];

  for (const plan of plans) {
    const typedPlan = plan as Plan;
    message += `<b>${sanitizeForHTML(typedPlan.plan_name)}</b>\n`;
    message += `💰 $${typedPlan.price} for ${typedPlan.duration_days} days\n`;
    if (typedPlan.description) {
      message += `📝 ${sanitizeForHTML(typedPlan.description)}\n`;
    }
    message += "\n";

    buttons.push([{ text: `${typedPlan.plan_name} - $${typedPlan.price}`, callback_data: `select_plan:${typedPlan.id}` }]);
  }

  message += "👇 <b>Select a plan to continue:</b>";

  await sendTelegramMessage(project.bot_token, chatId, message, { inline_keyboard: buttons });
}

async function handlePlanSelection(
  supabase: any,
  project: Project,
  planId: string,
  userId: number,
  chatId: number,
  firstName: string,
  username: string,
  requestId: string
) {
  console.log(`[${requestId}] Plan selected: ${planId} by ${userId}`);

  // Fetch plan
  const { data: plan, error: planError } = await supabase
    .from("plans")
    .select("*")
    .eq("id", planId)
    .eq("project_id", project.id)
    .eq("is_active", true)
    .single();

  if (planError || !plan) {
    await sendTelegramMessage(project.bot_token, chatId, "❌ This plan is no longer available. Please use /start to see current options.");
    return;
  }

  const typedPlan = plan as Plan;

  // Check payment methods available
  const manualEnabled = project.manual_payment_config?.enabled ?? false;
  const stripeEnabled = project.stripe_config?.enabled ?? false;

  if (!manualEnabled && !stripeEnabled) {
    await sendTelegramMessage(project.bot_token, chatId, "❌ No payment methods are currently available. Please contact support.");
    return;
  }

  // Create or update subscriber
  const { data: existingSub } = await supabase
    .from("subscribers")
    .select("id")
    .eq("project_id", project.id)
    .eq("telegram_user_id", userId)
    .single();

  let subscriberId: string;

  if (existingSub) {
    subscriberId = existingSub.id;
    await supabase
      .from("subscribers")
      .update({
        plan_id: planId,
        status: "pending_payment",
        first_name: firstName,
        username: username,
        updated_at: new Date().toISOString(),
      })
      .eq("id", subscriberId);
  } else {
    const { data: newSub, error: insertError } = await supabase
      .from("subscribers")
      .insert({
        project_id: project.id,
        telegram_user_id: userId,
        plan_id: planId,
        status: "pending_payment",
        first_name: firstName,
        username: username,
      })
      .select()
      .single();

    if (insertError || !newSub) {
      console.error(`[${requestId}] Error creating subscriber:`, insertError);
      await sendTelegramMessage(project.bot_token, chatId, "❌ Error processing your request. Please try again later.");
      return;
    }
    subscriberId = newSub.id;
  }

  // Show payment method selection
  let message = `✅ <b>Plan Selected: ${sanitizeForHTML(typedPlan.plan_name)}</b>\n\n`;
  message += `💰 Amount: $${typedPlan.price}\n`;
  message += `📅 Duration: ${typedPlan.duration_days} days\n\n`;
  message += "💳 <b>Choose your payment method:</b>";

  const buttons: Array<Array<{ text: string; callback_data: string }>> = [];

  if (stripeEnabled) {
    buttons.push([{ text: "💳 Pay with Card (Stripe)", callback_data: `pay_method:${planId}:stripe` }]);
  }
  if (manualEnabled) {
    buttons.push([{ text: "🏦 Manual Payment", callback_data: `pay_method:${planId}:manual` }]);
  }

  await sendTelegramMessage(project.bot_token, chatId, message, { inline_keyboard: buttons });
}

async function handlePaymentMethod(
  supabase: any,
  project: Project,
  planId: string,
  method: string,
  userId: number,
  chatId: number,
  requestId: string
) {
  console.log(`[${requestId}] Payment method: ${method} for plan ${planId} by ${userId}`);

  // Get subscriber
  const { data: subscriber, error: subError } = await supabase
    .from("subscribers")
    .select("id")
    .eq("project_id", project.id)
    .eq("telegram_user_id", userId)
    .single();

  if (subError || !subscriber) {
    await sendTelegramMessage(project.bot_token, chatId, "❌ Session expired. Please use /start again.");
    return;
  }

  const { data: plan } = await supabase
    .from("plans")
    .select("*")
    .eq("id", planId)
    .single();

  if (!plan) {
    await sendTelegramMessage(project.bot_token, chatId, "❌ Plan not found. Please use /start again.");
    return;
  }

  const typedPlan = plan as Plan;

  if (method === "stripe") {
    // Create Stripe checkout session
    const checkoutUrl = `${supabaseUrl}/functions/v1/create-checkout-session`;
    
    try {
      const response = await fetch(checkoutUrl, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          project_id: project.id,
          plan_id: planId,
          subscriber_id: subscriber.id,
          telegram_user_id: userId,
        }),
      });

      const result = await response.json();

      if (result.checkout_url) {
        await sendTelegramMessage(
          project.bot_token,
          chatId,
          `💳 <b>Stripe Payment</b>\n\n📦 Plan: ${sanitizeForHTML(typedPlan.plan_name)}\n💰 Amount: $${typedPlan.price}\n\n👇 <b>Click below to complete your payment:</b>`,
          {
            inline_keyboard: [[{ text: "💳 Pay Now", url: result.checkout_url }]],
          }
        );
      } else {
        throw new Error(result.error || "Failed to create checkout");
      }
    } catch (error) {
      console.error(`[${requestId}] Error creating checkout:`, error);
      await sendTelegramMessage(project.bot_token, chatId, "❌ Error creating payment link. Please try again later.");
    }
  } else if (method === "manual") {
    // Manual payment flow
    const instructions = project.manual_payment_config?.instructions || "Please contact support for payment details.";

    await supabase
      .from("subscribers")
      .update({
        status: "awaiting_proof",
        payment_method: "manual",
        updated_at: new Date().toISOString(),
      })
      .eq("id", subscriber.id);

    let message = `🏦 <b>Manual Payment</b>\n\n`;
    message += `📦 Plan: ${sanitizeForHTML(typedPlan.plan_name)}\n`;
    message += `💰 Amount: $${typedPlan.price}\n\n`;
    message += `📋 <b>Payment Instructions:</b>\n${sanitizeForHTML(instructions)}\n\n`;
    message += `📸 After making payment, please <b>send a photo of your payment receipt</b> to complete the process.`;

    await sendTelegramMessage(project.bot_token, chatId, message);
  }
}

async function handleStatus(
  supabase: any,
  project: Project,
  userId: number,
  chatId: number,
  requestId: string
) {
  console.log(`[${requestId}] /status from ${userId}`);

  const { data: subscriber } = await supabase
    .from("subscribers")
    .select("*, plans(*)")
    .eq("project_id", project.id)
    .eq("telegram_user_id", userId)
    .single();

  if (!subscriber) {
    await sendTelegramMessage(
      project.bot_token,
      chatId,
      "❓ You don't have a subscription yet.\n\nUse /start to subscribe!"
    );
    return;
  }

  const sub = subscriber as Subscriber & { plans: Plan };
  const statusEmoji: Record<string, string> = {
    active: "✅",
    pending_payment: "⏳",
    pending_approval: "⏳",
    awaiting_proof: "📸",
    expired: "❌",
    rejected: "🚫",
    suspended: "⛔",
  };

  let message = `📊 <b>Your Subscription Status</b>\n\n`;
  message += `${statusEmoji[sub.status] || "❓"} Status: <b>${sub.status.replace("_", " ").toUpperCase()}</b>\n`;
  
  if (sub.plans) {
    message += `📦 Plan: ${sanitizeForHTML(sub.plans.plan_name)}\n`;
  }
  
  if (sub.status === "active" && sub.expiry_date) {
    const expiryDate = new Date(sub.expiry_date);
    const now = new Date();
    const daysLeft = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    message += `📅 Expires: ${expiryDate.toLocaleDateString()}\n`;
    message += `⏰ Days remaining: ${daysLeft}\n`;
    
    if (daysLeft <= 7) {
      message += "\n⚠️ <b>Your subscription is expiring soon!</b>\nUse /renew to extend it.";
    }
  } else if (sub.status === "expired") {
    message += "\n💡 Use /renew to reactivate your subscription.";
  }

  await sendTelegramMessage(project.bot_token, chatId, message);
}

async function handleRenew(
  supabase: any,
  project: Project,
  userId: number,
  chatId: number,
  requestId: string
) {
  console.log(`[${requestId}] /renew from ${userId}`);

  const { data: subscriber } = await supabase
    .from("subscribers")
    .select("*, plans(*)")
    .eq("project_id", project.id)
    .eq("telegram_user_id", userId)
    .single();

  if (!subscriber) {
    await sendTelegramMessage(
      project.bot_token,
      chatId,
      "❓ You don't have a subscription yet.\n\nUse /start to subscribe!"
    );
    return;
  }

  const sub = subscriber as Subscriber & { plans: Plan };

  // Fetch available plans
  const { data: plans } = await supabase
    .from("plans")
    .select("*")
    .eq("project_id", project.id)
    .eq("is_active", true)
    .order("price", { ascending: true });

  if (!plans || plans.length === 0) {
    await sendTelegramMessage(project.bot_token, chatId, "❌ No plans available. Please contact support.");
    return;
  }

  let message = `🔄 <b>Renew Your Subscription</b>\n\n`;
  
  if (sub.status === "active" && sub.expiry_date) {
    message += `📅 Current expiry: ${new Date(sub.expiry_date).toLocaleDateString()}\n\n`;
    message += "Renewing will extend your subscription from the current expiry date.\n\n";
  }
  
  message += "📋 <b>Select a plan:</b>";

  const buttons: Array<Array<{ text: string; callback_data: string }>> = [];
  for (const plan of plans) {
    const typedPlan = plan as Plan;
    buttons.push([{ text: `${typedPlan.plan_name} - $${typedPlan.price}`, callback_data: `select_plan:${typedPlan.id}` }]);
  }

  await sendTelegramMessage(project.bot_token, chatId, message, { inline_keyboard: buttons });
}

async function handleHelp(project: Project, chatId: number) {
  let message = `ℹ️ <b>Available Commands</b>\n\n`;
  message += `/start - Start subscription process\n`;
  message += `/status - Check your subscription status\n`;
  message += `/renew - Renew or extend subscription\n`;
  message += `/help - Show this help message\n`;
  
  if (project.support_contact) {
    message += `\n📞 Support: ${sanitizeForHTML(project.support_contact)}`;
  }

  await sendTelegramMessage(project.bot_token, chatId, message);
}