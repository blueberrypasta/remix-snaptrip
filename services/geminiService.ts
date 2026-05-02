
import { GoogleGenAI, Type } from "@google/genai";
import type { AnalysisResultData, Language, LocationData, GroundingSource, LocationSource } from '../types';

const getApiKey = () => {
    // Check localStorage first
    if (typeof window !== 'undefined') {
        const localKey = localStorage.getItem('SNAPTRIP_API_KEY');
        if (localKey && localKey.trim() !== '' && localKey.trim() !== 'null' && localKey.trim() !== 'undefined') return localKey.trim();
    }
    return process.env.API_KEY || '';
};

const getAI = () => new GoogleGenAI({ apiKey: getApiKey() });

const getLanguageLabel = (lang: Language): string => {
  const labels: Record<Language, string> = {
    en: 'casual English',
    ko: 'informal Korean (banmal)',
    ja: 'casual Japanese',
    zh: 'casual Chinese',
    es: 'casual Spanish',
    fr: 'casual French',
    de: 'casual German',
    it: 'casual Italian'
  };
  return labels[lang] || labels.en;
};

const sanitizeText = (text: string): string => {
    if (!text) return "";
    return text
        .replace(/\[TITLE\]:?/gi, '')
        .replace(/\[FACT\]:?/gi, '')
        .replace(/\[STORY\]:?/gi, '')
        .replace(/\*\*/g, '') 
        .replace(/\*\s/g, '')   
        .replace(/#/g, '')    
        .replace(/_/g, '')    
        .replace(/`/g, '')
        .replace(/thought\s*[:\s][\s\S]*?(?=\n\n|\n[가-힣]|\n[A-Z]|$)/gi, '')
        .trim();
};

export const analyzeImageStream = async (
    base64Image: string, 
    mimeType: string, 
    language: Language,
    onChunk: (partialData: Partial<AnalysisResultData>) => void,
    location?: LocationData | null,
    locationSource: LocationSource = 'none'
): Promise<AnalysisResultData> => {
    try {
        const imagePart = { inlineData: { data: base64Image, mimeType: mimeType } };
        
        let locationContext = "";
        if (location && locationSource === 'exif') {
            locationContext = `CRITICAL: This location (lat: ${location.latitude}, lng: ${location.longitude}) is retrieved from the IMAGE METADATA. It is highly reliable.`;
        } else if (location && locationSource === 'device') {
            locationContext = `NOTE: This location (lat: ${location.latitude}, lng: ${location.longitude}) is the user's CURRENT device location. If the visual landmark looks different, trust visual analysis.`;
        } else {
            locationContext = "No location metadata available. Rely solely on visual analysis.";
        }

        const langLabel = getLanguageLabel(language);
        const systemInstruction = `You are a friendly travel docent. Respond in ${langLabel}. Always start with [TITLE]:, then [FACT]:, then [STORY]:. ${locationContext}`;
        const textPart = { text: `Analyze this landmark. Format: [TITLE]: Name [FACT]: One-line tip [STORY]: Full guide.` };
        
        const ai = getAI();
        const responseStream = await ai.models.generateContentStream({
            model: 'gemini-3.1-flash-lite-preview',
            contents: { parts: [imagePart, textPart] },
            config: { systemInstruction, tools: [{ googleSearch: {} }] }
        });

        let fullText = "";
        let sources: GroundingSource[] = [];

        for await (const chunk of responseStream) {
            if (chunk.candidates?.[0]?.groundingMetadata?.groundingChunks) {
                const chunks = chunk.candidates[0].groundingMetadata.groundingChunks;
                chunks.filter(c => c.web).forEach(c => {
                    if (!sources.some(s => s.uri === c.web!.uri)) sources.push({ uri: c.web!.uri, title: c.web!.title });
                });
            }
            if (chunk.text) {
                fullText += chunk.text;
                const title = fullText.match(/\[TITLE\]:?\s*([\s\S]*?)(?=\n\s*\[|$)/i)?.[1];
                const fact = fullText.match(/\[FACT\]:?\s*([\s\S]*?)(?=\n\s*\[|$)/i)?.[1];
                const story = fullText.match(/\[STORY\]:?\s*([\s\S]*)$/i)?.[1];
                onChunk({ title: sanitizeText(title), fact: sanitizeText(fact), story: sanitizeText(story), sources });
            }
        }
        return { 
            title: sanitizeText(fullText.match(/\[TITLE\]:?\s*([\s\S]*?)(?=\n\s*\[|$)/i)?.[1]) || "Discovery", 
            fact: sanitizeText(fullText.match(/\[FACT\]:?\s*([\s\S]*?)(?=\n\s*\[|$)/i)?.[1]) || "Searching for secrets", 
            story: sanitizeText(fullText.match(/\[STORY\]:?\s*([\s\S]*)$/i)?.[1]) || fullText, 
            sources 
        };
    } catch (error: any) { throw error; }
};

export const fetchGuidePointList = async (landmarkName: string, language: Language, locationHint?: string): Promise<{ko: string, en: string, wikiTitle: string, backupQuery: string, visualDescription: string, isOverview?: boolean}[]> => {
    const ai = getAI();
    try {
        const locationContext = locationHint ? `This landmark is located in/near: ${locationHint}. ` : "";
        const langLabel = getLanguageLabel(language);
        const response = await ai.models.generateContent({
            model: "gemini-3.1-flash-lite-preview",
            contents: `${locationContext}Landmark: ${landmarkName}. 
            Task: Pick the most significant points for a tour of this SPECIFIC landmark.
            Rules:
            1. CRITICAL: Only include points belonging to '${landmarkName}'. 
            2. NO CONTENT OVERLAP: Each point must represent a unique physical area or historical aspect.
            3. The VERY FIRST point MUST be 'Overview & History' of '${landmarkName}'.
            4. 3-8 points. Quality and distinctiveness over quantity.
            5. Each point MUST have a 'wikiTitle' for image search.
            
            Format: { "ko": "Title in ${language}", "en": "Title in English", "wikiTitle": "Wiki Title", "backupQuery": "Tags", "visualDescription": "Desc", "isOverview": true/false }`,
            config: { 
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            ko: { type: Type.STRING },
                            en: { type: Type.STRING },
                            wikiTitle: { type: Type.STRING },
                            backupQuery: { type: Type.STRING },
                            visualDescription: { type: Type.STRING },
                            isOverview: { type: Type.BOOLEAN }
                        },
                        required: ["ko", "en", "wikiTitle", "backupQuery", "visualDescription"]
                    }
                }
            }
        });
        return JSON.parse(response.text || "[]");
    } catch (e) {
        throw e;
    }
};

export const streamGuideDetail = async (
    pointName: string, 
    landmarkName: string, 
    language: Language, 
    onChunk: (text: string) => void, 
    isOverview: boolean = false, 
    locationHint?: string,
    allPointTitles?: string[]
) => {
    const ai = getAI();
    const locationInfo = locationHint ? `(Located in ${locationHint})` : "";
    const contextInfo = allPointTitles ? `This tour consists of: [${allPointTitles.join(', ')}]. Do not repeat info from other points.` : "";
    
    const langLabel = getLanguageLabel(language);
    const instruction = isOverview 
        ? `You are a veteran tour guide. Explain the macro-history and background of '${landmarkName}'. ${locationInfo} ${contextInfo} Respond in ${langLabel}.`
        : `You are a veteran tour guide. Focus on the specific spot '${pointName}' within '${landmarkName}'. ${locationInfo} ${contextInfo} Tell a specific hidden secret or visual detail in ${langLabel}.`;

    const stream = await ai.models.generateContentStream({
        model: "gemini-3.1-flash-lite-preview",
        contents: isOverview 
            ? `Give an overview of '${landmarkName}'.` 
            : `Tell me about '${pointName}' in '${landmarkName}'.`,
        config: { systemInstruction: instruction }
    });
    let full = "";
    for await (const chunk of stream) {
        if (chunk.text) {
            full += chunk.text;
            onChunk(sanitizeText(full));
        }
    }
};

export const fetchNearbyPlaces = async (location: LocationData, language: Language) => {
    const ai = getAI();
    const langLabel = language === 'ko' ? 'Korean' : 'English'; // General language group for search
    const actualLang = getLanguageLabel(language);
    try {
        const response = await ai.models.generateContent({
            model: "gemini-3.1-flash-lite-preview",
            contents: `Nearby (lat ${location.latitude}, lng ${location.longitude}). Find 5 hot places. 
            CRITICAL: Respond COMPLETELY in the language: ${actualLang}. Provide names and descriptions in that language.
            For 'type', strictly use one of English constants: 'landmark', 'restaurant', 'cafe', 'park', 'museum'.
            'mapQuery' MUST be a clean, single-language search term for Google Maps.
            Respond in JSON: { areaName, weather{emoji, tempC}, places[{name, type, rating, reviewCount, description, mapQuery}] }`,
            config: { 
                tools: [{ googleSearch: {} }],
                responseMimeType: "application/json"
            }
        });
        const data = JSON.parse(response.text || "{}");
        const areaName = data.areaName || "Nearby";
        
        const places = (data.places || []).map((p: any) => ({
            ...p,
            url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.mapQuery || p.name)}`
        }));

        return { 
            areaName, 
            weather: data.weather || { emoji: "🌤️", tempC: 22 }, 
            places
        };
    } catch (e) { 
        throw e;
    }
};

export const fetchMoreNearbyPlaces = async (location: LocationData, language: Language, excludeNames: string[]) => {
    const ai = getAI();
    const actualLang = getLanguageLabel(language);
    try {
        const response = await ai.models.generateContent({
            model: "gemini-3.1-flash-lite-preview",
            contents: `Nearby (lat ${location.latitude}, lng ${location.longitude}). Find 5 MORE places excluding: [${excludeNames.join(', ')}]. 
            CRITICAL: Respond COMPLETELY in the language: ${actualLang}. Provide names and descriptions in that language.
            For 'type', strictly use one of English constants: 'landmark', 'restaurant', 'cafe', 'park', 'museum'.
            'mapQuery' MUST be a clean, single-language search term for Google Maps.
            Respond in JSON: { places[{name, type, rating, reviewCount, description, mapQuery}] }`,
            config: { 
                tools: [{ googleSearch: {} }],
                responseMimeType: "application/json"
            }
        });
        const data = JSON.parse(response.text || "{}");
        
        const places = (data.places || []).map((p: any) => ({
            ...p,
            url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.mapQuery || p.name)}`
        }));

        return places;
    } catch (e) { 
        return [];
    }
};
