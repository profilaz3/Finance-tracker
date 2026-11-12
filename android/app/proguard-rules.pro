# ========================================
# Capacitor / React Native Rules
# ========================================

# Keep Capacitor plugin classes
-keep class com.capacitor.** { *; }
-keep class com.getcapacitor.** { *; }

# Keep Capacitor JS interfaces
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# ========================================
# React Native Rules
# ========================================

# Keep React Native methods
-keep class com.facebook.react.** { *; }
-keep interface com.facebook.react.bridge.** { *; }

# Keep React Native modules
-keepclassmembers class * extends com.facebook.react.bridge.NativeModule {
    <methods>;
}

# ========================================
# App-Specific Rules
# ========================================

# Keep your model/data classes if using reflection
-keep class com.finance.tracker.models.** { *; }
-keep class com.finance.tracker.types.** { *; }

# Keep serializable classes
-keepclassmembers class * implements java.io.Serializable {
    private static final java.io.ObjectStreamField[] serialPersistentFields;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
}

# Keep enum classes
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# ========================================
# Third-Party Library Rules
# ========================================

# OpenAI
-keep class com.openai.** { *; }

# Supabase
-keep class io.supabase.** { *; }

# Gson (if used for JSON)
-keepattributes Signature
-keepattributes *Annotation*
-dontwarn sun.misc.**
-keep class com.google.gson.** { *; }
-keep class * implements com.google.gson.TypeAdapter
-keep class * implements com.google.gson.JsonSerializer
-keep class * implements com.google.gson.JsonDeserializer

# ========================================
# Optimization Settings
# ========================================

# Don't optimize for size (keep performance)
-dontoptimize

# Keep line numbers for debugging
-keepattributes SourceFile,LineNumberTable
