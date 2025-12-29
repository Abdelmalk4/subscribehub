# SubscribeHub Platform Audit

> **Complete Technical Documentation & Code Review**  
> Generated: December 2024  
> Platform Version: 1.0.0

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Technology Stack](#3-technology-stack)
4. [Database Schema](#4-database-schema)
5. [Edge Functions](#5-edge-functions)
6. [Frontend Pages](#6-frontend-pages)
7. [Components Inventory](#7-components-inventory)
8. [Hooks & Utilities](#8-hooks--utilities)
9. [Business Logic](#9-business-logic)
10. [Security Audit](#10-security-audit)
11. [API Integrations](#11-api-integrations)
12. [File-by-File Index](#12-file-by-file-index)
13. [Known Issues & TODOs](#13-known-issues--todos)
14. [Environment Configuration](#14-environment-configuration)

---

## 1. Executive Summary

### Platform Purpose
SubscribeHub is a SaaS platform for managing paid Telegram channel subscriptions. Content creators can:
- Set up Telegram bots to manage channel access
- Define subscription plans with different durations and prices
- Accept payments via Stripe or manual payment methods
- Automatically manage subscriber access (invites, kicks, renewals)
- Track analytics and revenue

### User Types

| User Type | Description | Access Level |
|-----------|-------------|--------------|
| **Super Admin** | Platform owner | Full platform access, client management |
| **Client** | Content creator | Dashboard, projects, subscribers, billing |
| **Subscriber** | End user | Telegram bot interaction only |

### Key Metrics
- **10 Database Tables** with RLS policies
- **8 Edge Functions** for backend logic
- **15+ Frontend Pages** (public + protected)
- **50+ React Components**
- **3 External Integrations** (Telegram, Stripe, Supabase)

---

## 2. Architecture Overview

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SUBSCRIBEHUB PLATFORM                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────┐ │
│  │   FRONTEND (Vite)   │    │   SUPABASE CLOUD    │    │   EXTERNAL APIs │ │
│  │                     │    │                     │    │                 │ │
│  │  ┌───────────────┐  │    │  ┌───────────────┐  │    │  ┌───────────┐  │ │
│  │  │ Landing Page  │  │    │  │   PostgreSQL  │  │    │  │ Telegram  │  │ │
│  │  │ Auth Pages    │  │────│  │   Database    │  │────│  │ Bot API   │  │ │
│  │  │ Dashboard     │  │    │  │   (10 tables) │  │    │  └───────────┘  │ │
│  │  │ Admin Panel   │  │    │  └───────────────┘  │    │                 │ │
│  │  └───────────────┘  │    │                     │    │  ┌───────────┐  │ │
│  │                     │    │  ┌───────────────┐  │    │  │  Stripe   │  │ │
│  │  React 18           │    │  │ Edge Functions│  │────│  │ Payments  │  │ │
│  │  TypeScript         │    │  │  (8 functions)│  │    │  └───────────┘  │ │
│  │  Tailwind CSS       │    │  └───────────────┘  │    │                 │ │
│  │  React Router       │    │                     │    └─────────────────┘ │
│  │  TanStack Query     │    │  ┌───────────────┐  │                        │
│  │  Framer Motion      │    │  │   Storage     │  │                        │
│  └─────────────────────┘    │  │ (payment-proofs)│ │                        │
│                             │  └───────────────┘  │                        │
│                             │                     │                        │
│                             │  ┌───────────────┐  │                        │
│                             │  │  Supabase Auth│  │                        │
│                             │  │  (JWT + RLS)  │  │                        │
│                             │  └───────────────┘  │                        │
│                             └─────────────────────┘                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### User Flow Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                            SUBSCRIBER JOURNEY                                 │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. DISCOVERY          2. SUBSCRIPTION        3. PAYMENT         4. ACCESS  │
│  ───────────          ─────────────────       ──────────         ────────   │
│                                                                              │
│  ┌─────────┐          ┌─────────────┐        ┌──────────┐       ┌────────┐  │
│  │ User    │          │ /start      │        │ Choose   │       │ Get    │  │
│  │ finds   │ ───────> │ command     │ ─────> │ payment  │ ────> │ invite │  │
│  │ bot     │          │ sent        │        │ method   │       │ link   │  │
│  └─────────┘          └─────────────┘        └──────────┘       └────────┘  │
│                              │                     │                  │      │
│                              v                     v                  v      │
│                       ┌─────────────┐        ┌──────────┐       ┌────────┐  │
│                       │ Bot shows   │        │ Manual:  │       │ Join   │  │
│                       │ available   │        │ Upload   │       │ private│  │
│                       │ plans       │        │ proof    │       │ channel│  │
│                       └─────────────┘        ├──────────┤       └────────┘  │
│                              │               │ Stripe:  │             │      │
│                              v               │ Redirect │             v      │
│                       ┌─────────────┐        │ to pay   │       ┌────────┐  │
│                       │ User        │        └──────────┘       │ Access │  │
│                       │ selects     │              │            │ content│  │
│                       │ plan        │              v            └────────┘  │
│                       └─────────────┘        ┌──────────┐                   │
│                                              │ Admin    │                   │
│                                              │ approves │                   │
│                                              │ (manual) │                   │
│                                              └──────────┘                   │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                         SUBSCRIPTION LIFECYCLE                                │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌────────────────┐     ┌────────────────┐     ┌────────────────┐          │
│   │ pending_payment│────>│ awaiting_proof │────>│pending_approval│          │
│   └────────────────┘     └────────────────┘     └────────────────┘          │
│          │                                              │                    │
│          │ (Stripe auto)                                │                    │
│          v                                              v                    │
│   ┌────────────────┐                           ┌────────────────┐           │
│   │     active     │<──────────────────────────│   approved     │           │
│   └────────────────┘                           └────────────────┘           │
│          │                                              │                    │
│          │                                              v                    │
│          │                                     ┌────────────────┐           │
│          │                                     │    rejected    │           │
│          │                                     └────────────────┘           │
│          │                                                                   │
│    ┌─────┴─────┐                                                            │
│    v           v                                                            │
│ ┌──────┐  ┌─────────┐                                                       │
│ │expire│  │suspended│                                                       │
│ └──────┘  └─────────┘                                                       │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Technology Stack

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 18.3.1 | UI framework |
| Vite | Latest | Build tool |
| TypeScript | Latest | Type safety |
| Tailwind CSS | Latest | Styling |
| React Router | 6.30.1 | Routing |
| TanStack Query | 5.83.0 | Data fetching |
| Framer Motion | 12.23.26 | Animations |
| Shadcn/ui | Latest | Component library |
| Recharts | 2.15.4 | Charts |
| React Hook Form | 7.61.1 | Form handling |
| Zod | 3.25.76 | Schema validation |
| Sonner | 1.7.4 | Toast notifications |

### Backend (Supabase/Lovable Cloud)

| Service | Purpose |
|---------|---------|
| PostgreSQL | Database |
| Supabase Auth | Authentication |
| Edge Functions (Deno) | Serverless functions |
| Storage | File storage |
| Row Level Security | Data protection |

### External APIs

| API | Purpose |
|-----|---------|
| Telegram Bot API | Bot messaging, channel management |
| Stripe API | Payment processing |

---

## 4. Database Schema

### Tables Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DATABASE RELATIONSHIPS                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  auth.users (Supabase)                                                      │
│       │                                                                     │
│       ├──────────────┬──────────────┬────────────────┐                     │
│       v              v              v                v                      │
│  ┌─────────┐   ┌──────────┐   ┌───────────┐   ┌────────────────┐          │
│  │profiles │   │user_roles│   │ projects  │   │client_          │          │
│  │         │   │          │   │           │   │subscriptions    │          │
│  └─────────┘   └──────────┘   └─────┬─────┘   └────────────────┘          │
│                                     │                                       │
│                          ┌──────────┼──────────┐                           │
│                          v          v          v                            │
│                     ┌───────┐ ┌───────────┐ (via channel_id)               │
│                     │ plans │ │subscribers│                                 │
│                     └───┬───┘ └───────────┘                                 │
│                         │           │                                       │
│                         └─────┬─────┘                                       │
│                               v                                             │
│                    (plan_id reference)                                      │
│                                                                             │
│  Standalone Tables:                                                         │
│  ┌────────────────────┐  ┌─────────────────────────┐  ┌──────────────────┐ │
│  │ subscription_plans │  │ platform_payment_methods│  │ platform_config  │ │
│  │ (platform pricing) │  │ (payment options)       │  │ (settings)       │ │
│  └────────────────────┘  └─────────────────────────┘  └──────────────────┘ │
│                                                                             │
│  ┌────────────────────────────┐  ┌────────────────────┐                    │
│  │client_subscription_payments│  │  sales_inquiries   │                    │
│  │ (payment history)          │  │ (contact requests) │                    │
│  └────────────────────────────┘  └────────────────────┘                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Table: `profiles`

**Purpose:** Stores user profile information linked to auth.users

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | No | gen_random_uuid() | Primary key |
| `user_id` | uuid | No | - | Reference to auth.users |
| `email` | text | Yes | - | User email |
| `full_name` | text | Yes | - | Display name |
| `avatar_url` | text | Yes | - | Profile picture URL |
| `created_at` | timestamptz | Yes | now() | Creation timestamp |
| `updated_at` | timestamptz | Yes | now() | Last update timestamp |

**RLS Policies:**
- ✅ Users can view own profile
- ✅ Users can update own profile
- ✅ Users can insert own profile
- ✅ Super admins can view all profiles
- ❌ No DELETE policy (intentional)

---

### Table: `user_roles`

**Purpose:** Role-based access control (RBAC)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | No | gen_random_uuid() | Primary key |
| `user_id` | uuid | No | - | Reference to auth.users |
| `role` | app_role | No | 'client' | Enum: 'super_admin' \| 'client' |
| `created_at` | timestamptz | Yes | now() | Creation timestamp |

**RLS Policies:**
- ✅ Users can view own roles
- ✅ Super admins can view all roles
- ❌ No INSERT/UPDATE/DELETE (roles assigned via trigger)

**Trigger:** `handle_new_user()` automatically assigns roles on signup

---

### Table: `projects`

**Purpose:** Telegram channel/bot configurations owned by clients

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | No | gen_random_uuid() | Primary key |
| `user_id` | uuid | No | - | Owner (client) |
| `project_name` | text | No | - | Display name |
| `bot_token` | text | No | - | Telegram bot token |
| `channel_id` | text | No | - | Telegram channel ID |
| `admin_telegram_id` | bigint | Yes | - | Admin's Telegram user ID |
| `admin_username` | text | Yes | - | Admin's Telegram username |
| `support_contact` | text | Yes | - | Support contact info |
| `status` | text | Yes | 'active' | Project status |
| `stripe_config` | jsonb | Yes | {"enabled": false} | Stripe settings |
| `manual_payment_config` | jsonb | Yes | {"enabled": true, "instructions": ""} | Manual payment settings |
| `created_at` | timestamptz | Yes | now() | Creation timestamp |
| `updated_at` | timestamptz | Yes | now() | Last update timestamp |

**JSONB Structure - `stripe_config`:**
```json
{
  "enabled": boolean,
  "secret_key": string (optional)
}
```

**JSONB Structure - `manual_payment_config`:**
```json
{
  "enabled": boolean,
  "instructions": string
}
```

**RLS Policies:**
- ✅ Users can view own projects
- ✅ Users can insert own projects
- ✅ Users can update own projects
- ✅ Users can delete own projects
- ✅ Super admins can view all projects

---

### Table: `plans`

**Purpose:** Subscription plans for each project

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | No | gen_random_uuid() | Primary key |
| `project_id` | uuid | No | - | FK to projects |
| `plan_name` | text | No | - | Plan display name |
| `description` | text | Yes | - | Plan description |
| `price` | numeric | No | - | Price amount |
| `currency` | text | Yes | 'USD' | Currency code |
| `duration_days` | integer | No | - | Subscription duration |
| `stripe_price_id` | text | Yes | - | Stripe price ID |
| `is_active` | boolean | Yes | true | Plan availability |
| `created_at` | timestamptz | Yes | now() | Creation timestamp |

**RLS Policies:**
- ✅ Project owners can manage plans
- ✅ Super admins can view all plans

---

### Table: `subscribers`

**Purpose:** Channel subscribers and their subscription status

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | No | gen_random_uuid() | Primary key |
| `project_id` | uuid | No | - | FK to projects |
| `telegram_user_id` | bigint | No | - | Telegram user ID |
| `username` | text | Yes | - | Telegram username |
| `first_name` | text | Yes | - | Telegram first name |
| `plan_id` | uuid | Yes | - | FK to plans |
| `status` | subscriber_status | No | 'pending_payment' | Current status |
| `start_date` | timestamptz | Yes | - | Subscription start |
| `expiry_date` | timestamptz | Yes | - | Subscription end |
| `invite_link` | text | Yes | - | Unique invite link |
| `payment_method` | text | Yes | - | 'manual' \| 'stripe' |
| `payment_proof_url` | text | Yes | - | Payment proof image |
| `notes` | text | Yes | - | Admin notes |
| `rejection_reason` | text | Yes | - | Why rejected |
| `channel_joined` | boolean | Yes | false | Has joined channel |
| `channel_joined_at` | timestamptz | Yes | - | When joined |
| `channel_membership_status` | text | Yes | 'unknown' | Current membership |
| `last_membership_check` | timestamptz | Yes | - | Last check time |
| `expiry_reminder_sent` | boolean | Yes | false | 3-day reminder sent |
| `final_reminder_sent` | boolean | Yes | false | 1-day reminder sent |
| `approved_by_admin_id` | uuid | Yes | - | Who approved |
| `suspended_by` | uuid | Yes | - | Who suspended |
| `suspended_at` | timestamptz | Yes | - | When suspended |
| `created_at` | timestamptz | Yes | now() | Creation timestamp |
| `updated_at` | timestamptz | Yes | now() | Last update timestamp |

**Status Enum (`subscriber_status`):**
- `pending_payment` - Awaiting payment selection
- `awaiting_proof` - Manual payment, needs proof upload
- `pending_approval` - Proof uploaded, needs admin review
- `active` - Subscription active, has channel access
- `expired` - Subscription ended
- `rejected` - Payment/subscription rejected
- `suspended` - Manually suspended by admin

**RLS Policies:**
- ✅ Project owners can manage subscribers
- ✅ Super admins can view all subscribers

---

### Table: `subscription_plans`

**Purpose:** Platform-level pricing plans (for clients)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | No | gen_random_uuid() | Primary key |
| `plan_name` | text | No | - | Plan name |
| `plan_slug` | text | No | - | URL-safe identifier |
| `price` | numeric | No | 0 | Monthly price |
| `billing_cycle` | text | Yes | 'monthly' | Billing frequency |
| `max_projects` | integer | No | 1 | Project limit |
| `max_subscribers` | integer | No | 20 | Subscriber limit |
| `features` | jsonb | Yes | {} | Feature flags |
| `is_active` | boolean | Yes | true | Plan availability |
| `created_at` | timestamptz | Yes | now() | Creation timestamp |

**RLS Policies:**
- ✅ Anyone can view active plans
- ✅ Super admins can manage plans

---

### Table: `client_subscriptions`

**Purpose:** Client subscription to platform plans

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | No | gen_random_uuid() | Primary key |
| `client_id` | uuid | No | - | FK to auth.users |
| `plan_id` | uuid | Yes | - | FK to subscription_plans |
| `status` | subscription_status | Yes | 'trial' | Current status |
| `trial_ends_at` | timestamptz | Yes | - | Trial end date |
| `current_period_start` | timestamptz | Yes | - | Billing period start |
| `current_period_end` | timestamptz | Yes | - | Billing period end |
| `created_at` | timestamptz | Yes | now() | Creation timestamp |

**Status Enum (`subscription_status`):**
- `trial` - Free trial period
- `active` - Paid subscription
- `pending_payment` - Payment needed
- `expired` - Subscription ended

**RLS Policies:**
- ✅ Users can view own subscription
- ✅ Users can insert own subscription
- ✅ Users can update own subscription
- ✅ Super admins can manage all subscriptions

---

### Table: `client_subscription_payments`

**Purpose:** Payment history for client subscriptions

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | No | gen_random_uuid() | Primary key |
| `client_id` | uuid | No | - | FK to auth.users |
| `subscription_id` | uuid | Yes | - | FK to client_subscriptions |
| `plan_id` | uuid | Yes | - | FK to subscription_plans |
| `amount` | numeric | No | - | Payment amount |
| `payment_method` | text | Yes | - | Payment method used |
| `payment_proof_url` | text | Yes | - | Proof image URL |
| `status` | text | Yes | 'pending' | Payment status |
| `notes` | text | Yes | - | Admin notes |
| `reviewed_by` | uuid | Yes | - | Admin who reviewed |
| `reviewed_at` | timestamptz | Yes | - | Review timestamp |
| `created_at` | timestamptz | Yes | now() | Creation timestamp |

**RLS Policies:**
- ✅ Users can view own payments
- ✅ Users can insert own payments
- ✅ Super admins can manage all payments

---

### Table: `platform_payment_methods`

**Purpose:** Available payment methods for manual payments

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | No | gen_random_uuid() | Primary key |
| `method_name` | text | No | - | Display name |
| `method_type` | text | No | - | Type identifier |
| `details` | jsonb | No | {} | Payment details |
| `instructions` | text | Yes | - | Payment instructions |
| `display_order` | integer | Yes | 0 | Sort order |
| `is_active` | boolean | Yes | true | Availability |
| `created_at` | timestamptz | Yes | now() | Creation timestamp |
| `updated_at` | timestamptz | Yes | now() | Last update timestamp |

**RLS Policies:**
- ✅ Anyone can view active payment methods
- ✅ Super admins can manage payment methods

---

### Table: `platform_config`

**Purpose:** Platform-wide configuration settings

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | No | gen_random_uuid() | Primary key |
| `key` | text | No | - | Config key |
| `value` | jsonb | No | - | Config value |
| `updated_at` | timestamptz | Yes | now() | Last update timestamp |

**RLS Policies:**
- ✅ Super admins only (full access)

---

### Table: `sales_inquiries`

**Purpose:** Enterprise/sales contact form submissions

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | No | gen_random_uuid() | Primary key |
| `user_id` | uuid | Yes | - | Logged-in user (optional) |
| `name` | text | No | - | Contact name |
| `email` | text | No | - | Contact email |
| `company` | text | Yes | - | Company name |
| `message` | text | Yes | - | Inquiry message |
| `plan_interest` | text | Yes | 'unlimited' | Interested plan |
| `status` | text | Yes | 'pending' | Inquiry status |
| `responded_at` | timestamptz | Yes | - | Response timestamp |
| `created_at` | timestamptz | No | now() | Creation timestamp |

**RLS Policies:**
- ✅ Users can insert inquiries (with or without auth)
- ✅ Users can view own inquiries
- ✅ Super admins can manage all inquiries

---

### Database Functions

#### `has_role(_user_id uuid, _role app_role)`
**Purpose:** Check if user has specific role  
**Returns:** boolean  
**Security:** SECURITY DEFINER  
**Used in:** RLS policies for admin access

```sql
SELECT EXISTS (
  SELECT 1
  FROM public.user_roles
  WHERE user_id = _user_id AND role = _role
)
```

#### `handle_new_user()`
**Purpose:** Auto-setup for new users  
**Trigger:** AFTER INSERT ON auth.users  
**Actions:**
1. Creates profile record
2. Assigns role (super_admin for admin@subscribehub.com, client for others)
3. Creates trial subscription (14 days)

#### `update_updated_at_column()`
**Purpose:** Auto-update `updated_at` timestamps  
**Used on:** projects table

---

### Storage Buckets

| Bucket | Public | Purpose |
|--------|--------|---------|
| `payment-proofs` | No | Store payment proof images |

---

## 5. Edge Functions

### Function Inventory

| Function | Auth Required | Webhook | Purpose |
|----------|---------------|---------|---------|
| `telegram-bot-handler` | Custom (webhook secret) | Yes | Handle Telegram bot updates |
| `notify-subscriber` | JWT or Service Key | No | Send notifications to subscribers |
| `check-channel-membership` | JWT or Service Key | No | Verify channel membership |
| `check-expiring-subscriptions` | None (cron) | No | Process expirations |
| `validate-project-setup` | None | No | Validate bot/channel setup |
| `setup-telegram-webhook` | None | No | Configure Telegram webhook |
| `create-checkout-session` | None | No | Create Stripe checkout |
| `stripe-webhook` | Stripe signature | Yes | Handle Stripe events |

---

### Function: `telegram-bot-handler`

**File:** `supabase/functions/telegram-bot-handler/index.ts`  
**Lines:** ~1014  
**Purpose:** Main webhook handler for Telegram bot interactions

**Authentication:**
- Uses custom webhook secret derived from bot token
- Validates `X-Telegram-Bot-Api-Secret-Token` header

**Endpoints/Commands:**
| Command | Description |
|---------|-------------|
| `/start` | Begin subscription flow, show plans |
| `/status` | Show current subscription status |
| `/renew` | Extend subscription |
| `/help` | Show available commands |

**Callback Handlers:**
| Callback | Description |
|----------|-------------|
| `select_plan:*` | Plan selection |
| `pay_manual` | Choose manual payment |
| `pay_stripe` | Redirect to Stripe |

**Key Functions:**
```typescript
// Message routing
handleTextMessage(message, project, supabase)
handleCallbackQuery(callbackQuery, project, supabase)
handlePhotoMessage(message, project, supabase)

// Command handlers
handleStart(chatId, userId, project, supabase, ...)
handleStatus(chatId, userId, project, supabase)
handleRenew(chatId, userId, project, supabase)
handleHelp(chatId, botToken)

// Payment handling
handlePlanSelection(callbackQuery, project, supabase, planId)
handlePaymentMethod(callbackQuery, project, supabase, method)

// Utilities
sendTelegramMessage(botToken, chatId, text, replyMarkup?)
uploadPaymentProof(file, supabase, projectId, subscriberId)
```

**Security Measures:**
- Webhook secret validation
- Input sanitization (100 char limit on text)
- UUID validation
- File size limits (5MB max)

---

### Function: `notify-subscriber`

**File:** `supabase/functions/notify-subscriber/index.ts`  
**Lines:** ~533  
**Purpose:** Send action notifications to subscribers

**Authentication:**
- JWT token OR service role key required
- Validates project ownership

**Request Body:**
```typescript
{
  subscriber_id: string;
  action: "approved" | "rejected" | "expired" | "suspended" | "reactivated" | 
          "extended" | "kicked" | "reminder";
  duration_days?: number;
  reason?: string;
}
```

**Actions:**
| Action | Telegram Message | Additional Actions |
|--------|------------------|-------------------|
| `approved` | Welcome + invite link | Creates invite link if needed |
| `rejected` | Rejection notice + reason | - |
| `expired` | Expiration notice | - |
| `suspended` | Suspension notice | Kicks from channel |
| `reactivated` | Welcome back + new link | Creates new invite link |
| `extended` | Extension confirmation | - |
| `kicked` | Removal notice | Kicks from channel |
| `reminder` | Expiry reminder | - |

---

### Function: `check-channel-membership`

**File:** `supabase/functions/check-channel-membership/index.ts`  
**Lines:** ~100  
**Purpose:** Verify subscriber's channel membership status

**Authentication:**
- JWT token or service role key
- Project ownership validation

**Request Body:**
```typescript
{
  project_id: string;
  subscriber_id: string;
}
```

**Response:**
```typescript
{
  success: boolean;
  membership_status: "member" | "left" | "kicked" | "unknown";
  subscriber: { ... };
}
```

**Telegram API Used:**
- `getChatMember` - Check membership status

---

### Function: `check-expiring-subscriptions`

**File:** `supabase/functions/check-expiring-subscriptions/index.ts`  
**Lines:** ~330  
**Purpose:** Cron job for subscription lifecycle management

**Authentication:** None (should be scheduled/protected)

**Actions:**
1. **3-day warning:** Send reminder to subscribers expiring in 3 days
2. **1-day warning:** Send final reminder to subscribers expiring tomorrow
3. **Expired processing:** 
   - Update status to 'expired'
   - Kick from channel
   - Send expiration notice

**Database Updates:**
- Sets `expiry_reminder_sent = true`
- Sets `final_reminder_sent = true`
- Sets `status = 'expired'`

---

### Function: `validate-project-setup`

**File:** `supabase/functions/validate-project-setup/index.ts`  
**Lines:** ~200  
**Purpose:** Validate bot token and channel configuration

**Authentication:** None (public)

**Request Body:**
```typescript
{
  bot_token: string;
  channel_id: string;
}
```

**Validation Steps:**
1. Validate bot token format
2. Call Telegram `getMe` to verify bot
3. Call Telegram `getChat` to verify channel
4. Call Telegram `getChatMember` to check bot is admin

**Response:**
```typescript
{
  success: boolean;
  bot_info?: { id, username, first_name };
  channel_info?: { id, title, type };
  error?: string;
  step?: "bot" | "channel" | "admin";
}
```

---

### Function: `setup-telegram-webhook`

**File:** `supabase/functions/setup-telegram-webhook/index.ts`  
**Lines:** ~103  
**Purpose:** Configure Telegram webhook for a project

**Authentication:** None (⚠️ should require auth)

**Request Body:**
```typescript
{
  bot_token: string;
  project_id: string;
}
```

**Actions:**
1. Generate webhook secret from bot token
2. Call Telegram `setWebhook` with:
   - URL: `${SUPABASE_URL}/functions/v1/telegram-bot-handler?project_id=${project_id}`
   - Secret token for authentication
   - Allowed updates: `message`, `callback_query`
3. Verify webhook with `getWebhookInfo`

---

### Function: `create-checkout-session`

**File:** `supabase/functions/create-checkout-session/index.ts`  
**Lines:** ~123  
**Purpose:** Create Stripe checkout session for subscription payment

**Authentication:** None (⚠️ should require auth)

**Request Body:**
```typescript
{
  project_id: string;
  plan_id: string;
  subscriber_id: string;
  telegram_user_id: number;
}
```

**Stripe Session Configuration:**
- Mode: `payment` (one-time)
- Success URL: `https://t.me/?payment=success`
- Cancel URL: `https://t.me/?payment=cancelled`
- Metadata: project_id, plan_id, subscriber_id, telegram_user_id

---

### Function: `stripe-webhook`

**File:** `supabase/functions/stripe-webhook/index.ts`  
**Lines:** ~258  
**Purpose:** Handle Stripe webhook events

**Authentication:** Stripe signature verification

**Handled Events:**
| Event | Action |
|-------|--------|
| `checkout.session.completed` | Activate subscription, send invite |

**On Successful Payment:**
1. Fetch subscriber and project data
2. Calculate new expiry date (extends existing if active)
3. Generate channel invite link
4. Update subscriber status to 'active'
5. Send confirmation message via Telegram

---

## 6. Frontend Pages

### Public Pages

#### Landing Page (`/`)
**File:** `src/pages/Landing.tsx`

**Sections:**
| Component | Purpose |
|-----------|---------|
| `LandingNavbar` | Navigation with auth links |
| `HeroSection` | Main value proposition |
| `SocialProofSection` | Trust indicators |
| `FeaturesSection` | Feature showcase |
| `HowItWorksSection` | Process explanation |
| `TestimonialsSection` | User testimonials |
| `PricingSection` | Plan comparison |
| `FAQSection` | Common questions |
| `CTABanner` | Final call-to-action |
| `Footer` | Site links |

**Features:**
- Smooth scroll navigation
- Animated sections (Framer Motion)
- Responsive design
- Contact sales dialog

---

#### Login Page (`/login`)
**File:** `src/pages/auth/Login.tsx`

**Features:**
- Email/password authentication
- Form validation (React Hook Form + Zod)
- Error handling with toast
- Redirect to dashboard on success
- Link to signup and forgot password

---

#### Signup Page (`/signup`)
**File:** `src/pages/auth/Signup.tsx`

**Features:**
- Full name, email, password fields
- Password confirmation
- Form validation
- Auto-login after signup
- Link to login

---

#### Forgot Password (`/forgot-password`)
**File:** `src/pages/auth/ForgotPassword.tsx`

**Features:**
- Email input for password reset
- Reset link sent via Supabase Auth
- Success confirmation

---

#### Reset Password (`/reset-password`)
**File:** `src/pages/auth/ResetPassword.tsx`

**Features:**
- New password input
- Password confirmation
- Token validation from URL

---

### Client Dashboard (Protected)

#### Dashboard (`/dashboard`)
**File:** `src/pages/Dashboard.tsx`

**KPI Cards:**
| Metric | Source | Calculation |
|--------|--------|-------------|
| Total Subscribers | subscribers table | Count all |
| Active Subscribers | subscribers table | Count where status='active' |
| Pending Approval | subscribers table | Count where status='pending_approval' |
| Revenue | subscribers + plans | Sum of plan prices for active |

**Quick Actions:**
- Add New Subscriber
- View Pending Approvals
- Manage Projects

**Recent Subscribers Table:**
- Shows last 5 subscribers
- Status badge
- Plan name
- Quick view link

---

#### Projects (`/projects`)
**File:** `src/pages/Projects.tsx`

**Features:**
- Project cards with stats
- Create project dialog
- Edit project dialog
- Plans management dialog
- Delete project
- Status indicators

**Project Card Displays:**
- Project name
- Bot token (masked)
- Channel ID
- Active subscribers count
- Plan count
- Created date

---

#### Subscribers (`/subscribers`)
**File:** `src/pages/Subscribers.tsx`  
**Lines:** ~1158

**Features:**
- Tabbed interface (All / Active / Pending)
- Search by username/name
- Filter by project
- Filter by status
- Bulk actions (planned)
- Subscriber details side sheet

**Subscriber Table Columns:**
| Column | Description |
|--------|-------------|
| User | Username + first name |
| Project | Project name |
| Plan | Plan name |
| Status | Status badge |
| Channel Status | Membership badge |
| Expiry | Expiry date |
| Actions | View details button |

**Subscriber Details Sheet:**
- Full subscriber info
- Action buttons by status
- Extend subscription
- Approve/Reject
- Suspend/Reactivate
- Kick from channel
- Notes section
- Payment proof display

---

#### Analytics (`/analytics`)
**File:** `src/pages/Analytics.tsx`

**Charts:**
| Chart | Type | Data |
|-------|------|------|
| Revenue Over Time | Line | Monthly revenue |
| Subscribers by Status | Bar | Status distribution |
| Projects | Bar | Subscribers per project |

**Metrics:**
- Total revenue
- Average subscription value
- Subscriber growth rate
- Retention rate

---

#### Billing (`/billing`)
**File:** `src/pages/Billing.tsx`

**Features:**
- Current plan display
- Usage meters (projects, subscribers)
- Plan upgrade options
- Payment history table
- Contact sales dialog

---

#### Settings (`/settings`)
**File:** `src/pages/Settings.tsx`

**Sections:**
| Section | Features |
|---------|----------|
| Profile | Update name, email, avatar |
| Password | Change password |
| Notifications | Email preferences (UI only) |
| Danger Zone | Delete account (placeholder) |

---

### Super Admin Pages (Protected)

#### Admin Overview (`/admin`)
**File:** `src/pages/admin/AdminOverview.tsx`

**Metrics:**
- Total clients
- Total revenue
- Active subscriptions
- Platform health

---

#### Admin Clients (`/admin/clients`)
**File:** `src/pages/admin/AdminClients.tsx`

**Features:**
- All clients table
- Subscription status
- Plan info
- Actions (view, manage)

---

#### Admin Payments (`/admin/payments`)
**File:** `src/pages/admin/AdminPayments.tsx`

**Features:**
- All payments table
- Approve/reject payments
- Payment proof viewing
- Notes

---

#### Admin Settings (`/admin/settings`)
**File:** `src/pages/admin/AdminSettings.tsx`

**Features:**
- Platform configuration
- Payment methods management
- Subscription plans management

---

### 404 Page
**File:** `src/pages/NotFound.tsx`

**Features:**
- Friendly error message
- Return home link
- Animated illustration

---

## 7. Components Inventory

### Layout Components

| Component | File | Purpose |
|-----------|------|---------|
| `DashboardLayout` | `src/components/layout/DashboardLayout.tsx` | Protected layout with sidebar |
| `AuthLayout` | `src/components/layout/AuthLayout.tsx` | Auth pages wrapper |
| `Sidebar` | `src/components/layout/Sidebar.tsx` | Navigation sidebar |

**DashboardLayout Features:**
- Authentication check
- Role-based routing
- Responsive sidebar
- Page transitions

**Sidebar Features:**
- User info display
- Navigation links
- Role-based menu items
- Sign out button
- Mobile responsive (sheet)

---

### Landing Components

| Component | File | Purpose |
|-----------|------|---------|
| `LandingNavbar` | `src/components/landing/LandingNavbar.tsx` | Top navigation |
| `HeroSection` | `src/components/landing/HeroSection.tsx` | Hero banner |
| `SocialProofSection` | `src/components/landing/SocialProofSection.tsx` | Trust badges |
| `FeaturesSection` | `src/components/landing/FeaturesSection.tsx` | Feature grid |
| `HowItWorksSection` | `src/components/landing/HowItWorksSection.tsx` | Process steps |
| `TestimonialsSection` | `src/components/landing/TestimonialsSection.tsx` | Reviews |
| `PricingSection` | `src/components/landing/PricingSection.tsx` | Pricing cards |
| `FAQSection` | `src/components/landing/FAQSection.tsx` | FAQ accordion |
| `CTABanner` | `src/components/landing/CTABanner.tsx` | Final CTA |
| `Footer` | `src/components/landing/Footer.tsx` | Site footer |

---

### Project Components

| Component | File | Purpose |
|-----------|------|---------|
| `CreateProjectDialog` | `src/components/projects/CreateProjectDialog.tsx` | New project form |
| `EditProjectDialog` | `src/components/projects/EditProjectDialog.tsx` | Edit project |
| `PlansDialog` | `src/components/projects/PlansDialog.tsx` | Manage plans |

**CreateProjectDialog Steps:**
1. Bot token input + validation
2. Channel ID input + validation
3. Admin Telegram ID (optional)
4. Support contact (optional)
5. Webhook setup

---

### Subscriber Components

| Component | File | Purpose |
|-----------|------|---------|
| `SubscriberDetails` | `src/components/subscribers/SubscriberDetails.tsx` | Detail side sheet |
| `AddSubscriberDialog` | `src/components/subscribers/AddSubscriberDialog.tsx` | Manual add |
| `PaymentProofUpload` | `src/components/subscribers/PaymentProofUpload.tsx` | Proof upload |

**SubscriberDetails Actions:**
| Action | Available When | API Call |
|--------|----------------|----------|
| Approve | pending_approval, awaiting_proof | notify-subscriber (approved) |
| Reject | pending_approval, awaiting_proof | notify-subscriber (rejected) |
| Extend | active | notify-subscriber (extended) |
| Suspend | active | notify-subscriber (suspended) |
| Reactivate | suspended, rejected | notify-subscriber (reactivated) |
| Kick | active | notify-subscriber (kicked) |
| Check Membership | active | check-channel-membership |

---

### Billing Components

| Component | File | Purpose |
|-----------|------|---------|
| `ContactSalesDialog` | `src/components/billing/ContactSalesDialog.tsx` | Sales inquiry form |

---

### Admin Components

| Component | File | Purpose |
|-----------|------|---------|
| `PaymentMethodsManager` | `src/components/admin/PaymentMethodsManager.tsx` | Manage payment methods |

---

### UI Components (Shadcn)

All Shadcn components in `src/components/ui/`:

| Component | Purpose |
|-----------|---------|
| `accordion` | Collapsible sections |
| `alert-dialog` | Confirmation dialogs |
| `alert` | Alert messages |
| `avatar` | User avatars |
| `badge` | Status badges |
| `button` | Buttons |
| `calendar` | Date picker |
| `card` | Card containers |
| `checkbox` | Checkboxes |
| `dialog` | Modal dialogs |
| `dropdown-menu` | Dropdown menus |
| `form` | Form components |
| `input` | Text inputs |
| `label` | Form labels |
| `popover` | Popovers |
| `progress` | Progress bars |
| `scroll-area` | Scrollable areas |
| `select` | Select dropdowns |
| `separator` | Visual separators |
| `sheet` | Slide-out panels |
| `skeleton` | Loading skeletons |
| `switch` | Toggle switches |
| `table` | Data tables |
| `tabs` | Tab navigation |
| `textarea` | Text areas |
| `toast` | Toast notifications |
| `tooltip` | Tooltips |

---

### Other Components

| Component | File | Purpose |
|-----------|------|---------|
| `NavLink` | `src/components/NavLink.tsx` | Navigation link with active state |
| `PageTransition` | `src/components/PageTransition.tsx` | Page transition animation |

---

## 8. Hooks & Utilities

### Custom Hooks

#### `useAuth`
**File:** `src/hooks/useAuth.tsx`

**Provides:**
```typescript
{
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email, password) => Promise<{ error: Error | null }>;
  signUp: (email, password, fullName) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}
```

**Usage:**
```tsx
const { user, signIn, signOut } = useAuth();
```

---

#### `useUserRole`
**File:** `src/hooks/useUserRole.tsx`

**Provides:**
```typescript
{
  role: "super_admin" | "client" | null;
  loading: boolean;
  isAdmin: boolean;
  isClient: boolean;
}
```

**Usage:**
```tsx
const { isAdmin, isClient } = useUserRole();
```

---

#### `useMobile`
**File:** `src/hooks/use-mobile.tsx`

**Purpose:** Detect mobile viewport

**Returns:** `boolean` (true if width < 768px)

---

#### `useToast`
**File:** `src/hooks/use-toast.ts`

**Purpose:** Toast notification management

**Usage:**
```tsx
const { toast } = useToast();
toast({ title: "Success", description: "Action completed" });
```

---

### Utilities

#### `cn()` - Class Name Merger
**File:** `src/lib/utils.ts`

```typescript
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

**Usage:**
```tsx
<div className={cn("base-class", conditional && "conditional-class")} />
```

---

## 9. Business Logic

### Subscriber Status Flow

```
                            ┌─────────────────────────────────┐
                            │          NEW USER               │
                            │     (via /start command)        │
                            └─────────────┬───────────────────┘
                                          │
                                          v
                            ┌─────────────────────────────────┐
                            │       pending_payment           │
                            │  (waiting to select payment)    │
                            └─────────────┬───────────────────┘
                                          │
                       ┌──────────────────┴──────────────────┐
                       │                                      │
                       v                                      v
        ┌──────────────────────────┐           ┌──────────────────────────┐
        │     MANUAL PAYMENT       │           │     STRIPE PAYMENT       │
        │                          │           │                          │
        │  ┌────────────────────┐  │           │  ┌────────────────────┐  │
        │  │   awaiting_proof   │  │           │  │  Stripe Checkout   │  │
        │  │ (needs to upload)  │  │           │  │   (redirected)     │  │
        │  └─────────┬──────────┘  │           │  └─────────┬──────────┘  │
        │            │             │           │            │             │
        │            v             │           │            │             │
        │  ┌────────────────────┐  │           │            │             │
        │  │ pending_approval   │  │           │            │             │
        │  │ (admin reviews)    │  │           │            │             │
        │  └─────────┬──────────┘  │           │            │             │
        │            │             │           │            │             │
        └────────────┼─────────────┘           └────────────┼─────────────┘
                     │                                      │
                     │ APPROVED                             │ PAID
                     │                                      │
                     └──────────────────┬───────────────────┘
                                        │
                                        v
                          ┌─────────────────────────────────┐
                          │            active               │
                          │   (has channel access)          │
                          └─────────────┬───────────────────┘
                                        │
              ┌─────────────────────────┼─────────────────────────┐
              │                         │                         │
              v                         v                         v
   ┌───────────────────┐    ┌───────────────────┐    ┌───────────────────┐
   │     EXPIRED       │    │    SUSPENDED      │    │     RENEWED       │
   │ (auto on expiry)  │    │ (admin action)    │    │ (extend action)   │
   │                   │    │                   │    │                   │
   │ - kicked from     │    │ - kicked from     │    │ - new expiry set  │
   │   channel         │    │   channel         │    │ - stays active    │
   │ - notified        │    │ - can reactivate  │    │                   │
   └───────────────────┘    └───────────────────┘    └───────────────────┘
```

### Allowed Actions Matrix

| Current Status | Approve | Reject | Extend | Suspend | Reactivate | Kick |
|----------------|---------|--------|--------|---------|------------|------|
| pending_payment | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| awaiting_proof | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| pending_approval | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| active | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ |
| expired | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| suspended | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| rejected | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |

### Subscription Extension Logic

**From `stripe-webhook` and `notify-subscriber`:**

```typescript
// Calculate new expiry date
let newExpiryDate: Date;
const currentExpiry = subscriber.expiry_date 
  ? new Date(subscriber.expiry_date) 
  : null;

if (currentExpiry && currentExpiry > now && subscriber.status === 'active') {
  // EXTEND from current expiry (not from today)
  newExpiryDate = addDays(currentExpiry, durationDays);
} else {
  // NEW subscription starts from today
  newExpiryDate = addDays(now, durationDays);
}
```

### Channel Membership Management

**Invite Link Generation:**
```typescript
// Creates unique, single-use invite link
const inviteLink = await createChannelInviteLink(
  botToken,
  channelId,
  subscriberName
);

// Link format: t.me/+XXXXXXXXX
// Expires after use or timeout
```

**Kick from Channel:**
```typescript
// Two-step process: ban then unban
// This removes from channel but allows rejoin with new invite
await kickFromChannel(botToken, channelId, telegramUserId);
```

### Automatic Expiration Processing

**Cron Job Schedule:** (should be configured externally)

```
┌─────────────────────────────────────────────────────────────┐
│                  EXPIRATION TIMELINE                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Day -3          Day -1           Day 0 (Expiry)           │
│    │               │                 │                      │
│    v               v                 v                      │
│ ┌───────┐     ┌─────────┐     ┌──────────┐                 │
│ │ 3-day │     │ Final   │     │ Expire   │                 │
│ │ warn  │     │ warning │     │ & kick   │                 │
│ └───────┘     └─────────┘     └──────────┘                 │
│                                                             │
│ Sets:          Sets:           Sets:                        │
│ expiry_        final_          status='expired'             │
│ reminder_      reminder_       Kicks from channel           │
│ sent=true      sent=true       Sends notification           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 10. Security Audit

### Authentication & Authorization

| Layer | Implementation | Status |
|-------|----------------|--------|
| Frontend Auth | Supabase Auth (JWT) | ✅ Secure |
| Route Protection | AuthProvider + ProtectedRoute | ✅ Secure |
| Role-Based Access | useUserRole hook | ✅ Secure |
| API Auth (RLS) | Row Level Security | ✅ Secure |
| Edge Function Auth | Mixed (see below) | ⚠️ Needs Review |

### Edge Function Security Assessment

| Function | Auth Method | Risk Level | Recommendation |
|----------|-------------|------------|----------------|
| `telegram-bot-handler` | Webhook secret | ✅ Low | Good |
| `notify-subscriber` | JWT/Service Key | ✅ Low | Good |
| `check-channel-membership` | JWT/Service Key | ✅ Low | Good |
| `check-expiring-subscriptions` | None | ⚠️ Medium | Add IP whitelist or cron secret |
| `validate-project-setup` | None | ✅ Low | Public by design |
| `setup-telegram-webhook` | None | 🔴 High | Add JWT auth |
| `create-checkout-session` | None | 🔴 High | Add JWT auth |
| `stripe-webhook` | Stripe signature | ✅ Low | Good |

### RLS Policy Audit

| Table | SELECT | INSERT | UPDATE | DELETE | Notes |
|-------|--------|--------|--------|--------|-------|
| profiles | ✅ | ✅ | ✅ | ❌ | No delete (intentional) |
| user_roles | ✅ | ❌ | ❌ | ❌ | Read-only (trigger managed) |
| projects | ✅ | ✅ | ✅ | ✅ | Owner-based access |
| plans | ✅ | ✅ | ✅ | ✅ | Project owner access |
| subscribers | ✅ | ✅ | ✅ | ✅ | Project owner access |
| subscription_plans | ✅ | Admin | Admin | Admin | Public read |
| client_subscriptions | ✅ | ✅ | ✅ | ❌ | Owner-based |
| client_subscription_payments | ✅ | ✅ | Admin | Admin | Owner insert |
| platform_payment_methods | ✅ | Admin | Admin | Admin | Public read |
| platform_config | Admin | Admin | Admin | Admin | Admin only |
| sales_inquiries | ✅ | ✅ | Admin | Admin | Anyone can submit |

### Sensitive Data Handling

| Data Type | Storage | Encryption | Access Control |
|-----------|---------|------------|----------------|
| Bot Tokens | projects.bot_token | At rest | Owner only |
| Stripe Keys | projects.stripe_config | At rest | Owner only |
| Passwords | auth.users | Hashed (bcrypt) | N/A |
| Payment Proofs | Storage bucket | At rest | Owner + Admin |

### Security Recommendations

1. **Add authentication to `setup-telegram-webhook`:**
   ```typescript
   // Verify user owns the project before setting up webhook
   const authHeader = req.headers.get("Authorization");
   // ... validate JWT and project ownership
   ```

2. **Add authentication to `create-checkout-session`:**
   ```typescript
   // This creates payment sessions - should verify subscriber exists
   // and request comes from Telegram bot context
   ```

3. **Protect `check-expiring-subscriptions`:**
   ```typescript
   // Option 1: Cron secret
   const cronSecret = req.headers.get("X-Cron-Secret");
   if (cronSecret !== Deno.env.get("CRON_SECRET")) {
     return new Response("Unauthorized", { status: 401 });
   }
   
   // Option 2: IP whitelist for cron service
   ```

4. **Bot Token Exposure:**
   - Bot tokens are sent from frontend to edge functions
   - Consider encrypting in transit beyond HTTPS
   - Add rate limiting

---

## 11. API Integrations

### Telegram Bot API

**Base URL:** `https://api.telegram.org/bot{token}/`

**Methods Used:**

| Method | Purpose | Used In |
|--------|---------|---------|
| `getMe` | Validate bot token | validate-project-setup |
| `getChat` | Validate channel | validate-project-setup |
| `getChatMember` | Check membership | validate-project-setup, check-channel-membership |
| `sendMessage` | Send notifications | All notification functions |
| `setWebhook` | Configure webhook | setup-telegram-webhook |
| `getWebhookInfo` | Verify webhook | setup-telegram-webhook |
| `createChatInviteLink` | Generate invite | stripe-webhook, notify-subscriber |
| `banChatMember` | Kick user (step 1) | notify-subscriber, check-expiring-subscriptions |
| `unbanChatMember` | Kick user (step 2) | notify-subscriber, check-expiring-subscriptions |
| `getFile` | Get file path | telegram-bot-handler |

**Webhook Payload Structure:**
```typescript
interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: { id: number; username?: string; first_name: string };
    chat: { id: number; type: string };
    text?: string;
    photo?: Array<{ file_id: string; file_size: number }>;
  };
  callback_query?: {
    id: string;
    from: { id: number; username?: string; first_name: string };
    message: { chat: { id: number } };
    data: string;
  };
}
```

---

### Stripe API

**Base URL:** `https://api.stripe.com/v1/`

**Methods Used:**

| Method | Purpose | Used In |
|--------|---------|---------|
| `POST /checkout/sessions` | Create checkout | create-checkout-session |

**Webhook Events Handled:**

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Activate subscription |

**Checkout Session Structure:**
```typescript
{
  mode: "payment",
  success_url: "https://t.me/?payment=success",
  cancel_url: "https://t.me/?payment=cancelled",
  client_reference_id: subscriber_id,
  line_items: [{
    price_data: {
      currency: "usd",
      product_data: { name, description },
      unit_amount: price_in_cents
    },
    quantity: 1
  }],
  metadata: {
    project_id,
    plan_id,
    subscriber_id,
    telegram_user_id
  }
}
```

---

### Supabase Client

**Configuration:**
```typescript
// src/integrations/supabase/client.ts
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
);
```

**Common Patterns:**

```typescript
// Query with RLS
const { data, error } = await supabase
  .from("subscribers")
  .select("*, plans(*), projects(*)")
  .eq("project_id", projectId);

// Insert
const { data, error } = await supabase
  .from("subscribers")
  .insert({ ... })
  .select()
  .single();

// Update
const { error } = await supabase
  .from("subscribers")
  .update({ status: "active" })
  .eq("id", subscriberId);

// Edge function call
const { data, error } = await supabase.functions.invoke("notify-subscriber", {
  body: { subscriber_id, action: "approved" }
});
```

---

## 12. File-by-File Index

### Root Files

| File | Purpose |
|------|---------|
| `index.html` | HTML entry point |
| `vite.config.ts` | Vite configuration |
| `tailwind.config.ts` | Tailwind configuration |
| `eslint.config.js` | ESLint configuration |
| `README.md` | Project readme |
| `DOCUMENTATION.md` | User documentation |

### Source Files (`src/`)

| File | Lines | Purpose |
|------|-------|---------|
| `main.tsx` | ~20 | React entry point |
| `App.tsx` | ~80 | Route definitions |
| `App.css` | ~10 | Global styles |
| `index.css` | ~100 | Tailwind + custom CSS |
| `vite-env.d.ts` | ~5 | Vite type declarations |

### Pages (`src/pages/`)

| File | Lines | Purpose |
|------|-------|---------|
| `Landing.tsx` | ~100 | Marketing landing page |
| `Dashboard.tsx` | ~300 | Client dashboard |
| `Projects.tsx` | ~400 | Project management |
| `Subscribers.tsx` | ~1158 | Subscriber management |
| `Analytics.tsx` | ~250 | Analytics & charts |
| `Billing.tsx` | ~300 | Billing & plans |
| `Settings.tsx` | ~200 | User settings |
| `NotFound.tsx` | ~30 | 404 page |

### Auth Pages (`src/pages/auth/`)

| File | Lines | Purpose |
|------|-------|---------|
| `Login.tsx` | ~100 | Login form |
| `Signup.tsx` | ~120 | Registration form |
| `ForgotPassword.tsx` | ~80 | Password reset request |
| `ResetPassword.tsx` | ~90 | Password reset form |

### Admin Pages (`src/pages/admin/`)

| File | Lines | Purpose |
|------|-------|---------|
| `AdminOverview.tsx` | ~200 | Admin dashboard |
| `AdminClients.tsx` | ~250 | Client management |
| `AdminPayments.tsx` | ~200 | Payment management |
| `AdminSettings.tsx` | ~150 | Platform settings |

### Layout Components (`src/components/layout/`)

| File | Lines | Purpose |
|------|-------|---------|
| `DashboardLayout.tsx` | ~100 | Protected layout |
| `AuthLayout.tsx` | ~50 | Auth layout |
| `Sidebar.tsx` | ~200 | Navigation sidebar |

### Landing Components (`src/components/landing/`)

| File | Lines | Purpose |
|------|-------|---------|
| `LandingNavbar.tsx` | ~80 | Top navigation |
| `HeroSection.tsx` | ~100 | Hero banner |
| `SocialProofSection.tsx` | ~50 | Trust indicators |
| `FeaturesSection.tsx` | ~120 | Feature cards |
| `HowItWorksSection.tsx` | ~100 | Process steps |
| `TestimonialsSection.tsx` | ~100 | Testimonials |
| `PricingSection.tsx` | ~200 | Pricing cards |
| `FAQSection.tsx` | ~100 | FAQ accordion |
| `CTABanner.tsx` | ~50 | Call to action |
| `Footer.tsx` | ~80 | Site footer |

### Project Components (`src/components/projects/`)

| File | Lines | Purpose |
|------|-------|---------|
| `CreateProjectDialog.tsx` | ~400 | Project creation |
| `EditProjectDialog.tsx` | ~200 | Project editing |
| `PlansDialog.tsx` | ~300 | Plan management |

### Subscriber Components (`src/components/subscribers/`)

| File | Lines | Purpose |
|------|-------|---------|
| `SubscriberDetails.tsx` | ~500 | Subscriber sheet |
| `AddSubscriberDialog.tsx` | ~200 | Manual add |
| `PaymentProofUpload.tsx` | ~100 | Proof upload |

### Billing Components (`src/components/billing/`)

| File | Lines | Purpose |
|------|-------|---------|
| `ContactSalesDialog.tsx` | ~150 | Sales form |

### Admin Components (`src/components/admin/`)

| File | Lines | Purpose |
|------|-------|---------|
| `PaymentMethodsManager.tsx` | ~300 | Payment methods |

### Hooks (`src/hooks/`)

| File | Lines | Purpose |
|------|-------|---------|
| `useAuth.tsx` | ~80 | Auth context |
| `useUserRole.tsx` | ~50 | Role hook |
| `use-mobile.tsx` | ~20 | Mobile detection |
| `use-toast.ts` | ~50 | Toast hook |

### UI Components (`src/components/ui/`)

50+ Shadcn components - see Section 7 for full list

### Edge Functions (`supabase/functions/`)

| Function | Lines | Purpose |
|----------|-------|---------|
| `telegram-bot-handler/index.ts` | ~1014 | Telegram webhook |
| `notify-subscriber/index.ts` | ~533 | Notifications |
| `check-channel-membership/index.ts` | ~100 | Membership check |
| `check-expiring-subscriptions/index.ts` | ~330 | Expiration cron |
| `validate-project-setup/index.ts` | ~200 | Setup validation |
| `setup-telegram-webhook/index.ts` | ~103 | Webhook setup |
| `create-checkout-session/index.ts` | ~123 | Stripe checkout |
| `stripe-webhook/index.ts` | ~258 | Stripe events |

---

## 13. Known Issues & TODOs

### Code Issues

| Issue | Location | Priority | Description |
|-------|----------|----------|-------------|
| Hardcoded metric | Dashboard.tsx | Low | `revenueChange` is hardcoded to 12.5% |
| Unused settings | Settings.tsx | Low | Notification preferences not persisted |
| Missing auth | setup-telegram-webhook | High | No authentication on webhook setup |
| Missing auth | create-checkout-session | High | No authentication on checkout |
| Cron protection | check-expiring-subscriptions | Medium | No auth on cron endpoint |

### Feature Gaps

| Feature | Status | Notes |
|---------|--------|-------|
| Bulk subscriber actions | Planned | UI exists but not implemented |
| Webhook retry logic | Partial | Has retries but no dead-letter queue |
| Email notifications | Not implemented | Only Telegram notifications |
| Subscription pause | Not implemented | Only active/suspended |
| Revenue analytics | Basic | Needs actual payment tracking |
| Export data | Not implemented | CSV/Excel export for subscribers |
| Multi-language | Not implemented | English only |
| Dark mode | Implemented | Via Tailwind dark classes |

### Performance Considerations

| Area | Current State | Recommendation |
|------|---------------|----------------|
| Subscriber list | Fetches all | Add pagination |
| Analytics | Real-time calculation | Add caching layer |
| Project list | Fetches with counts | Use aggregate function |
| Images | Direct storage URLs | Add CDN/optimization |

---

## 14. Environment Configuration

### Environment Variables

| Variable | Source | Purpose |
|----------|--------|---------|
| `VITE_SUPABASE_URL` | Auto-configured | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Auto-configured | Supabase anon key |
| `VITE_SUPABASE_PROJECT_ID` | Auto-configured | Project identifier |

### Supabase Secrets (Edge Functions)

| Secret | Purpose |
|--------|---------|
| `SUPABASE_URL` | Database URL |
| `SUPABASE_ANON_KEY` | Public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin key |
| `SUPABASE_DB_URL` | Direct DB connection |
| `STRIPE_SECRET_KEY` | Stripe API key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook verification |

### Supabase Configuration

**File:** `supabase/config.toml`

Key settings:
- Project ID: `fcmwixdlmbauyznvcfti`
- Auth: Email/password enabled
- Storage: `payment-proofs` bucket (private)

---

## Appendix A: Status Badge Reference

### Subscriber Status Badges

| Status | Color | Tailwind Class |
|--------|-------|----------------|
| `active` | Green | `bg-green-500/10 text-green-500` |
| `pending_payment` | Yellow | `bg-yellow-500/10 text-yellow-500` |
| `awaiting_proof` | Orange | `bg-orange-500/10 text-orange-500` |
| `pending_approval` | Blue | `bg-blue-500/10 text-blue-500` |
| `expired` | Gray | `bg-gray-500/10 text-gray-500` |
| `rejected` | Red | `bg-red-500/10 text-red-500` |
| `suspended` | Purple | `bg-purple-500/10 text-purple-500` |

### Channel Membership Badges

| Status | Color | Tailwind Class |
|--------|-------|----------------|
| `member` | Green | `bg-green-500/10 text-green-500` |
| `left` | Gray | `bg-gray-500/10 text-gray-500` |
| `kicked` | Red | `bg-red-500/10 text-red-500` |
| `unknown` | Gray | `bg-gray-500/10 text-gray-500` |

---

## Appendix B: API Response Codes

### Edge Function Responses

| Code | Meaning | Common Causes |
|------|---------|---------------|
| 200 | Success | Request completed |
| 400 | Bad Request | Missing parameters, invalid data |
| 401 | Unauthorized | Missing/invalid auth token |
| 403 | Forbidden | User doesn't own resource |
| 404 | Not Found | Resource doesn't exist |
| 500 | Server Error | Unexpected error, API failure |

### Telegram API Errors

| Code | Description | Resolution |
|------|-------------|------------|
| 400 | Bad Request | Check parameters |
| 401 | Unauthorized | Invalid bot token |
| 403 | Forbidden | Bot not in channel/not admin |
| 429 | Too Many Requests | Rate limited, add delay |

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

## Document Version

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | December 2024 | Initial comprehensive audit |

---

*This document was generated as a complete technical reference for the SubscribeHub platform. For questions or updates, refer to the project maintainers.*
