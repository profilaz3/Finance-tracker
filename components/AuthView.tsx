import React, { useState } from 'react';
import { getSupabaseService } from '../services/runtimeServices';
import { LogIn, UserPlus, AlertCircle } from 'lucide-react';
import { m } from 'motion/react';

interface AuthViewProps {
    onAuthSuccess: () => void;
}

export const AuthView: React.FC<AuthViewProps> = ({ onAuthSuccess }) => {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const supabaseService = await getSupabaseService();

            if (isLogin) {
                const { error } = await supabaseService.signIn(email, password);
                if (error) throw error;
            } else {
                const { error } = await supabaseService.signUp(email, password);
                if (error) throw error;
                // For signup, we might want to show a message to check email if email confirmation is enabled.
                // Assuming auto-confirm or no confirmation for now, or handling session immediately.
            }
            onAuthSuccess();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-surface p-4">
            <m.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-surface-container-low p-8 rounded-2xl shadow-elevation-3 w-full max-w-md border border-outline-variant/20"
            >
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-primary mb-2">Finance App</h1>
                    <p className="text-on-surface-variant">
                        {isLogin ? 'Welcome back! Please sign in.' : 'Create an account to get started.'}
                    </p>
                </div>

                {error && (
                    <div className="bg-error-container text-on-error-container p-3 rounded-lg mb-4 flex items-center gap-2 text-sm">
                        <AlertCircle size={16} />
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-on-surface-variant mb-1">Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            autoComplete="email"
                            className="w-full bg-surface-container-high border-none rounded-lg px-4 py-3 text-on-surface placeholder-on-surface-variant/60 focus:ring-2 focus:ring-primary"
                            placeholder="you@example.com"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-on-surface-variant mb-1">Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoComplete={isLogin ? 'current-password' : 'new-password'}
                            className="w-full bg-surface-container-high border-none rounded-lg px-4 py-3 text-on-surface placeholder-on-surface-variant/60 focus:ring-2 focus:ring-primary"
                            placeholder="••••••••"
                            required
                            minLength={6}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-primary text-on-primary py-3 rounded-lg font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? (
                            <div className="w-5 h-5 border-2 border-on-primary border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <>
                                {isLogin ? <LogIn size={20} /> : <UserPlus size={20} />}
                                {isLogin ? 'Sign In' : 'Sign Up'}
                            </>
                        )}
                    </button>
                </form>

                <div className="mt-6 space-y-4 text-center">
                    <button
                        onClick={() => setIsLogin(!isLogin)}
                        className="text-primary hover:underline text-sm font-medium block w-full"
                    >
                        {isLogin ? "Don't have an account? Sign Up" : "Already have an account? Sign In"}
                    </button>
                </div>
            </m.div>
        </div>
    );
};
