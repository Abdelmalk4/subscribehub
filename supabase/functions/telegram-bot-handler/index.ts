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
const MAX_MESSAGE_LENGTH = 4096; // Telegram message limit
const MAX_CAPTION_LENGTH = 1024;
const MAX_CALLBACK_DATA_LENGTH = 64;
const SESSION_TIMEOUT_MINUTES = 30; // Session timeout for pending operations
const MAX_PLANS_PER_PROJECT = 20;
const MIN_PLAN_PRICE = 0;
const MAX_PLAN_PRICE = 100000;
const ALLOWED_PHOTO_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
const MAX_USERNAME_LENGTH = 32; // Telegram username limit
const MAX_FIRST_NAME_LENGTH = 64;
const CONCURRENT_OPERATION_LOCK_SECONDS = 5;

// Rate limiting configuration
const RATE_LIMIT_REQUESTS = 100; // requests per window
const RATE_LIMIT_WINDOW_SECONDS = 60; // 1 minute window
const USER_RATE_LIMIT_REQUESTS = 20; // per user limit
const USER_RATE_LIMIT_WINDOW_SECONDS = 60;

// ============= TYPE DEFINITIONS =============
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TELEGRAM_USER_ID_REGEX = /^[1-9][0-9]{5,14}$/; // Valid Telegram user ID range

// Error codes for better debugging
const ERROR_CODES = {
  MISSING_PROJECT_ID: "E001",
  INVALID_PROJECT_ID: "E002",
  PROJECT_NOT_FOUND: "E003",
  UNAUTHORIZED: "E004",
  RATE_LIMITED: "E005",
  USER_BLOCKED_BOT: "E006",
  INVALID_PLAN: "E007",
  NO_PAYMENT_METHODS: "E008",
  SESSION_EXPIRED: "E009",
  FILE_TOO_LARGE: "E010",
  INVALID_FILE_TYPE: "E011",
  SUBSCRIBER_NOT_FOUND: "E012",
  PLAN_NOT_FOUND: "E013",
  CONCURRENT_OPERATION: "E014",
  PROJECT_INACTIVE: "E015",
  CHANNEL_ACCESS_ERROR: "E016",
  STORAGE_ERROR: "E017",
  DATABASE_ERROR: "E018",
  TELEGRAM_API_ERROR: "E019",
  MALFORMED_REQUEST: "E020",
  USER_SUSPENDED: "E021",
  USER_REJECTED: "E022",
  DUPLICATE_SUBSCRIPTION: "E023",
  CHECKOUT_CREATION_FAILED: "E024",
} as const;

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: {
      id: number;
      is_bot: boolean;
      first_name: string;
      username?: string;
      language_code?: string;
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
    document?: {
      file_id: string;
      file_unique_id: string;
      file_name?: string;
      mime_type?: string;
      file_size?: number;
    };
  };
  callback_query?: {
    id: string;
    from: { id: number; first_name: string; username?: string };
    message: { chat: { id: number }; message_id: number };
    data: string;
  };
  my_chat_member?: {
    chat: { id: number; type: string };
    from: { id: number };
    new_chat_member: { status: string };
    old_chat_member: { status: string };
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
  status: string | null;
  admin_telegram_id: number | null;
}

interface Plan {
  id: string;
  plan_name: string;
  price: number;
  duration_days: number;
  description: string | null;
  is_active: boolean;
}

interface Subscriber {
  id: string;
  status: string;
  plan_id: string | null;
  start_date: string | null;
  expiry_date: string | null;
  updated_at: string | null;
  suspended_at: string | null;
  rejection_reason: string | null;
  plans?: Plan;
}

// ============= UTILITY FUNCTIONS =============

function isValidUUID(id: string): boolean {
  if (!id || typeof id !== "string") return false;
  return UUID_REGEX.test(id);
}

function isValidTelegramUserId(id: number): boolean {
  if (typeof id !== "number" || !Number.isInteger(id)) return false;
  return id > 0 && id < 10000000000000; // Max ~13 digits
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
  if (!text || typeof text !== "string") return "";
  // Remove control characters, null bytes, and trim
  return text
    .replace(/[\x00-\x1F\x7F]/g, "")
    .replace(/\0/g, "")
    .trim()
    .substring(0, maxLength);
}

function truncateMessage(message: string, maxLength: number = MAX_MESSAGE_LENGTH): string {
  if (message.length <= maxLength) return message;
  return message.substring(0, maxLength - 20) + "\n\n... (truncated)";
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
  // Constant-time comparison to prevent timing attacks
  if (providedToken.length !== expectedToken.length) return false;
  let result = 0;
  for (let i = 0; i < providedToken.length; i++) {
    result |= providedToken.charCodeAt(i) ^ expectedToken.charCodeAt(i);
  }
  return result === 0;
}

function isSessionExpired(updatedAt: string | null, timeoutMinutes: number = SESSION_TIMEOUT_MINUTES): boolean {
  if (!updatedAt) return true;
  const lastUpdate = new Date(updatedAt);
  const now = new Date();
  const diffMinutes = (now.getTime() - lastUpdate.getTime()) / (1000 * 60);
  return diffMinutes > timeoutMinutes;
}

function getFileExtension(filePath: string): string {
  const parts = filePath.split('.');
  return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
}

function isAllowedPhotoExtension(extension: string): boolean {
  return ALLOWED_PHOTO_EXTENSIONS.includes(extension.toLowerCase());
}

