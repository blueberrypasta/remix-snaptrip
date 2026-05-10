
import React, { useState, useEffect } from 'react';
import { useTranslations } from '../translations';
import { supabase } from '../services/supabaseClient';
import type { Language } from '../types';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (name: string, email: string, avatar: string, accessToken: string) => void;
  language: Language;
}

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose, language }) => {
  const t = useTranslations(language);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isInAppBrowser, setIsInAppBrowser] = useState(false);

  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    if (userAgent.includes('kakao') || userAgent.includes('instagram') || userAgent.includes('fbav') || userAgent.includes('line')) {
      setIsInAppBrowser(true);
    }
  }, []);

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const redirectTo = window.location.origin + '/remix-snaptrip/';

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectTo,
          queryParams: {
            prompt: 'select_account'
          }
        }
      });
      if (error) throw error;
    } catch (e: any) {
      console.error("Login Error:", e);
      setError(t('oauth403Help'));
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-md" onClick={onClose}></div>
      <div className="relative w-full max-w-sm bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl overflow-hidden animate-fade-in-up border border-white/5">
        <div className="p-8 text-center">
          <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl shadow-inner">
            👋
          </div>
          <h3 className="text-2xl font-black text-slate-800 dark:text-white mb-2">{t('login')}</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed break-keep">
            {t('loginBenefitMsg')}
          </p>

          {isInAppBrowser && (
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 text-[11px] rounded-2xl mb-6 font-bold leading-normal text-left border border-blue-100 dark:border-blue-900/30">
              <div className="flex gap-2 mb-1">
                <span className="material-symbols-outlined text-sm flex-shrink-0">info</span>
                <span className="font-black uppercase tracking-widest text-[10px]">Mobile Browser Tip</span>
              </div>
              <p className="opacity-90">{t('inAppBrowserTip')}</p>
            </div>
          )}

          {error && (
            <div className="p-5 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 text-[11px] rounded-2xl mb-6 font-bold leading-normal text-left border border-red-100 dark:border-red-900/30">
              <div className="flex gap-2 mb-2">
                <span className="material-symbols-outlined text-sm flex-shrink-0">report</span>
                <span className="font-black uppercase tracking-widest text-[10px]">Login Issue</span>
              </div>
              <p className="opacity-90 font-medium">{error}</p>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <button
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-white dark:bg-white/5 hover:bg-slate-50 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 rounded-2xl text-slate-700 dark:text-white font-bold transition-all shadow-sm hover:shadow-md active:scale-95 disabled:opacity-50"
            >
               {isLoading ? (
                   <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
               ) : (
                   <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
               )}
               <span>{isLoading ? 'Connecting...' : t('signInWithGoogle')}</span>
            </button>

            <button
              onClick={onClose}
              className="w-full py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-2xl font-bold text-sm transition-all active:scale-95"
            >
              {t('loginLater')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
