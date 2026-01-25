
# Implementation Plan: Onboarding Wizard, Bot Health Indicators, and Quick-Approve Links

## Overview

This plan addresses three key features to transform SubscribeHub from a functional but confusing tool into a seamless, professional subscription management platform:

1. **Onboarding Wizard** - Guide first-time users through project creation
2. **Bot Health Indicators** - Show webhook status on Projects page
3. **Quick-Approve Links** - Enable one-click payment approval from Telegram

---

## Feature 1: Onboarding Wizard

### Purpose
New users currently land on an empty dashboard with no guidance. This wizard will guide them through creating their first project, connecting their bot, and setting up a plan - all in one seamless flow.

### Implementation Approach

**New Components:**
- `src/components/onboarding/OnboardingWizard.tsx` - Full-screen wizard with 4 steps
- `src/components/onboarding/steps/WelcomeStep.tsx` - Introduction with value proposition
- `src/components/onboarding/steps/ProjectStep.tsx` - Name and basic info
- `src/components/onboarding/steps/BotStep.tsx` - Bot token and channel connection
- `src/components/onboarding/steps/PlanStep.tsx` - Create first subscription plan
- `src/components/onboarding/steps/SuccessStep.tsx` - Celebration with next actions

**Modified Files:**
- `src/pages/Dashboard.tsx` - Detect first-time users (0 projects) and show wizard
- `src/App.tsx` - Add `/onboarding` route for direct access

**User Flow:**
```text
Step 1: Welcome
   "Turn your Telegram channel into a revenue machine"
   [Get Started]

Step 2: Project Info
   - Project name
   - Support contact (optional)
   [Continue]

Step 3: Connect Bot
   - Bot token (with validation)
   - Channel ID
   - Real-time validation feedback
   [Validate & Continue]

Step 4: First Plan
   - Plan name (e.g., "Monthly")
   - Price
   - Duration (preset buttons: 7d, 30d, 90d, 365d)
   [Create Plan]

Step 5: Success!
   - Celebration animation
   - Shareable bot link
   - Quick actions: "Open Bot", "Add More Plans", "Go to Dashboard"
```

**Technical Details:**
- Store wizard progress in localStorage to resume if interrupted
- Use existing `validate-project-setup` edge function for bot validation
- Automatically setup webhook via `setup-telegram-webhook` edge function
- Create project and plan in a single transaction flow

---

## Feature 2: Bot Health Indicators

### Purpose
Project owners can't tell if their bot is working correctly. This feature adds visual indicators showing webhook status, last activity, and any errors.

### Implementation Approach

**Database Changes:**
Add columns to track bot health (migration):
```sql
ALTER TABLE projects ADD COLUMN IF NOT EXISTS last_webhook_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS webhook_status TEXT DEFAULT 'unknown';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS webhook_error TEXT;
```

**New Edge Function:**
- `supabase/functions/check-bot-health/index.ts` - Validates bot token and webhook configuration

**Modified Files:**
- `src/pages/Projects.tsx` - Add health indicator badge to each project card
- `supabase/functions/telegram-bot-handler/index.ts` - Update `last_webhook_at` on each webhook call

**UI Design:**
```text
Project Card Header:
┌─────────────────────────────────────────┐
│ [Bot Icon] My Premium Channel           │
│ @mybot                                  │
│ ┌──────────┐ ┌──────────┐              │
│ │ ✅ Active │ │ 🟢 Bot OK │              │
│ └──────────┘ └──────────┘              │
└─────────────────────────────────────────┘

Health States:
- 🟢 "Healthy" - Last activity < 24h, webhook working
- 🟡 "Idle" - No activity in 24-72h
- 🔴 "Error" - Webhook failed or no activity > 72h
- ⚪ "Unknown" - Never connected
```

**Health Check Logic:**
- "Healthy": `last_webhook_at` within 24 hours OR webhook validation passes
- "Idle": `last_webhook_at` between 24-72 hours ago
- "Error": `last_webhook_at` > 72 hours OR webhook validation fails
- "Unknown": `last_webhook_at` is null

**Implementation in `telegram-bot-handler`:**
Update project on each successful webhook:
```typescript
// After processing any update successfully
await supabase
  .from("projects")
  .update({ 
    last_webhook_at: new Date().toISOString(),
    webhook_status: 'healthy',
    webhook_error: null 
  })
  .eq("id", projectId);
```

