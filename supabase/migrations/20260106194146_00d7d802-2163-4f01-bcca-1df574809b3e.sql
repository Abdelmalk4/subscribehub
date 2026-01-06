-- Create webhook_events table for idempotency tracking
CREATE TABLE public.webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_source TEXT NOT NULL, -- 'telegram', 'stripe'
  event_id TEXT NOT NULL,
  event_type TEXT,
  processed_at TIMESTAMPTZ DEFAULT now(),
  result JSONB,
  UNIQUE(event_source, event_id)
);

-- Create index for fast lookups
CREATE INDEX idx_webhook_events_lookup ON public.webhook_events(event_source, event_id);

-- Enable RLS
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- Only service role can access webhook events (edge functions use service role)
CREATE POLICY "Service role only" 
ON public.webhook_events 
FOR ALL 
USING (false)
WITH CHECK (false);

-- Add comment
COMMENT ON TABLE public.webhook_events IS 'Tracks processed webhook events for idempotency';