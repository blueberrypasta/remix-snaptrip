import React from 'react';
import { createPortal } from 'react-dom';
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

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export const HistorySidebar: React.FC<HistorySidebarProps> = ({
  history,
  onSelect,
  isOpen,
  onClose,
  language,
  onClearHistory,
  user,
  isSyncing = false,
  onRefresh,
}) => {
  const t = useTranslations(language);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const closeButtonRef = React.useRef<HTMLButtonElement>(null);

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

  React.useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Lock body scroll
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus close button after a short delay to allow transition/render
    closeButtonRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key === 'Tab' && panelRef.current) {
        const focusableElements = Array.from<HTMLElement>(
          panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        ).filter(el => !el.hasAttribute('inert'));

        if (focusableElements.length === 0) return;

        const firstEl = focusableElements[0];
        const lastEl = focusableElements[focusableElements.length - 1];
        const currentActive = document.activeElement;

        if (e.shiftKey) {
          if (currentActive === firstEl || !panelRef.current.contains(currentActive)) {
            e.preventDefault();
            lastEl.focus();
          }
        } else {
          if (currentActive === lastEl || !panelRef.current.contains(currentActive)) {
            e.preventDefault();
            firstEl.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;

      // Restore focus
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    };
  }, [isOpen, onClose]);

  // SSR Guard
  if (typeof document === 'undefined' || !isOpen) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        className={`fixed inset-0 bg-background-dark/80 backdrop-blur-md z-[200] transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Panel */}
      <aside
        ref={panelRef}
        aria-hidden={!isOpen}
        inert={!isOpen ? true : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={t('history')}
        className={`fixed inset-y-0 right-0 w-full max-w-sm h-[100dvh] bg-[#0B0F14] shadow-[0_0_80px_rgba(0,0,0,0.5)] z-[201] flex flex-col transform transition-transform duration-500 ease-[cubic-bezier(0.2,0.7,0.2,1)] border-l border-white/5 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <header className="shrink-0 px-4 py-4 sm:p-8 pt-[max(1rem,env(safe-area-inset-top))] border-b border-white/5 flex justify-between items-center bg-black/20 backdrop-blur-md">
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
                className="w-11 h-11 rounded-full hover:bg-white/5 flex items-center justify-center text-[#F4EFE6]/70 transition-colors"
              >
                <span className={`material-symbols-outlined text-[20px] ${isSyncing ? 'animate-spin text-[#D9B26A]' : ''}`}>
                  sync
                </span>
              </button>
            )}
            <button
              ref={closeButtonRef}
              aria-label={t('cancel')}
              onClick={onClose}
              className="w-11 h-11 rounded-full hover:bg-white/5 flex items-center justify-center text-[#F4EFE6]/70 transition-colors"
            >
              <span className="material-symbols-outlined text-[24px]">close</span>
            </button>
          </div>
        </header>

        {/* List Container */}
        <main className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6 no-scrollbar">
          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-[#F4EFE6]/20 gap-5">
              <span className="material-symbols-outlined text-6xl opacity-20">folder_off</span>
              <p className="text-[10px] font-black uppercase tracking-[0.3em]">{t('noHistory')}</p>
            </div>
          ) : (
            <ul className="grid gap-4 sm:gap-5 list-none m-0 p-0">
              {history.map((item) => (
                <li key={item.id + item.timestamp} className="m-0 p-0">
                  <button
                    onClick={() => (item.status === 'success' || item.status === 'processing') && onSelect(item)}
                    disabled={item.status === 'failed'}
                    className={`group relative flex items-center gap-4 sm:gap-5 p-3 sm:p-4 rounded-[1.5rem] sm:rounded-[1.8rem] bg-white/5 border border-white/10 transition-all w-full min-w-0 text-left ${
                      item.status === 'success'
                        ? 'hover:border-[#D9B26A]/40 active:scale-[0.98] shadow-sm cursor-pointer'
                        : 'opacity-60 cursor-default'
                    }`}
                  >
                    <div className="relative h-16 w-16 sm:h-20 sm:w-20 rounded-xl sm:rounded-2xl overflow-hidden flex-shrink-0 shadow-sm bg-black">
                      {item.imageData ? (
                        <img src={item.imageData} alt="Thumb" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <span className="material-symbols-outlined text-slate-500 text-lg sm:text-xl">
                            image_not_supported
                          </span>
                        </div>
                      )}
                      {item.status === 'processing' && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-[1px]">
                          <div className="w-5 h-5 sm:w-6 sm:h-6 border-2 border-white/20 border-t-[#D9B26A] rounded-full animate-spin"></div>
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <h4 className="text-base sm:text-[17px] font-serif font-medium text-[#F4EFE6] truncate leading-tight mb-1">
                        {item.title || (item.status === 'processing' ? t('analyzing') : 'Discovery')}
                      </h4>
                      <p className="text-[10px] font-bold text-[#F4EFE6]/40 uppercase tracking-widest flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[12px] sm:text-[14px]">schedule</span>
                        <span className="truncate">{formatDateTime(item.timestamp)}</span>
                      </p>
                    </div>

                    <span className="material-symbols-outlined text-white/20 group-hover:text-[#D9B26A]/60 transition-colors flex-shrink-0 ml-1">
                      chevron_right
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </main>

        {/* Footer */}
        {history.length > 0 && (
          <footer className="shrink-0 p-4 sm:p-8 bg-[#0B0F14] border-t border-white/5 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <button
              onClick={onClearHistory}
              className="w-full h-12 sm:h-14 rounded-full border border-red-500/20 text-red-500/60 text-[10px] sm:text-[11px] font-black uppercase tracking-[0.2em] hover:bg-red-500/5 transition-all flex items-center justify-center gap-2 sm:gap-3 active:scale-95"
            >
              <span className="material-symbols-outlined text-[18px] sm:text-[20px]">delete_sweep</span>
              {t('clearHistory')}
            </button>
          </footer>
        )}
      </aside>
    </>,
    document.body
  );
};