function formatCurrency(amount: number, currency: string = "USD"): string {
  try {
    return new Intl.NumberFormat('en-US', { 
      style: 'currency', 
      currency: currency.toUpperCase() 
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

function formatDate(dateString: string): string {
  try {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch {
    return dateString;
  }
}

function getDaysRemaining(expiryDate: string): number {
  const expiry = new Date(expiryDate);
  const now = new Date();
  return Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
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
      // Allow request if rate limit check fails (fail open) but log it
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

async function checkUserRateLimit(supabase: any, userId: number, projectId: string): Promise<{ allowed: boolean; retryAfter?: number }> {
  try {
    const { data, error } = await supabase.rpc("check_rate_limit", {
      p_identifier: `user:${userId}:${projectId}`,
      p_endpoint: "telegram-user",
      p_limit: USER_RATE_LIMIT_REQUESTS,
      p_window_seconds: USER_RATE_LIMIT_WINDOW_SECONDS,
    });

    if (error) {
      console.error("[USER_RATE_LIMIT] Error:", error);
      return { allowed: true };
    }

    return {
      allowed: data.allowed,
      retryAfter: data.retry_after,
    };
  } catch (err) {
    console.error("[USER_RATE_LIMIT] Exception:", err);
    return { allowed: true };
  }
}

// ============= IDEMPOTENCY & CONCURRENCY =============

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

async function acquireUserLock(supabase: any, userId: number, projectId: string): Promise<boolean> {
  // Check if there's a recent operation for this user
  const lockKey = `lock:${projectId}:${userId}`;
  const now = new Date();
  const lockThreshold = new Date(now.getTime() - CONCURRENT_OPERATION_LOCK_SECONDS * 1000);
  
  try {
    const { data: recentEvent } = await supabase
      .from("webhook_events")
      .select("processed_at")
      .eq("event_source", "telegram")
      .like("event_type", `%user:${userId}%`)
      .gte("processed_at", lockThreshold.toISOString())
      .limit(1)
      .single();

    return !recentEvent; // Lock acquired if no recent event
  } catch {
    return true; // Allow if check fails
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
      
      // Don't retry on certain errors
      if (error.message.includes("blocked") || error.message.includes("403")) {
        throw error; // User blocked bot, no point retrying
      }
      
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
): Promise<{ ok: boolean; result?: any; error?: string; blocked?: boolean }> {
  // Edge case: Empty or invalid message
  if (!text || text.trim().length === 0) {
    console.warn("[TELEGRAM] Attempted to send empty message");
    return { ok: false, error: "Empty message" };
  }

  // Edge case: Message too long
  const truncatedText = truncateMessage(text);

  try {
    return await withRetry(async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TELEGRAM_API_TIMEOUT_MS);
      
      try {
        const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
        const body: Record<string, unknown> = { 
          chat_id: chatId, 
          text: truncatedText, 
          parse_mode: "HTML",
          disable_web_page_preview: true // Prevent issues with links
        };
        if (replyMarkup) body.reply_markup = replyMarkup;

        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        
        const result = await response.json();
        
        if (!result.ok) {
          // Edge case: User blocked the bot
          if (result.error_code === 403) {
            console.warn(`[TELEGRAM] User ${chatId} has blocked the bot or chat not found`);
            return { ok: false, error: result.description, blocked: true };
          }
          // Edge case: Rate limited by Telegram
          if (result.error_code === 429) {
            const retryAfter = result.parameters?.retry_after || 30;
            console.warn(`[TELEGRAM] Rate limited, retry after ${retryAfter}s`);
            throw new Error(`Rate limited: retry after ${retryAfter}s`);
          }
          // Edge case: Chat not found (user deleted account)
          if (result.error_code === 400 && result.description?.includes("chat not found")) {
            console.warn(`[TELEGRAM] Chat ${chatId} not found - user may have deleted account`);
            return { ok: false, error: "Chat not found", blocked: true };
          }
          // Edge case: Bot was kicked from group
          if (result.error_code === 403 && result.description?.includes("bot was kicked")) {
            console.warn(`[TELEGRAM] Bot was kicked from chat ${chatId}`);
            return { ok: false, error: "Bot kicked", blocked: true };
          }
          // Edge case: Invalid HTML parsing
          if (result.error_code === 400 && result.description?.includes("parse")) {
            console.error(`[TELEGRAM] HTML parse error, retrying without HTML`);
            // Retry without HTML parsing
            body.parse_mode = undefined;
            body.text = text.replace(/<[^>]*>/g, ''); // Strip HTML
            const retryResponse = await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });
            return await retryResponse.json();
          }
        }
        
        return result;
      } finally {
        clearTimeout(timeoutId);
      }
    }, `sendMessage to ${chatId}`);
  } catch (err) {
    const error = err as Error;
    console.error(`[TELEGRAM] Failed to send message to ${chatId}:`, error.message);
    return { ok: false, error: error.message };
  }
}

async function answerCallbackQuery(
  botToken: string,
  callbackQueryId: string,
  text?: string,
  showAlert: boolean = false
): Promise<void> {
  // Edge case: Invalid callback query ID
  if (!callbackQueryId || callbackQueryId.length === 0) {
    console.warn("[TELEGRAM] Invalid callback query ID");
    return;
  }

  try {
    const url = `https://api.telegram.org/bot${botToken}/answerCallbackQuery`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        callback_query_id: callbackQueryId, 
        text: text?.substring(0, 200), // Max 200 chars
        show_alert: showAlert 
      }),
    });
    
    const result = await response.json();
    if (!result.ok) {
      // Edge case: Callback query expired (> 1 hour old)
      if (result.description?.includes("query is too old")) {
        console.warn("[TELEGRAM] Callback query expired");
      }
    }
  } catch (err) {
    const error = err as Error;
    console.warn("[TELEGRAM] Failed to answer callback query:", error.message);
  }
}

async function editMessageReplyMarkup(
  botToken: string,
  chatId: number,
  messageId: number,
  replyMarkup?: object
): Promise<void> {
  try {
    const url = `https://api.telegram.org/bot${botToken}/editMessageReplyMarkup`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        reply_markup: replyMarkup || { inline_keyboard: [] }
      }),
    });
  } catch (err) {
    console.warn("[TELEGRAM] Failed to edit message markup:", err);
  }
}

async function getTelegramFile(botToken: string, fileId: string): Promise<{ filePath: string | null; fileSize: number; error?: string }> {
  // Edge case: Invalid file ID
  if (!fileId || fileId.length === 0) {
    return { filePath: null, fileSize: 0, error: "Invalid file ID" };
  }

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
    
    // Edge case: File no longer available on Telegram servers
    if (result.description?.includes("file is no longer available")) {
      return { filePath: null, fileSize: 0, error: "File expired" };
    }
    
    console.error("[TELEGRAM] Failed to get file path:", result);
    return { filePath: null, fileSize: 0, error: result.description };
  } catch (error) {
    console.error("[TELEGRAM] Error getting file path:", error);
    return { filePath: null, fileSize: 0, error: "Network error" };
  }
}

async function downloadTelegramFile(botToken: string, filePath: string): Promise<Uint8Array | null> {
  // Edge case: Invalid file path
  if (!filePath || filePath.length === 0) {
    return null;
  }

  try {
    return await withRetry(async () => {
      const url = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout for downloads
      
      try {
        const response = await fetch(url, { signal: controller.signal });
        
        if (!response.ok) {
          throw new Error(`Download failed: ${response.status}`);
        }
        
        const arrayBuffer = await response.arrayBuffer();
        
        // Edge case: Empty file
        if (arrayBuffer.byteLength === 0) {
          throw new Error("Downloaded file is empty");
        }
        
        return new Uint8Array(arrayBuffer);
      } finally {
        clearTimeout(timeoutId);
      }
    }, `downloadFile ${filePath}`);
  } catch (err) {
    console.error("[TELEGRAM] Download failed:", err);
    return null;
  }
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
    const extension = getFileExtension(filePath);
    
    // Edge case: Invalid file extension
    if (!isAllowedPhotoExtension(extension)) {
      console.error("[STORAGE] Invalid file extension:", extension);
      return null;
    }
    
    const fileName = `${projectId}/${subscriberId}/${Date.now()}.${extension}`;
    
    const contentTypeMap: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
    };
    const contentType = contentTypeMap[extension] || 'image/jpeg';
    
    const { data, error } = await supabase.storage
      .from('payment-proofs')
      .upload(fileName, fileData, { contentType, upsert: false });
    
    if (error) {
      // Edge case: Storage bucket doesn't exist
      if (error.message?.includes("Bucket not found")) {
        console.error("[STORAGE] Bucket 'payment-proofs' not found");
        return null;
      }
      // Edge case: Duplicate file (race condition)
      if (error.message?.includes("already exists")) {
        console.warn("[STORAGE] File already exists, generating new name");
        const newFileName = `${projectId}/${subscriberId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${extension}`;
        const { data: retryData, error: retryError } = await supabase.storage
          .from('payment-proofs')
          .upload(newFileName, fileData, { contentType, upsert: false });
        if (retryError) {
          console.error("[STORAGE] Retry upload error:", retryError);
          return null;
        }
        console.log("[STORAGE] File uploaded on retry:", retryData.path);
      } else {
        console.error("[STORAGE] Upload error:", error);
        return null;
      }
    } else {
      console.log("[STORAGE] File uploaded:", data.path);
    }
    
    // Generate signed URL with longer expiry
    const { data: signedData, error: signedError } = await supabase.storage
      .from('payment-proofs')
      .createSignedUrl(fileName, 60 * 60 * 24 * 365); // 1 year
    
    if (signedError) {
      console.error("[STORAGE] Signed URL error:", signedError);
      // Edge case: Return public URL as fallback if possible
      const publicUrl = `${supabaseUrl}/storage/v1/object/public/payment-proofs/${fileName}`;
      return publicUrl;
    }
    
    return signedData.signedUrl;
  } catch (error) {
    console.error("[STORAGE] Error uploading payment proof:", error);
    return null;
  }
}

