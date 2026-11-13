-- Add category column to shared_expenses table
ALTER TABLE shared_expenses
ADD COLUMN IF NOT EXISTS category TEXT;

-- Set default category for existing rows
UPDATE shared_expenses
SET category = 'Activities'
WHERE category IS NULL;
