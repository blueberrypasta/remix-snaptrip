import React, { useState, useRef, useEffect } from 'react';
import type { Language, User } from '../types';
import { useTranslations, translations } from '../translations';
import { SnapTripLogo } from './SnapTripLogo';
import { usageService } from '../services/usageService';
import { Icon } from './Icon';

declare global {
  interface Window {
    slapTripAppearance?: {
      get: () => 'system' | 'light' | 'dark';
      set: (theme: 'system' | 'light' | 'dark') => void;
    };
  }
}

interface HeaderProps {
  onToggleSidebar: () => void;
  language: Language;
  setLanguage: (lang: Language) => void;
  user: (User & { id: string }) | null;
  onLogin: () => void;
  onLogout: () => void;
  credits: number;
  maxCredits: number;
  isSyncing?: boolean;
  onShowAbout: () => void;
  onGoHome?: () => void;
}

const LANGUAGES: { code: Language }[] = [
  { code: 'ko' },
  { code: 'en' },
  { code: 'ja' },
  { code: 'zh' },
  { code: 'es' },
  { code: 'fr' },
  { code: 'de' },
  { code: 'it' },
];

export const Header: React.FC<HeaderProps> = ({
  onToggleSidebar,
  language,
  setLanguage,
  user,
  onLogin,
  onLogout,
  credits,
  maxCredits,
  isSyncing = false,
  onShowAbout,
  onGoHome,
}) => {
  const t = useTranslations(language);
  const [currentTheme, setCurrentTheme] = useState<'system' | 'light' | 'dark'>(() => {
    return (typeof window !== 'undefined' && window.slapTripAppearance) ? window.slapTripAppearance.get() : 'system';
  });

  const handleThemeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value as 'system' | 'light' | 'dark';
    setCurrentTheme(val);
    if (window.slapTripAppearance) {
      window.slapTripAppearance.set(val);
    }
  };
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [promoMessage, setPromoMessage] = useState({ text: '', type: '' });
  const [isApplying, setIsApplying] = useState(false);

  const settingsContainerRef = useRef<HTMLDivElement>(null);
  const settingsTriggerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const closeSettings = (restoreFocus: boolean) => {
    setIsSettingsOpen(false);
    if (restoreFocus) {
      requestAnimationFrame(() => {
        settingsTriggerRef.current?.focus();
      });
    }
  };

  useEffect(() => {
    if (!isSettingsOpen) return;

    closeButtonRef.current?.focus();

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!settingsContainerRef.current?.contains(target)) {
        setIsSettingsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeSettings(true);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSettingsOpen]);

  const handleApplyPromo = async () => {
    if (!user || isApplying) return;

    const targetCode = promoCode.trim();
    if (!targetCode) return;

    setIsApplying(true);
    setPromoMessage({ text: '', type: '' });

    try {
      const result = await usageService.applyPromoCode(user.id, targetCode);
      if (result.success) {
        setPromoMessage({ text: 'Success!', type: 'success' });
        setTimeout(() => window.location.reload(), 1200);
      } else {
        setPromoMessage({ text: 'Invalid code', type: 'error' });
        setIsApplying(false);
      }
    } catch {
      setPromoMessage({ text: 'Error', type: 'error' });
      setIsApplying(false);
    }
  };

  const handleContactDev = () => {
    window.location.href = 'mailto:contact@slaptrip.com?subject=[SlapTrip Support] Inquiry';
  };

  const handleSupportDev = () => {
    window.open('https://buymeacoffee.com/blueberrypastaco', '_blank', 'noopener,noreferrer');
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-st-surface/95 backdrop-blur-md border-b border-st-ink/10 pt-[env(safe-area-inset-top,0px)]">
      <div className="flex items-center justify-between gap-3 px-4 sm:px-6 lg:px-8 h-14 sm:h-16 max-w-6xl mx-auto">
        <button
          type="button"
          onClick={() => (onGoHome ? onGoHome() : window.location.reload())}
          className="flex items-center gap-2.5 min-h-[44px] pr-2 rounded-xl text-left hover:opacity-80 transition-opacity shrink-0"
        >
          <SnapTripLogo className="size-7 shrink-0" />
          <span className="text-[17px] font-bold tracking-tight text-st-ink">SlapTrip</span>
        </button>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            aria-label={t('history')}
            onClick={onToggleSidebar}
            className="min-h-[44px] min-w-[44px] px-3 inline-flex items-center justify-center gap-1.5 rounded-full text-sm font-medium text-st-ink hover:bg-st-ink/[0.06] transition-colors"
          >
            <Icon name="bookmarks" className="text-[20px]" />
            <span className="hidden sm:inline">{t('history')}</span>
          </button>

          <div className="relative" ref={settingsContainerRef}>
            <button
              ref={settingsTriggerRef}
              type="button"
              aria-label={t('settings')}
              aria-expanded={isSettingsOpen}
              aria-controls="header-settings-panel"
              onClick={() => setIsSettingsOpen((prev) => !prev)}
              className={`min-h-[44px] min-w-[44px] px-3 inline-flex items-center justify-center gap-1.5 rounded-full border text-sm font-medium transition-colors ${
                isSettingsOpen
                  ? 'bg-st-ink text-st-surface border-st-ink'
                  : 'bg-st-surface-alt hover:bg-st-surface-muted text-st-ink border-st-ink/[0.12]'
              }`}
            >
              <Icon name="settings" className="text-[20px]" />
              <span className="hidden sm:inline">{t('settings')}</span>
            </button>

            {isSettingsOpen && (
              <>
                <div
                  className="fixed inset-0 bg-black/25 z-40 sm:hidden"
                  aria-hidden="true"
                  onClick={() => closeSettings(true)}
                />
                <div
                  id="header-settings-panel"
                  role="dialog"
                  aria-label={t('settings')}
                  className="fixed top-[64px] left-4 right-4 sm:absolute sm:top-full sm:left-auto sm:right-0 sm:mt-2 sm:w-[340px] max-h-[calc(100dvh-84px)] overflow-y-auto rounded-3xl bg-st-surface text-st-ink border border-st-ink/15 shadow-2xl p-4 sm:p-5 z-50 t-dropdown space-y-4"
                >
                  <div className="flex items-center justify-between gap-2 pb-3 border-b border-st-ink/10">
                    <span className="text-sm font-bold tracking-tight text-st-ink">
                      {t('settings')}
                    </span>
                    <button
                      ref={closeButtonRef}
                      type="button"
                      aria-label={t('close')}
                      onClick={() => closeSettings(true)}
                      className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-full hover:bg-st-ink/[0.06] text-st-ink"
                    >
                      <Icon name="close" className="text-[20px]" />
                    </button>
                  </div>

                  {/* Theme Selector */}
                  <div className="flex items-center gap-2">
                    <label htmlFor="theme-select" className="text-xs font-medium text-st-ink">
                      {t('themeLabel')}
                    </label>
                    <select
                      id="theme-select"
                      value={currentTheme}
                      onChange={handleThemeChange}
                      className="h-[44px] min-w-0 rounded-lg border border-st-ink/25 bg-st-surface px-3 text-sm text-st-ink focus-visible:border-st-mint"
                    >
                      <option value="system">{t('themeSystem')}</option>
                      <option value="light">{t('themeLight')}</option>
                      <option value="dark">{t('themeDark')}</option>
                    </select>
                  </div>

                  {/* Account & Credits */}
                  <div className="rounded-2xl bg-st-surface-alt p-3.5 space-y-3 border border-st-ink/[0.08]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-st-secondary">
                        {t('credits')}
                      </span>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#2EE5A8]/25 text-st-mint text-xs font-bold">
                        <Icon name="diamond" className="text-[14px]" />
                        {isSyncing ? '…' : `${credits} / ${maxCredits}`}
                      </span>
                    </div>

                    {user ? (
                      <div className="flex items-center justify-between gap-3 pt-2 border-t border-st-ink/10">
                        <div className="min-w-0 flex items-center gap-2.5">
                          <img
                            src={user.avatar}
                            alt=""
                            className="w-8 h-8 rounded-full object-cover border border-st-ink/15 shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-st-ink truncate">{user.name}</p>
                            {user.email && (
                              <p className="text-[11px] text-st-secondary truncate">{user.email}</p>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setIsSettingsOpen(false);
                            onLogout();
                          }}
                          className="min-h-[44px] px-3 rounded-xl text-xs font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-500/10 transition-colors shrink-0"
                        >
                          {t('logout')}
                        </button>
                      </div>
                    ) : (
                      <div className="pt-2 border-t border-st-ink/10 space-y-2">
                        <p className="text-xs text-st-secondary leading-relaxed">{t('loginBenefitMsg')}</p>
                        <button
                          type="button"
                          onClick={() => {
                            setIsSettingsOpen(false);
                            onLogin();
                          }}
                          className="w-full min-h-[44px] px-4 rounded-xl bg-st-ink text-st-surface text-xs font-semibold hover:bg-[#22282B] dark:hover:bg-st-ink/90 transition-colors inline-flex items-center justify-center gap-2"
                        >
                          <Icon name="login" className="text-[18px]" />
                          {t('login')}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Promo Code */}
                  <div className="rounded-2xl bg-st-surface-alt p-3.5 space-y-2.5 border border-st-ink/[0.08]">
                    <p className="text-xs font-semibold uppercase tracking-wider text-st-secondary">
                      {t('promoCodeLabel')}
                    </p>
                    {user ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={promoCode}
                          onChange={(e) => setPromoCode(e.target.value)}
                          placeholder={t('enterCode')}
                          onKeyDown={(e) => e.key === 'Enter' && handleApplyPromo()}
                          className="min-h-[44px] min-w-0 flex-1 rounded-xl bg-st-surface border border-st-ink/15 px-3 text-xs font-medium text-st-ink placeholder:text-st-secondary/70"
                        />
                        <button
                          type="button"
                          onClick={handleApplyPromo}
                          disabled={isApplying}
                          className="min-h-[44px] px-3.5 rounded-xl bg-[#2EE5A8] hover:bg-[#22D398] text-[#0D1412] text-xs font-semibold disabled:opacity-50 transition-colors shrink-0"
                        >
                          {isApplying ? '…' : t('applyPromo')}
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs text-st-secondary">{t('loginBenefitMsg')}</p>
                    )}
                    {promoMessage.text && (
                      <p
                        className={`text-xs font-semibold ${
                          promoMessage.type === 'success' ? 'text-st-mint' : 'text-rose-700 dark:text-rose-300'
                        }`}
                      >
                        {promoMessage.text}
                      </p>
                    )}
                  </div>

                  {/* Languages (all 8) */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-st-secondary px-1">
                      {t('selectLanguage')}
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {LANGUAGES.map((lang) => {
                        const isActive = language === lang.code;
                        return (
                          <button
                            key={lang.code}
                            type="button"
                            aria-pressed={isActive}
                            onClick={() => {
                              setLanguage(lang.code);
                              closeSettings(true);
                            }}
                            className={`min-h-[44px] px-3 py-2 rounded-xl text-left flex items-center justify-between text-xs font-semibold border transition-colors ${
                              isActive
                                ? 'bg-[#2EE5A8] text-[#0D1412] border-[#1ED698]'
                                : 'bg-st-surface-alt text-st-ink border-st-ink/[0.08] hover:bg-st-surface-muted'
                            }`}
                          >
                            <span className="truncate">{translations.languageName[lang.code]}</span>
                            <span className="text-[10px] uppercase opacity-70 ml-1">{lang.code}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* About & Support */}
                  <div className="pt-2 border-t border-st-ink/10 flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setIsSettingsOpen(false);
                        onShowAbout();
                      }}
                      className="w-full min-h-[44px] px-3 rounded-xl flex items-center justify-between text-xs font-semibold text-st-ink hover:bg-st-surface-alt transition-colors"
                    >
                      <span>{t('aboutSnapTrip')}</span>
                      <Icon name="info" className="text-[18px] text-st-secondary" />
                    </button>
                    <button
                      type="button"
                      onClick={handleContactDev}
                      className="w-full min-h-[44px] px-3 rounded-xl flex items-center justify-between text-xs font-semibold text-st-ink hover:bg-st-surface-alt transition-colors"
                    >
                      <span>{t('contactDev')}</span>
                      <Icon name="mail" className="text-[18px] text-st-secondary" />
                    </button>
                    <button
                      type="button"
                      onClick={handleSupportDev}
                      className="w-full min-h-[44px] px-3 rounded-xl flex items-center justify-between text-xs font-semibold text-st-ink hover:bg-st-surface-alt transition-colors"
                    >
                      <span>{t('supportDev')}</span>
                      <Icon name="coffee" className="text-[18px] text-st-secondary" />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
