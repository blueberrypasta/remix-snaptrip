import { useState, useRef, useEffect, useCallback } from 'react';
import { interpretTaste } from '../services/tasteProfileService';
import type { Language } from '../types';

type State = 'idle' | 'requesting' | 'recording' | 'stopped' | 'sending';

export const useTasteVoice = (language: Language, onText: (summary: string) => void, onError: (error: unknown) => void) => {
  const [state, setState] = useState<State>('idle');
  const [seconds, setSeconds] = useState(0);

  const stateRef = useRef<State>('idle');
  const generationRef = useRef(1);
  const isSendingRef = useRef(false);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);

  const timerRef = useRef<number | null>(null);
  const limitRef = useRef<number | null>(null);

  const stopPromiseRef = useRef<Promise<Blob | null> | null>(null);
  const resolverRef = useRef<((val: Blob | null) => void) | null>(null);

  const cbTextRef = useRef(onText);
  const cbErrRef = useRef(onError);
  const langRef = useRef(language);

  useEffect(() => { cbTextRef.current = onText; }, [onText]);
  useEffect(() => { cbErrRef.current = onError; }, [onError]);
  useEffect(() => { langRef.current = language; }, [language]);

  const transition = (next: State) => {
    stateRef.current = next;
    setState(next);
  };

  const cleanupTracks = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  };

  const clearTimers = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (limitRef.current) clearTimeout(limitRef.current);
    timerRef.current = null;
    limitRef.current = null;
  };

  const cancel = useCallback(() => {
    generationRef.current++;
    clearTimers();

    if (recorderRef.current) {
      recorderRef.current.onstop = null;
      recorderRef.current.onerror = null;
      recorderRef.current.ondataavailable = null;

      try {
        if (recorderRef.current.state !== 'inactive') {
          recorderRef.current.stop();
        }
      } catch (_) {}
    }

    if (resolverRef.current) {
      resolverRef.current(null);
      resolverRef.current = null;
    }
    stopPromiseRef.current = null;

    cleanupTracks();
    chunksRef.current = [];
    blobRef.current = null;

    isSendingRef.current=false;
    transition('idle');
    setSeconds(0);
  }, []);

  const start = useCallback(async () => {
    if (stateRef.current!=='idle') return;

    const gen = ++generationRef.current;
    transition('requesting');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (gen !== generationRef.current) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      streamRef.current = stream;
      let mimeType = '';
      if (typeof MediaRecorder.isTypeSupported === 'function') {
         if (MediaRecorder.isTypeSupported('audio/webm')) mimeType = 'audio/webm';
         else if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';
      }

      if(!mimeType)throw new Error('microphone');
      const options = {mimeType};
      const rec = new MediaRecorder(stream, options);
      recorderRef.current = rec;
      chunksRef.current = [];

      stopPromiseRef.current = new Promise(res => { resolverRef.current = res; });

      rec.ondataavailable = (e) => {
        if (gen !== generationRef.current) return;
        if (e.data.size > 0) chunksRef.current.push(e.data);

        const totalSize = chunksRef.current.reduce((acc, c) => acc + c.size, 0);
        if (totalSize > 1.5 * 1024 * 1024) {
           cbErrRef.current(new Error('microphone'));
           cancel();
        }
      };

      rec.onstop = () => {
        if (gen !== generationRef.current) return;
        clearTimers();cleanupTracks();
        const finalBlob = chunksRef.current.length > 0 ? new Blob(chunksRef.current, { type: mimeType }) : null;
        blobRef.current = finalBlob;
        if (resolverRef.current) {
          resolverRef.current(finalBlob);
          resolverRef.current = null;
        }
        stopPromiseRef.current = null;
        transition('stopped');
      };

      rec.onerror = () => {
         if (gen !== generationRef.current) return;
         cbErrRef.current(new Error('microphone'));
         cancel();
      };

      rec.start(250);
      transition('recording');
      setSeconds(0);

      const startTime = Date.now();
      timerRef.current = window.setInterval(() => {
        if (gen !== generationRef.current) return;
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        setSeconds(Math.min(elapsed, 30));
      }, 1000);

      limitRef.current = window.setTimeout(() => {
        if (gen !== generationRef.current) return;
        if (rec.state === 'recording') rec.stop();
      }, 30000);

    } catch (err) {
       if (gen === generationRef.current) {
         cancel();cbErrRef.current(new Error('microphone'));
       }
    }
  }, [cancel]);

  const stop = useCallback(() => {
    if (stateRef.current === 'recording' && recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    }
  }, []);

  const send = useCallback(async () => {
    if (isSendingRef.current) return;
    if (stateRef.current !== 'stopped' && stateRef.current !== 'recording') return;

    isSendingRef.current = true;
    const gen = generationRef.current;

    try {
      let targetBlob = blobRef.current;

      if (!targetBlob && stateRef.current === 'recording') {
        transition('sending');
        const stopped=stopPromiseRef.current;
        if (recorderRef.current?.state === 'recording') {
             recorderRef.current.stop();
        }

        if (stopped) {
            targetBlob = await stopped;
        }
      }

      if (gen !== generationRef.current) return;
      if (!targetBlob) throw new Error('microphone');

      transition('sending');

      const arrayBuffer = await targetBlob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);
      if(gen!==generationRef.current)return;

      const result = await interpretTaste({ audio: { data: base64, mimeType: targetBlob.type } }, langRef.current);

      if (gen !== generationRef.current) return;

      if (result && typeof result.summary === 'string') {
        cbTextRef.current(result.summary);
      }

      chunksRef.current = [];
      blobRef.current = null;
      transition('idle');
      setSeconds(0);

    } catch (err) {
      if (gen !== generationRef.current) return;
      cbErrRef.current(err);
      transition('idle');
      setSeconds(0);
      chunksRef.current = [];
      blobRef.current = null;
    } finally {
      if(gen===generationRef.current)isSendingRef.current = false;
    }
  }, []);

  useEffect(() => {
    const generation=generationRef;
    return () => {
      generation.current++;
      clearTimers();
      if (recorderRef.current) {
        recorderRef.current.onstop = null;
        recorderRef.current.onerror = null;
        recorderRef.current.ondataavailable = null;
        try { if(recorderRef.current.state !== 'inactive') recorderRef.current.stop(); } catch(_){}
      }
      if (resolverRef.current) {
        resolverRef.current(null);
      }
      cleanupTracks();
    };
  }, []);

  return { state, seconds, start, stop, send, cancel };
};
