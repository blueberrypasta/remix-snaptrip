/* global window, document */
(() => {
  const KEY = 'slaptrip-appearance';
  const DARK_COLOR = '#0D151D';
  const LIGHT_COLOR = '#FAF7F2';
  const VALID = new Set(['system', 'light', 'dark']);
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  let meta = document.querySelector('meta[name="theme-color"]');
  let memPref = 'system';

  try {
    const stored = window.localStorage.getItem(KEY);
    if (VALID.has(stored)) memPref = stored;
  } catch {
    // Use the in-memory preference when local storage is unavailable.
  }

  function apply() {
    const isDark = memPref === 'dark' || (memPref === 'system' && mql.matches);
    document.documentElement.classList.toggle('dark', isDark);
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', isDark ? DARK_COLOR : LIGHT_COLOR);
  }

  window.slapTripAppearance = {
    get: () => memPref,
    set: (val) => {
      if (!VALID.has(val)) return;
      memPref = val;
      try {
        if (val === 'system') window.localStorage.removeItem(KEY);
        else window.localStorage.setItem(KEY, val);
      } catch {
        // Keep the current selection for this page.
      }
      apply();
    }
  };

  mql.addEventListener('change', () => { if (memPref === 'system') apply(); });
  apply();
})();
