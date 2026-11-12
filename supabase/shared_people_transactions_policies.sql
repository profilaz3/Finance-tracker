-- RLS Policies for People, Transactions, and Shared Expenses to support shared events
-- Apply this migration to allow shared event participants to access related data

-- ============================================================================
-- PEOPLE TABLE POLICIES
-- ============================================================================
-- People are owned by users globally, not tied to specific events.
-- Allow access if user owns the person OR the person is used in a shared event.

DROP POLICY IF EXISTS "Users can view their own people or people in shared events" ON people;
DROP POLICY IF EXISTS "Users can insert their own people or people in shared events" ON people;
DROP POLICY IF EXISTS "Users can update their own people or people in shared events" ON people;
DROP POLICY IF EXISTS "Users can delete their own people or people in shared events" ON people;

CREATE POLICY "Users can view their own people or people in shared events"
ON people FOR SELECT
TO authenticated
USING (
    user_id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM events e
        WHERE e.user_id = people.user_id
        AND e.shared_emails @> ARRAY[auth.jwt() ->> 'email']
    )
);

-- Users can only INSERT their own people
CREATE POLICY "Users can insert their own people or people in shared events"
ON people FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Users can only UPDATE their own people
CREATE POLICY "Users can update their own people or people in shared events"
ON people FOR UPDATE
TO authenticated
USING (user_id = auth.uid());

-- Users can only DELETE their own people
CREATE POLICY "Users can delete their own people or people in shared events"
ON people FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- ============================================================================
-- SHARED_EXPENSES TABLE POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view shared expenses in their events or shared events" ON shared_expenses;
DROP POLICY IF EXISTS "Users can insert shared expenses in their events or shared events" ON shared_expenses;
DROP POLICY IF EXISTS "Users can update shared expenses in their events or shared events" ON shared_expenses;
DROP POLICY IF EXISTS "Users can delete shared expenses in their events or shared events" ON shared_expenses;

-- Allow SELECT for shared_expenses in events user owns OR events shared with them
CREATE POLICY "Users can view shared expenses in their events or shared events"
ON shared_expenses FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM events
        WHERE events.id = shared_expenses.event_id
        AND (
            events.user_id = auth.uid()
            OR events.shared_emails @> ARRAY[auth.jwt() ->> 'email']
        )
    )
);

-- Allow INSERT for shared_expenses in events user owns OR events shared with them
CREATE POLICY "Users can insert shared expenses in their events or shared events"
ON shared_expenses FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM events
        WHERE events.id = shared_expenses.event_id
        AND (
            events.user_id = auth.uid()
            OR events.shared_emails @> ARRAY[auth.jwt() ->> 'email']
        )
    )
);

-- Allow UPDATE for shared_expenses in events user owns OR events shared with them
CREATE POLICY "Users can update shared expenses in their events or shared events"
ON shared_expenses FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM events
        WHERE events.id = shared_expenses.event_id
        AND (
            events.user_id = auth.uid()
            OR events.shared_emails @> ARRAY[auth.jwt() ->> 'email']
        )
    )
);

-- Allow DELETE for shared_expenses in events user owns OR events shared with them
CREATE POLICY "Users can delete shared expenses in their events or shared events"
ON shared_expenses FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM events
        WHERE events.id = shared_expenses.event_id
        AND (
            events.user_id = auth.uid()
            OR events.shared_emails @> ARRAY[auth.jwt() ->> 'email']
        )
    )
);
