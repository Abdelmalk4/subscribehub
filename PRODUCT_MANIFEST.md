# SubscribeHub - Product Manifest

**Version:** 1.0  
**Prepared for:** Investor Review  
**Date:** December 2024

---

## 1. Core Purpose

### Problem Statement
Content creators and community managers running Telegram channels/groups struggle to monetize their audiences effectively. They face:
- **Manual subscriber management** - tracking who paid, when subscriptions expire, and revoking access
- **Fragmented payment processing** - juggling multiple payment methods without automation
- **No renewal automation** - losing revenue from expired subscriptions without timely reminders
- **Lack of analytics** - no visibility into growth, churn, or revenue metrics

### Solution
**SubscribeHub** is a B2B SaaS platform that automates Telegram channel monetization. It provides:
- **Automated subscriber lifecycle management** via Telegram bot integration
- **Multi-payment support** (Stripe + manual bank/crypto payments)
- **Intelligent renewal reminders** and expiration handling
- **Real-time analytics dashboard** for revenue and subscriber insights

### Target Market
- Telegram content creators (crypto signals, trading groups, educational content)
- Community managers running paid private channels
- Digital product sellers using Telegram for delivery

---

## 2. User Flow

### Main Pages

| Route | Page | Purpose |
|-------|------|---------|
| `/` | Landing | Marketing page with features, pricing, testimonials |
| `/signup` | Signup | User registration |
| `/login` | Login | Authentication |
| `/forgot-password` | Forgot Password | Password recovery |
| `/reset-password` | Reset Password | Password reset |
| `/dashboard` | Dashboard | Overview metrics and quick actions |
| `/projects` | Projects | Manage Telegram bot/channel integrations |
| `/subscribers` | Subscribers | View and manage channel subscribers |
| `/analytics` | Analytics | Revenue charts and growth metrics |
| `/billing` | Billing | Subscription plans and payment history |
| `/settings` | Settings | Account and notification preferences |
| `/super-admin/*` | Admin Panel | Platform-wide management (super admins only) |

### User Journey (Signup to "Aha! Moment")

```
┌─────────────────────────────────────────────────────────────────┐
│                    USER ONBOARDING FLOW                         │
└─────────────────────────────────────────────────────────────────┘

1. DISCOVER (Landing Page)
   └─→ User lands on "/" and sees value proposition
   └─→ Views pricing, features, testimonials
   └─→ Clicks "Start Free Trial"

2. SIGNUP (/signup)
   └─→ Creates account with email/password
   └─→ Auto-assigned "client" role
   └─→ 14-day trial subscription created automatically
   └─→ Profile created in database

3. FIRST LOGIN (/dashboard)
   └─→ Sees empty dashboard with getting started prompts
   └─→ Trial countdown visible in sidebar

4. CREATE PROJECT (/projects)
   └─→ Clicks "Create Project"
   └─→ Enters Telegram Bot Token (from @BotFather)
   └─→ Enters Channel ID
   └─→ Configures payment methods (Stripe/Manual)
   └─→ Creates subscription plans (price, duration)

5. SETUP TELEGRAM BOT
   └─→ System registers webhook with Telegram
   └─→ Bot starts receiving messages

6. ⭐ "AHA! MOMENT" - First Subscriber Joins
   └─→ End-user messages bot with /start
   └─→ Bot shows plans, user selects one
   └─→ User pays (Stripe or uploads proof)
   └─→ Admin approves (if manual payment)
   └─→ Subscriber receives invite link
   └─→ Admin sees subscriber in dashboard with revenue!

7. ONGOING VALUE
   └─→ Automated expiry reminders sent
   └─→ Renewal payments processed
   └─→ Analytics show growth over time
```

---

## 3. Component Architecture

### Layout Components

