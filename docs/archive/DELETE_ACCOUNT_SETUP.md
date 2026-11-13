# Delete Account Setup

To enable the delete account feature, you need to deploy a Supabase Edge Function.

## Steps:

1. **Install Supabase CLI** (if not already installed):
   ```bash
   npm install -g supabase
   ```

2. **Link your project**:
   ```bash
   supabase link --project-ref ccgmzhffcnjcxivetgzv
   ```
   
   When prompted for the database password, use your Supabase database password.

3. **Deploy the edge function**:
   ```bash
   supabase functions deploy delete-user
   ```

4. **Done!** The delete account button will now properly delete users and all their data.

## How it works:

- When a user clicks "Delete Account", the app calls the edge function
- The edge function uses the service role key (server-side) to delete the auth user
- Thanks to `ON DELETE CASCADE` in the database schema, all user data (transactions, categories, accounts, people) is automatically deleted
- The user is then signed out

## Testing:

1. Create a test account
2. Add some data (transactions, categories, etc.)
3. Go to Settings → Account → Delete Account
4. Confirm the deletion
5. Try to log in again - the account should no longer exist
