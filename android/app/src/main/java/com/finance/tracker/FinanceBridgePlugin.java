package com.finance.tracker;

import android.content.ClipData;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Parcelable;
import android.util.Base64;
import android.util.Log;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import androidx.core.content.FileProvider;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Bridge between the web app and Android entry points outside the web view:
 *  - updateWidget: stores the home screen widget snapshot and redraws the widgets.
 *  - getPendingAction: the widget's "+" button (add an expense).
 *  - getPendingShare: a receipt image shared into the app from another app.
 *  - shareImage: shares a PNG (a payment QR code) to other apps through the system share sheet.
 * Pending items survive until the web app reads them, so a share that arrives before sign-in waits.
 */
@CapacitorPlugin(name = "FinanceBridge")
public class FinanceBridgePlugin extends Plugin {

    static final String ACTION_ADD_EXPENSE = "com.finance.tracker.action.ADD_EXPENSE";
    private static final String TAG = "FinanceBridge";
    private static final String PENDING_PREFS = "finance_pending";
    private static final String KEY_ACTION = "action";

    private final ExecutorService io = Executors.newSingleThreadExecutor();

    @Override
    public void load() {
        handleIntent(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (ACTION_ADD_EXPENSE.equals(action)) {
            pendingPrefs(getContext()).edit().putString(KEY_ACTION, "add-expense").apply();
            consume(intent);
            notifyListeners("actionReceived", new JSObject(), true);
            return;
        }
        boolean isShare = Intent.ACTION_SEND.equals(action) || Intent.ACTION_SEND_MULTIPLE.equals(action);
        String type = intent.getType();
        if (!isShare || type == null || !type.startsWith("image/")) return;
        final Uri uri = firstStream(intent);
        consume(intent);
        if (uri == null) return;
        final Context context = getContext().getApplicationContext();
        io.execute(() -> {
            if (SharedImage.save(context, uri)) {
                notifyListeners("shareReceived", new JSObject(), true);
            }
        });
    }

    /** Keeps a recreated activity from handling the same share or widget tap twice. */
    private void consume(Intent intent) {
        if (getActivity() != null && getActivity().getIntent() == intent) {
            getActivity().setIntent(new Intent(Intent.ACTION_MAIN));
        }
    }

    @SuppressWarnings("deprecation")
    private static Uri firstStream(Intent intent) {
        if (Intent.ACTION_SEND.equals(intent.getAction())) {
            Parcelable stream = Build.VERSION.SDK_INT >= 33
                ? intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri.class)
                : intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (stream instanceof Uri) return (Uri) stream;
        } else {
            ArrayList<? extends Parcelable> streams = Build.VERSION.SDK_INT >= 33
                ? intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri.class)
                : intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (streams != null && !streams.isEmpty() && streams.get(0) instanceof Uri) return (Uri) streams.get(0);
        }
        if (intent.getClipData() != null && intent.getClipData().getItemCount() > 0) {
            return intent.getClipData().getItemAt(0).getUri();
        }
        return null;
    }

    private static SharedPreferences pendingPrefs(Context context) {
        return context.getSharedPreferences(PENDING_PREFS, Context.MODE_PRIVATE);
    }

    @PluginMethod
    public void updateWidget(PluginCall call) {
        JSObject data = call.getData();
        FinanceWidgetProvider.saveSnapshot(getContext(), data.toString());
        FinanceWidgetProvider.refreshAll(getContext());
        call.resolve();
    }

    @PluginMethod
    public void getPendingAction(PluginCall call) {
        SharedPreferences prefs = pendingPrefs(getContext());
        String action = prefs.getString(KEY_ACTION, null);
        prefs.edit().remove(KEY_ACTION).apply();
        JSObject result = new JSObject();
        if (action != null) result.put("action", action);
        call.resolve(result);
    }

    @PluginMethod
    public void getPendingShare(PluginCall call) {
        final Context context = getContext().getApplicationContext();
        io.execute(() -> {
            JSObject result = new JSObject();
            File file = SharedImage.pendingFile(context);
            if (file.exists()) {
                try {
                    byte[] bytes = readAll(file);
                    result.put("dataUrl", "data:image/jpeg;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP));
                } catch (IOException error) {
                    Log.w(TAG, "Could not read the shared image", error);
                } finally {
                    //noinspection ResultOfMethodCallIgnored
                    file.delete();
                }
            }
            call.resolve(result);
        });
    }

    /**
     * Shares a PNG through the system share sheet. Takes base64 data (no data URL prefix), a file
     * name and an optional text. The file goes to the cache through the app's FileProvider, and this
     * app is left out of the chooser so a QR code is never shared back into itself.
     */
    @PluginMethod
    public void shareImage(PluginCall call) {
        final String base64 = call.getString("base64");
        final String rawName = call.getString("fileName", "payment-qr.png");
        final String text = call.getString("text", "");
        final String title = call.getString("title", "");
        if (base64 == null || base64.isEmpty() || base64.length() > 8 * 1024 * 1024) {
            call.reject("Missing or oversized image");
            return;
        }
        final String fileName = rawName.replaceAll("[^A-Za-z0-9._-]", "_");
        final Context context = getContext().getApplicationContext();
        io.execute(() -> {
            try {
                File dir = new File(context.getCacheDir(), "shared-out");
                if (!dir.exists() && !dir.mkdirs()) throw new IOException("cache dir");
                File file = new File(dir, fileName.endsWith(".png") ? fileName : fileName + ".png");
                try (FileOutputStream out = new FileOutputStream(file)) {
                    out.write(Base64.decode(base64, Base64.DEFAULT));
                }
                Uri uri = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", file);
                Intent send = new Intent(Intent.ACTION_SEND);
                send.setType("image/png");
                send.putExtra(Intent.EXTRA_STREAM, uri);
                if (!text.isEmpty()) send.putExtra(Intent.EXTRA_TEXT, text);
                send.setClipData(ClipData.newRawUri("", uri));
                send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                Intent chooser = Intent.createChooser(send, title.isEmpty() ? null : title);
                chooser.putExtra(Intent.EXTRA_EXCLUDE_COMPONENTS,
                    new ComponentName[] { new ComponentName(context, MainActivity.class) });
                chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                getActivity().runOnUiThread(() -> {
                    try {
                        getActivity().startActivity(chooser);
                        call.resolve();
                    } catch (Exception error) {
                        Log.w(TAG, "Could not open the share sheet", error);
                        call.reject("Share failed");
                    }
                });
            } catch (Exception error) {
                Log.w(TAG, "Could not prepare the shared image", error);
                call.reject("Share failed");
            }
        });
    }

    private static byte[] readAll(File file) throws IOException {
        byte[] bytes = new byte[(int) file.length()];
        try (InputStream in = new FileInputStream(file)) {
            int offset = 0;
            while (offset < bytes.length) {
                int read = in.read(bytes, offset, bytes.length - offset);
                if (read < 0) break;
                offset += read;
            }
        }
        return bytes;
    }

    @Override
    protected void handleOnDestroy() {
        io.shutdown();
        super.handleOnDestroy();
    }
}
