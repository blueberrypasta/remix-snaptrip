import test from 'node:test';
import React from 'react';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import * as esbuild from 'esbuild';
import { Window } from 'happy-dom';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

const reactPkgPath = require.resolve('react', { paths: [repoRoot] });
const reactDomPkgPath = require.resolve('react-dom', { paths: [repoRoot] });
const reactDomClientPkgPath = require.resolve('react-dom/client', { paths: [repoRoot] });
const jsxRuntimePkgPath = require.resolve('react/jsx-runtime', { paths: [repoRoot] });

const cacheDir = path.join(repoRoot, 'node_modules', '.cache', 'site-audit-ui');
const bundledOutfile = path.join(cacheDir, `app-bundle-${Date.now()}.mjs`);

function createMockBundlePlugin() {
  return {
    name: 'site-audit-ui-mocks',
    setup(build) {
      build.onResolve({ filter: /^react$/ }, () => ({ path: reactPkgPath, external: true }));
      build.onResolve({ filter: /^react-dom$/ }, () => ({ path: reactDomPkgPath, external: true }));
      build.onResolve({ filter: /^react-dom\/client$/ }, () => ({ path: reactDomClientPkgPath, external: true }));
      build.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: jsxRuntimePkgPath, external: true }));

      build.onResolve({ filter: /services\/weatherService/ }, (args) => ({
        path: args.path,
        namespace: 'mock-weather',
      }));
      build.onLoad({ filter: /.*/, namespace: 'mock-weather' }, () => ({
        contents: `
          export const fetchCurrentWeather = async () => ({
            temperature: 20,
            condition: 'Clear',
            icon: 'sun'
          });
        `,
        loader: 'js',
      }));

      build.onResolve({ filter: /services\/geminiService/ }, (args) => ({
        path: args.path,
        namespace: 'mock-gemini',
      }));
      build.onLoad({ filter: /.*/, namespace: 'mock-gemini' }, () => ({
        contents: `
          export const analyzeImageStream = async (base64, mimeType, location, onChunk) => {
            globalThis.__audit.genCalls++;
            const p = new Promise((resolve, reject) => {
              globalThis.__audit.pendingAnalysis.push({ resolve, reject, onChunk });
            });
            return p;
          };
          export const fetchNearbyPlaces = async () => ({places:[],areaName:'Fixture city'});
          export const fetchMoreNearbyPlaces = async () => [];
        `,
        loader: 'js',
      }));

      build.onResolve({ filter: /services\/usageService/ }, (args) => ({
        path: args.path,
        namespace: 'mock-usage',
      }));
      build.onLoad({ filter: /.*/, namespace: 'mock-usage' }, () => ({
        contents: `
          export const usageService = {
            getUserCredits: async () => ({ credits: 10, language: 'en' }),
            canAnalyze: async () => true,
            deductCredit: async () => {
              globalThis.__audit.charges++;
              return 10 - globalThis.__audit.charges;
            }
          };
        `,
        loader: 'js',
      }));

      build.onResolve({ filter: /services\/historyService/ }, (args) => ({
        path: args.path,
        namespace: 'mock-history',
      }));
      build.onLoad({ filter: /.*/, namespace: 'mock-history' }, () => ({
        contents: `
          export const historyService = {
            getUserHistory: async () => [],
            saveResult: async () => 'saved-id',
            deleteResult: async () => true,
            clearAll: async () => true
          };
        `,
        loader: 'js',
      }));

      build.onResolve({ filter: /services\/localPhotoService/ }, (args) => ({
        path: args.path,
        namespace: 'mock-local-photo',
      }));
      build.onLoad({ filter: /.*/, namespace: 'mock-local-photo' }, () => ({
        contents: `
          export const localPhotoService = {
            savePhoto: async (data) => 'photo-id-123',
            getPhoto: async () => null,
            deletePhoto: async () => true
          };
        `,
        loader: 'js',
      }));

      build.onResolve({ filter: /services\/supabaseClient/ }, (args) => ({
        path: args.path,
        namespace: 'mock-supabase',
      }));
      build.onLoad({ filter: /.*/, namespace: 'mock-supabase' }, () => ({
        contents: `
          export const supabase = {
            auth: {
              getSession: async () => ({ data: { session: null }, error: null }),
              onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
              signOut: async () => ({ error: null })
            }
          };
        `,
        loader: 'js',
      }));

      build.onResolve({ filter: /utils\/fileUtils/ }, (args) => ({
        path: args.path,
        namespace: 'mock-file-utils',
      }));
      build.onLoad({ filter: /.*/, namespace: 'mock-file-utils' }, () => ({
        contents: `
          export const fileToBase64 = async (file) => {
            globalThis.__audit.fileCalls++;
            if (globalThis.__audit.failFileToBase64) {
              throw new Error('Unsupported image format or corrupted file');
            }
            return {
              base64: 'fake-image-base64-content',
              mimeType: 'image/jpeg',
              location: null
            };
          };
        `,
        loader: 'js',
      }));

      build.onResolve({ filter: /components\/TasteEntry/ }, (args) => ({
        path: args.path,
        namespace: 'mock-taste-entry',
      }));
      build.onLoad({ filter: /.*/, namespace: 'mock-taste-entry' }, () => ({
        contents: `
          import React from 'react';
          export const TasteEntry = ({ onSelect }) => (
            React.createElement('button', { type: 'button', onClick: () => onSelect && onSelect('taste') }, 'Taste Entry')
          );
          export default TasteEntry;
        `,
        loader: 'js',
      }));

      build.onResolve({ filter: /components\/Header/ }, (args) => ({
        path: args.path,
        namespace: 'mock-header',
      }));
      build.onLoad({ filter: /.*/, namespace: 'mock-header' }, () => ({
        contents: `
          import React from 'react';
          export const Header = (props) => React.createElement('header', { 'data-testid': 'mock-header' });
          export default Header;
        `,
        loader: 'js',
      }));

      build.onResolve({ filter: /components\/ResultScreen/ }, (args) => ({
        path: args.path,
        namespace: 'mock-result-screen',
      }));
      build.onLoad({ filter: /.*/, namespace: 'mock-result-screen' }, () => ({
        contents: `
          import React from 'react';
          export const ResultScreen = ({ result, onReset, onNewPhoto }) => (
            React.createElement('div', { 'data-testid': 'mock-result-screen' },
              React.createElement('h1', null, result?.title || 'No Title'),
              React.createElement('button', { type: 'button', onClick: onReset }, 'Reset'),
              React.createElement('button', { type: 'button', onClick: onNewPhoto }, 'New Photo')
            )
          );
          export default ResultScreen;
        `,
        loader: 'js',
      }));

      build.onResolve({ filter: /components\/(HistorySidebar|LoginModal|AboutScreen|GuideScreen)/ }, (args) => ({
        path: args.path,
        namespace: 'mock-simple-components',
      }));
      build.onLoad({ filter: /.*/, namespace: 'mock-simple-components' }, (args) => {
        const basename = path.basename(args.path).replace(/\.[^/.]+$/, '');
        return {
          contents: `
            import React from 'react';
            export const ${basename} = (props) => React.createElement('div', { 'data-testid': 'mock-${basename.toLowerCase()}' });
            export default ${basename};
          `,
          loader: 'js',
        };
      });
    },
  };
}

