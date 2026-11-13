package com.finance.tracker;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.net.Uri;
import android.util.Log;
import androidx.exifinterface.media.ExifInterface;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

/** Copies an image shared into the app to the cache, upright and downscaled for receipt scanning. */
final class SharedImage {
    private static final String TAG = "SharedImage";
    private static final int MAX_SIDE = 1600;
    private static final int JPEG_QUALITY = 85;

    private SharedImage() {}

    static File pendingFile(Context context) {
        File dir = new File(context.getCacheDir(), "shared");
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
        return new File(dir, "receipt.jpg");
    }

    static boolean save(Context context, Uri uri) {
        try {
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            try (InputStream in = context.getContentResolver().openInputStream(uri)) {
                if (in == null) return false;
                BitmapFactory.decodeStream(in, null, bounds);
            }
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return false;

            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inSampleSize = sampleSize(Math.max(bounds.outWidth, bounds.outHeight));
            Bitmap bitmap;
            try (InputStream in = context.getContentResolver().openInputStream(uri)) {
                if (in == null) return false;
                bitmap = BitmapFactory.decodeStream(in, null, options);
            }
            if (bitmap == null) return false;

            int rotation = 0;
            try (InputStream in = context.getContentResolver().openInputStream(uri)) {
                if (in != null) rotation = new ExifInterface(in).getRotationDegrees();
            } catch (Exception ignored) {
                // No EXIF: keep as is.
            }

            float scale = Math.min(1f, (float) MAX_SIDE / Math.max(bitmap.getWidth(), bitmap.getHeight()));
            if (scale < 1f || rotation != 0) {
                Matrix matrix = new Matrix();
                if (scale < 1f) matrix.postScale(scale, scale);
                if (rotation != 0) matrix.postRotate(rotation);
                Bitmap transformed = Bitmap.createBitmap(bitmap, 0, 0, bitmap.getWidth(), bitmap.getHeight(), matrix, true);
                if (transformed != bitmap) bitmap.recycle();
                bitmap = transformed;
            }

            File out = pendingFile(context);
            try (OutputStream stream = new FileOutputStream(out)) {
                bitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, stream);
            } finally {
                bitmap.recycle();
            }
            return true;
        } catch (Exception | OutOfMemoryError error) {
            Log.w(TAG, "Could not read the shared image", error);
            return false;
        }
    }

    /** Largest power of two that keeps the decoded image at least MAX_SIDE on its long side. */
    private static int sampleSize(int longSide) {
        int sample = 1;
        while (longSide / (sample * 2) >= MAX_SIDE) sample *= 2;
        return sample;
    }
}
