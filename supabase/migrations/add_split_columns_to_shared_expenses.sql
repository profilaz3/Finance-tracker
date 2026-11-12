-- Migration to add split columns to shared_expenses table
-- Run this in Supabase SQL Editor

-- Add split_type column
ALTER TABLE shared_expenses
ADD COLUMN IF NOT EXISTS split_type TEXT DEFAULT 'equal' CHECK (split_type IN ('equal', 'exact'));

-- Add split_details column
ALTER TABLE shared_expenses
ADD COLUMN IF NOT EXISTS split_details JSONB DEFAULT NULL;

-- Update existing rows to have default split_type
UPDATE shared_expenses
SET split_type = 'equal'
WHERE split_type IS NULL;