| Component | Location | Function |
|-----------|----------|----------|
| `DashboardLayout` | `src/components/layout/` | Authenticated page wrapper with sidebar |
| `AuthLayout` | `src/components/layout/` | Auth pages wrapper (login, signup) |
| `Sidebar` | `src/components/layout/` | Main navigation, trial status, user actions |
| `LandingNavbar` | `src/components/landing/` | Public page navigation |
| `Footer` | `src/components/landing/` | Public page footer |

### Landing Page Components

| Component | Function |
|-----------|----------|
| `HeroSection` | Main value prop, CTA buttons, mock dashboard preview |
| `FeaturesSection` | Feature grid with icons and descriptions |
| `HowItWorksSection` | Step-by-step onboarding explanation |
| `PricingSection` | Subscription plan cards |
| `TestimonialsSection` | Social proof from users |
| `SocialProofSection` | Logos, stats, trust indicators |
| `FAQSection` | Common questions accordion |
| `CTABanner` | Final conversion call-to-action |

### Feature Components

| Component | Location | Function |
|-----------|----------|----------|
| `CreateProjectDialog` | `src/components/projects/` | New project creation modal |
| `EditProjectDialog` | `src/components/projects/` | Project settings editor |
| `PlansDialog` | `src/components/projects/` | Subscription plan management |
| `AddSubscriberDialog` | `src/components/subscribers/` | Manual subscriber addition |
| `SubscriberDetails` | `src/components/subscribers/` | Subscriber info panel |
| `PaymentProofUpload` | `src/components/subscribers/` | Payment proof viewer |
| `ContactSalesDialog` | `src/components/billing/` | Enterprise sales form |
| `PaymentMethodsManager` | `src/components/admin/` | Platform payment config |

### UI Component Library
Full Shadcn/UI implementation with 45+ components including:
- Forms (Input, Select, Checkbox, Radio, etc.)
- Dialogs, Sheets, Modals
- Tables, Cards, Badges
- Charts (Recharts integration)
- Toast notifications (Sonner)

---

## 4. Data & Backend

### Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite |
| Styling | Tailwind CSS, Shadcn/UI |
| State Management | TanStack Query (React Query) |
| Routing | React Router v6 |
| Animation | Framer Motion |
| Backend | Supabase (Lovable Cloud) |
| Payments | Stripe API |
| Messaging | Telegram Bot API |

### Database Schema

```
┌─────────────────────────────────────────────────────────────────┐
│                      DATABASE TABLES                            │
└─────────────────────────────────────────────────────────────────┘

CORE TABLES
├── profiles              User profile data (linked to auth.users)
├── user_roles            Role assignments (super_admin, client)
├── projects              Telegram bot/channel configurations
├── plans                 Subscription plans per project
├── subscribers           End-user subscriber records
└── extend_requests       Subscription extension requests

PLATFORM MANAGEMENT
├── subscription_plans    SaaS pricing tiers (Free, Starter, Pro, etc.)
├── client_subscriptions  Client subscription status
├── client_subscription_payments  Client payment records
├── platform_config       Global platform settings
├── platform_payment_methods      Accepted payment methods
└── sales_inquiries       Enterprise contact form submissions

STORAGE BUCKETS
└── payment-proofs        Uploaded payment screenshots (private)
```

### Key Relationships

```
auth.users (1) ──────┬──────── (1) profiles
                     ├──────── (1) user_roles
                     ├──────── (N) projects
                     └──────── (1) client_subscriptions

projects (1) ────────┬──────── (N) plans
                     ├──────── (N) subscribers
                     └──────── (N) extend_requests

subscription_plans (1) ────── (N) client_subscriptions
```

### Edge Functions (Serverless Backend)

| Function | Trigger | Purpose |
|----------|---------|---------|
| `telegram-bot-handler` | Telegram Webhook | Processes bot commands, payments, photos |
| `setup-telegram-webhook` | API Call | Registers bot webhook with Telegram |
| `validate-project-setup` | API Call | Validates bot token and channel access |
| `create-checkout-session` | API Call | Creates Stripe checkout sessions |
| `stripe-webhook` | Stripe Webhook | Processes successful payments |
| `check-expiring-subscriptions` | Cron/Manual | Sends renewal reminders |
| `notify-subscriber` | API Call | Sends messages to subscribers |
| `check-channel-membership` | API Call | Verifies user is in channel |

