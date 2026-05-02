
import React, { useState, useEffect } from 'react';
import { useTranslations } from '../translations';
import type { Language } from '../types';

interface LoadingScreenProps {
  language: Language;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ language }) => {
  const t = useTranslations(language);
  const messages = [t('analyzing'), t('generatingStory'), t('findingFacts')];
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [progress, setProgress] = useState(5);

  useEffect(() => {
    const messageInterval = setInterval(() => {
      setCurrentMessageIndex((prevIndex) => (prevIndex + 1) % messages.length);
    }, 2500);

    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 95) return prev;
        const step = prev < 60 ? 1.5 : (prev < 85 ? 0.5 : 0.1);
        return prev + step;
      });
    }, 100);

    return () => {
      clearInterval(messageInterval);
      clearInterval(progressInterval);
    };
  }, [messages.length]);
  
  return (
    <div className="flex flex-col items-center justify-center h-[70vh] text-center p-8 animate-fade-in">
        <div className="relative w-32 h-32 mb-12">
            <div className="absolute inset-0 bg-[#D9B26A] rounded-full opacity-10 animate-ping"></div>
            <div className="absolute inset-0 bg-[#5EC9C2] rounded-full opacity-5 blur-2xl animate-pulse"></div>
            <div className="relative w-full h-full bg-black/40 backdrop-blur-2xl rounded-full shadow-2xl flex items-center justify-center border border-white/10 ring-1 ring-[#D9B26A]/20">
                 <div className="w-14 h-14 border-[3px] border-[#D9B26A] border-t-transparent rounded-full animate-spin"></div>
            </div>
            <div className="absolute -bottom-2 -right-2">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="animate-bounce">
                <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" stroke="#D9B26A" strokeWidth="1.2" strokeLinejoin="round"/>
              </svg>
            </div>
        </div>
        
        <h3 className="text-2xl font-serif italic text-[#F4EFE6] mb-8 animate-pulse tracking-tight">
            Preparing your travel docent...
        </h3>

        <div className="w-full max-w-[240px] bg-white/5 h-[3px] rounded-full overflow-hidden mb-6 relative shadow-inner">
            <div 
                className="h-full bg-gradient-to-r from-[#D9B26A] to-[#E6C079] transition-all duration-300 ease-out flex items-center justify-end"
                style={{ width: `${progress}%` }}
            >
                <div className="w-1.5 h-1.5 bg-white rounded-full shadow-[0_0_10px_white]"></div>
            </div>
        </div>
        
        <p className="text-[#F4EFE6]/40 font-sans font-black uppercase tracking-[0.3em] text-[9px] antialiased">
            {messages[currentMessageIndex]}
        </p>
    </div>
  );
};