let App;
let act;
let createRoot;
let domWindow;
let root;
let container;
const globalPropsToRestore = new Map();

function resetAuditState() {
  globalThis.__audit = {
    fileCalls: 0,
    genCalls: 0,
    charges: 0,
    geoCalls: 0,
    failFileToBase64: false,
    pendingAnalysis: [],
  };
}

function setupHappyDOM() {
  domWindow = new Window({
    url: 'http://localhost:3000',
    width: 1024,
    height: 768,
  });

  const domGlobals = {
    IS_REACT_ACT_ENVIRONMENT: true,
    window: domWindow,
    localStorage: domWindow.localStorage,
    document: domWindow.document,
    navigator: domWindow.navigator,
    HTMLElement: domWindow.HTMLElement,
    Element: domWindow.Element,
    Node: domWindow.Node,
    File: domWindow.File,
    Event: domWindow.Event,
    requestAnimationFrame: (cb) => globalThis.setTimeout(cb, 0),
    cancelAnimationFrame: (id) => globalThis.clearTimeout(id),
  };

  for (const [key, value] of Object.entries(domGlobals)) {
    if (!globalPropsToRestore.has(key)) {
      globalPropsToRestore.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    }
    Object.defineProperty(globalThis, key, {
      value,
      writable: true,
      configurable: true,
    });
  }

  const geolocationStub = {
    getCurrentPosition: (success, error) => {
      globalThis.__audit.geoCalls++;
      if (error) {
        error({
          code: 1,
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
          message: 'User denied Geolocation',
        });
      }
    },
    watchPosition: () => 1,
    clearWatch: () => {},
  };

  Object.defineProperty(domWindow.navigator, 'geolocation', {
    value: geolocationStub,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(globalThis.navigator, 'geolocation', {
    value: geolocationStub,
    writable: true,
    configurable: true,
  });
}

function teardownHappyDOM() {
  for (const [key, descriptor] of globalPropsToRestore.entries()) {
    if (descriptor) {
      Object.defineProperty(globalThis, key, descriptor);
    } else {
      delete globalThis[key];
    }
  }
  globalPropsToRestore.clear();

  if (domWindow && domWindow.happyDOM) {
    domWindow.happyDOM.abort();
  }
}

async function flushAsync(predicate, maxWaitMs = 1500, intervalMs = 20) {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitMs) {
    await act(async () => {
      await new Promise((resolve) => globalThis.setTimeout(resolve, Math.min(intervalMs, 30)));
    });
    if (predicate && predicate()) {
      return true;
    }
  }
  return predicate ? predicate() : true;
}

function simulateFileSelection(inputElement, filename = 'test-landmark.jpg', mimeType = 'image/jpeg') {
  const file = new globalThis.File(['mock-content-bytes'], filename, { type: mimeType });
  Object.defineProperty(inputElement, 'files', {
    value: [file],
    writable: true,
    configurable: true,
  });
  const event = new domWindow.Event('change', { bubbles: true, cancelable: true });
  inputElement.dispatchEvent(event);
}

function findFileInput(idx = 0) {
  const inputs = Array.from(domWindow.document.querySelectorAll('input[type="file"]'));
  return inputs[idx] || inputs[0];
}

function resolvePendingAnalysis(syntheticResult = null) {
  const pending = globalThis.__audit.pendingAnalysis.shift();
  if (!pending) return;
  const result = syntheticResult || {
    title: 'Fixture Landmark',
    fact: 'Historical site test fact',
    story: 'Comprehensive architectural narrative fixture',
    sources: [],
    identificationStatus: 'confirmed',
    confidence: 1,
  };
  pending.resolve(result);
}

function rejectPendingAnalysis(error = new Error('Generic analysis network failure')) {
  const pending = globalThis.__audit.pendingAnalysis.shift();
  if (!pending) return;
  pending.reject(error);
}

test('Site Audit UI suite', async (t) => {
  await fs.mkdir(cacheDir, { recursive: true });

  const appSourcePath = path.resolve(repoRoot, 'App.tsx');
  await esbuild.build({
    entryPoints: [appSourcePath],
    bundle: true,
    format: 'esm',
    platform: 'node',
    jsx: 'automatic',
    outfile: bundledOutfile,
    plugins: [createMockBundlePlugin()],
    loader: {
      '.tsx': 'tsx',
      '.ts': 'ts',
      '.jsx': 'jsx',
      '.js': 'js',
    },
  });

  const bundledAppModule = await import(pathToFileURL(bundledOutfile).href);
  App = bundledAppModule.App || bundledAppModule.default;

  const reactModule = await import(pathToFileURL(reactPkgPath).href);
  act = reactModule.act;

  const reactDomClientModule = await import(pathToFileURL(reactDomClientPkgPath).href);
  createRoot = reactDomClientModule.createRoot;

  try {
    await t.test('initial mount: no unexpected geolocation prompts or analysis calls', async () => {
      resetAuditState();
      setupHappyDOM();
      container = domWindow.document.createElement('div');
      domWindow.document.body.appendChild(container);

      await act(async () => {
        root = createRoot(container);
        root.render(React.createElement(App));
      });

      await flushAsync(() => domWindow.document.querySelector('input[type="file"]') !== null);

      assert.equal(globalThis.__audit.geoCalls, 0, 'No geolocation query should fire initially on welcome screen');
      assert.equal(globalThis.__audit.genCalls, 0, 'No analysis call should trigger on idle mount');
      assert.equal(globalThis.__audit.charges, 0, 'No credit deduction on initial mount');

      await act(async () => {
        root.unmount();
      });
      teardownHappyDOM();
    });

    await t.test('file selection: starts analysis without geolocation prompt', async () => {
      resetAuditState();
      setupHappyDOM();
      container = domWindow.document.createElement('div');
      domWindow.document.body.appendChild(container);

      await act(async () => {
        root = createRoot(container);
        root.render(React.createElement(App));
      });

      await flushAsync(() => domWindow.document.querySelectorAll('input[type="file"]').length > 0);
      const input = findFileInput(0);
      assert.ok(input, 'Hidden file input must exist in DOM');

      await act(async () => {
        simulateFileSelection(input, 'monument.jpg');
      });

      await flushAsync(() => globalThis.__audit.genCalls === 1);

      assert.equal(globalThis.__audit.fileCalls, 1, 'File processor should convert selected photo');
      assert.equal(globalThis.__audit.genCalls, 1, 'Gemini analyze stream should be invoked once');
      assert.equal(globalThis.__audit.geoCalls, 0, 'Should not force location lookup on standard photo pick');
      assert.equal(globalThis.__audit.charges, 0, 'Credit should not be charged before analysis resolves');

      await act(async () => {
        resolvePendingAnalysis();
      });

      await flushAsync(() => globalThis.__audit.charges === 1);
      assert.equal(globalThis.__audit.charges, 1, 'Credit must be deducted exactly once upon analysis success');

      await act(async () => {
        root.unmount();
      });
      teardownHappyDOM();
    });

    await t.test('error retry: reject generic error -> alert displayed -> same-file retry -> success charge exactly 1', async () => {
      resetAuditState();
      setupHappyDOM();
      container = domWindow.document.createElement('div');
      domWindow.document.body.appendChild(container);

      await act(async () => {
        root = createRoot(container);
        root.render(React.createElement(App));
      });

      await flushAsync(() => domWindow.document.querySelectorAll('input[type="file"]').length > 0);
      const input = findFileInput(0);

      await act(async () => {
        simulateFileSelection(input, 'failing-landmark.jpg');
      });

      await flushAsync(() => globalThis.__audit.pendingAnalysis.length === 1);

      await act(async () => {
        rejectPendingAnalysis(new Error('Network glitch during generation'));
      });

      await flushAsync(() => {
        const alertEl = domWindow.document.querySelector('[role="alert"]');
        return alertEl !== null;
      });

      const alertEl = domWindow.document.querySelector('[role="alert"]');
      assert.ok(alertEl, 'An alert element should notify user of analysis error');
      assert.equal(globalThis.__audit.charges, 0, 'Failed analysis must not charge credit');

      const buttons = Array.from(domWindow.document.querySelectorAll('button'));
      const retryBtn = buttons.find((btn) => /retry/i.test(btn.textContent || ''));
      assert.ok(retryBtn, 'Retry button should be visible in UI');

      await act(async () => {
        retryBtn.dispatchEvent(new domWindow.Event('click', { bubbles: true }));
      });

      await flushAsync(() => globalThis.__audit.pendingAnalysis.length === 1);
      assert.equal(globalThis.__audit.genCalls, 2, 'Retry should initiate a second analysis call');

      await act(async () => {
        resolvePendingAnalysis();
      });

      await flushAsync(() => globalThis.__audit.charges === 1);
      assert.equal(globalThis.__audit.charges, 1, 'Only one credit should be deducted after single retry success');

      await act(async () => {
        root.unmount();
      });
      teardownHappyDOM();
    });

    await t.test('stale guard: cancel request then resolve late -> no stale result or charge', async () => {
      resetAuditState();
      setupHappyDOM();
      container = domWindow.document.createElement('div');
      domWindow.document.body.appendChild(container);

      await act(async () => {
        root = createRoot(container);
        root.render(React.createElement(App));
      });

      await flushAsync(() => domWindow.document.querySelectorAll('input[type="file"]').length > 0);
      const input = findFileInput(0);

      await act(async () => {
        simulateFileSelection(input, 'cancel-test.jpg');
      });

      await flushAsync(() => globalThis.__audit.pendingAnalysis.length === 1);

      const buttons = Array.from(domWindow.document.querySelectorAll('button'));
      const cancelBtn = buttons.find((btn) => /cancel/i.test(btn.textContent || ''));
      assert.ok(cancelBtn, 'Cancellation action should be available during in-flight analysis');

      await act(async () => {
        cancelBtn.dispatchEvent(new domWindow.Event('click', { bubbles: true }));
      });

      await act(async () => {
        resolvePendingAnalysis({
          title: 'Late Stale Result Title',
          fact: 'Stale fact',
          story: 'Stale story',
          sources: [],
          identificationStatus: 'confirmed',
          confidence: 1,
        });
      });

      await flushAsync(null, 150);

      assert.equal(globalThis.__audit.charges, 0, 'Cancelled requests must never deduct credits even if late resolved');
      const pageText = domWindow.document.body.textContent || '';
      assert.match(pageText, /^(?!.*Late Stale Result Title).*$/s, 'Stale result title should not be rendered after cancellation');

      await act(async () => {
        root.unmount();
      });
      teardownHappyDOM();
    });

    await t.test('concurrency guard: duplicate file change while active triggers only one analysis API call', async () => {
      resetAuditState();
      setupHappyDOM();
      container = domWindow.document.createElement('div');
      domWindow.document.body.appendChild(container);

      await act(async () => {
        root = createRoot(container);
        root.render(React.createElement(App));
      });

      await flushAsync(() => domWindow.document.querySelectorAll('input[type="file"]').length > 0);
      const input = findFileInput(0);

      await act(async () => {
        simulateFileSelection(input, 'first.jpg');
      });

      await flushAsync(() => globalThis.__audit.genCalls === 1);

      await act(async () => {
        simulateFileSelection(input, 'second.jpg');
      });

      await flushAsync(null, 100);

      assert.equal(globalThis.__audit.genCalls, 1, 'Subsequent file input change while loading should not trigger parallel analysis');

      await act(async () => {
        resolvePendingAnalysis();
      });

      await flushAsync(() => globalThis.__audit.charges === 1);
      assert.equal(globalThis.__audit.charges, 1, 'Single charge for the single executed analysis');

      await act(async () => {
        root.unmount();
      });
      teardownHappyDOM();
    });

    await t.test('unsupported image: fileToBase64 reject -> alert and zero charge', async () => {
      resetAuditState();
      globalThis.__audit.failFileToBase64 = true;
      setupHappyDOM();
      container = domWindow.document.createElement('div');
      domWindow.document.body.appendChild(container);

      await act(async () => {
        root = createRoot(container);
        root.render(React.createElement(App));
      });

      await flushAsync(() => domWindow.document.querySelectorAll('input[type="file"]').length > 0);
      const input = findFileInput(0);

      await act(async () => {
        simulateFileSelection(input, 'corrupted.bin', 'application/octet-stream');
      });

      await flushAsync(() => {
        const alertEl = domWindow.document.querySelector('[role="alert"]');
        return alertEl !== null;
      });

      const alertEl = domWindow.document.querySelector('[role="alert"]');
      assert.ok(alertEl, 'Alert should be rendered when file read/conversion fails');
      assert.equal(globalThis.__audit.genCalls, 0, 'Gemini analyzeImageStream should not be called on corrupted image');
      assert.equal(globalThis.__audit.charges, 0, 'No credits should be deducted for invalid files');

      await act(async () => {
        root.unmount();
      });
      teardownHappyDOM();
    });
  } finally {
    teardownHappyDOM();
    await fs.rm(bundledOutfile, { force: true });
  }
});