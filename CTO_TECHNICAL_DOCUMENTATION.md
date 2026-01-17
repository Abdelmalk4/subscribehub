# SubscribeHub - Comprehensive CTO Technical Documentation

**Document Version:** 1.0  
**Date:** January 17, 2026  
**Classification:** Internal Technical Reference  
**Prepared For:** Incoming CTO / Technical Owner Handoff

---

## Table of Contents

1. [Executive Technical Summary](#1-executive-technical-summary)
2. [System Architecture Overview](#2-system-architecture-overview)
3. [Technology Stack Deep Dive](#3-technology-stack-deep-dive)
4. [Frontend Architecture](#4-frontend-architecture)
5. [Backend Architecture](#5-backend-architecture)
6. [Database Schema & Design](#6-database-schema--design)
7. [Authentication & Authorization](#7-authentication--authorization)
8. [Payment Integration Analysis](#8-payment-integration-analysis)
9. [Telegram Bot Integration](#9-telegram-bot-integration)
10. [Admin Dashboard Technical Breakdown](#10-admin-dashboard-technical-breakdown)
11. [Business Logic & Edge Cases](#11-business-logic--edge-cases)
12. [Security Analysis](#12-security-analysis)
13. [Technical Debt & Risks](#13-technical-debt--risks)
14. [Scalability Assessment](#14-scalability-assessment)
15. [CTO 30-Day Action Plan](#15-cto-30-day-action-plan)

---

## 1. Executive Technical Summary

### What Is SubscribeHub?

SubscribeHub is a **SaaS platform** that enables content creators to monetize Telegram channels through paid subscriptions. The system acts as an intermediary layer managing:

- **Clients (B2B)**: Platform users who own Telegram channels
- **Subscribers (B2C)**: End-users who pay to access private Telegram channels
- **Super Admins**: Platform operators managing the entire ecosystem

### Core Business Flow

```
Platform Admin ←→ Client (Channel Owner) ←→ Subscriber (Telegram User)
         |                |                        |
    Manages         Creates projects       Pays for access
    clients         & pricing plans       to private channel
         |                |                        |
    Approves         Approves              Gets invite link
    payments         payments              via Telegram bot
```

### Key Technical Components

1. **Frontend**: React SPA with role-based routing
2. **Backend**: Supabase (Postgres + Edge Functions)
3. **Bot Layer**: Telegram Bot API integration
4. **Payments**: Stripe + Manual proof-based payments
5. **Storage**: Supabase Storage for payment proofs

---

## 2. System Architecture Overview

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND (React SPA)                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐│
│  │   Landing   │  │   Client    │  │    Admin    │  │   Auth Pages    ││
│  │    Page     │  │  Dashboard  │  │  Dashboard  │  │ (Login/Signup)  ││
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────┘│
└────────────────────────────────┬────────────────────────────────────────┘
                                 │ HTTPS / REST
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         SUPABASE BACKEND                                │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │                     PostgreSQL Database                              ││
│  │  ┌──────────┐ ┌───────────┐ ┌────────────┐ ┌───────────────────────┐││
│  │  │ profiles │ │ projects  │ │subscribers │ │ client_subscriptions  │││
│  │  └──────────┘ └───────────┘ └────────────┘ └───────────────────────┘││
│  │  ┌──────────┐ ┌───────────┐ ┌────────────┐ ┌───────────────────────┐││
│  │  │  plans   │ │user_roles │ │  invoices  │ │ subscription_plans    │││
│  │  └──────────┘ └───────────┘ └────────────┘ └───────────────────────┘││
│  └─────────────────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │                       Edge Functions (Deno)                          ││
│  │  telegram-bot-handler │ notify-subscriber │ stripe-webhook          ││
│  │  check-expiring-subs  │ create-checkout   │ stripe-connect-*        ││
│  └─────────────────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │                       Storage Buckets                                ││
│  │        payment-proofs (private)  │  invoice-proofs (private)        ││
│  └─────────────────────────────────────────────────────────────────────┘│
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
        ┌────────────────────────┼────────────────────────┐
        ▼                        ▼                        ▼
┌───────────────┐      ┌─────────────────┐      ┌─────────────────┐
│  Telegram API │      │    Stripe API   │      │ Platform Admin  │
│  (Bot Layer)  │      │   (Payments)    │      │   Dashboard     │
└───────────────┘      └─────────────────┘      └─────────────────┘
```

### Request Flow Patterns

**Pattern 1: Web Dashboard Interaction**
```
User → React App → Supabase Client SDK → RLS → PostgreSQL
```

**Pattern 2: Telegram Bot Interaction**
```
Telegram → Webhook → telegram-bot-handler → Database → Telegram API Response
```

**Pattern 3: Stripe Payment Flow**
```
Bot → create-checkout → Stripe Checkout → stripe-webhook → DB Update → Bot Notification
```

---

## 3. Technology Stack Deep Dive

### Frontend Technologies

| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| Framework | React | ^18.3.1 | UI Library |
| Build Tool | Vite | Latest | Fast development & bundling |
| Language | TypeScript | Latest | Type safety |
| Styling | Tailwind CSS | Latest | Utility-first CSS |
| UI Components | shadcn/ui | Latest | Radix-based components |
| Routing | react-router-dom | ^6.30.1 | Client-side routing |
| State Management | React Query | ^5.83.0 | Server state & caching |
| Forms | react-hook-form + zod | ^7.61.1 / ^3.25.76 | Form handling & validation |
| Animation | framer-motion | ^12.23.26 | UI animations |
| Charts | recharts | ^2.15.4 | Data visualization |
| Icons | lucide-react | ^0.462.0 | Icon library |
| Notifications | sonner | ^1.7.4 | Toast notifications |
| Date Handling | date-fns | ^3.6.0 | Date utilities |

### Backend Technologies

| Component | Technology | Purpose |
|-----------|------------|---------|
| Database | PostgreSQL 14+ | Primary data store |
| Backend Platform | Supabase (Lovable Cloud) | BaaS with auth, storage, edge functions |
| Edge Functions | Deno Runtime | Serverless functions |
| Authentication | Supabase Auth | JWT-based auth |
| Storage | Supabase Storage | File uploads (payment proofs) |
| RLS | PostgreSQL RLS | Row-level security |

### External Services

| Service | Purpose | Integration Type |
|---------|---------|------------------|
| Telegram Bot API | Channel management, user notifications | Webhook + REST |
| Stripe | Payment processing | Connect + Webhooks |
| Stripe Connect | Multi-tenant payments | OAuth + Webhooks |

---

## 4. Frontend Architecture

### 4.1 Directory Structure

```
src/
├── components/
│   ├── admin/           # Super Admin components
│   │   └── PaymentMethodsManager.tsx
│   ├── billing/         # Client billing components
│   │   ├── ClientPaymentMethodsManager.tsx
│   │   ├── ContactSalesDialog.tsx
│   │   ├── InvoiceProofUpload.tsx
│   │   ├── InvoicesList.tsx
│   │   ├── PlatformPaymentInfo.tsx
│   │   └── UpgradePlanDialog.tsx
│   ├── landing/         # Public landing page components
│   │   ├── CTABanner.tsx
│   │   ├── FAQSection.tsx
│   │   ├── FeaturesSection.tsx
│   │   ├── Footer.tsx
│   │   ├── HeroSection.tsx
│   │   ├── HowItWorksSection.tsx
│   │   ├── LandingNavbar.tsx
│   │   ├── PricingSection.tsx
│   │   ├── SocialProofSection.tsx
│   │   └── TestimonialsSection.tsx
│   ├── layout/          # Layout components
│   │   ├── AuthLayout.tsx
│   │   ├── DashboardLayout.tsx
│   │   └── Sidebar.tsx
│   ├── projects/        # Project management
│   │   ├── CreateProjectDialog.tsx
│   │   ├── EditProjectDialog.tsx
│   │   └── PlansDialog.tsx
│   ├── subscribers/     # Subscriber management
│   │   ├── AddSubscriberDialog.tsx
│   │   ├── PaymentProofUpload.tsx
│   │   └── SubscriberDetails.tsx
│   └── ui/              # shadcn/ui components (50+ files)
├── hooks/
│   ├── useAuth.tsx           # Authentication context & methods
│   ├── useUserRole.tsx       # Role detection (client/super_admin)
│   ├── useAdminGuard.tsx     # Admin operation verification
│   ├── useSubscriptionLimits.tsx  # Plan limits tracking
│   ├── use-mobile.tsx        # Responsive detection
│   └── use-toast.ts          # Toast state management
├── lib/
│   ├── auditLog.ts           # Audit logging utility
│   └── utils.ts              # General utilities (cn, etc.)
├── pages/
│   ├── admin/                # Super Admin pages
│   │   ├── AdminOverview.tsx
│   │   ├── AdminClients.tsx
│   │   ├── AdminPayments.tsx
│   │   └── AdminSettings.tsx
│   ├── auth/                 # Authentication pages
│   │   ├── Login.tsx
│   │   ├── Signup.tsx
│   │   ├── ForgotPassword.tsx
│   │   └── ResetPassword.tsx
│   ├── Analytics.tsx         # Client analytics dashboard
│   ├── Billing.tsx           # Client billing & subscription
│   ├── Dashboard.tsx         # Client main dashboard
│   ├── Landing.tsx           # Public landing page
│   ├── NotFound.tsx          # 404 page
│   ├── Projects.tsx          # Project management
│   ├── Settings.tsx          # Client settings
│   └── Subscribers.tsx       # Subscriber management
├── integrations/supabase/
│   ├── client.ts             # Supabase client (auto-generated)
│   └── types.ts              # Database types (auto-generated)
├── App.tsx                   # Root component with routing
├── App.css                   # Global styles
├── index.css                 # Tailwind & design tokens
└── main.tsx                  # Entry point
```

### 4.2 Routing Architecture

**File: `src/App.tsx`**

The application uses react-router-dom v6 with three distinct route groups:

```typescript
// Route Structure
<Routes location={location} key={location.pathname}>
  {/* Public Routes */}
  <Route path="/" element={<Landing />} />
  
  {/* Auth Routes - AuthLayout wrapper */}
  <Route element={<AuthLayout />}>
    <Route path="/login" element={<Login />} />
    <Route path="/signup" element={<Signup />} />
    <Route path="/forgot-password" element={<ForgotPassword />} />
    <Route path="/reset-password" element={<ResetPassword />} />
  </Route>

  {/* Client Dashboard Routes - DashboardLayout wrapper */}
  <Route element={<DashboardLayout />}>
    <Route path="/dashboard" element={<Dashboard />} />
    <Route path="/projects" element={<Projects />} />
    <Route path="/subscribers" element={<Subscribers />} />
    <Route path="/analytics" element={<Analytics />} />
    <Route path="/billing" element={<Billing />} />
    <Route path="/settings" element={<Settings />} />
  </Route>

  {/* Super Admin Routes - DashboardLayout with isAdmin=true */}
  <Route element={<DashboardLayout isAdmin={true} />}>
    <Route path="/super-admin" element={<AdminOverview />} />
    <Route path="/super-admin/clients" element={<AdminClients />} />
    <Route path="/super-admin/payments" element={<AdminPayments />} />
    <Route path="/super-admin/settings" element={<AdminSettings />} />
  </Route>

  <Route path="*" element={<NotFound />} />
</Routes>
```

### 4.3 Authentication Flow

**File: `src/hooks/useAuth.tsx`**

The AuthProvider component wraps the entire application and provides:

```typescript
interface AuthContextType {
  user: User | null;           // Current Supabase user
  session: Session | null;     // Current session
  loading: boolean;            // Auth state loading
  signIn: (email, password) => Promise<{error}>
  signUp: (email, password, fullName) => Promise<{error}>
  signOut: () => Promise<void>
}
```

**Auth State Management:**
1. On mount, subscribes to `onAuthStateChange`
2. Checks existing session via `getSession()`
3. Updates `user`, `session`, `loading` state accordingly
4. Triggers on new user via database trigger `handle_new_user()`

**New User Onboarding (Database Trigger):**
```sql
-- When a new user signs up, this trigger fires:
1. Creates profile in public.profiles
2. Assigns 'client' role in user_roles
3. Creates trial subscription in client_subscriptions (14 days)
```

### 4.4 Role-Based Access Control (Frontend)

**File: `src/hooks/useUserRole.tsx`**

```typescript
export function useUserRole() {
  // Fetches role from user_roles table
  // Returns: { role, isSuperAdmin, loading }
}
```

**File: `src/components/layout/DashboardLayout.tsx`**

```typescript
export function DashboardLayout({ isAdmin = false }) {
  const { user, loading } = useAuth();
  const { isSuperAdmin, loading: roleLoading } = useUserRole();

  // Show loading while checking auth AND role
  if (loading || roleLoading) return <Loader />;

  // Redirect unauthenticated users
  if (!user) return <Navigate to="/login" />;

  // CRITICAL: Redirect non-admins away from admin routes
  if (isAdmin && !isSuperAdmin) {
    return <Navigate to="/dashboard" />;
  }

  return <Layout><Outlet /></Layout>;
}
```

**SECURITY NOTE:** Frontend checks are for UX only. The actual protection comes from:
1. RLS policies on database tables
2. `useAdminGuard` hook for sensitive operations
3. Backend validation in edge functions

### 4.5 Component Architecture Patterns

**Pattern 1: Data Fetching in Page Components**

Most pages use inline `useEffect` + state for data fetching:

```typescript
// Typical pattern in pages
export default function Dashboard() {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState<Type | null>(null);

  useEffect(() => {
    if (user) fetchData();
  }, [user]);

  const fetchData = async () => {
    setIsLoading(true);
    // Supabase queries...
    setIsLoading(false);
  };
}
```

**TECHNICAL DEBT:** React Query is installed but underutilized. Most data fetching uses raw `useEffect` + `useState`, missing caching benefits.

**Pattern 2: Dialog-Based Actions**

CRUD operations use shadcn Sheet/Dialog components:
- `CreateProjectDialog` - Project creation wizard
- `EditProjectDialog` - Project settings
- `PlansDialog` - Pricing plan management
- `SubscriberDetails` - Side panel for subscriber management

**Pattern 3: Form Handling**

Forms use react-hook-form with Zod validation:

```typescript
const schema = z.object({
  project_name: z.string().min(3).max(50),
  bot_token: z.string().regex(/^\d+:[A-Za-z0-9_-]+$/),
  channel_id: z.string().regex(/^(-100\d+|@\w+)$/),
});

const form = useForm<FormData>({
  resolver: zodResolver(schema),
  defaultValues: { ... },
});
```

### 4.6 Design System

**File: `src/index.css`**

The design system uses CSS custom properties with HSL values:

```css
:root {
  --background: 220 14% 98%;
  --foreground: 222 47% 11%;
  --primary: 222 47% 11%;        /* Near-black */
  --secondary: 215 16% 47%;      /* Medium gray */
  --muted: 220 14% 96%;          /* Light gray */
  --destructive: 0 84% 60%;      /* Red */
  --success: 160 84% 39%;        /* Green */
  --warning: 38 92% 50%;         /* Orange */
  --border: 220 13% 91%;
}
```

**Theme:** Clean minimal white/black aesthetic with semantic color tokens.

---

## 5. Backend Architecture

### 5.1 Edge Functions Overview

Located in `supabase/functions/`, these are Deno-based serverless functions:

| Function | Purpose | Trigger |
|----------|---------|---------|
| `telegram-bot-handler` | Processes Telegram webhooks | Telegram webhook POST |
| `notify-subscriber` | Sends notifications to subscribers | HTTP from frontend/other functions |
| `check-expiring-subscriptions` | Handles expiry reminders & kicks | Cron (scheduled) |
| `retry-failed-notifications` | Retries failed Telegram messages | Cron (scheduled) |
| `create-checkout-session` | Creates Stripe checkout | HTTP from Telegram bot |
| `stripe-webhook` | Processes Stripe payment events | Stripe webhook POST |
| `stripe-connect-oauth` | Handles Stripe Connect OAuth | HTTP from frontend |
| `stripe-connect-callback` | OAuth callback handler | Stripe redirect |
| `stripe-connect-webhook` | Handles Connect-specific events | Stripe webhook POST |
| `setup-telegram-webhook` | Configures bot webhook URL | HTTP from frontend |
| `validate-project-setup` | Validates bot token & channel | HTTP from frontend |
| `test-stripe-connection` | Tests Stripe integration | HTTP from frontend |
| `check-channel-membership` | Verifies user is in channel | HTTP from frontend |

### 5.2 Telegram Bot Handler Deep Dive

**File: `supabase/functions/telegram-bot-handler/index.ts`**

This is the **most complex edge function** (~1000 lines). It handles all Telegram bot interactions.

**Request Flow:**
```
Telegram → POST /telegram-bot-handler?project_id=<uuid>
         → Verify webhook secret (X-Telegram-Bot-Api-Secret-Token)
         → Parse update (message/callback_query/photo)
         → Route to appropriate handler
         → Send response via Telegram API
```

**Security Measures:**
1. **Rate Limiting:** 100 requests/minute per project via `check_rate_limit` RPC
2. **Idempotency:** Checks `webhook_events` table to prevent duplicate processing
3. **Webhook Auth:** Validates secret token header against generated hash
4. **UUID Validation:** Validates all IDs before database queries
5. **Input Sanitization:** Sanitizes user input (names, text) before storage

**Command Handlers:**

| Command/Action | Handler | Description |
|----------------|---------|-------------|
| `/start` | `handleTextMessage` | Shows project welcome + plan selection |
| `/renew` | `handleTextMessage` | Renewal flow for existing subscribers |
| `/status` | `handleTextMessage` | Shows subscription status |
| `select_plan:<id>` | `handleCallbackQuery` | User selects a plan |
| `pay_method:stripe:<id>` | `handleCallbackQuery` | Initiates Stripe checkout |
| `pay_method:manual:<id>` | `handleCallbackQuery` | Shows manual payment instructions |
| Photo upload | `handlePhotoMessage` | Processes payment proof |

**Payment Proof Upload Flow:**
```
1. User sends photo to bot
2. Get subscriber in "awaiting_proof" status
3. Validate file size (<20MB)
4. Download from Telegram API
5. Upload to Supabase storage (payment-proofs bucket)
6. Update subscriber with proof URL, set status to "pending_approval"
7. Create admin notification
8. Send confirmation to user
```

### 5.3 Subscription Expiry Handler

**File: `supabase/functions/check-expiring-subscriptions/index.ts`**

Designed to run on a schedule (cron job). Three processing stages:

**Stage 1: 3-Day Warning**
- Query: `status='active' AND expiry_reminder_sent=false AND expiry_date <= now+3days AND > now+1day`
- Action: Send Telegram reminder, set `expiry_reminder_sent=true`

**Stage 2: 1-Day Final Warning**
- Query: `status='active' AND final_reminder_sent=false AND expiry_date <= now+1day AND > now`
- Action: Send urgent Telegram reminder, set `final_reminder_sent=true`

**Stage 3: Expire & Kick**
- Query: `status='active' AND expiry_date < now`
- Action (ATOMIC):
  1. Kick user from Telegram channel
  2. IF kick succeeds: Update status to 'expired'
  3. IF kick fails: Queue to `failed_notifications` for retry
  4. Send expiry notification

**CRITICAL:** The kick-then-update pattern ensures data consistency. User is only marked expired if actually removed from channel.

### 5.4 Stripe Payment Flow

**File: `supabase/functions/stripe-webhook/index.ts`**

**Webhook Event Processing:**
```
Stripe → POST /stripe-webhook?project_id=<uuid>
       → Verify signature (project-specific secret)
       → Check idempotency (webhook_events table)
       → Process checkout.session.completed
       → Update subscriber via atomic RPC
       → Send Telegram confirmation
```

**Atomic Payment Processing:**
Uses database function `process_stripe_payment` with row-level locking:

```sql
-- This function:
1. Locks subscriber row (FOR UPDATE)
2. Determines if extension or new subscription
3. Calculates new expiry date
4. Updates subscriber atomically
5. Returns result with dates
```

This prevents race conditions from concurrent payments.

### 5.5 Notify Subscriber Service

**File: `supabase/functions/notify-subscriber/index.ts`**

Central notification hub for all subscriber communications.

**Supported Actions:**
- `approved` - Payment approved, sends invite link
- `rejected` - Payment rejected with reason
- `extended` - Subscription extended
- `expiring_soon` - Reminder before expiry
- `expired` - Subscription ended
- `suspended` - Account suspended (kicks from channel)
- `kicked` - Removed from channel
- `reactivated` - Subscription restored

**Authorization:**
1. Verifies JWT from Authorization header
2. For frontend calls: Validates user owns the subscriber's project
3. For internal calls: Accepts service role key

**Retry Logic:**
- Uses exponential backoff wrapper for Telegram API calls
- 3 retry attempts with increasing delays

---

## 6. Database Schema & Design

### 6.1 Entity Relationship Overview

```
                    ┌───────────────────┐
                    │    auth.users     │
                    │   (Supabase Auth) │
                    └─────────┬─────────┘
                              │ user_id
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────────┐
│    profiles     │ │   user_roles    │ │ client_subscriptions│
│  (user info)    │ │(super_admin/    │ │  (platform subs)    │
│                 │ │    client)      │ │                     │
└─────────────────┘ └─────────────────┘ └──────────┬──────────┘
                                                   │ plan_id
                                                   ▼
                                       ┌─────────────────────┐
                                       │ subscription_plans  │
                                       │ (Free/Pro/Business/ │
                                       │    Unlimited)       │
                                       └─────────────────────┘

┌─────────────────┐
│    projects     │ ←── One client can have many projects
│  (Telegram      │     (limited by subscription plan)
│   channels)     │
└────────┬────────┘
         │ project_id
         ├───────────────────────────────┐
         ▼                               ▼
┌─────────────────┐              ┌───────────────┐
│   subscribers   │              │    plans      │
│ (Telegram users │              │ (per-project  │
│  subscribed)    │──────────────│  pricing)     │
└─────────────────┘   plan_id    └───────────────┘
```

### 6.2 Core Tables Detail

#### `profiles`
User profile information (created by trigger on signup).

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | References auth.users |
| email | text | User email |
| full_name | text | Display name |
| avatar_url | text | Profile image URL |
| created_at | timestamp | Account creation |
| updated_at | timestamp | Last update |

#### `user_roles`
Role assignment table (security-critical).

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | References auth.users |
| role | app_role ENUM | 'super_admin' or 'client' |
| created_at | timestamp | Assignment time |

**SECURITY:** Roles stored separately from profiles. No way for users to self-assign admin. Requires direct database access.

#### `client_subscriptions`
Platform subscription (what clients pay to use SubscribeHub).

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| client_id | uuid | References auth.users |
| plan_id | uuid | References subscription_plans |
| status | subscription_status ENUM | trial/active/pending_payment/expired |
| trial_ends_at | timestamp | Trial expiration |
| current_period_start | timestamp | Billing period start |
| current_period_end | timestamp | Billing period end |

#### `subscription_plans`
Platform plan tiers (managed by super_admin).

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| plan_name | text | Display name |
| plan_slug | text | URL-friendly identifier |
| price | numeric | Monthly price USD |
| max_projects | integer | Project limit (-1 = unlimited) |
| max_subscribers | integer | Total subscriber limit |
| features | jsonb | Feature flags |
| billing_cycle | text | 'monthly' |
| is_active | boolean | Available for purchase |

#### `projects`
Telegram channel configurations.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | Owner (client) |
| project_name | text | Display name |
| bot_token | text | Telegram bot token (sensitive!) |
| channel_id | text | Telegram channel ID |
| status | text | 'active'/'suspended' |
| admin_telegram_id | bigint | Bot owner's Telegram ID |
| admin_username | text | Bot username |
| support_contact | text | Support info for subscribers |
| stripe_config | jsonb | Stripe Connect settings |
| manual_payment_config | jsonb | Manual payment settings |

**SECURITY CONCERN:** `bot_token` is stored in plaintext. Should be encrypted at rest.

#### `plans`
Per-project pricing plans (what subscribers pay).

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| project_id | uuid | Parent project |
| plan_name | text | Display name |
| price | numeric | Price in currency |
| currency | text | 'USD', etc. |
| duration_days | integer | Subscription length |
| description | text | Plan description |
| stripe_price_id | text | Stripe price object ID |
| is_active | boolean | Available for selection |

#### `subscribers`
Telegram users subscribed to channels.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| project_id | uuid | Parent project |
| telegram_user_id | bigint | Telegram user ID |
| username | text | Telegram username |
| first_name | text | Telegram first name |
| status | subscriber_status ENUM | See below |
| plan_id | uuid | Selected plan |
| payment_method | text | 'stripe'/'manual' |
| payment_proof_url | text | Uploaded proof URL |
| invite_link | text | Generated invite URL |
| start_date | timestamp | Subscription start |
| expiry_date | timestamp | Subscription end |
| expiry_reminder_sent | boolean | 3-day reminder flag |
| final_reminder_sent | boolean | 1-day reminder flag |
| channel_joined | boolean | In channel? |
| channel_membership_status | text | Telegram membership status |
| rejection_reason | text | Why rejected |
| suspended_at | timestamp | Suspension time |
| notes | text | Admin notes |

**Subscriber Status Values:**
- `pending_payment` - Selected plan, awaiting payment
- `awaiting_proof` - Manual payment, awaiting proof upload
- `pending_approval` - Proof uploaded, awaiting admin approval
- `active` - Approved, has channel access
- `expired` - Subscription ended
- `rejected` - Payment rejected
- `suspended` - Manually suspended

### 6.3 Billing Tables

#### `invoices`
Client platform subscription invoices.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| client_id | uuid | Client user ID |
| subscription_id | uuid | Related subscription |
| plan_id | uuid | Plan being purchased |
| invoice_number | text | Auto-generated (trigger) |
| amount | numeric | Invoice amount |
| status | text | pending/paid/rejected |
| payment_proof_url | text | Proof upload |
| payment_method | text | Payment method used |
| notes | text | Client notes |
| admin_notes | text | Admin notes |
| due_date | timestamp | Payment due date |
| paid_at | timestamp | Payment timestamp |
| reviewed_at | timestamp | Review timestamp |
| reviewed_by | uuid | Reviewer admin ID |

#### `client_subscription_payments`
Payment records for client subscriptions.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| client_id | uuid | Client user ID |
| subscription_id | uuid | Related subscription |
| plan_id | uuid | Plan purchased |
| amount | numeric | Payment amount |
| status | text | pending/approved/rejected |
| payment_method | text | Method used |
| payment_proof_url | text | Proof URL |
| notes | text | Notes |
| reviewed_at | timestamp | Review time |
| reviewed_by | uuid | Reviewer |

### 6.4 Platform Configuration Tables

#### `platform_config`
Key-value store for platform settings.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| key | text | Setting key (unique) |
| value | jsonb | Setting value |
| updated_at | timestamp | Last update |

**Used for:** maintenance_mode, allow_new_signups, default_trial_days, support_email

#### `platform_payment_methods`
Platform-level payment methods (for clients to pay platform).

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| method_name | text | Display name |
| method_type | text | bank_transfer/crypto/paypal |
| details | jsonb | Account details |
| instructions | text | Payment instructions |
| display_order | integer | Sort order |
| is_active | boolean | Available for use |

### 6.5 Support Tables

#### `audit_logs`
Tracks sensitive operations for compliance.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | Acting user |
| action | text | Action performed |
| resource_type | text | Affected resource type |
| resource_id | uuid | Affected resource ID |
| changes | jsonb | Before/after data |
| ip_address | text | Client IP |
| created_at | timestamp | Event time |

#### `admin_notifications`
Notifications for project admins.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| project_id | uuid | Related project |
| notification_type | text | Type of notification |
| message | text | Notification content |
| reference_type | text | Related entity type |
| reference_id | uuid | Related entity ID |
| is_read | boolean | Read status |
| created_at | timestamp | Created time |

#### `webhook_events`
Idempotency tracking for webhooks.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| event_source | text | 'telegram'/'stripe' |
| event_id | text | External event ID |
| event_type | text | Event type |
| result | jsonb | Processing result |
| processed_at | timestamp | Processing time |

#### `failed_notifications`
Queue for retrying failed notifications.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| subscriber_id | uuid | Target subscriber |
| action | text | Notification action |
| payload | jsonb | Notification data |
| retry_count | integer | Retry attempts |
| max_retries | integer | Max attempts |
| next_retry_at | timestamp | Next retry time |
| processed_at | timestamp | Success time (null if pending) |
| error_message | text | Last error |

#### `rate_limits`
Rate limiting state.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| identifier | text | Rate limit key |
| endpoint | text | Endpoint name |
| request_count | integer | Requests in window |
| window_start | timestamp | Window start time |

### 6.6 Database Functions

| Function | Purpose |
|----------|---------|
| `handle_new_user()` | Trigger: Creates profile, role, trial subscription |
| `check_project_limit()` | Trigger: Enforces max projects per plan |
| `check_subscriber_limit()` | Trigger: Enforces max subscribers per plan |
| `prevent_self_reactivation()` | Trigger: Blocks clients from self-reactivating expired subscriptions |
| `validate_invoice_amount()` | Trigger: Validates invoice amount matches plan price |
| `generate_invoice_number()` | Trigger: Auto-generates invoice numbers |
| `update_updated_at_column()` | Trigger: Updates updated_at on row changes |
| `check_rate_limit(...)` | RPC: Rate limiting logic |
| `process_stripe_payment(...)` | RPC: Atomic payment processing with locking |
| `log_audit_event(...)` | RPC: Audit log insertion |
| `has_role(user_id, role)` | Helper: Checks if user has role (used in RLS) |

---

## 7. Authentication & Authorization

### 7.1 Authentication Architecture

**Provider:** Supabase Auth (JWT-based)

**Supported Methods:**
- Email/Password signup/login
- Password reset via email

**Session Management:**
```typescript
// In useAuth.tsx
supabase.auth.onAuthStateChange((event, session) => {
  setSession(session);
  setUser(session?.user ?? null);
});
```

**Auto-Confirm:** Email auto-confirm is enabled (no email verification required).

### 7.2 Authorization Model

**Three User Types:**

| Role | Table | Access |
|------|-------|--------|
| `super_admin` | user_roles | Full platform access |
| `client` | user_roles | Own projects/subscribers only |
| Anonymous | N/A | Public pages only |

### 7.3 Row-Level Security (RLS) Policies

**CRITICAL:** All tables have RLS enabled. Policies use `auth.uid()` and `has_role()` function.

**Example Policy Pattern:**
```sql
-- Clients see only their own projects
CREATE POLICY "Users can view own projects"
ON projects FOR SELECT
USING (user_id = auth.uid());

-- Super admins see all
CREATE POLICY "Admins can view all projects"
ON projects FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));
```

### 7.4 Frontend Authorization Guards

**1. Route-Level Guard (`DashboardLayout`):**
```typescript
if (isAdmin && !isSuperAdmin) {
  return <Navigate to="/dashboard" />;
}
```

**2. Operation-Level Guard (`useAdminGuard`):**
```typescript
const verifyAdminRole = async () => {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "super_admin")
    .single();
  
  return !!data;
};
```

Used in AdminPayments, AdminSettings for sensitive operations.

### 7.5 Backend Authorization

**Edge Functions:**
1. Parse JWT from Authorization header
2. Validate via `supabase.auth.getUser(token)`
3. Check project ownership: `subscriber.projects.user_id === authResult.userId`

---

## 8. Payment Integration Analysis

### 8.1 Two Payment Paradigms

**Paradigm 1: Platform Payments (Client → Platform)**
- Clients pay SubscribeHub for platform access
- Payment methods: Manual (bank, crypto, PayPal)
- Flow: Upload proof → Admin reviews → Approve/Reject

**Paradigm 2: Subscriber Payments (Subscriber → Client)**
- Subscribers pay for Telegram channel access
- Payment methods: Stripe or Manual
- Flow varies by method (see below)

### 8.2 Stripe Payment Flow (Subscriber)

```
┌─────────────────┐    /start     ┌─────────────────┐
│  Telegram User  │───────────────│  Bot Handler    │
└────────┬────────┘               └────────┬────────┘
         │ select plan                     │
         │ choose Stripe                   │
         ▼                                 ▼
┌─────────────────┐              ┌─────────────────┐
│  Bot Callback   │───────────────│create-checkout  │
└────────┬────────┘              └────────┬────────┘
         │                                 │ Creates session
         │                                 ▼
         │                        ┌─────────────────┐
         │                        │  Stripe API     │
         │                        │  Checkout       │
         │                        └────────┬────────┘
         │                                 │
         │    ◄──── Payment Link ──────────┘
         ▼
┌─────────────────┐
│  User Pays on   │
│  Stripe Checkout│
└────────┬────────┘
         │ Payment complete
         ▼
┌─────────────────┐              ┌─────────────────┐
│ Stripe Webhook  │───────────────│ stripe-webhook  │
│ Event           │              │ Edge Function   │
└─────────────────┘              └────────┬────────┘
                                          │ process_stripe_payment()
                                          │ (atomic with row lock)
                                          ▼
                                 ┌─────────────────┐
                                 │ Update DB       │
                                 │ Send Invite     │
                                 │ via Telegram    │
                                 └─────────────────┘
```

### 8.3 Manual Payment Flow (Subscriber)

```
┌─────────────────┐    /start     ┌─────────────────┐
│  Telegram User  │───────────────│  Bot Handler    │
└────────┬────────┘               └────────┬────────┘
         │ select plan                     │
         │ choose Manual                   │
         ▼                                 ▼
┌─────────────────┐              ┌─────────────────┐
│  Bot shows      │◄─────────────│  Sends payment  │
│  payment info   │              │  instructions   │
└────────┬────────┘              └─────────────────┘
         │ User makes payment externally
         │ User sends photo proof
         ▼
┌─────────────────┐              ┌─────────────────┐
│  Bot receives   │───────────────│  handlePhoto    │
│  photo          │              │  Message        │
└─────────────────┘              └────────┬────────┘
                                          │ Upload to storage
                                          │ Set status="pending_approval"
                                          ▼
┌─────────────────┐              ┌─────────────────┐
│  Admin sees     │◄─────────────│  Notification   │
│  pending proof  │              │  created        │
└────────┬────────┘              └─────────────────┘
         │ Reviews proof
         │ Approves/Rejects
         ▼
┌─────────────────┐              ┌─────────────────┐
│  Frontend       │───────────────│notify-subscriber│
│  action         │              │  Edge Function  │
└─────────────────┘              └────────┬────────┘
                                          │ Creates invite link
                                          │ Sends to user
                                          ▼
                                 ┌─────────────────┐
                                 │ User joins      │
                                 │ channel         │
                                 └─────────────────┘
```

### 8.4 Stripe Connect (Multi-Tenant)

Clients can connect their own Stripe accounts:

**Configuration Fields (in `projects.stripe_config`):**
```json
{
  "enabled": true,
  "stripe_account_id": "acct_xxx",
  "account_name": "Channel Name",
  "webhook_secret": "whsec_xxx",
  "livemode": true
}
```

**OAuth Flow:**
1. Client clicks "Connect Stripe" in project settings
2. `stripe-connect-oauth` generates Stripe OAuth URL
3. Client authorizes on Stripe
4. Callback returns to `stripe-connect-callback`
5. Edge function exchanges code for tokens
6. Stores `stripe_account_id` in project

**Payment Routing:**
- If project has Stripe Connect: Payments go to client's Stripe account
- Platform can take fees via Stripe Connect application fees (NOT IMPLEMENTED)

### 8.5 Platform Payment Flow (Client → Platform)

```
Client → Billing Page → Select Plan → UpgradePlanDialog
                                            │
                                            ▼
                                     Create Invoice
                                     (pending status)
                                            │
                                            ▼
                                     Show Payment Methods
                                     (from platform_payment_methods)
                                            │
                                            ▼
                                     Client Makes Payment
                                     (external transfer)
                                            │
                                            ▼
                                     Upload Proof
                                     (InvoiceProofUpload)
                                            │
                                            ▼
                                     Admin Reviews
                                     (AdminPayments page)
                                            │
                              ┌─────────────┴─────────────┐
                              ▼                           ▼
                         Approve                      Reject
                         (Updates subscription        (Notifies client)
                          to 'active')
```

### 8.6 Revenue Attribution

**Current State:**
- Platform revenue tracked in `client_subscription_payments`
- Subscriber revenue calculated from `subscribers.plans.price` sums
- No direct revenue recording for per-subscriber payments

**LIMITATION:** True financial reporting requires:
- Transaction ledger for each payment
- Stripe fee deductions
- Refund handling
- Multi-currency support

---

## 9. Telegram Bot Integration

### 9.1 Bot Setup Flow

**During Project Creation:**
1. User enters bot token from @BotFather
2. `validate-project-setup` verifies:
   - Bot token is valid (calls getMe)
   - Bot is admin of the channel
   - Can create invite links
3. `setup-telegram-webhook` configures:
   - Webhook URL: `https://<project>.supabase.co/functions/v1/telegram-bot-handler?project_id=<uuid>`
   - Secret token for webhook authentication

### 9.2 Webhook Security

**Secret Token Generation:**
```typescript
function generateWebhookSecret(botToken: string): string {
  let hash = 0;
  for (let i = 0; i < botToken.length; i++) {
    const char = botToken.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `wh_${Math.abs(hash).toString(36)}`;
}
```

**Verification:**
- Telegram sends secret in `X-Telegram-Bot-Api-Secret-Token` header
- Edge function compares against generated secret

### 9.3 Telegram API Rate Limits

The bot handler includes rate limiting:
- 100 requests per minute per project
- Uses database-based rate limit tracking
- Returns 429 if exceeded

### 9.4 Channel Management

**Invite Links:**
- Created via `createChatInviteLink` API
- Single-use (`member_limit: 1`)
- Expires after 7 days

**Kicking Users:**
- `banChatMember` followed by `unbanChatMember`
- Removes access but allows future rejoin
- Handled in expiry checker and notification functions

### 9.5 Message Templates

Messages use HTML formatting:
```typescript
const message = `🎉 <b>Payment Approved!</b>\n\n` +
  `Your subscription to <b>${projectName}</b> has been activated.\n\n` +
  `📦 Plan: <b>${planName}</b>\n` +
  `📅 Expires: <b>${expiryText}</b>`;
```

---

## 10. Admin Dashboard Technical Breakdown

### 10.1 Admin Pages Overview

| Page | Purpose | Key Operations |
|------|---------|----------------|
| AdminOverview | Platform KPIs & charts | Read-only analytics |
| AdminClients | Client management | View clients, their projects, stats |
| AdminPayments | Payment approval | Approve/reject payments, view proofs |
| AdminSettings | Platform config | Manage plans, payment methods, settings |

### 10.2 AdminPayments Workflow

**File: `src/pages/admin/AdminPayments.tsx`**

**Data Fetching:**
```typescript
// Fetch payments with client enrichment
const { data: paymentsData } = await supabase
  .from("client_subscription_payments")
  .select("*")
  .order("created_at", { ascending: false });

// Enrich with profile and plan data
const [profilesRes, plansRes] = await Promise.all([
  supabase.from("profiles").select("user_id, email, full_name").in("user_id", clientIds),
  supabase.from("subscription_plans").select("id, plan_name").in("id", planIds),
]);
```

**Review Action:**
```typescript
const handleReview = async (action: "approve" | "reject") => {
  // CRITICAL: Verify admin role before operation
  const isAdmin = await verifyAdminRole();
  if (!isAdmin) return;

  await supabase
    .from("client_subscription_payments")
    .update({
      status: action === "approve" ? "approved" : "rejected",
      notes: reviewNotes || null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
    })
    .eq("id", selectedPayment.id);

  // Log audit event
  await logAuditEvent({
    action: action === "approve" ? "payment_approved" : "payment_rejected",
    resourceType: "payment",
    resourceId: selectedPayment.id,
  });

  // If approved, update subscription
  if (action === "approve") {
    await supabase
      .from("client_subscriptions")
      .update({ status: "active" })
      .eq("client_id", selectedPayment.client_id);
  }
};
```

### 10.3 AdminSettings Capabilities

**Payment Methods Management:**
- Create/edit/delete platform payment methods
- Configure: bank_transfer, crypto, paypal
- Set display order and active status

**Subscription Plans Management:**
- Create/edit/delete platform plans
- Configure: name, slug, price, limits, features
- Toggle active status

**Platform Settings:**
- Maintenance mode toggle
- New signups toggle
- Default trial days
- Support email

### 10.4 Dangerous Operations & Protections

| Operation | Protection |
|-----------|------------|
| Approve payment | `verifyAdminRole()` check |
| Reject payment | `verifyAdminRole()` check |
| Delete plan | `verifyAdminRole()` + confirm dialog |
| Update settings | `verifyAdminRole()` check |

**MISSING PROTECTION:** Soft-delete for plans (could break existing references).

---

## 11. Business Logic & Edge Cases

### 11.1 Subscription Lifecycle

```
State Machine: Subscriber Status

         ┌─────────────┐
         │   (start)   │
         └──────┬──────┘
                │ User interacts with bot
                ▼
       ┌────────────────┐
       │pending_payment │ ◄──┐
       └───────┬────────┘    │
               │             │ User changes plan
               ├─────────────┘
               │ User selects payment method
    ┌──────────┼──────────┐
    │ Stripe   │          │ Manual
    ▼          │          ▼
(Pay Online)   │   ┌────────────────┐
    │          │   │ awaiting_proof │
    │          │   └───────┬────────┘
    │          │           │ Upload photo
    │          │           ▼
    │          │   ┌────────────────┐
    │          │   │pending_approval│
    │          │   └───────┬────────┘
    │          │           │
    │          │     ┌─────┴─────┐
    │          │     │           │
    │          │ Approve     Reject
    │          │     │           │
    │          │     ▼           ▼
    │          │ ┌──────┐   ┌──────────┐
    │ Webhook  └►│active│   │rejected  │
    └───────────►└──┬───┘   └──────────┘
                    │
                    │ Time passes
                    │
        ┌───────────┴───────────┐
        │           │           │
    3-day       1-day       Expiry
    reminder   reminder    reached
        │           │           │
        │           │           ▼
        │           │      ┌─────────┐
        │           │      │ expired │
        │           │      └─────────┘
        │           │
        └───────────┴──────────────────►
              (Status unchanged, flags set)
```

### 11.2 Plan Limit Enforcement

**Trigger: `check_project_limit()`**
```sql
-- Fires BEFORE INSERT on projects
-- Counts user's existing projects
-- Compares to plan.max_projects
-- Raises exception if limit reached
```

**Trigger: `check_subscriber_limit()`**
```sql
-- Fires BEFORE INSERT on subscribers
-- Counts subscribers across all user's projects
-- Compares to plan.max_subscribers
-- Raises exception if limit reached
```

**EDGE CASE:** If client downgrades, existing over-limit entities remain but new ones blocked.

### 11.3 Subscription Extension Logic

**In `notify-subscriber.ts` (extended action):**
```typescript
// Check if user still in channel
const membershipCheck = await checkChannelMembership(botToken, channelId, chatId);

if (!membershipCheck.isMember) {
  // Generate new invite link
  generatedInviteLink = await createChannelInviteLink(botToken, channelId);
  // Send with rejoin instructions
} else {
  // Just confirm extension
}
```

**In `process_stripe_payment()` database function:**
```sql
IF v_subscriber.status = 'active' AND v_subscriber.expiry_date > NOW() THEN
  -- EXTENSION: Add duration to existing expiry
  v_expiry_date := v_subscriber.expiry_date + (p_duration_days || ' days')::INTERVAL;
ELSE
  -- NEW/REACTIVATION: Start from now
  v_expiry_date := NOW() + (p_duration_days || ' days')::INTERVAL;
END IF;
```

### 11.4 Unhandled Edge Cases

| Scenario | Current Behavior | Risk |
|----------|------------------|------|
| Double Stripe payment | Idempotency key prevents duplicate processing | Low |
| Webhook failure (Stripe) | Stripe retries; idempotency check handles | Low |
| Webhook failure (Telegram) | Secret mismatch returns 401, Telegram stops sending | Medium |
| Bot token revoked | All bot operations fail silently | High |
| Channel deleted | Invite link creation fails, user can't join | High |
| User blocks bot | Messages fail with 403, logged but not handled | Medium |
| Plan deleted while subscribed | Foreign key remains, plan data shows null | Medium |
| Client deletes project | Subscribers orphaned (cascade delete not configured) | High |
| Concurrent payment submissions | Database function uses row locking | Low |
| Timezone issues | All times stored as UTC | Low |

---

## 12. Security Analysis

### 12.1 Security Strengths

1. **Role Separation:** Roles in separate table, not user-editable
2. **RLS Everywhere:** All tables protected by row-level security
3. **JWT Verification:** Edge functions verify tokens before processing
4. **Webhook Authentication:** Telegram webhooks use secret tokens
5. **Stripe Signature Verification:** All Stripe webhooks verify signature
6. **Rate Limiting:** Implemented on telegram-bot-handler and stripe-webhook
7. **Idempotency:** Webhook events tracked to prevent duplicate processing
8. **Audit Logging:** Sensitive operations logged with user ID
9. **Input Sanitization:** User input sanitized in bot handler

### 12.2 Security Weaknesses

| Issue | Severity | Description |
|-------|----------|-------------|
| Bot tokens in plaintext | HIGH | Should be encrypted at rest |
| No CSRF protection | MEDIUM | SPA uses JWT, lower risk |
| Missing content security policy | LOW | XSS risk if user input displayed |
| No rate limiting on login | MEDIUM | Brute force possible |
| Payment proof URLs accessible with signed URL | LOW | 1-year expiry, should be shorter |
| Missing webhook retry signature validation | MEDIUM | Replayed webhooks could be accepted |

### 12.3 RLS Policy Review

**Well-Designed Policies:**
- `projects` - User can only see own projects
- `subscribers` - Via project join, only project owner sees
- `user_roles` - Users can only read own role

**Policies Needing Review:**
- `platform_payment_methods` - Public read may be intentional
- `subscription_plans` - Public read may be intentional
- `platform_config` - Check if all settings should be readable

### 12.4 Secret Management

**Stored in Supabase Edge Function Secrets:**
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_CONNECT_CLIENT_ID`
- `SUPABASE_SERVICE_ROLE_KEY`

**Stored in Database (CONCERN):**
- `projects.bot_token` - Plaintext in database
- `projects.stripe_config.webhook_secret` - Plaintext in JSONB

---

## 13. Technical Debt & Risks

### 13.1 Code Quality Issues

| Issue | Location | Impact |
|-------|----------|--------|
| Underutilized React Query | All pages | Missing caching, optimistic updates |
| Large monolithic edge functions | telegram-bot-handler | Hard to test, maintain |
| Inconsistent error handling | Various | Some errors silently caught |
| Magic numbers | Various | Duration days, retry counts hardcoded |
| Missing TypeScript strict mode | tsconfig | Potential runtime errors |
| No unit tests | Entire codebase | Regression risk |
| No integration tests | Entire codebase | Flow breakage risk |

### 13.2 Architectural Concerns

1. **Tight Coupling:** Bot handler has too many responsibilities
2. **No Event Sourcing:** Payment history not fully traceable
3. **Missing Queuing:** Failed operations should use proper queue (not DB table)
4. **No Caching Layer:** All reads hit database
5. **Single Point of Failure:** One edge function handles all bot logic

### 13.3 Data Integrity Risks

| Risk | Mitigation Status |
|------|-------------------|
| Orphaned subscribers on project delete | ❌ Not handled |
| Inconsistent status after failed kick | ✅ Atomic kick-then-update |
| Double payment credit | ✅ Idempotency + row locking |
| Expired subscription but still in channel | ⚠️ Relies on cron job |
| Rate limit table bloat | ⚠️ Old entries cleaned in function |

### 13.4 Missing Features for Production

1. **Email notifications** - Only Telegram notifications exist
2. **Webhook retry dashboard** - No visibility into failed notifications
3. **Client API access** - No public API for clients
4. **Multi-language support** - English only
5. **Time zone handling in UI** - All dates shown in UTC
6. **Detailed billing reports** - Basic analytics only
7. **Subscription pause/resume** - Not implemented
8. **Proration** - Plan changes don't prorate

---

## 14. Scalability Assessment

### 14.1 Current Bottlenecks

| Component | Limit | Mitigation |
|-----------|-------|------------|
| Telegram API rate limits | 30 messages/second | Exponential backoff |
| Supabase connection pool | Default 15 connections | Monitor, increase if needed |
| Edge function cold starts | ~500ms | Keep-alive not possible |
| Storage bucket throughput | High | Should be adequate |
| Database indexes | Basic | Need composite indexes for common queries |

### 14.2 Scaling Recommendations

**Short-term (100-1000 clients):**
- Add database indexes on common query patterns
- Implement query result caching
- Monitor edge function performance

**Medium-term (1000-10000 clients):**
- Split telegram-bot-handler into microservices
- Implement Redis caching layer
- Add database read replicas
- Consider Telegram Long Polling fallback

**Long-term (10000+ clients):**
- Multi-region deployment
- Sharding by project/client
- Dedicated Telegram bot infrastructure
- Event-driven architecture with message queues

### 14.3 Performance Metrics to Monitor

- Edge function invocation duration
- Database query latency
- Telegram API response times
- Webhook processing backlog
- Failed notification retry queue depth

---

## 15. CTO 30-Day Action Plan

### Week 1: Assessment & Quick Wins

**Day 1-2: Environment Setup**
- [ ] Get access to Supabase dashboard
- [ ] Review production database state
- [ ] Check edge function logs for errors
- [ ] Verify Stripe Connect configuration

**Day 3-5: Security Audit**
- [ ] Audit all RLS policies
- [ ] Implement bot token encryption
- [ ] Add rate limiting to auth endpoints
- [ ] Review and rotate secrets if needed

**Day 6-7: Quick Wins**
- [ ] Add missing database indexes
- [ ] Fix any console errors
- [ ] Update dependencies with security patches

### Week 2: Stability Improvements

**Day 8-10: Error Handling**
- [ ] Implement global error boundary
- [ ] Add structured logging in edge functions
- [ ] Set up error monitoring (Sentry or similar)

**Day 11-14: Testing Foundation**
- [ ] Set up Jest + React Testing Library
- [ ] Write tests for critical hooks (useAuth, useUserRole)
- [ ] Add integration tests for payment flows

### Week 3: Architecture Improvements

**Day 15-17: Refactoring**
- [ ] Split telegram-bot-handler into smaller functions
- [ ] Implement React Query for data fetching
- [ ] Add proper TypeScript strict mode

**Day 18-21: Infrastructure**
- [ ] Set up CI/CD pipeline
- [ ] Add staging environment
- [ ] Implement database backup verification

### Week 4: Production Hardening

**Day 22-25: Monitoring & Alerts**
- [ ] Set up uptime monitoring
- [ ] Configure alerting for failed webhooks
- [ ] Add analytics for business metrics

**Day 26-28: Documentation**
- [ ] Document deployment procedures
- [ ] Create runbooks for common issues
- [ ] Update API documentation

**Day 29-30: Roadmap Planning**
- [ ] Prioritize feature backlog
- [ ] Identify technical debt to address
- [ ] Plan next quarter's technical initiatives

### Critical Risks to Address Immediately

1. **Bot Token Security:** Implement encryption ASAP
2. **Missing Tests:** Any change risks breaking production
3. **Error Visibility:** Set up monitoring before issues occur
4. **Backup Verification:** Ensure data can be restored

### Long-term Architecture Goals

1. Migrate to event-driven architecture
2. Implement proper message queue (not database tables)
3. Add comprehensive API for third-party integrations
4. Consider mobile app or Telegram mini-app

---

## Appendix A: Environment Variables

**Frontend (.env):**
```
VITE_SUPABASE_URL=https://fcmwixdlmbauyznvcfti.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon_key>
VITE_SUPABASE_PROJECT_ID=fcmwixdlmbauyznvcfti
```

**Edge Function Secrets:**
```
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_DB_URL
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_CONNECT_CLIENT_ID
```

---

## Appendix B: API Endpoints

**Edge Functions (via Supabase Functions):**
| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| /telegram-bot-handler | POST | Webhook secret | Telegram webhook |
| /notify-subscriber | POST | JWT | Send notifications |
| /check-expiring-subscriptions | POST | Service key | Cron trigger |
| /retry-failed-notifications | POST | Service key | Cron trigger |
| /create-checkout-session | POST | None (bot) | Create Stripe checkout |
| /stripe-webhook | POST | Stripe signature | Handle Stripe events |
| /stripe-connect-oauth | POST | JWT | Start OAuth flow |
| /stripe-connect-callback | GET | None (redirect) | OAuth callback |
| /setup-telegram-webhook | POST | JWT | Configure bot webhook |
| /validate-project-setup | POST | JWT | Validate bot/channel |
| /check-channel-membership | POST | JWT | Check user in channel |

---

## Appendix C: Database Enums

```sql
-- User roles
CREATE TYPE app_role AS ENUM ('super_admin', 'client');

-- Subscriber status
CREATE TYPE subscriber_status AS ENUM (
  'active',
  'pending_payment',
  'pending_approval',
  'awaiting_proof',
  'expired',
  'rejected',
  'suspended'
);

-- Client subscription status
CREATE TYPE subscription_status AS ENUM (
  'trial',
  'active',
  'pending_payment',
  'expired'
);
```

---

**Document End**

*This document was prepared for technical handoff purposes. For questions, contact the development team.*
