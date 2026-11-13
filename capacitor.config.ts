import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.finance.tracker',
  appName: 'Finance Tracker',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    // Android 15+ forces edge-to-edge. Let the WebView draw behind the system bars and
    // expose the bar sizes as env(safe-area-inset-*) so the layout pads itself (M32).
    SystemBars: {
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
    },
    Camera: {
      permissions: ['camera', 'photos']
    }
  }
};

export default config;
