-- Phase 8: Create failed_notifications queue table
CREATE TABLE public.failed_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  subscriber_id UUID NOT NULL REFERENCES public.subscribers(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 5,
  next_retry_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  processed_at TIMESTAMP WITH TIME ZONE
);

-- Index for efficient retry queries
CREATE INDEX idx_failed_notifications_retry ON public.failed_notifications(next_retry_at) 
  WHERE processed_at IS NULL AND retry_count < max_retries;

-- Index for subscriber lookup
CREATE INDEX idx_failed_notifications_subscriber ON public.failed_notifications(subscriber_id);

-- Enable RLS
ALTER TABLE public.failed_notifications ENABLE ROW LEVEL SECURITY;

-- RLS policy: Allow service role full access (edge functions)
CREATE POLICY "Service role can manage failed_notifications" 
  ON public.failed_notifications 
  FOR ALL 
  USING (true)
  WITH CHECK (true);

-- Add comment
COMMENT ON TABLE public.failed_notifications IS 'Queue for failed notification retries with exponential backoff';