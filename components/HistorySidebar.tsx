
import React from 'react';
import { useTranslations } from '../translations';
import type { HistoryItem, Language, User } from '../types';

interface HistorySidebarProps {
  history: HistoryItem[];
  onSelect: (item: HistoryItem) => void;
  isOpen: boolean;
  onClose: () => void;
  language: Language;
  onClearHistory: () => void;
  user: User | null;
  isSyncing?: boolean;
  onRefresh?: () => void;
}

export const HistorySidebar: React.FC<HistorySidebarProps> = ({ 
    history, 
    onSelect, 
    isOpen, 
    onClose, 
    language, 
    onClearHistory, 
    user,
    isSyncing = false,
    onRefresh
}) => {
  const t = useTranslations(language);

  // 날짜 및 시간 포맷팅 함수
  const formatDateTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${yyyy}.${mm}.${dd} ${hh}:${min}`;
  };

  return (
    <>
      <div 
        aria-hidden={!isOpen}
        className={`fixed inset-0 bg-background-dark/80 backdrop-blur-md z-[60] transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} 
        onClick={onClose}
      ></div>
      <aside 
        aria-hidden={!isOpen}
        inert={!isOpen ? true : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={t('history')}
        className={`fixed top-0 bottom-0 right-0 w-full max-w-sm bg-[#0B0F14] shadow-[0_0_80px_rgba(0,0,0,0.5)] z-[70] transform transition-transform duration-500 ease-[cubic-bezier(0.2,0.7,0.2,1)] border-l border-white/5 ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="p-8 border-b border-white/5 flex justify-between items-center bg-black/20 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[#D9B26A] text-[28px]">bookmarks</span>
            <h2 className="text-xl font-serif italic text-[#F4EFE6] tracking-tight">
              {t('history')}
            </h2>
          </div>
          <div className="flex gap-2">
            {user && (
                <button 
                  onClick={onRefresh} 
                  disabled={isSyncing}
                  aria-label={t('syncing')}
                  className="w-11 h-11 rounded-full hover:bg-white/5 flex items-center justify-center text-[#F4EFE6]/70"
                >
                  <span className={`material-symbols-outlined text-[20px] ${isSyncing ? 'animate-spin text-[#D9B26A]' : ''}`}>sync</span>
                </button>
            )}
            <button aria-label={t('cancel')} onClick={onClose} className="w-11 h-11 rounded-full hover:bg-white/5 flex items-center justify-center text-[#F4EFE6]/70">
              <span className="material-symbols-outlined text-[24px]">close</span>
            </button>
          </div>
        </div>
        
        <div className="overflow-y-auto h-[calc(100%-12rem)] p-6 no-scrollbar">
          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-[#F4EFE6]/20 gap-5">
              <span className="material-symbols-outlined text-6xl opacity-20">folder_off</span>
              <p className="text-[10px] font-black uppercase tracking-[0.3em]">{t('noHistory')}</p>
            </div>
          ) : (
            <div className="grid gap-5">
              {history.map((item) => (
                <button 
                  key={item.id + item.timestamp}
                  onClick={() => (item.status === 'success' || item.status === 'processing') && onSelect(item)}
                  disabled={item.status === 'failed'}
                  className={`group relative flex items-center gap-5 p-4 rounded-[1.8rem] bg-white/5 border border-white/10 transition-all ${item.status === 'success' ? 'hover:border-[#D9B26A]/40 active:scale-95 shadow-sm' : 'opacity-60'}`}
                >
                  <div className="relative h-20 w-20 rounded-2xl overflow-hidden flex-shrink-0 shadow-sm bg-black">
                    <img src={item.imageData} alt="Thumb" className="w-full h-full object-cover" />
                    {item.status === 'processing' && (
                       <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-[1px]">
                          <div className="w-6 h-6 border-2 border-white/20 border-t-[#D9B26A] rounded-full animate-spin"></div>
                       </div>
                    )}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <h4 className="text-[17px] font-serif font-medium text-[#F4EFE6] truncate leading-tight">
                      {item.title || (item.status === 'processing' ? t('analyzing') : 'Discovery')}
                    </h4>
                    <p className="text-[10px] font-bold text-[#F4EFE6]/40 uppercase tracking-widest mt-2 flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[14px]">schedule</span>
                      {formatDateTime(item.timestamp)}
                    </p>
                  </div>
                  <span className="material-symbols-outlined text-white/20 group-hover:text-[#D9B26A]/60 transition-colors">chevron_right</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {history.length > 0 && (
          <div className="absolute bottom-0 left-0 right-0 p-8 bg-[#0B0F14] border-t border-white/5">
            <button 
              onClick={onClearHistory}
              className="w-full h-14 rounded-full border border-red-500/20 text-red-500/60 text-[11px] font-black uppercase tracking-[0.2em] hover:bg-red-500/5 transition-all flex items-center justify-center gap-3 active:scale-95"
            >
              <span className="material-symbols-outlined text-[20px]">delete_sweep</span>
              {t('clearHistory')}
            </button>
          </div>
        )}
      </aside>
    </>
  );
};
