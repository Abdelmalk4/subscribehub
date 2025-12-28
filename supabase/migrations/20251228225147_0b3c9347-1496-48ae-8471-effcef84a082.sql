-- Add channel membership tracking columns to subscribers table
ALTER TABLE public.subscribers 
ADD COLUMN IF NOT EXISTS channel_joined boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS channel_joined_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS last_membership_check timestamp with time zone,
ADD COLUMN IF NOT EXISTS channel_membership_status text DEFAULT 'unknown';

-- Add index for quick filtering on channel membership
CREATE INDEX IF NOT EXISTS idx_subscribers_channel_joined ON public.subscribers(channel_joined);
CREATE INDEX IF NOT EXISTS idx_subscribers_channel_membership_status ON public.subscribers(channel_membership_status);

-- Add comment for documentation
COMMENT ON COLUMN public.subscribers.channel_joined IS 'Whether the subscriber has joined the Telegram channel';
COMMENT ON COLUMN public.subscribers.channel_joined_at IS 'Timestamp when the subscriber joined the channel';
COMMENT ON COLUMN public.subscribers.last_membership_check IS 'Timestamp of last channel membership verification';
COMMENT ON COLUMN public.subscribers.channel_membership_status IS 'Channel membership status: member, left, kicked, unknown, never_joined';