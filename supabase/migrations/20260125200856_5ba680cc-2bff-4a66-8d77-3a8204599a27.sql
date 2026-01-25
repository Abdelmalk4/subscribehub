-- Add bot health tracking columns to projects table
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS last_webhook_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS webhook_status TEXT DEFAULT 'unknown',
ADD COLUMN IF NOT EXISTS webhook_error TEXT;

-- Index for health queries
CREATE INDEX IF NOT EXISTS idx_projects_webhook_status ON projects(webhook_status);
CREATE INDEX IF NOT EXISTS idx_projects_last_webhook_at ON projects(last_webhook_at);