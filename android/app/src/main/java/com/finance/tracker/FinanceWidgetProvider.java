package com.finance.tracker;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.text.format.DateFormat;
import android.text.format.DateUtils;
import android.util.TypedValue;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Home screen widget: this month's spending, the budget left (or income without a budget) and a
 * "+" that opens the app straight into a new expense. The web app pushes the numbers through
 * FinanceBridgePlugin.updateWidget; the widget never reads app data on its own.
 */
public class FinanceWidgetProvider extends AppWidgetProvider {

    private static final String PREFS = "finance_widget";
    private static final String KEY_SNAPSHOT = "snapshot";
    private static final int COMPACT_HEIGHT_DP = 100;
    private static final int TALL_HEIGHT_DP = 130;

    static void saveSnapshot(Context context, String json) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_SNAPSHOT, json).apply();
    }

    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, FinanceWidgetProvider.class));
        for (int id : ids) {
            manager.updateAppWidget(id, build(context, manager.getAppWidgetOptions(id)));
        }
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) {
            manager.updateAppWidget(id, build(context, manager.getAppWidgetOptions(id)));
        }
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        manager.updateAppWidget(id, build(context, options));
    }

    private static JSONObject readSnapshot(Context context) {
        String json = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_SNAPSHOT, null);
        if (json == null) return null;
        try {
            return new JSONObject(json);
        } catch (JSONException error) {
            return null;
        }
    }

    static RemoteViews build(Context context, Bundle options) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_finance);
        int heightDp = options != null ? options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0) : 0;
        boolean compact = heightDp > 0 && heightDp < COMPACT_HEIGHT_DP;
        boolean tall = heightDp >= TALL_HEIGHT_DP;

        int padding = dp(context, compact ? 12 : 16);
        views.setViewPadding(R.id.widget_root, padding, padding, padding, padding);
        views.setTextViewTextSize(R.id.widget_spent, TypedValue.COMPLEX_UNIT_SP, compact ? 21 : tall ? 30 : 26);

        JSONObject snapshot = readSnapshot(context);
        boolean signedIn = snapshot != null && snapshot.optBoolean("signedIn", false);

        String title = snapshot != null ? snapshot.optString("title", "") : "";
        if (!title.isEmpty()) views.setTextViewText(R.id.widget_title, title);
        views.setViewVisibility(R.id.widget_title, compact && signedIn ? View.GONE : View.VISIBLE);

        if (signedIn) {
            views.setViewVisibility(R.id.widget_spent, View.VISIBLE);
            views.setTextViewText(R.id.widget_spent, snapshot.optString("spentText", ""));
            String secondaryLabel = snapshot.optString("secondaryLabel", "");
            String secondaryText = snapshot.optString("secondaryText", "");
            views.setTextViewText(R.id.widget_secondary, secondaryLabel.isEmpty() ? secondaryText : secondaryLabel + " · " + secondaryText);
            boolean over = snapshot.optBoolean("overBudget", false);
            views.setTextColor(R.id.widget_secondary, context.getColor(over ? R.color.widget_negative : R.color.widget_muted));

            double progress = snapshot.optDouble("progress", -1);
            boolean showProgress = progress >= 0 && !compact;
            views.setViewVisibility(R.id.widget_progress, showProgress && !over ? View.VISIBLE : View.GONE);
            views.setViewVisibility(R.id.widget_progress_over, showProgress && over ? View.VISIBLE : View.GONE);
            if (showProgress && !over) {
                views.setProgressBar(R.id.widget_progress, 1000, (int) Math.round(Math.min(1, progress) * 1000), false);
            }

            long updatedAt = snapshot.optLong("updatedAt", 0);
            boolean showUpdated = tall && updatedAt > 0;
            views.setViewVisibility(R.id.widget_updated, showUpdated ? View.VISIBLE : View.GONE);
            if (showUpdated) {
                String when = DateUtils.isToday(updatedAt)
                    ? DateFormat.getTimeFormat(context).format(updatedAt)
                    : DateFormat.getMediumDateFormat(context).format(updatedAt);
                views.setTextViewText(R.id.widget_updated, snapshot.optString("updatedLabel", "") + " " + when);
            }
            String addLabel = snapshot.optString("addLabel", "");
            if (!addLabel.isEmpty()) views.setContentDescription(R.id.widget_add, addLabel);
        } else {
            views.setViewVisibility(R.id.widget_spent, View.GONE);
            views.setViewVisibility(R.id.widget_progress, View.GONE);
            views.setViewVisibility(R.id.widget_progress_over, View.GONE);
            views.setViewVisibility(R.id.widget_updated, View.GONE);
            String signIn = snapshot != null ? snapshot.optString("signInText", "") : "";
            if (signIn.isEmpty()) {
                views.setTextViewText(R.id.widget_secondary, context.getString(R.string.widget_placeholder_body));
            } else {
                views.setTextViewText(R.id.widget_secondary, signIn);
            }
            views.setTextColor(R.id.widget_secondary, context.getColor(R.color.widget_muted));
        }

        views.setOnClickPendingIntent(R.id.widget_root, openAppIntent(context));
        views.setOnClickPendingIntent(R.id.widget_add, addExpenseIntent(context));
        return views;
    }

    private static PendingIntent openAppIntent(Context context) {
        Intent intent = new Intent(context, MainActivity.class)
            .setAction(Intent.ACTION_MAIN)
            .addCategory(Intent.CATEGORY_LAUNCHER)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static PendingIntent addExpenseIntent(Context context) {
        Intent intent = new Intent(context, MainActivity.class)
            .setAction(FinanceBridgePlugin.ACTION_ADD_EXPENSE)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(context, 1, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static int dp(Context context, int value) {
        return Math.round(value * context.getResources().getDisplayMetrics().density);
    }
}
