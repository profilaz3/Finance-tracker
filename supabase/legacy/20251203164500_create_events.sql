-- Events table
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  person_ids JSONB DEFAULT '[]'::jsonb, -- Array of person IDs
  icon TEXT,
  color TEXT,
  image_url TEXT, -- URL to Supabase Storage
  status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'archived')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Shared expenses table
CREATE TABLE shared_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  amount DECIMAL(15, 2) NOT NULL,
  currency TEXT NOT NULL,
  paid_by TEXT NOT NULL, -- Person ID
  shared_with JSONB DEFAULT '[]'::jsonb, -- Array of person IDs
  date TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own events"
  ON events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own events"
  ON events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own events"
  ON events FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own events"
  ON events FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view shared expenses for their events"
  ON shared_expenses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM events 
      WHERE events.id = shared_expenses.event_id 
      AND events.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert shared expenses for their events"
  ON shared_expenses FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM events 
      WHERE events.id = shared_expenses.event_id 
      AND events.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update shared expenses for their events"
  ON shared_expenses FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM events 
      WHERE events.id = shared_expenses.event_id 
      AND events.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete shared expenses for their events"
  ON shared_expenses FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM events 
      WHERE events.id = shared_expenses.event_id 
      AND events.user_id = auth.uid()
    )
  );

-- Indexes
CREATE INDEX idx_events_user_id ON events(user_id);
CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_shared_expenses_event_id ON shared_expenses(event_id);

-- Storage bucket for event photos
INSERT INTO storage.buckets (id, name, public) 
VALUES ('event-photos', 'event-photos', true);

-- Storage policy
CREATE POLICY "Users can upload event photos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'event-photos' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Anyone can view event photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'event-photos');
