-- Add shared_emails column to events table
ALTER TABLE events ADD COLUMN IF NOT EXISTS shared_emails text[] DEFAULT '{}';

-- Drop legacy guest policies
DROP POLICY IF EXISTS "Allow guest event inserts" ON events;
DROP POLICY IF EXISTS "Allow guest event reads" ON events;
DROP POLICY IF EXISTS "Allow guest event updates" ON events;
DROP POLICY IF EXISTS "Allow guest event deletes" ON events;

-- Drop previous participant policies if they exist (from my previous attempt)
DROP POLICY IF EXISTS "Participants can read shared events" ON events;
DROP POLICY IF EXISTS "Participants can update shared events" ON events;

-- Policy: Shared users can READ events they are in
CREATE POLICY "Shared users can read events"
ON events
FOR SELECT
TO authenticated
USING (
  (auth.jwt() ->> 'email') = ANY(shared_emails)
);

-- Policy: Shared users can UPDATE events they are in
CREATE POLICY "Shared users can update events"
ON events
FOR UPDATE
TO authenticated
USING (
  (auth.jwt() ->> 'email') = ANY(shared_emails)
);

-- Note: Owners already have access via existing policies (user_id = auth.uid())
