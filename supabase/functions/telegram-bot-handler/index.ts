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
        // Handle specific Telegram errors
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

    // Route to appropriate handler
    if (update.callback_query) {
      await handleCallbackQuery(supabase, typedProject, update.callback_query, requestId);
    } else if (update.message?.photo && update.message.photo.length > 0) {
      await handlePhotoMessage(supabase, typedProject, update.message, requestId);
    } else if (update.message?.text) {
      await handleTextMessage(supabase, typedProject, update.message, requestId);
    }

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
  const updateData: any = {
    status: "pending_approval",
    payment_proof_url: paymentProofUrl || `telegram_file:${fileId}`,
    updated_at: new Date().toISOString(),
  };

  await supabase.from("subscribers").update(updateData).eq("id", sub.id);

  if (paymentProofUrl) {
    await sendTelegramMessage(
      project.bot_token,
      chatId,
      "✅ Payment proof uploaded successfully!\n\nOur team will review your payment and activate your subscription shortly."
    );
    console.log(`[${requestId}] Payment proof stored: ${paymentProofUrl}`);
  } else {
    await sendTelegramMessage(
      project.bot_token,
      chatId,
      "📸 Payment proof received!\n\nOur team will review your payment and activate your subscription shortly."
    );
    console.warn(`[${requestId}] Saved file_id reference for subscriber ${sub.id}`);
  }
}

// ============= COMMAND HANDLERS =============

