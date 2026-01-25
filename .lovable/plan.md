

# Implementation Plan: Real-time Bot Health + First-Time User Redirect

## Overview

This plan implements three enhancements:
1. **Real-time Supabase subscription** for bot health indicators on the Projects page
2. **Automatic redirect** for first-time users (0 projects) to the onboarding wizard
3. **Verification** that the onboarding wizard works correctly (already tested via screenshot)

---

## Part 1: Real-time Bot Health Indicators

### Purpose
Currently, bot health status is only fetched once when the Projects page loads. When a webhook updates `last_webhook_at`, the UI doesn't reflect this until a manual refresh. Real-time subscriptions will update the health indicators live.

### Database Requirements
Enable Realtime on the `projects` table for the relevant columns.

**Migration SQL:**
```sql
-- Enable realtime for projects table
ALTER PUBLICATION supabase_realtime ADD TABLE public.projects;
```

### Frontend Changes

**File: `src/pages/Projects.tsx`**

Add a Supabase real-time subscription that listens for changes to the `projects` table and updates the local state when `last_webhook_at`, `webhook_status`, or `webhook_error` columns change.

```typescript
// Add real-time subscription in useEffect
useEffect(() => {
  if (!user) return;

  // Subscribe to project updates
  const channel = supabase
    .channel('projects-health')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'projects',
        filter: `user_id=eq.${user.id}`,
      },
      (payload) => {
        // Update the project in local state
        setProjects((prev) =>
          prev.map((p) =>
            p.id === payload.new.id
              ? {
                  ...p,
                  last_webhook_at: payload.new.last_webhook_at,
                  webhook_status: payload.new.webhook_status,
                  webhook_error: payload.new.webhook_error,
                }
              : p
          )
        );
      }
    )
    .subscribe();

  // Cleanup on unmount
  return () => {
    supabase.removeChannel(channel);
  };
}, [user]);
```

### Technical Flow
```text
1. User visits Projects page
2. Initial fetch loads all projects with health data
3. Supabase real-time channel subscribes to UPDATE events
4. When telegram-bot-handler updates last_webhook_at, Postgres emits change
5. Real-time subscription receives payload
6. React state updates, BotHealthBadge re-renders with new status
```

---

## Part 2: First-Time User Redirect to Onboarding

### Purpose
New users with 0 projects currently see an empty state on the Dashboard with a button to create a project. Instead, they should be automatically redirected to the onboarding wizard for a smoother experience.

### Implementation

**File: `src/pages/Dashboard.tsx`**

Change the current empty state behavior to redirect first-time users to `/onboarding` instead of showing a static card.

**Current behavior (lines 198-216):**
```typescript
// Empty state for new users
if (!hasProjects) {
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] text-center">
      ...
      <Link to="/projects">
        <Button size="lg" className="gap-2">
          <Plus className="h-4 w-4" />
          Create Your First Project
        </Button>
      </Link>
    </div>
  );
}
```

**New behavior:**
```typescript
import { useNavigate } from "react-router-dom";

// Inside component:
const navigate = useNavigate();

// After loading completes, redirect first-time users
useEffect(() => {
  if (!isLoading && !hasProjects && user) {
    navigate("/onboarding", { replace: true });
  }
}, [isLoading, hasProjects, user, navigate]);

// Keep empty state as fallback (in case navigation fails or for edge cases)
if (!hasProjects) {
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] text-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground mt-2">Redirecting to setup...</p>
    </div>
  );
}
```

### Edge Cases Handled
- **Returning users after deleting all projects:** They'll be redirected to onboarding
- **Onboarding skip:** Users who skip the wizard and go to Projects can still create projects manually
- **Browser back button:** Using `replace: true` prevents back-button issues

---

## Part 3: Onboarding Wizard Verification

### Current Status
The onboarding wizard has been tested via screenshot at `/onboarding`:
- Welcome screen displays correctly
- Progress bar and step indicators work
- UI follows the design system

### Flow Verification (Manual Testing Steps)
1. Navigate to `/onboarding`
2. Step 1 (Welcome): Click "Get Started"
3. Step 2 (Project): Enter project name, click "Continue"
4. Step 3 (Bot): Enter bot token and channel ID, click "Validate Connection"
5. Step 4 (Plan): Set plan details, click "Create Plan"
6. Step 5 (Success): Verify confetti and shareable link

### Known Limitations
- Real bot token required for Step 3 validation (cannot be simulated)
- Webhook setup may fail silently (non-blocking, logged to console)

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/Projects.tsx` | Add real-time subscription for project health updates |
| `src/pages/Dashboard.tsx` | Add redirect to `/onboarding` for first-time users |

## Database Changes

| Change | Purpose |
|--------|---------|
| Enable Realtime on `projects` table | Allow real-time subscriptions to receive updates |

---

## Implementation Order

1. **Database Migration** - Enable Realtime on projects table
2. **Projects.tsx** - Add real-time subscription hook
3. **Dashboard.tsx** - Add first-time user redirect
4. **Test** - Verify both features work correctly

---

## Success Criteria

- Bot health badges update automatically when webhooks are received (no page refresh needed)
- New users are automatically redirected to the onboarding wizard
- The onboarding wizard creates projects successfully and shows the success screen

