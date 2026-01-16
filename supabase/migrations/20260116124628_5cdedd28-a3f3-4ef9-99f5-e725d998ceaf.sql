-- Fix the permissive INSERT policy on admin_notifications
-- Replace with a proper policy that only allows inserts from service role or triggers

DROP POLICY IF EXISTS "System can insert notifications" ON admin_notifications;

-- No INSERT policy needed since inserts will happen via service role (edge functions)
-- Service role bypasses RLS