async function handleStart(
  supabase: any,
  project: Project,
  userId: number,
  chatId: number,
  firstName: string,
  username: string | undefined,
  requestId: string
) {
  const { data: existingSubscriber } = await supabase
    .from("subscribers")
    .select("*, plans(*)")
    .eq("project_id", project.id)
    .eq("telegram_user_id", userId)
    .single();

  const sub = existingSubscriber as Subscriber | null;
  const safeFirstName = sanitizeForHTML(firstName);
  const safeProjectName = sanitizeForHTML(project.project_name);

  // Active subscriber - show status
  if (sub && sub.status === "active") {
    const expiryDate = sub.expiry_date ? new Date(sub.expiry_date).toLocaleDateString() : "N/A";
    await sendTelegramMessage(
      project.bot_token,
      chatId,
      `👋 Welcome back, <b>${safeFirstName}</b>!\n\n✅ You have an active subscription!\n📅 Expires: ${expiryDate}\n\nUse /status for details.\nUse /renew to extend.`
    );
    return;
  }

  // Pending approval - notify them
  if (sub && sub.status === "pending_approval") {
    await sendTelegramMessage(
      project.bot_token,
      chatId,
      `👋 Welcome back, <b>${safeFirstName}</b>!\n\n🔄 Your payment is pending approval. We'll notify you once reviewed!`
    );
    return;
  }

  // Awaiting proof - remind them
  if (sub && sub.status === "awaiting_proof") {
    await sendTelegramMessage(
      project.bot_token,
      chatId,
      `👋 Welcome back, <b>${safeFirstName}</b>!\n\n📤 You have a pending payment. Please send your payment proof (screenshot) here.`
    );
    return;
  }

  // Fetch plans
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
      `👋 Welcome to <b>${safeProjectName}</b>!\n\nSorry, no subscription plans available. Please check back later.`
    );
    return;
  }

  const keyboard = typedPlans.map((plan) => [{
    text: `${plan.plan_name} - $${plan.price} (${plan.duration_days} days)`,
    callback_data: `select_plan:${plan.id}`,
  }]);

  const plansList = typedPlans.map((p) => 
    `• <b>${sanitizeForHTML(p.plan_name)}</b>\n  💰 $${p.price} for ${p.duration_days} days${p.description ? `\n  ${sanitizeForHTML(p.description)}` : ""}`
  ).join("\n\n");

  await sendTelegramMessage(
    project.bot_token,
    chatId,
    `👋 Welcome to <b>${safeProjectName}</b>, ${safeFirstName}!\n\n🎯 Choose a subscription plan:\n\n${plansList}`,
    { inline_keyboard: keyboard }
  );

  // Create or update subscriber record
  if (sub) {
    await supabase
      .from("subscribers")
      .update({ 
        first_name: firstName, 
        username: username || null, 
        status: "pending_payment",
        updated_at: new Date().toISOString() 
      })
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

async function handleStatus(
  supabase: any,
  project: Project,
  userId: number,
  chatId: number,
  requestId: string
) {
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
  const statusInfo: Record<string, { emoji: string; text: string }> = {
    active: { emoji: "✅", text: "Active" },
    pending_payment: { emoji: "⏳", text: "Pending Payment" },
    pending_approval: { emoji: "🔄", text: "Pending Approval" },
    awaiting_proof: { emoji: "📤", text: "Awaiting Payment Proof" },
    expired: { emoji: "❌", text: "Expired" },
    rejected: { emoji: "🚫", text: "Rejected" },
    suspended: { emoji: "⚠️", text: "Suspended" },
  };

  const { emoji, text } = statusInfo[sub.status] || { emoji: "❓", text: sub.status };

  let message = `📊 <b>Subscription Status</b>\n\n${emoji} Status: <b>${text}</b>\n`;
  
  if (sub.plans) {
    message += `📦 Plan: ${sanitizeForHTML(sub.plans.plan_name)}\n`;
  }
  
  if (sub.start_date) {
    message += `📅 Started: ${new Date(sub.start_date).toLocaleDateString()}\n`;
  }
  
  if (sub.expiry_date) {
    const expiry = new Date(sub.expiry_date);
    const daysLeft = Math.ceil((expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    message += `📅 Expires: ${expiry.toLocaleDateString()}\n`;
    
    if (sub.status === "active") {
      if (daysLeft <= 0) {
        message += `\n⚠️ Subscription expired! Use /renew to reactivate.`;
      } else if (daysLeft <= 7) {
        message += `\n⚠️ Expires in <b>${daysLeft} days</b>! Use /renew to extend.`;
      }
    }
  }

  if (sub.status === "suspended") {
    message += `\n\n⚠️ Your subscription has been suspended. Please contact support.`;
    if (project.support_contact) {
      message += `\n📞 Support: ${sanitizeForHTML(project.support_contact)}`;
    }
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
  const { data: subscriber } = await supabase
    .from("subscribers")
    .select("*, plans(*)")
    .eq("project_id", project.id)
    .eq("telegram_user_id", userId)
    .single();

  const sub = subscriber as Subscriber | null;

  // Allow renewal for active, expired, and rejected subscribers
  const renewableStatuses = ["active", "expired", "rejected"];
  if (!sub || !renewableStatuses.includes(sub.status)) {
    if (sub?.status === "pending_approval") {
      await sendTelegramMessage(
        project.bot_token,
        chatId,
        "🔄 Your payment is pending approval. Please wait for verification."
      );
      return;
    }
    if (sub?.status === "awaiting_proof") {
      await sendTelegramMessage(
        project.bot_token,
        chatId,
        "📤 Please send your payment proof first to complete your current subscription."
      );
      return;
    }
    if (sub?.status === "suspended") {
      await sendTelegramMessage(
        project.bot_token,
        chatId,
        "⚠️ Your account is suspended. Please contact support to resolve this."
      );
      return;
    }
    
    await sendTelegramMessage(
      project.bot_token,
      chatId,
      "❌ You don't have a subscription to renew.\n\nUse /start to subscribe!"
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

  let message = `🔄 <b>${sub.status === "active" ? "Extend" : "Renew"} Your Subscription</b>\n\n`;
  
  if (sub.status === "active" && sub.expiry_date) {
    message += `Current subscription expires: ${new Date(sub.expiry_date).toLocaleDateString()}\n`;
    message += `New days will be added to your current expiry.\n\n`;
  } else if (sub.status === "expired") {
    message += `Your previous subscription has expired.\n\n`;
  }
  
  message += `Choose a plan:`;

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
  username: string | undefined,
  requestId: string
) {
  const { data: plan, error } = await supabase.from("plans").select("*").eq("id", planId).single();

  if (error || !plan) {
    console.error(`[${requestId}] Plan not found: ${planId}`);
    await sendTelegramMessage(project.bot_token, chatId, "❌ Plan not found. Please use /start again.");
    return;
  }

  const typedPlan = plan as Plan;

  // Update subscriber with selected plan
  const { error: updateError } = await supabase
    .from("subscribers")
    .update({ 
      plan_id: planId, 
      status: "pending_payment", 
      updated_at: new Date().toISOString() 
    })
    .eq("project_id", project.id)
    .eq("telegram_user_id", userId);

  if (updateError) {
    console.error(`[${requestId}] Failed to update subscriber:`, updateError);
  }

  // Build payment method buttons
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
  chatId: number,
  requestId: string
) {
  const { data: plan } = await supabase.from("plans").select("*").eq("id", planId).single();

  if (!plan) {
    await sendTelegramMessage(project.bot_token, chatId, "❌ Plan not found. Please use /start again.");
    return;
  }

  const typedPlan = plan as Plan;

  if (method === "manual") {
    // Update subscriber status
    await supabase
      .from("subscribers")
      .update({ 
        status: "awaiting_proof", 
        payment_method: "manual", 
        updated_at: new Date().toISOString() 
      })
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
        paymentInstructions += `<b>${sanitizeForHTML(pm.method_name)}</b> (${pm.method_type})\n`;

        const details = pm.details as Record<string, string>;
        if (pm.method_type === "bank_transfer" && details) {
          if (details.bank_name) paymentInstructions += `🏦 Bank: ${sanitizeForHTML(details.bank_name)}\n`;
          if (details.account_name) paymentInstructions += `👤 Name: ${sanitizeForHTML(details.account_name)}\n`;
          if (details.account_number) paymentInstructions += `💳 Account: ${details.account_number}\n`;
          if (details.routing_number) paymentInstructions += `🔢 Routing: ${details.routing_number}\n`;
        } else if (pm.method_type === "crypto" && details) {
          if (details.network) paymentInstructions += `🔗 Network: ${sanitizeForHTML(details.network)}\n`;
          if (details.address) paymentInstructions += `📍 Address: <code>${details.address}</code>\n`;
        } else if (pm.method_type === "mobile_money" && details) {
          if (details.provider) paymentInstructions += `📱 Provider: ${sanitizeForHTML(details.provider)}\n`;
          if (details.phone_number) paymentInstructions += `📞 Number: ${details.phone_number}\n`;
          if (details.name) paymentInstructions += `👤 Name: ${sanitizeForHTML(details.name)}\n`;
        } else if (details) {
          for (const [key, value] of Object.entries(details)) {
            if (value) {
              const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
              paymentInstructions += `${formattedKey}: ${sanitizeForHTML(String(value))}\n`;
            }
          }
        }

        if (pm.instructions) {
          paymentInstructions += `📌 ${sanitizeForHTML(pm.instructions)}\n`;
        }
        paymentInstructions += "\n";
      }
    } else {
      const instructions = sanitizeForHTML(project.manual_payment_config?.instructions) || 
        "Please send your payment to complete the subscription.";
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
      await sendTelegramMessage(project.bot_token, chatId, "❌ Subscriber not found. Please use /start again.");
      return;
    }

    // Update subscriber status
    await supabase
      .from("subscribers")
      .update({ 
        status: "pending_payment", 
        payment_method: "stripe", 
        updated_at: new Date().toISOString() 
      })
      .eq("id", subscriber.id);

    // Call create-checkout-session
    try {
      const checkoutResponse = await fetch(`${supabaseUrl}/functions/v1/create-checkout-session`, {
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

      const checkoutData = await checkoutResponse.json();
      console.log(`[${requestId}] Checkout session:`, JSON.stringify(checkoutData));

      if (checkoutData.checkout_url) {
        await sendTelegramMessage(
          project.bot_token,
          chatId,
          `💳 <b>Card Payment</b>\n\nAmount: <b>$${typedPlan.price}</b>\n\n🔗 Click the button below to complete your payment securely:`,
          {
            inline_keyboard: [[
              { text: "💳 Pay Now", url: checkoutData.checkout_url }
            ]]
          }
        );
      } else {
        console.error(`[${requestId}] Failed to create checkout session:`, checkoutData);
        await sendTelegramMessage(
          project.bot_token,
          chatId,
          "❌ Error setting up payment. Please try again or use manual payment."
        );
      }
    } catch (error) {
      console.error(`[${requestId}] Checkout error:`, error);
      await sendTelegramMessage(
        project.bot_token,
        chatId,
        "❌ Error setting up payment. Please try again or use manual payment."
      );
    }
  }
}
