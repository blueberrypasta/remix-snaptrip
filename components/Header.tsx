
import React, { useState, useRef, useEffect } from 'react';
import type { Language, User } from '../types';
import { useTranslations, translations } from '../translations';
import { SnapTripLogo } from './SnapTripLogo';
import { usageService } from '../services/usageService';
import { isValidGeminiApiKey } from '../utils/apiKeyUtils';

interface HeaderProps {
  onToggleSidebar: () => void;
  language: Language;
  setLanguage: (lang: Language) => void;
  user: User & { id: string } | null;
  onLogin: () => void;
  onLogout: () => void;
  credits: number;
  maxCredits: number;
  isSyncing?: boolean;
  onShowAbout: () => void;
}

const LANGUAGES: { code: Language }[] = [
  { code: 'ko' },
  { code: 'en' },
  { code: 'ja' },
  { code: 'zh' },
  { code: 'es' },
  { code: 'fr' },
  { code: 'de' },
  { code: 'it' }
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
  onShowAbout
}) => {
  const t = useTranslations(language);
  const [openMenu, setOpenMenu] = useState<null | 'language' | 'promo' | 'settings' | 'profile' | 'mobile'>(null);
  const [promoCode, setPromoCode] = useState('');
  const [promoMessage, setPromoMessage] = useState({ text: '', type: '' });
  const [isApplying, setIsApplying] = useState(false);
  const [localApiKey, setLocalApiKey] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('SNAPTRIP_API_KEY');
      return (stored && stored !== 'null' && stored !== 'undefined') ? stored : '';
    }
    return '';
  });

  const hasValidApiKey = isValidGeminiApiKey(localApiKey);
  const [showKeySaved, setShowKeySaved] = useState(false);
  
  const settingsRef = useRef<HTMLDivElement>(null);
  const langRef = useRef<HTMLDivElement>(null);
  const promoRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      const clickedInsideMenu =
        settingsRef.current?.contains(target) ||
        langRef.current?.contains(target) ||
        promoRef.current?.contains(target) ||
        profileRef.current?.contains(target) ||
        mobileMenuRef.current?.contains(target);

      if (!clickedInsideMenu) {
        setOpenMenu(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!openMenu) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpenMenu(null);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openMenu]);

  const handleApplyPromo = async () => {
    if (!user || isApplying) return;
    
    const targetCode = promoCode.trim();
    if (!targetCode) return;
    
    setIsApplying(true);
    setPromoMessage({ text: '', type: '' });

    try {
      const result = await usageService.applyPromoCode(user.id, targetCode);
      if (result.success) {
        setPromoMessage({ text: `✨ Success!`, type: 'success' });
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setPromoMessage({ text: 'Invalid code', type: 'error' });
        setIsApplying(false);
      }
    } catch (e) {
      setPromoMessage({ text: 'Error', type: 'error' });
      setIsApplying(false);
    }
  };

  const handleContactDev = () => {
    window.location.href = 'mailto:blueberrypastaco@gmail.com?subject=[SlapTrip Support] Inquiry';
  };

  const handleSupportDev = () => {
    window.open('https://buymeacoffee.com/blueberrypastaco', '_blank');
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-background-dark/80 backdrop-blur-lg border-b border-white/5 pt-[env(safe-area-inset-top,0px)]">
      <div className="flex items-center justify-between px-5 h-16 max-w-4xl mx-auto">
        {/* Logo Section */}
        <div className="flex items-center gap-2.5 cursor-pointer active:opacity-70 transition-opacity shrink-0" onClick={() => window.location.reload()}>
          <SnapTripLogo className="size-7 text-primary" />
          <h1 className="text-base sm:text-lg font-black tracking-tighter text-white st-shimmer">{t('appName')}</h1>
        </div>

        {/* Action Section */}
        <div className="flex items-center gap-1 sm:gap-2 flex-1 justify-end ml-4">
           {/* Language Selector (Dropdown) */}
           <div className="relative hidden sm:block" ref={langRef}>
              <button 
                onClick={() => setOpenMenu(openMenu === 'language' ? null : 'language')}
                className={`w-11 h-11 flex items-center justify-center rounded-full transition-all ${openMenu === 'language' ? 'bg-primary text-[#1B130A] shadow-lg' : 'hover:bg-white/5 text-slate-300'}`}
                aria-label={t('selectLanguage')}
              >
                <span className="material-symbols-outlined text-[24px]">language</span>
              </button>
              
              {openMenu === 'language' && (
                <>
                <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={() => setOpenMenu(null)}></div>
                <div className="fixed top-[70px] left-4 right-4 sm:absolute sm:top-full sm:left-auto sm:right-0 mt-3 w-auto sm:w-64 bg-slate-900/95 backdrop-blur-xl rounded-[2rem] shadow-2xl border border-white/10 p-4 z-50 animate-fade-in-up">
                  <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-3 px-2">{t('selectLanguage')}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {LANGUAGES.map((lang) => (
                      <button 
                        key={lang.code}
                        onClick={() => { setLanguage(lang.code); setOpenMenu(null); }}
                        className={`flex flex-col items-center justify-center py-3 rounded-2xl transition-all border relative ${language === lang.code ? 'bg-primary border-primary shadow-lg ring-2 ring-primary/20' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}
                      >
                         <span className={`text-[13px] font-black ${language === lang.code ? 'text-white' : 'text-slate-200'}`}>
                           {translations.languageName[lang.code]}
                         </span>
                         <span className={`text-[9px] font-bold uppercase tracking-widest mt-1 ${language === lang.code ? 'text-white/70' : 'text-slate-500'}`}>
                           {lang.code}
                         </span>
                         {language === lang.code && (
                           <div className="absolute top-2 right-2">
                             <span className="material-symbols-outlined text-[14px] text-white">check_circle</span>
                           </div>
                         )}
                      </button>
                    ))}
                  </div>
                </div>
                </>
              )}
           </div>

           <div className="relative" ref={promoRef}>
              <button 
                onClick={() => setOpenMenu(openMenu === 'promo' ? null : 'promo')}
                aria-label={`${t('credits')}: ${hasValidApiKey ? 'API' : (credits || 0)}`}
                className="min-h-11 flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 rounded-full border border-primary/20 mr-1 hover:bg-primary/20 transition-all active:scale-95"
              >
                  <span className="material-symbols-outlined text-[16px] text-primary">{hasValidApiKey ? 'key' : 'diamond'}</span>
                  <span className="text-[13px] font-black text-white">{hasValidApiKey ? 'API' : (credits || 0)}</span>
              </button>
              
              {openMenu === 'promo' && (
                <>
                <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={() => setOpenMenu(null)}></div>
                <div className="fixed top-[70px] left-4 right-4 sm:absolute sm:top-full sm:left-auto sm:right-0 mt-3 w-auto sm:w-64 bg-slate-900 rounded-2xl shadow-2xl border border-white/10 p-4 z-50 animate-fade-in-up">
                  <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-3 px-1">{t('promoCodeLabel')}</p>
                  
                  {!user ? (
                    <div className="text-[11px] text-center text-slate-400 font-bold py-2">
                       {t('loginBenefitMsg')}
                    </div>
                  ) : (
                  <div className="flex flex-col gap-2">
                    <input 
                      type="text"
                      value={promoCode}
                      onChange={(e) => setPromoCode(e.target.value)}
                      placeholder="Enter code"
                      className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs font-bold text-white focus:ring-1 focus:ring-primary outline-none"
                      onKeyDown={(e) => e.key === 'Enter' && handleApplyPromo()}
                    />
                    <button 
                      onClick={handleApplyPromo}
                      disabled={isApplying}
                      className="w-full bg-primary py-2.5 rounded-xl text-white font-black text-[10px] uppercase transition-transform active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isApplying ? (
                        <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      ) : t('applyPromo')}
                    </button>
                  </div>
                  )}
                  {promoMessage.text && (
                    <p className={`mt-3 text-[9px] font-bold text-center leading-snug ${promoMessage.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                      {promoMessage.text}
                    </p>
                  )}
                </div>
                </>
              )}
           </div>

           <div className="relative hidden sm:block" ref={settingsRef}>
              <button 
                onClick={() => setOpenMenu(openMenu === 'settings' ? null : 'settings')} 
                aria-label="Settings"
                className={`w-11 h-11 flex items-center justify-center rounded-full transition-all ${openMenu === 'settings' ? 'bg-primary text-[#1B130A] shadow-lg' : 'hover:bg-white/5 text-slate-300'}`}
              >
                <span className="material-symbols-outlined text-[24px]">settings</span>
              </button>
              {openMenu === 'settings' && (
                <>
                <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={() => setOpenMenu(null)}></div>
                <div className="fixed top-[70px] left-4 right-4 sm:absolute sm:top-full sm:left-auto sm:right-0 mt-3 w-auto sm:w-72 bg-slate-900 rounded-2xl shadow-2xl border border-white/10 p-2 flex flex-col gap-1 z-50 animate-fade-in-up">
                   <div className="p-3 mb-2">
                     <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary mb-3 px-1">{t('useOwnKey')}</p>
                     <div className="flex flex-col gap-2">
                       <input 
                         type="password"
                         value={localApiKey}
                         onChange={(e) => setLocalApiKey(e.target.value)}
                         placeholder="Gemini API Key"
                         className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs font-bold text-white focus:ring-1 focus:ring-primary outline-none w-full"
                       />
                       <button 
                         onClick={() => {
                           const cleanKey = localApiKey.trim();
                           localStorage.setItem('SNAPTRIP_API_KEY', cleanKey);
                           setLocalApiKey(cleanKey);
                           setShowKeySaved(true);
                           setTimeout(() => { setShowKeySaved(false); setOpenMenu(null); window.location.reload(); }, 1500);
                         }}
                         className={`w-full py-2.5 rounded-xl text-white font-black text-[10px] uppercase transition-all active:scale-95 flex items-center justify-center gap-2 ${showKeySaved ? 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]' : 'bg-primary'}`}
                       >
                         {showKeySaved ? (
                           <>
                             <span className="material-symbols-outlined text-[14px]">check_circle</span>
                             {t('savedLocally')}
                           </>
                         ) : t('saveKey')}
                       </button>
                       <p className="text-[9px] text-[#F4EFE6]/40 px-1 leading-tight">
                         • Key is stored strictly on this device.<br/>
                         • Never uploaded to any server.
                       </p>
                     </div>
                   </div>

                   <div className="h-px bg-white/5 mb-1 mx-2"></div>

                   <button 
                     onClick={() => { setOpenMenu(null); onShowAbout(); }}
                     className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-white/10 text-primary transition-colors group"
                   >
                     <span className="text-[11px] font-black uppercase tracking-widest">{t('aboutSnapTrip')}</span>
                     <span className="material-symbols-outlined text-[18px] group-hover:scale-110 transition-transform">info</span>
                   </button>
                   
                   <div className="h-px bg-white/5 my-1 mx-2"></div>

                   <button 
                     onClick={handleContactDev}
                     className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-white/10 text-slate-300 transition-colors group"
                   >
                     <span className="text-[11px] font-black uppercase tracking-widest">{t('contactDev')}</span>
                     <span className="material-symbols-outlined text-[18px] group-hover:scale-110 transition-transform">mail</span>
                   </button>

                   <button 
                     onClick={handleSupportDev}
                     className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-amber-500/10 text-amber-400 transition-colors group"
                   >
                     <span className="text-[11px] font-black uppercase tracking-widest">{t('supportDev')}</span>
                     <span className="material-symbols-outlined text-[18px] group-hover:scale-110 transition-transform">coffee</span>
                   </button>

                   <div className="h-px bg-white/5 my-1 mx-2"></div>

                   {user ? (
                     <button 
                       onClick={() => { setOpenMenu(null); onLogout(); }}
                       className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-red-500/10 text-red-400 transition-colors group"
                     >
                       <span className="text-[11px] font-black uppercase tracking-widest">{t('logout')}</span>
                       <span className="material-symbols-outlined text-[20px] group-hover:translate-x-1 transition-transform">logout</span>
                     </button>
                   ) : (
                     <button 
                       onClick={() => { setOpenMenu(null); onLogin(); }}
                       className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-primary/10 text-primary transition-colors group"
                     >
                       <span className="text-[11px] font-black uppercase tracking-widest">{t('login')}</span>
                       <span className="material-symbols-outlined text-[20px] group-hover:translate-x-1 transition-transform">login</span>
                     </button>
                   )}
                </div>
                </>
              )}
           </div>

           <div className="relative w-11 h-11 hidden sm:flex items-center justify-center shrink-0" ref={profileRef}>
             {user ? (
               <button aria-label={user.name} onClick={() => setOpenMenu(openMenu === 'profile' ? null : 'profile')} className="w-11 h-11 p-1.5 rounded-full overflow-hidden border border-primary/30 transition-transform active:scale-95 text-left">
                 <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
               </button>
             ) : (
               <button aria-label={t('login')} onClick={onLogin} className="w-11 h-11 flex items-center justify-center text-slate-300 hover:text-white transition-all active:scale-95">
                 <span className="material-symbols-outlined text-[24px]">account_circle</span>
               </button>
             )}

             {openMenu === 'profile' && user && (
               <div className="fixed top-[70px] right-4 left-auto sm:absolute sm:top-full sm:left-auto sm:translate-x-0 sm:right-0 mt-3 w-48 bg-slate-900/95 backdrop-blur-xl rounded-[2rem] shadow-2xl border border-white/10 p-2 flex flex-col gap-1 z-[110] animate-fade-in-up">
                 <div className="px-3 py-3 border-b border-white/5 mb-1 text-center">
                   <p className="text-sm text-white font-bold truncate">{user.name}</p>
                   <p className="text-[10px] text-slate-400 truncate">{user.email || 'User'}</p>
                 </div>
                 <button 
                   onClick={() => { setOpenMenu(null); onLogout(); }}
                   className="w-full flex items-center justify-between p-3 rounded-full hover:bg-red-500/10 text-red-400 transition-colors group"
                 >
                   <span className="text-[11px] font-black uppercase tracking-widest pl-2">{t('logout')}</span>
                   <span className="material-symbols-outlined text-[20px] group-hover:translate-x-1 transition-transform">logout</span>
                 </button>
               </div>
             )}
           </div>
           
           <button aria-label={t('history')} onClick={onToggleSidebar} className="w-11 h-11 hidden sm:flex items-center justify-center rounded-full hover:bg-white/5 text-slate-300 shrink-0">
              <span className="material-symbols-outlined text-[22px]">bookmarks</span>
           </button>

           <div className="relative sm:hidden" ref={mobileMenuRef}>
             <button aria-label={t('menu')} aria-expanded={openMenu === 'mobile'} onClick={() => setOpenMenu(openMenu === 'mobile' ? null : 'mobile')} className="w-11 h-11 flex items-center justify-center rounded-full text-slate-200 hover:bg-white/10">
               <span aria-hidden="true" className="material-symbols-outlined">more_horiz</span>
             </button>
             {openMenu === 'mobile' && (
               <div className="fixed top-[70px] left-4 right-4 z-[120] rounded-3xl border border-white/10 bg-slate-900/95 backdrop-blur-xl p-4 shadow-2xl animate-fade-in-up">
                 <p className="px-1 pb-3 text-[10px] font-black uppercase tracking-widest text-primary">{t('selectLanguage')}</p>
                 <div className="grid grid-cols-4 gap-2">
                   {LANGUAGES.map((lang) => <button key={lang.code} onClick={() => { setLanguage(lang.code); setOpenMenu(null); }} className={`min-h-11 rounded-xl text-xs font-black ${language === lang.code ? 'bg-primary text-[#1B130A]' : 'bg-white/5 text-slate-200'}`}>{lang.code.toUpperCase()}</button>)}
                 </div>
                 <div className="my-4 h-px bg-white/10" />
                 <div className="grid grid-cols-3 gap-2">
                   <button onClick={() => { setOpenMenu(null); onToggleSidebar(); }} className="min-h-14 rounded-2xl bg-white/5 text-xs font-bold text-slate-100"><span className="material-symbols-outlined block text-[20px]">bookmarks</span>{t('history')}</button>
                   <button onClick={() => { setOpenMenu(null); onShowAbout(); }} className="min-h-14 rounded-2xl bg-white/5 text-xs font-bold text-slate-100"><span className="material-symbols-outlined block text-[20px]">info</span>{t('aboutSnapTrip')}</button>
                   <button onClick={() => { setOpenMenu(null); if (user) onLogout(); else onLogin(); }} className="min-h-14 rounded-2xl bg-white/5 text-xs font-bold text-slate-100"><span className="material-symbols-outlined block text-[20px]">account_circle</span>{user ? t('logout') : t('login')}</button>
                 </div>
                 <div className="mt-3 flex gap-2">
                   <input aria-label="Gemini API Key" type="password" value={localApiKey} onChange={(e) => setLocalApiKey(e.target.value)} placeholder="Gemini API Key" className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 text-xs text-white outline-none focus:border-primary" />
                   <button onClick={() => { const cleanKey = localApiKey.trim(); localStorage.setItem('SNAPTRIP_API_KEY', cleanKey); setLocalApiKey(cleanKey); setShowKeySaved(true); }} className="min-h-11 rounded-xl bg-primary px-4 text-xs font-black text-[#1B130A]">{showKeySaved ? t('savedLocally') : t('saveKey')}</button>
                 </div>
               </div>
             )}
           </div>
        </div>
      </div>
    </header>
  );
};
