import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0';
import { adminClient, requireUser } from '../_shared/auth.ts';
import { jsonResponse, serveJson } from '../_shared/http.ts';

const USER_BUCKETS = ['event-photos', 'avatars'] as const;
const PAGE = 100;

/** Removes every object under `<userId>/` in a bucket, page by page. */
const purgeFolder = async (admin: SupabaseClient, bucket: string, userId: string): Promise<number> => {
  let removed = 0;
  for (;;) {
    const { data, error } = await admin.storage.from(bucket).list(userId, { limit: PAGE });
    if (error) throw new Error(`list ${bucket}: ${error.message}`);
    const paths = (data ?? []).filter((entry) => entry.id).map((entry) => `${userId}/${entry.name}`);
    if (paths.length === 0) return removed;

    const { error: removeError } = await admin.storage.from(bucket).remove(paths);
    if (removeError) throw new Error(`remove ${bucket}: ${removeError.message}`);
    removed += paths.length;
    if (paths.length < PAGE) return removed;
  }
};

serveJson('delete-user', async (req) => {
  const { user } = await requireUser(req);
  const admin = adminClient();

  // Storage first: once the auth user is gone the folder would be orphaned.
  let removedObjects = 0;
  for (const bucket of USER_BUCKETS) {
    removedObjects += await purgeFolder(admin, bucket, user.id);
  }

  // Table rows go with the auth user through ON DELETE CASCADE foreign keys.
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) throw new Error(`deleteUser: ${error.message}`);

  return jsonResponse(req, { message: 'User deleted', removedObjects });
});
