
import React from 'react';
import { useTranslations } from '../translations';
import type { Language } from '../types';
import { SnapTripLogo } from './SnapTripLogo';

interface AboutScreenProps {
  language: Language;
  onBack: () => void;
}

export const AboutScreen: React.FC<AboutScreenProps> = ({ language, onBack }) => {
  const t = useTranslations(language);

  const handleSupportDev = () => {
    window.open('https://buymeacoffee.com/blueberrypastaco', '_blank');
  };

  return (
    <div className="flex-1 flex flex-col bg-background-dark animate-fade-in overflow-y-auto no-scrollbar pb-20">
      <nav className="sticky top-0 z-50 p-6 flex items-center bg-background-dark/80 backdrop-blur-xl border-b border-white/5">
        <button onClick={onBack} className="flex items-center gap-2 px-4 py-2 bg-white/10 rounded-full text-white hover:bg-white/20 transition-all font-bold text-sm active:scale-95 border border-white/10">
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          {t('back')}
        </button>
        <h2 className="flex-1 text-center text-sm font-black text-white/50 uppercase tracking-[0.3em] mr-20">
          {t('aboutSnapTrip')}
        </h2>
      </nav>

      <div className="max-w-xl mx-auto px-6 py-10 flex flex-col gap-12">
        {/* Intro */}
        <section className="flex flex-col items-center text-center animate-fade-in-up">
          <div className="w-20 h-20 bg-primary/10 rounded-[2rem] flex items-center justify-center mb-6 shadow-2xl border border-primary/20">
             <SnapTripLogo className="w-10 h-10 text-primary" />
          </div>
          <h3 className="text-3xl font-black text-white mb-4 tracking-tight">SlapTrip</h3>
          <div className="px-4 py-1.5 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-4">
             Built with Vibe Coding
          </div>
        </section>

        {/* Story */}
        <section className="flex flex-col gap-4 animate-fade-in-up" style={{ animationDelay: '100ms' }}>
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-primary">auto_awesome</span>
            <h4 className="text-lg font-black text-white">{t('aboutOriginTitle')}</h4>
          </div>
          <p className="text-slate-400 text-base leading-[1.8] font-medium break-keep">
            {t('aboutOriginDesc')}
          </p>
        </section>

        {/* Tip */}
        <section className="p-6 rounded-[2rem] bg-indigo-500/10 border border-indigo-500/20 animate-fade-in-up" style={{ animationDelay: '200ms' }}>
          <div className="flex items-center gap-3 mb-4">
            <span className="material-symbols-outlined text-indigo-400">tips_and_updates</span>
            <h4 className="text-lg font-black text-white">{t('aboutTipTitle')}</h4>
          </div>
          <p className="text-slate-300 text-sm leading-[1.7] font-medium break-keep">
            {t('aboutTipDesc')}
          </p>
        </section>

        {/* Credits */}
        <section className="flex flex-col gap-4 animate-fade-in-up" style={{ animationDelay: '300ms' }}>
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-emerald-400">diamond</span>
            <h4 className="text-lg font-black text-white">{t('aboutCreditsTitle')}</h4>
          </div>
          <p className="text-slate-400 text-base leading-[1.8] font-medium break-keep">
            {t('aboutCreditsDesc')}
          </p>
        </section>

        {/* Support */}
        <section className="p-8 rounded-[2.5rem] bg-gradient-to-br from-amber-500/20 to-orange-500/5 border border-amber-500/20 flex flex-col items-center text-center gap-5 animate-fade-in-up" style={{ animationDelay: '400ms' }}>
          <div className="w-16 h-16 bg-amber-500/20 rounded-full flex items-center justify-center text-amber-500 text-3xl">☕</div>
          <div className="flex flex-col gap-2">
            <h4 className="text-xl font-black text-white">{t('aboutSupportTitle')}</h4>
            <p className="text-slate-400 text-sm leading-relaxed font-medium break-keep px-4">
              {t('aboutSupportDesc')}
            </p>
          </div>
          <button 
            onClick={handleSupportDev}
            className="w-full py-4 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest transition-all shadow-xl shadow-amber-500/20 active:scale-95 flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined">favorite</span>
            {t('supportDev')}
          </button>
        </section>

        {/* Footer */}
        <footer className="mt-10 pt-10 border-t border-white/5 text-center opacity-30">
          <p className="text-[10px] font-black uppercase tracking-[0.5em] text-slate-500">
            Powered by Google Gemini 3 Flash & Pro
          </p>
          <p className="text-[10px] font-bold mt-2 text-slate-500">
            © {new Date().getFullYear()} SlapTrip. Handcrafted with love.
          </p>
        </footer>
      </div>
    </div>
  );
};