---

## Feature 3: Quick-Approve Links in Telegram

### Purpose
When a user submits payment proof, the admin currently receives a notification but must open the dashboard to approve. This feature adds a direct "Approve" button in the Telegram notification.

### Implementation Approach

**New Edge Function:**
- `supabase/functions/quick-approve/index.ts` - Handles one-click approval from Telegram callback

**Modified Files:**
- `supabase/functions/telegram-bot-handler/index.ts` - Update `notifyAdminOfPendingPayment` to include approve/reject buttons
- Add callback handler for `quick_approve:` and `quick_reject:` actions

**Admin Notification Redesign:**
```text
Current:
📬 New Payment Pending

User: @john_doe
Plan: Monthly
Amount: $29

Please review in the dashboard.

New:
📬 New Payment Pending

👤 User: @john_doe
📦 Plan: Monthly ($29/30 days)
📸 Payment proof received

[✅ Approve] [❌ Reject] [👁 View Proof]
```

**Technical Flow:**
1. User uploads payment proof
2. `notifyAdminOfPendingPayment` sends enhanced notification with callback buttons
3. Admin clicks "Approve"
4. Telegram sends callback to bot handler
5. `handleQuickApprove` function:
   - Validates admin ownership of project
   - Updates subscriber status to "active"
   - Calculates expiry date based on plan duration
   - Generates invite link
   - Sends confirmation to user
   - Sends confirmation to admin

**Callback Data Format:**
```text
quick_approve:{subscriber_id}
quick_reject:{subscriber_id}
view_proof:{subscriber_id}
```

**Security Considerations:**
- Verify the callback is from the project's admin (compare `callback_query.from.id` with `project.admin_telegram_id`)
- Rate limit approval actions to prevent abuse
- Log all approval actions to audit_logs table

**Rejection Flow:**
When admin clicks "Reject", send follow-up message asking for reason:
```text
"Please reply with the rejection reason:"
[Cancel]
```
Then capture the next text message as the rejection reason.

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/components/onboarding/OnboardingWizard.tsx` | Main wizard container with step navigation |
| `src/components/onboarding/steps/WelcomeStep.tsx` | Introduction screen |
| `src/components/onboarding/steps/ProjectStep.tsx` | Project name input |
| `src/components/onboarding/steps/BotStep.tsx` | Bot token and channel setup |
| `src/components/onboarding/steps/PlanStep.tsx` | First plan creation |
| `src/components/onboarding/steps/SuccessStep.tsx` | Completion celebration |
| `supabase/functions/check-bot-health/index.ts` | Bot and webhook health validation |

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/Dashboard.tsx` | Add detection for first-time users, show onboarding prompt |
| `src/pages/Projects.tsx` | Add bot health indicator badges to project cards |
| `src/App.tsx` | Add `/onboarding` route |
| `supabase/functions/telegram-bot-handler/index.ts` | Update `last_webhook_at`, add quick-approve handlers, enhance admin notifications |
| Database migration | Add health tracking columns to projects table |

## Database Migration

```sql
-- Add bot health tracking columns
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS last_webhook_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS webhook_status TEXT DEFAULT 'unknown',
ADD COLUMN IF NOT EXISTS webhook_error TEXT;

-- Index for health queries
CREATE INDEX IF NOT EXISTS idx_projects_webhook_status ON projects(webhook_status);
```

---

## Implementation Order

1. **Phase A: Database Setup** (Day 1)
   - Create migration for health columns
   - Deploy database changes

2. **Phase B: Bot Health Indicators** (Day 1-2)
   - Update `telegram-bot-handler` to track `last_webhook_at`
   - Create `check-bot-health` edge function
   - Add health badges to `Projects.tsx`

3. **Phase C: Quick-Approve Links** (Day 2-3)
   - Update `notifyAdminOfPendingPayment` with buttons
   - Add callback handlers for approve/reject
   - Add audit logging for approvals

4. **Phase D: Onboarding Wizard** (Day 3-5)
   - Create wizard components
   - Integrate with Dashboard
   - Add route and navigation

---

## Success Criteria

- New users see guided onboarding flow on first login
- Project cards show accurate bot health status
- Admins can approve payments directly from Telegram in under 10 seconds
- All approval actions are logged for audit trail