// ============= NOTIFICATION HELPERS =============

async function notifyAdminOfPendingPayment(
  supabase: any,
  project: Project,
  subscriber: any,
  plan: Plan
): Promise<void> {
  try {
    // Create admin notification in database
    await supabase.from("admin_notifications").insert({
      project_id: project.id,
      notification_type: "pending_payment",
      message: `New payment proof received from @${subscriber.username || subscriber.first_name} for ${plan.plan_name}`,
      reference_type: "subscriber",
      reference_id: subscriber.id,
    });
    
    // If admin has Telegram ID, notify them directly
    if (project.admin_telegram_id) {
      await sendTelegramMessage(
        project.bot_token,
        project.admin_telegram_id as unknown as number,
        `📬 <b>New Payment Pending</b>\n\n` +
        `User: @${sanitizeForHTML(subscriber.username) || sanitizeForHTML(subscriber.first_name)}\n` +
        `Plan: ${sanitizeForHTML(plan.plan_name)}\n` +
        `Amount: ${formatCurrency(plan.price)}\n\n` +
        `Please review in the dashboard.`
      );
    }
  } catch (err) {
    console.error("[NOTIFICATION] Failed to notify admin:", err);
    // Non-critical, don't throw
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
    
    // Edge case: Invalid URL
    let url: URL;
    try {
      url = new URL(req.url);
    } catch {
      console.error(`[${requestId}] Invalid request URL`);
      return new Response(JSON.stringify({ error: "Invalid URL", code: ERROR_CODES.MALFORMED_REQUEST }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    const projectId = url.searchParams.get("project_id");

    // Validate project_id
    if (!projectId) {
      console.error(`[${requestId}] Missing project_id`);
      return new Response(JSON.stringify({ error: "Missing project_id", code: ERROR_CODES.MISSING_PROJECT_ID }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!isValidUUID(projectId)) {
      console.error(`[${requestId}] Invalid project_id format: ${projectId?.substring(0, 20)}`);
      return new Response(JSON.stringify({ error: "Invalid project_id", code: ERROR_CODES.INVALID_PROJECT_ID }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Global rate limiting check
    const rateLimitResult = await checkRateLimit(supabase, `telegram:${projectId}`, "telegram-bot-handler");
    if (!rateLimitResult.allowed) {
      console.warn(`[${requestId}] Rate limit exceeded for project ${projectId}`);
      return new Response(JSON.stringify({ error: "Rate limit exceeded", code: ERROR_CODES.RATE_LIMITED, retry_after: rateLimitResult.retryAfter }), {
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
      return new Response(JSON.stringify({ error: "Project not found", code: ERROR_CODES.PROJECT_NOT_FOUND }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const typedProject = project as Project;
    
    // Edge case: Project is inactive/disabled
    if (typedProject.status === "inactive" || typedProject.status === "disabled") {
      console.warn(`[${requestId}] Project ${projectId} is ${typedProject.status}`);
      return new Response(JSON.stringify({ error: "Project inactive", code: ERROR_CODES.PROJECT_INACTIVE }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    const botToken = typedProject.bot_token;
    
    // Edge case: Missing or invalid bot token
    if (!botToken || botToken.length < 40) {
      console.error(`[${requestId}] Invalid bot token for project ${projectId}`);
      return new Response(JSON.stringify({ error: "Invalid bot configuration" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify webhook authenticity
    if (!verifyWebhookAuth(req, botToken)) {
      console.error(`[${requestId}] Webhook auth failed`);
      return new Response(JSON.stringify({ error: "Unauthorized", code: ERROR_CODES.UNAUTHORIZED }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Edge case: Empty or malformed request body
    let update: TelegramUpdate;
    try {
      const bodyText = await req.text();
      if (!bodyText || bodyText.length === 0) {
        console.error(`[${requestId}] Empty request body`);
        return new Response(JSON.stringify({ error: "Empty body", code: ERROR_CODES.MALFORMED_REQUEST }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      update = JSON.parse(bodyText);
    } catch (parseError) {
      console.error(`[${requestId}] Failed to parse request body:`, parseError);
      return new Response(JSON.stringify({ error: "Invalid JSON", code: ERROR_CODES.MALFORMED_REQUEST }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Edge case: Missing update_id
    if (!update.update_id || typeof update.update_id !== "number") {
      console.error(`[${requestId}] Missing or invalid update_id`);
      return new Response(JSON.stringify({ error: "Invalid update", code: ERROR_CODES.MALFORMED_REQUEST }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[${requestId}] Update ID: ${update.update_id}`);

    // Idempotency check
    const isDuplicate = await checkIdempotency(supabase, update.update_id);
    if (isDuplicate) {
      console.log(`[${requestId}] Duplicate update_id ${update.update_id} - already processed`);
      return new Response(JSON.stringify({ ok: true, duplicate: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract user ID for user-level rate limiting
    const userId = update.callback_query?.from.id || update.message?.from.id;
    if (userId) {
      // Validate Telegram user ID
      if (!isValidTelegramUserId(userId)) {
        console.error(`[${requestId}] Invalid Telegram user ID: ${userId}`);
        return new Response(JSON.stringify({ ok: true, skipped: "invalid_user" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // User-level rate limiting
      const userRateLimit = await checkUserRateLimit(supabase, userId, projectId);
      if (!userRateLimit.allowed) {
        console.warn(`[${requestId}] User ${userId} rate limited`);
        // Don't expose rate limit to potentially abusive user
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Handle bot blocked/kicked events
    if (update.my_chat_member) {
      const newStatus = update.my_chat_member.new_chat_member.status;
      const userId = update.my_chat_member.from.id;
      
      if (newStatus === "kicked" || newStatus === "left") {
        console.log(`[${requestId}] Bot was ${newStatus} by user ${userId}`);
        // Mark subscriber as having blocked the bot
        await supabase
          .from("subscribers")
          .update({ channel_membership_status: "blocked_bot" })
          .eq("project_id", projectId)
          .eq("telegram_user_id", userId);
      }
      
      await recordWebhookEvent(supabase, update.update_id, `member_update:${newStatus}`, { user_id: userId });
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine event type for logging
    let eventType = "unknown";
    if (update.callback_query) {
      eventType = `callback:${update.callback_query.data?.split(":")[0] || "unknown"}:user:${update.callback_query.from.id}`;
    } else if (update.message?.photo) {
      eventType = `photo:user:${update.message.from.id}`;
    } else if (update.message?.document) {
      eventType = `document:user:${update.message.from.id}`;
    } else if (update.message?.text) {
      eventType = `command:${update.message.text.split(" ")[0]}:user:${update.message.from.id}`;
    }

    // Route to appropriate handler
    try {
      if (update.callback_query) {
        await handleCallbackQuery(supabase, typedProject, update.callback_query, requestId);
      } else if (update.message?.photo && update.message.photo.length > 0) {
        await handlePhotoMessage(supabase, typedProject, update.message, requestId);
      } else if (update.message?.document) {
        // Edge case: User sends document instead of photo
        await handleDocumentMessage(supabase, typedProject, update.message, requestId);
      } else if (update.message?.text) {
        await handleTextMessage(supabase, typedProject, update.message, requestId);
      } else {
        // Edge case: Unsupported message type (sticker, voice, etc.)
        console.log(`[${requestId}] Unsupported message type`);
        if (update.message) {
          await sendTelegramMessage(
            typedProject.bot_token,
            update.message.chat.id,
            "❓ Sorry, I can only process text messages and photos. Use /help to see available commands."
          );
        }
      }
    } catch (handlerError) {
      console.error(`[${requestId}] Handler error:`, handlerError);
      // Record the error but return OK to Telegram
      await recordWebhookEvent(supabase, update.update_id, `error:${eventType}`, { 
        error: (handlerError as Error).message,
        status: "handler_error" 
      });
      // Return OK to prevent Telegram from retrying
      return new Response(JSON.stringify({ ok: true, error: "Handler error" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Record successful processing
    await recordWebhookEvent(supabase, update.update_id, eventType, { status: "processed", project_id: projectId });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error(`[${requestId}] Error processing webhook:`, error);
    // Return 200 OK even on error to prevent Telegram retries
    return new Response(JSON.stringify({ ok: true, error: "Internal error" }), {
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
  const messageId = callbackQuery.message.message_id;
  const firstName = sanitizeUserInput(callbackQuery.from.first_name, MAX_FIRST_NAME_LENGTH);
  const username = sanitizeUserInput(callbackQuery.from.username, MAX_USERNAME_LENGTH);

  // Edge case: Invalid or empty callback data
  if (!callbackData || callbackData.length === 0 || callbackData.length > MAX_CALLBACK_DATA_LENGTH) {
    console.error(`[${requestId}] Invalid callback data`);
    await answerCallbackQuery(project.bot_token, callbackQuery.id, "❌ Invalid action", true);
    return;
  }

  console.log(`[${requestId}] Callback: ${callbackData} from ${userId}`);
  
  // Answer callback immediately to remove loading state
  await answerCallbackQuery(project.bot_token, callbackQuery.id);

  // Check for suspended/rejected subscriber
  const { data: existingSub } = await supabase
    .from("subscribers")
    .select("status, rejection_reason, suspended_at")
    .eq("project_id", project.id)
    .eq("telegram_user_id", userId)
    .single();

  if (existingSub) {
    if (existingSub.status === "suspended") {
      await sendTelegramMessage(
        project.bot_token,
        chatId,
        `⛔ <b>Your account has been suspended.</b>\n\n` +
        `Please contact support for assistance.\n` +
        (project.support_contact ? `📞 ${sanitizeForHTML(project.support_contact)}` : "")
      );
      return;
    }
    if (existingSub.status === "rejected" && existingSub.rejection_reason) {
      // Allow rejected users to try again with a new payment
      console.log(`[${requestId}] Rejected user ${userId} attempting new subscription`);
    }
  }

  if (callbackData.startsWith("select_plan:")) {
    const planId = callbackData.split(":")[1];
    if (!isValidUUID(planId)) {
      console.error(`[${requestId}] Invalid plan ID: ${planId}`);
      await sendTelegramMessage(project.bot_token, chatId, "❌ Invalid plan. Please use /start again.");
      return;
    }
    
    // Remove buttons from original message to prevent double-clicks
    await editMessageReplyMarkup(project.bot_token, chatId, messageId);
    
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
    
    // Remove buttons from original message
    await editMessageReplyMarkup(project.bot_token, chatId, messageId);
    
    await handlePaymentMethod(supabase, project, planId, method, userId, chatId, requestId);
  } else if (callbackData === "confirm_payment") {
    await sendTelegramMessage(project.bot_token, chatId, "✅ Payment confirmation received! Please wait for verification.");
  } else if (callbackData === "cancel") {
    // Edge case: User cancels operation
    await sendTelegramMessage(project.bot_token, chatId, "❌ Operation cancelled. Use /start to begin again.");
    await editMessageReplyMarkup(project.bot_token, chatId, messageId);
  } else {
    // Edge case: Unknown callback action
    console.warn(`[${requestId}] Unknown callback action: ${callbackData}`);
    await sendTelegramMessage(project.bot_token, chatId, "❓ Unknown action. Please use /start to begin.");
  }
}

async function handleTextMessage(
  supabase: any,
  project: Project,
  message: NonNullable<TelegramUpdate["message"]>,
  requestId: string
) {
  const text = message.text || "";
  const userId = message.from.id;
  const chatId = message.chat.id;
  const firstName = sanitizeUserInput(message.from.first_name, MAX_FIRST_NAME_LENGTH);
  const username = sanitizeUserInput(message.from.username, MAX_USERNAME_LENGTH);
  
  // Edge case: Message from bot
  if (message.from.is_bot) {
    console.log(`[${requestId}] Ignoring message from bot`);
    return;
  }
  
  // Edge case: Group chat (should only work in private)
  if (message.chat.type !== "private") {
    console.log(`[${requestId}] Ignoring message from non-private chat: ${message.chat.type}`);
    return;
  }
  
  // Extract command, handling @BotName suffix
  const commandMatch = text.match(/^\/(\w+)(@\w+)?/);
  const command = commandMatch ? `/${commandMatch[1].toLowerCase()}` : "";

  console.log(`[${requestId}] Command: ${command || "none"} from ${userId}`);

  // Check for suspended/rejected subscriber
  const { data: existingSub } = await supabase
    .from("subscribers")
    .select("status, rejection_reason")
    .eq("project_id", project.id)
    .eq("telegram_user_id", userId)
    .single();

  if (existingSub?.status === "suspended") {
    await sendTelegramMessage(
      project.bot_token,
      chatId,
      `⛔ <b>Your account has been suspended.</b>\n\n` +
      `Please contact support for assistance.\n` +
      (project.support_contact ? `📞 ${sanitizeForHTML(project.support_contact)}` : "")
    );
    return;
  }

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
    case "/cancel":
      await handleCancel(supabase, project, userId, chatId, requestId);
      break;
    case "/support":
      await handleSupport(project, chatId);
      break;
    default:
      if (text.startsWith("/")) {
        await sendTelegramMessage(project.bot_token, chatId, "❓ Unknown command. Use /help to see available commands.");
      } else {
        // Edge case: Non-command text when not expecting input
        // Check if user is in awaiting_proof status
        const { data: sub } = await supabase
          .from("subscribers")
          .select("status")
          .eq("project_id", project.id)
          .eq("telegram_user_id", userId)
          .single();

        if (sub?.status === "awaiting_proof") {
          await sendTelegramMessage(
            project.bot_token,
            chatId,
            "📸 <b>Please send a photo of your payment receipt.</b>\n\nText messages are not accepted as proof of payment."
          );
        }
        // Otherwise silently ignore
      }
  }
}

async function handleDocumentMessage(
  supabase: any,
  project: Project,
  message: NonNullable<TelegramUpdate["message"]>,
  requestId: string
) {
  const userId = message.from.id;
  const chatId = message.chat.id;
  const document = message.document!;

  console.log(`[${requestId}] Document from ${userId}: ${document.file_name}`);

  // Check if document is an image
  const mimeType = document.mime_type || "";
  const isImage = mimeType.startsWith("image/");
  const extension = document.file_name ? getFileExtension(document.file_name) : "";

  if (!isImage || !isAllowedPhotoExtension(extension)) {
    await sendTelegramMessage(
      project.bot_token,
      chatId,
      "❌ <b>Invalid file type.</b>\n\n" +
      "Please send a photo (JPG, PNG, GIF, WebP) of your payment receipt.\n\n" +
      "💡 Tip: Send the image as a <b>Photo</b>, not as a File/Document."
    );
    return;
  }

  // Check file size
  const fileSize = document.file_size || 0;
  if (fileSize > MAX_FILE_SIZE_MB * 1024 * 1024) {
    await sendTelegramMessage(
      project.bot_token,
      chatId,
      `❌ <b>File too large.</b>\n\nMaximum size is ${MAX_FILE_SIZE_MB}MB. Please compress the image and try again.`
    );
    return;
  }

  // Process as photo
  const { data: subscriber, error } = await supabase
    .from("subscribers")
    .select("*, plans(*)")
    .eq("project_id", project.id)
    .eq("telegram_user_id", userId)
    .eq("status", "awaiting_proof")
    .single();

  if (error || !subscriber) {
    await sendTelegramMessage(
      project.bot_token,
      chatId,
      "❓ We received your file, but you don't have a pending payment.\n\nUse /start to subscribe or /status to check your subscription."
    );
    return;
  }

  const sub = subscriber as Subscriber & { plans: Plan };
  await sendTelegramMessage(project.bot_token, chatId, "📸 Processing your payment proof...");

  // Get and download file
  const { filePath, error: fileError } = await getTelegramFile(project.bot_token, document.file_id);
  
  if (fileError || !filePath) {
    await sendTelegramMessage(
      project.bot_token,
      chatId,
      "❌ Failed to process your file. Please try sending it again as a photo."
    );
    return;
  }

  const fileData = await downloadTelegramFile(project.bot_token, filePath);
  if (!fileData) {
    await sendTelegramMessage(project.bot_token, chatId, "❌ Failed to download file. Please try again.");
    return;
  }

  const paymentProofUrl = await uploadPaymentProof(supabase, project.id, sub.id, fileData, filePath);

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

  // Notify admin
  if (sub.plans) {
    await notifyAdminOfPendingPayment(supabase, project, subscriber, sub.plans);
  }

  await sendTelegramMessage(
    project.bot_token,
    chatId,
    "✅ <b>Payment proof received!</b>\n\n" +
    "Your payment is now pending approval. You'll receive a notification once it's verified.\n\n" +
    "Thank you for your patience! 🙏"
  );
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
  
  // Edge case: Empty photo array
  if (photos.length === 0) {
    await sendTelegramMessage(project.bot_token, chatId, "❌ Failed to process photo. Please try again.");
    return;
  }
  
  const largestPhoto = photos[photos.length - 1];
  const fileId = largestPhoto.file_id;
  const fileSize = largestPhoto.file_size || 0;

  console.log(`[${requestId}] Photo from ${userId}, size: ${fileSize}, dimensions: ${largestPhoto.width}x${largestPhoto.height}`);

  // Edge case: File size check
  if (fileSize > MAX_FILE_SIZE_MB * 1024 * 1024) {
    await sendTelegramMessage(
      project.bot_token,
      chatId,
      `❌ <b>File too large.</b>\n\nMaximum size is ${MAX_FILE_SIZE_MB}MB. Please compress the image and try again.`
    );
    return;
  }

  // Edge case: Very small image (likely thumbnail or error)
  if (largestPhoto.width < 100 || largestPhoto.height < 100) {
    await sendTelegramMessage(
      project.bot_token,
      chatId,
      "❌ <b>Image too small.</b>\n\nPlease send a clear, legible photo of your payment receipt."
    );
    return;
  }

  const { data: subscriber, error } = await supabase
    .from("subscribers")
    .select("*, plans(*)")
    .eq("project_id", project.id)
    .eq("telegram_user_id", userId)
    .eq("status", "awaiting_proof")
    .single();

  if (error || !subscriber) {
    // Edge case: Photo received but no pending payment
    // Check other statuses
    const { data: anySub } = await supabase
      .from("subscribers")
      .select("status")
      .eq("project_id", project.id)
      .eq("telegram_user_id", userId)
      .single();

    if (anySub) {
      const statusMessages: Record<string, string> = {
        active: "✅ You already have an active subscription! Use /status to check details.",
        pending_approval: "⏳ We already received your payment proof. Please wait for approval.",
        pending_payment: "💳 Please complete the payment process first. Use /start to continue.",
        expired: "❌ Your subscription has expired. Use /renew to reactivate.",
        rejected: "🚫 Your previous payment was rejected. Use /start to try again.",
        suspended: "⛔ Your account is suspended. Please contact support.",
      };
      const message = statusMessages[anySub.status] || "Use /start to subscribe.";
      await sendTelegramMessage(project.bot_token, chatId, message);
    } else {
      await sendTelegramMessage(
        project.bot_token,
        chatId,
        "❓ We received your photo, but you don't have a pending payment.\n\nUse /start to subscribe or /status to check your subscription."
      );
    }
    return;
  }

  const sub = subscriber as Subscriber & { plans: Plan };
  
  // Edge case: Session timeout check
  if (isSessionExpired(sub.updated_at)) {
    await sendTelegramMessage(
      project.bot_token,
      chatId,
      "⏰ <b>Session expired.</b>\n\nPlease use /start to begin the subscription process again."
    );
    // Reset status
    await supabase
      .from("subscribers")
      .update({ status: "pending_payment", updated_at: new Date().toISOString() })
      .eq("id", sub.id);
    return;
  }

  await sendTelegramMessage(project.bot_token, chatId, "📸 Processing your payment proof...");

  // Get and download file
  const { filePath, error: fileError } = await getTelegramFile(project.bot_token, fileId);
  
  if (fileError === "File expired") {
    await sendTelegramMessage(
      project.bot_token,
      chatId,
      "❌ <b>Photo expired.</b>\n\nPlease send the photo again."
    );
    return;
  }
  
  if (!filePath) {
    await sendTelegramMessage(
      project.bot_token,
      chatId,
      "❌ Failed to process photo. Please try again."
    );
    return;
  }

  const fileData = await downloadTelegramFile(project.bot_token, filePath);
  if (!fileData) {
    await sendTelegramMessage(
      project.bot_token,
      chatId,
      "❌ Failed to download photo. Please try sending it again."
    );
    return;
  }

  const paymentProofUrl = await uploadPaymentProof(supabase, project.id, sub.id, fileData, filePath);
  
  if (!paymentProofUrl) {
    // Storage failed but continue with the flow
    console.error(`[${requestId}] Failed to upload payment proof to storage`);
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

  // Notify admin of pending payment
  if (sub.plans) {
    await notifyAdminOfPendingPayment(supabase, project, subscriber, sub.plans);
  }

  await sendTelegramMessage(
    project.bot_token,
    chatId,
    "✅ <b>Payment proof received!</b>\n\n" +
    "Your payment is being reviewed. You'll receive a notification as soon as it's approved.\n\n" +
    "⏱️ <b>Usually approved within 5-10 minutes during business hours.</b>\n\n" +
    "Thank you for your patience! 🙏"
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

  // Check for existing subscriber with all possible statuses
  const { data: existingSub } = await supabase
    .from("subscribers")
    .select("*, plans(*)")
    .eq("project_id", project.id)
    .eq("telegram_user_id", userId)
    .single();

  if (existingSub) {
    const sub = existingSub as Subscriber & { plans: Plan };
    
    switch (sub.status) {
      case "active": {
        const expiryDate = sub.expiry_date ? formatDate(sub.expiry_date) : "N/A";
        const daysLeft = sub.expiry_date ? getDaysRemaining(sub.expiry_date) : 0;
        let message = `✅ <b>You have an active subscription!</b>\n\n`;
        message += `📦 Plan: ${sanitizeForHTML(sub.plans?.plan_name || "Subscription")}\n`;
        message += `📅 Valid until: ${expiryDate}\n`;
        message += `⏰ Days remaining: ${daysLeft}\n`;
        
        if (daysLeft <= 7) {
          message += `\n⚠️ <b>Expiring soon!</b> Use /renew to extend.`;
        }
        
        await sendTelegramMessage(project.bot_token, chatId, message);
        return;
      }
      
      case "pending_approval":
        await sendTelegramMessage(
          project.bot_token,
          chatId,
          "⏳ <b>Your payment is being reviewed.</b>\n\n" +
          "You'll receive a notification as soon as it's approved.\n\n" +
          "⏱️ <b>Usually approved within 5-10 minutes.</b>\n\n" +
          "No action needed - just wait for confirmation!"
        );
        return;
        
      case "awaiting_proof":
        await sendTelegramMessage(
          project.bot_token,
          chatId,
          "📸 <b>We're waiting for your payment proof.</b>\n\n" +
          "Please send a photo of your payment receipt to complete the subscription process.\n\n" +
          "Use /cancel to cancel and start over."
        );
        return;
        
      case "pending_payment":
        // Check if session expired
        if (isSessionExpired(sub.updated_at)) {
          // Reset and show plans
          await supabase
            .from("subscribers")
            .update({ plan_id: null, updated_at: new Date().toISOString() })
            .eq("id", sub.id);
        } else {
          await sendTelegramMessage(
            project.bot_token,
            chatId,
            "💳 <b>You have a pending payment.</b>\n\n" +
            "Please complete the payment process or use /cancel to start over."
          );
          return;
        }
        break;
        
      case "suspended":
        await sendTelegramMessage(
          project.bot_token,
          chatId,
          `⛔ <b>Your account has been suspended.</b>\n\n` +
          `Please contact support for assistance.\n` +
          (project.support_contact ? `📞 ${sanitizeForHTML(project.support_contact)}` : "")
        );
        return;
        
      case "rejected":
        // Allow retry with message about rejection
        let rejectionMsg = "🚫 <b>Your previous payment was rejected.</b>\n\n";
        if (sub.rejection_reason) {
          rejectionMsg += `Reason: ${sanitizeForHTML(sub.rejection_reason)}\n\n`;
        }
        rejectionMsg += "You can try again by selecting a plan below.";
        await sendTelegramMessage(project.bot_token, chatId, rejectionMsg);
        // Continue to show plans
        break;
        
      case "expired":
        await sendTelegramMessage(
          project.bot_token,
          chatId,
          "❌ <b>Your subscription has expired.</b>\n\n" +
          "Select a plan below to renew your subscription."
        );
        // Continue to show plans
        break;
    }
  }

  // Fetch available plans
  const { data: plans, error: plansError } = await supabase
    .from("plans")
    .select("*")
    .eq("project_id", project.id)
    .eq("is_active", true)
    .order("price", { ascending: true })
    .limit(MAX_PLANS_PER_PROJECT);

  if (plansError) {
    console.error(`[${requestId}] Error fetching plans:`, plansError);
    await sendTelegramMessage(
      project.bot_token,
      chatId,
      "❌ Error loading plans. Please try again later."
    );
    return;
  }

  if (!plans || plans.length === 0) {
    await sendTelegramMessage(
      project.bot_token,
      chatId,
      "❌ No subscription plans are currently available.\n\n" +
      (project.support_contact ? `Please contact support: ${sanitizeForHTML(project.support_contact)}` : "Please try again later.")
    );
    return;
  }

  // Build plan selection message
  let message = `👋 <b>Welcome to ${sanitizeForHTML(project.project_name)}!</b>\n\n`;
  message += "📋 <b>Available Plans:</b>\n\n";

  const buttons: Array<Array<{ text: string; callback_data: string }>> = [];

  for (const plan of plans) {
    const typedPlan = plan as Plan;
    
    // Edge case: Validate plan data
    if (typedPlan.price < MIN_PLAN_PRICE || typedPlan.price > MAX_PLAN_PRICE) {
      console.warn(`[${requestId}] Invalid plan price: ${typedPlan.price}`);
      continue;
    }
    if (!typedPlan.duration_days || typedPlan.duration_days <= 0) {
      console.warn(`[${requestId}] Invalid plan duration: ${typedPlan.duration_days}`);
      continue;
    }
    
    message += `<b>${sanitizeForHTML(typedPlan.plan_name)}</b>\n`;
    message += `💰 ${formatCurrency(typedPlan.price)} for ${typedPlan.duration_days} days\n`;
    if (typedPlan.description) {
      message += `📝 ${sanitizeForHTML(typedPlan.description)}\n`;
    }
    message += "\n";

    buttons.push([{ text: `${typedPlan.plan_name} - ${formatCurrency(typedPlan.price)}`, callback_data: `select_plan:${typedPlan.id}` }]);
  }

  if (buttons.length === 0) {
    await sendTelegramMessage(
      project.bot_token,
      chatId,
      "❌ No valid plans available. Please contact support."
    );
    return;
  }

  message += "👇 <b>Select a plan to continue:</b>";

  await sendTelegramMessage(project.bot_token, chatId, truncateMessage(message), { inline_keyboard: buttons });
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

  // Fetch plan with validation
  const { data: plan, error: planError } = await supabase
    .from("plans")
    .select("*")
    .eq("id", planId)
    .eq("project_id", project.id)
    .eq("is_active", true)
    .single();

  if (planError || !plan) {
    console.error(`[${requestId}] Plan not found or inactive:`, planError);
    await sendTelegramMessage(
      project.bot_token,
      chatId,
      "❌ This plan is no longer available.\n\nUse /start to see current options."
    );
    return;
  }

  const typedPlan = plan as Plan;

  // Validate plan data
  if (typedPlan.price < 0 || typedPlan.duration_days <= 0) {
    console.error(`[${requestId}] Invalid plan data: price=${typedPlan.price}, duration=${typedPlan.duration_days}`);
    await sendTelegramMessage(project.bot_token, chatId, "❌ Invalid plan configuration. Please contact support.");
    return;
  }

  // Check payment methods available
  const manualEnabled = project.manual_payment_config?.enabled ?? false;
  const stripeEnabled = project.stripe_config?.enabled ?? false;

  if (!manualEnabled && !stripeEnabled) {
    await sendTelegramMessage(
      project.bot_token,
      chatId,
      "❌ No payment methods are currently available.\n\n" +
      (project.support_contact ? `Please contact support: ${sanitizeForHTML(project.support_contact)}` : "Please try again later.")
    );
    return;
  }

  // Create or update subscriber
  const { data: existingSub } = await supabase
    .from("subscribers")
    .select("id, status")
    .eq("project_id", project.id)
    .eq("telegram_user_id", userId)
    .single();

  let subscriberId: string;

  if (existingSub) {
    subscriberId = existingSub.id;
    
    // Edge case: Prevent concurrent modifications
    const { error: updateError } = await supabase
      .from("subscribers")
      .update({
        plan_id: planId,
        status: "pending_payment",
        first_name: firstName,
        username: username,
        updated_at: new Date().toISOString(),
        // Reset rejection/suspension if resubscribing
        rejection_reason: null,
        suspended_at: null,
        suspended_by: null,
      })
      .eq("id", subscriberId);

    if (updateError) {
      console.error(`[${requestId}] Error updating subscriber:`, updateError);
      await sendTelegramMessage(project.bot_token, chatId, "❌ Error processing request. Please try again.");
      return;
    }
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
      
      // Edge case: Unique constraint violation (race condition)
      if (insertError?.code === "23505") {
        await sendTelegramMessage(
          project.bot_token,
          chatId,
          "❌ A subscription already exists. Use /status to check your subscription."
        );
      } else {
        await sendTelegramMessage(project.bot_token, chatId, "❌ Error processing your request. Please try again later.");
      }
      return;
    }
    subscriberId = newSub.id;
  }

  // Show payment method selection
  let message = `✅ <b>Plan Selected: ${sanitizeForHTML(typedPlan.plan_name)}</b>\n\n`;
  message += `💰 Amount: ${formatCurrency(typedPlan.price)}\n`;
  message += `📅 Duration: ${typedPlan.duration_days} days\n\n`;
  message += "💳 <b>Choose your payment method:</b>";

  const buttons: Array<Array<{ text: string; callback_data: string }>> = [];

  if (stripeEnabled) {
    buttons.push([{ text: "💳 Pay with Card (Stripe)", callback_data: `pay_method:${planId}:stripe` }]);
  }
  if (manualEnabled) {
    buttons.push([{ text: "🏦 Manual Payment", callback_data: `pay_method:${planId}:manual` }]);
  }
  
  // Add cancel button
  buttons.push([{ text: "❌ Cancel", callback_data: "cancel" }]);

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

  // Get subscriber with session validation
  const { data: subscriber, error: subError } = await supabase
    .from("subscribers")
    .select("id, status, updated_at, plan_id")
    .eq("project_id", project.id)
    .eq("telegram_user_id", userId)
    .single();

  if (subError || !subscriber) {
    await sendTelegramMessage(
      project.bot_token,
      chatId,
      "❌ Session expired. Please use /start again."
    );
    return;
  }

  // Edge case: Session timeout
  if (isSessionExpired(subscriber.updated_at)) {
    await sendTelegramMessage(
      project.bot_token,
      chatId,
      "⏰ Session expired. Please use /start again."
    );
    return;
  }

  // Edge case: Plan mismatch (user manipulated callback data)
  if (subscriber.plan_id !== planId) {
    console.warn(`[${requestId}] Plan mismatch: expected ${subscriber.plan_id}, got ${planId}`);
    await sendTelegramMessage(
      project.bot_token,
      chatId,
      "❌ Invalid session. Please use /start again."
    );
    return;
  }

  const { data: plan } = await supabase
    .from("plans")
    .select("*")
    .eq("id", planId)
    .eq("is_active", true)
    .single();

  if (!plan) {
    await sendTelegramMessage(
      project.bot_token,
      chatId,
      "❌ Plan not found or no longer available. Please use /start again."
    );
    return;
  }

  const typedPlan = plan as Plan;

  if (method === "stripe") {
    // Verify Stripe is still enabled
    if (!project.stripe_config?.enabled) {
      await sendTelegramMessage(
        project.bot_token,
        chatId,
        "❌ Card payments are currently unavailable. Please try manual payment or contact support."
      );
      return;
    }

    // Create Stripe checkout session
    const checkoutUrl = `${supabaseUrl}/functions/v1/create-checkout-session`;
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout
      
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
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const result = await response.json();

        if (result.checkout_url) {
          await sendTelegramMessage(
            project.bot_token,
            chatId,
            `💳 <b>Stripe Payment</b>\n\n` +
            `📦 Plan: ${sanitizeForHTML(typedPlan.plan_name)}\n` +
            `💰 Amount: ${formatCurrency(typedPlan.price)}\n\n` +
            `👇 <b>Click below to complete your payment:</b>\n\n` +
            `⚠️ Link expires in 30 minutes.`,
            {
              inline_keyboard: [[{ text: "💳 Pay Now", url: result.checkout_url }]],
            }
          );
        } else {
          throw new Error(result.error || "Failed to create checkout");
        }
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      const err = error as Error;
      console.error(`[${requestId}] Error creating checkout:`, err.message);
      
      // Edge case: Timeout
      if (err.name === "AbortError") {
        await sendTelegramMessage(
          project.bot_token,
          chatId,
          "❌ Payment service is slow. Please try again in a few moments."
        );
      } else {
        await sendTelegramMessage(
          project.bot_token,
          chatId,
          "❌ Error creating payment link. Please try again later or use manual payment."
        );
      }
    }
  } else if (method === "manual") {
    // Verify manual payment is still enabled
    if (!project.manual_payment_config?.enabled) {
      await sendTelegramMessage(
        project.bot_token,
        chatId,
        "❌ Manual payments are currently unavailable. Please try card payment or contact support."
      );
      return;
    }

    const instructions = project.manual_payment_config?.instructions || "Please contact support for payment details.";

    const { error: updateError } = await supabase
      .from("subscribers")
      .update({
        status: "awaiting_proof",
        payment_method: "manual",
        updated_at: new Date().toISOString(),
      })
      .eq("id", subscriber.id);

    if (updateError) {
      console.error(`[${requestId}] Error updating subscriber:`, updateError);
      await sendTelegramMessage(project.bot_token, chatId, "❌ Error processing request. Please try again.");
      return;
    }

    let message = `🏦 <b>Manual Payment</b>\n\n`;
    message += `📦 Plan: ${sanitizeForHTML(typedPlan.plan_name)}\n`;
    message += `💰 Amount: ${formatCurrency(typedPlan.price)}\n\n`;
    message += `📋 <b>Payment Instructions:</b>\n${sanitizeForHTML(instructions)}\n\n`;
    message += `📸 After making payment, please <b>send a photo of your payment receipt</b> to complete the process.\n\n`;
    message += `⏰ You have ${SESSION_TIMEOUT_MINUTES} minutes to submit your payment proof.\n\n`;
    message += `Use /cancel to cancel this payment.`;

    await sendTelegramMessage(project.bot_token, chatId, truncateMessage(message));
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
    pending_payment: "💳",
    pending_approval: "⏳",
    awaiting_proof: "📸",
    expired: "❌",
    rejected: "🚫",
    suspended: "⛔",
  };

  const statusLabels: Record<string, string> = {
    active: "Active",
    pending_payment: "Pending Payment",
    pending_approval: "Pending Approval",
    awaiting_proof: "Awaiting Payment Proof",
    expired: "Expired",
    rejected: "Rejected",
    suspended: "Suspended",
  };

  let message = `📊 <b>Your Subscription Status</b>\n\n`;
  message += `${statusEmoji[sub.status] || "❓"} Status: <b>${statusLabels[sub.status] || sub.status}</b>\n`;
  
  if (sub.plans) {
    message += `📦 Plan: ${sanitizeForHTML(sub.plans.plan_name)}\n`;
    message += `💰 Price: ${formatCurrency(sub.plans.price)}\n`;
  }
  
  if (sub.status === "active" && sub.expiry_date) {
    const daysLeft = getDaysRemaining(sub.expiry_date);
    
    message += `📅 Expires: ${formatDate(sub.expiry_date)}\n`;
    message += `⏰ Days remaining: ${daysLeft}\n`;
    
    if (daysLeft <= 0) {
      message += "\n❌ <b>Your subscription has expired!</b>\nUse /renew to reactivate.";
    } else if (daysLeft <= 3) {
      message += "\n🔴 <b>Expiring very soon!</b>\nUse /renew to extend.";
    } else if (daysLeft <= 7) {
      message += "\n🟡 <b>Expiring soon!</b>\nUse /renew to extend.";
    }
  } else if (sub.status === "expired") {
    if (sub.expiry_date) {
      message += `📅 Expired on: ${formatDate(sub.expiry_date)}\n`;
    }
    message += "\n💡 Use /renew to reactivate your subscription.";
  } else if (sub.status === "rejected" && sub.rejection_reason) {
    message += `\n📝 Reason: ${sanitizeForHTML(sub.rejection_reason)}\n`;
    message += "\n💡 Use /start to try again with a new payment.";
  } else if (sub.status === "suspended" && sub.suspended_at) {
    message += `\n📅 Suspended on: ${formatDate(sub.suspended_at)}\n`;
    message += `\n📞 Contact support for assistance.`;
    if (project.support_contact) {
      message += `\n${sanitizeForHTML(project.support_contact)}`;
    }
  } else if (sub.status === "awaiting_proof") {
    message += "\n📸 Send a photo of your payment receipt.";
    message += "\n\nUse /cancel to cancel and start over.";
  } else if (sub.status === "pending_approval") {
    message += "\n⏳ Please wait while we verify your payment.";
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

  // Edge case: Can't renew suspended accounts
  if (sub.status === "suspended") {
    await sendTelegramMessage(
      project.bot_token,
      chatId,
      `⛔ <b>Your account is suspended.</b>\n\nPlease contact support to resolve this issue.` +
      (project.support_contact ? `\n📞 ${sanitizeForHTML(project.support_contact)}` : "")
    );
    return;
  }

  // Edge case: Already has pending payment
  if (sub.status === "pending_payment" || sub.status === "awaiting_proof" || sub.status === "pending_approval") {
    await sendTelegramMessage(
      project.bot_token,
      chatId,
      `⏳ <b>You already have a pending payment.</b>\n\n` +
      `Please complete your current payment or use /cancel to start over.`
    );
    return;
  }

  // Fetch available plans
  const { data: plans, error: plansError } = await supabase
    .from("plans")
    .select("*")
    .eq("project_id", project.id)
    .eq("is_active", true)
    .order("price", { ascending: true })
    .limit(MAX_PLANS_PER_PROJECT);

  if (plansError || !plans || plans.length === 0) {
    await sendTelegramMessage(
      project.bot_token,
      chatId,
      "❌ No plans available. Please contact support."
    );
    return;
  }

  let message = `🔄 <b>Renew Your Subscription</b>\n\n`;
  
  if (sub.status === "active" && sub.expiry_date) {
    const daysLeft = getDaysRemaining(sub.expiry_date);
    message += `📦 Current plan: ${sanitizeForHTML(sub.plans?.plan_name || "Unknown")}\n`;
    message += `📅 Current expiry: ${formatDate(sub.expiry_date)}\n`;
    message += `⏰ Days remaining: ${daysLeft}\n\n`;
    message += "Renewing will <b>extend</b> your subscription from the current expiry date.\n\n";
  } else if (sub.status === "expired") {
    message += "❌ Your subscription has expired.\n\n";
    message += "Select a plan below to reactivate:\n\n";
  }
  
  message += "📋 <b>Available Plans:</b>";

  const buttons: Array<Array<{ text: string; callback_data: string }>> = [];
  for (const plan of plans) {
    const typedPlan = plan as Plan;
    if (typedPlan.price >= MIN_PLAN_PRICE && typedPlan.price <= MAX_PLAN_PRICE && typedPlan.duration_days > 0) {
      buttons.push([{ text: `${typedPlan.plan_name} - ${formatCurrency(typedPlan.price)}`, callback_data: `select_plan:${typedPlan.id}` }]);
    }
  }

  if (buttons.length === 0) {
    await sendTelegramMessage(project.bot_token, chatId, "❌ No valid plans available. Please contact support.");
    return;
  }

  await sendTelegramMessage(project.bot_token, chatId, message, { inline_keyboard: buttons });
}

async function handleCancel(
  supabase: any,
  project: Project,
  userId: number,
  chatId: number,
  requestId: string
) {
  console.log(`[${requestId}] /cancel from ${userId}`);

  const { data: subscriber } = await supabase
    .from("subscribers")
    .select("id, status")
    .eq("project_id", project.id)
    .eq("telegram_user_id", userId)
    .single();

  if (!subscriber) {
    await sendTelegramMessage(
      project.bot_token,
      chatId,
      "❓ Nothing to cancel. Use /start to subscribe."
    );
    return;
  }

  const cancelableStatuses = ["pending_payment", "awaiting_proof"];
  
  if (!cancelableStatuses.includes(subscriber.status)) {
    const statusMessages: Record<string, string> = {
      active: "✅ You have an active subscription. Use /status to see details.",
      pending_approval: "⏳ Your payment is pending approval and cannot be cancelled. Please wait for verification.",
      expired: "❌ Your subscription has expired. Use /renew to reactivate.",
      rejected: "🚫 Your payment was rejected. Use /start to try again.",
      suspended: "⛔ Your account is suspended. Please contact support.",
    };
    
    await sendTelegramMessage(
      project.bot_token,
      chatId,
      statusMessages[subscriber.status] || "Nothing to cancel."
    );
    return;
  }

  // Reset subscriber to expired/inactive state
  await supabase
    .from("subscribers")
    .update({
      status: "expired",
      plan_id: null,
      payment_method: null,
      payment_proof_url: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", subscriber.id);

  await sendTelegramMessage(
    project.bot_token,
    chatId,
    "✅ <b>Payment cancelled.</b>\n\nUse /start to begin again when you're ready."
  );
}

async function handleSupport(project: Project, chatId: number) {
  let message = "📞 <b>Support Information</b>\n\n";
  
  if (project.support_contact) {
    message += `Contact: ${sanitizeForHTML(project.support_contact)}\n\n`;
  } else {
    message += "No support contact is currently configured.\n\n";
  }
  
  message += "📋 <b>Helpful Commands:</b>\n";
  message += "/status - Check your subscription\n";
  message += "/help - See all commands\n";
  message += "/cancel - Cancel pending payment";

  await sendTelegramMessage(project.bot_token, chatId, message);
}

async function handleHelp(project: Project, chatId: number) {
  let message = `ℹ️ <b>Available Commands</b>\n\n`;
  message += `/start - Start subscription process\n`;
  message += `/status - Check your subscription status\n`;
  message += `/renew - Renew or extend subscription\n`;
  message += `/cancel - Cancel pending payment\n`;
  message += `/support - Get support information\n`;
  message += `/help - Show this help message\n`;
  
  if (project.support_contact) {
    message += `\n📞 Support: ${sanitizeForHTML(project.support_contact)}`;
  }

  await sendTelegramMessage(project.bot_token, chatId, message);
}