### Security (Row-Level Security)

All tables have RLS enabled with policies for:
- **User isolation**: Clients can only see their own data
- **Super admin access**: Full read access to all data
- **Public data**: Plans and payment methods visible to all

### External Integrations

| Service | Purpose | Authentication |
|---------|---------|----------------|
| Supabase Auth | User authentication | Built-in |
| Supabase Storage | Payment proof uploads | Signed URLs |
| Stripe | Payment processing | Secret key (env) |
| Telegram Bot API | Subscriber management | Bot token per project |

### Environment Variables / Secrets

```
VITE_SUPABASE_URL          - Supabase project URL
VITE_SUPABASE_PUBLISHABLE_KEY - Supabase anon key
STRIPE_SECRET_KEY          - Stripe API key (Edge Functions)
STRIPE_WEBHOOK_SECRET      - Stripe webhook verification
SUPABASE_SERVICE_ROLE_KEY  - Admin access for Edge Functions
```

---

## 5. Unfinished Business

### Known Limitations

| Area | Issue | Severity |
|------|-------|----------|
| Demo Video | "Watch Demo" button has no video attached | Low |
| Help Center | Help Center link non-functional | Low |
| Feedback | Feedback button non-functional | Low |
| Favorites | Sidebar favorites are hardcoded, not dynamic | Low |
| Search | Global search in sidebar is UI-only, not implemented | Medium |

### Placeholder Content

| Location | Description |
|----------|-------------|
| HeroSection | Mock dashboard with static numbers |
| Testimonials | Sample testimonial data (needs real users) |
| Social Proof | Sample company logos and stats |

### Potential Improvements

| Priority | Enhancement |
|----------|-------------|
| High | Email notifications for subscription events |
| High | Webhook retry mechanism for failed Telegram messages |
| Medium | Multi-language support (i18n) |
| Medium | Dark/light theme persistence |
| Medium | Mobile app or PWA |
| Low | Bulk subscriber import/export |
| Low | API access for enterprise clients |

### Technical Debt

| Area | Description |
|------|-------------|
| Type Safety | Some `any` types in Edge Functions |
| Error Handling | Edge functions could have more granular error codes |
| Testing | No automated tests present |
| Documentation | Inline code documentation is minimal |

---

## 6. Metrics & Analytics

### Current Tracking

- Total subscribers per project
- Revenue per project
- Subscription status distribution
- Platform growth (30-day trend for admin)
- Client subscription status

### Suggested Additions

- Churn rate calculation
- Lifetime Value (LTV)
- Monthly Recurring Revenue (MRR)
- Cohort analysis

---

## 7. Monetization Model

### Pricing Tiers (configured in `subscription_plans` table)

| Plan | Projects | Subscribers | Price |
|------|----------|-------------|-------|
| Free Trial | 1 | 20 | $0 (14 days) |
| Starter | 1 | 100 | TBD/month |
| Pro | 3 | 500 | TBD/month |
| Unlimited | Unlimited | Unlimited | Contact Sales |

### Revenue Streams

1. **Subscription fees** - Monthly/yearly SaaS subscriptions
2. **Transaction fees** - Potential % on processed payments (not implemented)

---

## 8. Security Considerations

- ✅ Row-Level Security on all tables
- ✅ Authenticated API calls required
- ✅ Webhook signature verification (Stripe, Telegram)
- ✅ Secure file storage with signed URLs
- ✅ Password-based authentication
- ⚠️ No 2FA implemented
- ⚠️ No rate limiting on Edge Functions
- ⚠️ No audit logging

---

## Contact

For technical questions about this manifest, please contact the development team.
