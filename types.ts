
export type Language = 'en' | 'ko' | 'ja' | 'zh' | 'es' | 'fr' | 'de' | 'it';

export type AppState = 'welcome' | 'result' | 'guide' | 'about' | 'error';

export type AnalysisStatus = 'processing' | 'success' | 'failed';

export type LocationSource = 'exif' | 'device' | 'none';

export interface User {
  name: string;
  email: string;
  avatar: string;
  accessToken?: string;
  credits: number;
  isPremium: boolean;
}

export interface UserSettings {
  language: Language;
}

export interface UserData {
  history: HistoryItem[];
  settings: UserSettings;
}

export interface LocationData {
  latitude: number;
  longitude: number;
}

export interface GroundingSource {
  uri: string;
  title: string;
}

export interface AnalysisResultData {
  title: string;
  fact: string;
  story: string;
  identificationStatus?: 'confirmed' | 'probable' | 'uncertain' | 'needs_retake';
  confidence?: number;
  visit?: {
    atAGlance?: string;
    bestLight?: string;
    crowds?: string;
  };
  retakeReason?: string;
  recommendations?: string;
  sources?: GroundingSource[];
}

export interface GuidePoint {
  title: string;
  searchQueryEn?: string; 
  visualDescription?: string;
  content?: string;
  imageUrl?: string;
  sourceUrl?: string;
  isLoading?: boolean;
}

export interface HistoryItem {
  id: string;
  status: AnalysisStatus;
  imageData: string;
  timestamp: number;
  locationSource?: LocationSource; 
  locationData?: LocationData; 
  title?: string;
  fact?: string;
  story?: string;
  identificationStatus?: 'confirmed' | 'probable' | 'uncertain' | 'needs_retake';
  confidence?: number;
  visit?: {
    atAGlance?: string;
    bestLight?: string;
    crowds?: string;
  };
  retakeReason?: string;
  recommendations?: string;
  error?: string;
  isAutoSaved?: boolean;
  progress?: number;
  sources?: GroundingSource[];
}

declare global {
  /* Define the AIStudio interface to match requirements and allow for merging with existing global types */
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }

  interface Window {
    google: {
      accounts: {
        id: {
          initialize: (config: any) => void;
          renderButton: (parent: HTMLElement, options: any) => void;
          prompt: () => void;
        };
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: any) => void;
          }) => {
            requestAccessToken: () => void;
          };
        };
      };
    };
    EXIF: any;
    /* Fix: Use the AIStudio type to resolve the property declaration conflict */
    aistudio?: AIStudio;
  }
}
