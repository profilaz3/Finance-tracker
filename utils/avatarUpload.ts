import { AVATAR_MAX_DIMENSION, WEBP_QUALITY, dataUrlToBlob, processImage } from './imageResize';

type AvatarUploader = { uploadAvatar: (file: File, personId: string) => Promise<string> };

/** True for avatars still held inline as a data: URL (not yet in Supabase Storage). */
export const isInlineAvatar = (avatar: string | undefined | null): avatar is string =>
  typeof avatar === 'string' && avatar.startsWith('data:');

/**
 * Move an inline (data: URL) avatar into the `avatars` Storage bucket and return its
 * public URL. The image is re-downscaled to 256px WebP first, which also shrinks
 * legacy full-size inline avatars. Returns null when the upload is not possible
 * (offline, signed out, bucket missing); callers keep the data URL in that case.
 */
export async function uploadInlineAvatar(
  avatar: string,
  personId: string,
  getUploader: () => Promise<AvatarUploader>,
): Promise<string | null> {
  if (!isInlineAvatar(avatar)) {
    return null;
  }

  try {
    const { file } = await processImage(dataUrlToBlob(avatar), {
      maxDimension: AVATAR_MAX_DIMENSION,
      quality: WEBP_QUALITY,
      fileName: 'avatar',
    });
    const uploader = await getUploader();
    return await uploader.uploadAvatar(file, personId);
  } catch (error) {
    console.warn('Avatar upload failed; keeping the inline image', error);
    return null;
  }
}
