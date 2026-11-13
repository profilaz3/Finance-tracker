package com.finance.tracker;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Local plugin: home screen widget data, widget actions and images shared into the app.
        registerPlugin(FinanceBridgePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
