
import { GoogleGenAI, Type } from "@google/genai";
import type { AnalysisResultData, Language, LocationData, GroundingSource, LocationSource } from '../types';
import { supabase } from './supabaseClient';

// --- API Key & Mode ---

const getApiKey = () => {
    if (typeof window !== 'undefined') {
        const localKey = localStorage.getItem('SNAPTRIP_API_KEY');
        if (localKey && localKey.trim() !== '' && localKey.trim() !== 'null' && localKey.trim() !== 'undefined') return localKey.trim();
    }
    return '';
};

const hasUserKey = () => getApiKey() !== '';

const getAI = () => new GoogleGenAI({ apiKey: getApiKey() });

// --- Edge Function Proxy ---

const EDGE_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL || 'https://cshxkzgpuurursnhejnw.supabase.co'}/functions/v1/gemini-proxy`;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'missing-supabase-anon-key';

const callGeminiProxy = async (model: string, contents: unknown, generationConfig?: unknown, tools?: unknown) => {
    const body: Record<string, unknown> = { model, contents };
    if (generationConfig) body.generationConfig = generationConfig;
    if (tools) body.tools = tools;

    const response = await fetch(EDGE_FUNCTION_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(err.error || `Proxy error ${response.status}`);
    }

    return response.json();
};

// Extract text from Gemini REST API response
const extractText = (data: any): string => {
    return data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || '';
};

// Extract grounding sources from response
const extractSources = (data: any): GroundingSource[] => {
    const sources: GroundingSource[] = [];
    const chunks = data?.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks) {
        chunks.filter((c: any) => c.web).forEach((c: any) => {
            if (!sources.some(s => s.uri === c.web.uri)) {
                sources.push({ uri: c.web.uri, title: c.web.title });
            }
        });
    }
    return sources;
};

// --- Helpers ---

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

const parseAnalysis = (raw: string, sources: GroundingSource[]): AnalysisResultData => {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    const jsonText = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
    const parsed = JSON.parse(jsonText);
    const allowedStatuses = new Set(['confirmed', 'probable', 'uncertain', 'needs_retake']);
    const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
    const identificationStatus = allowedStatuses.has(parsed.identificationStatus)
        ? parsed.identificationStatus
        : (confidence >= 0.8 ? 'confirmed' : confidence >= 0.6 ? 'probable' : 'uncertain');
    const lowConfidence = identificationStatus === 'uncertain' || identificationStatus === 'needs_retake' || confidence < 0.55;

    return {
        title: sanitizeText(parsed.title) || (lowConfidence ? '' : 'Discovery'),
        fact: sanitizeText(parsed.fact || parsed.summary),
        story: lowConfidence ? sanitizeText(parsed.uncertaintyExplanation || parsed.summary) : sanitizeText(parsed.story),
        identificationStatus,
        confidence,
        visit: lowConfidence ? undefined : {
            atAGlance: sanitizeText(parsed.visit?.atAGlance),
            bestLight: sanitizeText(parsed.visit?.bestLight),
            crowds: sanitizeText(parsed.visit?.crowds)
        },
        retakeReason: sanitizeText(parsed.retakeReason),
        sources
    };
};
// --- Main Functions ---

export const analyzeImageStream = async (
    base64Image: string,
    mimeType: string,
    language: Language,
    onChunk: (partialData: Partial<AnalysisResultData>) => void,
    location?: LocationData | null,
    locationSource: LocationSource = 'none'
): Promise<AnalysisResultData> => {
    try {
        let locationContext = "";
        if (location && locationSource === 'exif') {
            locationContext = `CRITICAL: This location (lat: ${location.latitude}, lng: ${location.longitude}) is retrieved from the IMAGE METADATA. It is highly reliable.`;
        } else if (location && locationSource === 'device') {
            locationContext = `NOTE: This location (lat: ${location.latitude}, lng: ${location.longitude}) is the user's CURRENT device location. If the visual landmark looks different, trust visual analysis.`;
        } else {
            locationContext = "No location metadata available. Rely solely on visual analysis.";
        }

        const langLabel = getLanguageLabel(language);
        const systemInstruction = `You identify landmarks from one traveler photo and write as a friendly travel docent in ${langLabel}. ${locationContext}
Accuracy rules:
- Prefer an uncertain result over a plausible guess. Confidence measures identity certainty, not image quality.
- Carefully read visible signs, plaques, storefront names, inscriptions and street text. Cross-check the visual evidence, location and Google Search.
- Use confirmed only when visual/location evidence and public sources agree; probable for a strong but incomplete match.
- If a closer readable sign, plaque, or name would resolve ambiguity, use needs_retake. If the scene has no identifiable landmark or several candidates remain, use uncertain.
- Never invent a name, date, visit tip or source. Never use generic filler such as Historically significant site, Golden Hour, or Moderate.
- Omit any visit field you cannot support for this specific place. For uncertain/needs_retake, omit visit and keep the explanation short.
Return JSON only with this shape: {"title":"", "fact":"", "story":"", "identificationStatus":"confirmed|probable|uncertain|needs_retake", "confidence":0.0, "uncertaintyExplanation":"", "retakeReason":"", "visit":{"atAGlance":"", "bestLight":"", "crowds":""}}.`;
        const userText = `Identify this place. If visible text is too small, blurred, angled, cropped, or reflective, explicitly ask for a close, head-on photo of that text in retakeReason. Return only the JSON object.`;

        // --- BYOK path: use SDK with streaming ---
        if (hasUserKey()) {
            const imagePart = { inlineData: { data: base64Image, mimeType } };
            const textPart = { text: userText };
            const ai = getAI();
            const response = await ai.models.generateContent({
                model: 'gemini-3.1-flash-lite',
                contents: { parts: [imagePart, textPart] },
                config: { systemInstruction, tools: [{ googleSearch: {} }], temperature: 0.2 }
            });
            const sources: GroundingSource[] = [];
            response.candidates?.[0]?.groundingMetadata?.groundingChunks?.filter(c => c.web).forEach(c => {
                if (!sources.some(s => s.uri === c.web!.uri)) sources.push({ uri: c.web!.uri, title: c.web!.title });
            });
            const result = parseAnalysis(response.text || '{}', sources);
            onChunk(result);
            return result;
        }

        // --- Proxy path: use Edge Function (non-streaming) ---
        const contents = [
            {
                role: "user",
                parts: [
                    { inlineData: { data: base64Image, mimeType } },
                    { text: userText }
                ]
            }
        ];

        const data = await callGeminiProxy(
            'gemini-3.1-flash-lite',
            contents,
            { systemInstruction: { parts: [{ text: systemInstruction }] }, temperature: 0.2 },
            [{ googleSearch: {} }]
        );

        const fullText = extractText(data);
        const sources = extractSources(data);

        const result = parseAnalysis(fullText, sources);
        onChunk(result);
        return result;

    } catch (error: any) { throw error; }
};
export const fetchGuidePointList = async (landmarkName: string, language: Language, locationHint?: string): Promise<{ko: string, en: string, wikiTitle: string, backupQuery: string, visualDescription: string, isOverview?: boolean}[]> => {
    const locationContext = locationHint ? `This landmark is located in/near: ${locationHint}. ` : "";
    const langLabel = getLanguageLabel(language);
    const prompt = `${locationContext}Landmark: ${landmarkName}.
            Task: Pick the most significant points for a tour of this SPECIFIC landmark.
            Rules:
            1. CRITICAL: Only include points belonging to '${landmarkName}'.
            2. NO CONTENT OVERLAP: Each point must represent a unique physical area or historical aspect.
            3. The VERY FIRST point MUST be 'Overview & History' of '${landmarkName}'.
            4. 3-8 points. Quality and distinctiveness over quantity.
            5. Each point MUST have a 'wikiTitle' for image search.

            Format: { "ko": "Title in ${language}", "en": "Title in English", "wikiTitle": "Wiki Title", "backupQuery": "Tags", "visualDescription": "Desc", "isOverview": true/false }`;

    // --- BYOK path ---
    if (hasUserKey()) {
        const ai = getAI();
        const response = await ai.models.generateContent({
            model: "gemini-3.1-flash-lite",
            contents: prompt,
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
    }

    // --- Proxy path ---
    const contents = [{ role: "user", parts: [{ text: prompt }] }];
    const data = await callGeminiProxy('gemini-3.1-flash-lite', contents, {
        responseMimeType: "application/json"
    });
    return JSON.parse(extractText(data) || "[]");
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
    const locationInfo = locationHint ? `(Located in ${locationHint})` : "";
    const contextInfo = allPointTitles ? `This tour consists of: [${allPointTitles.join(', ')}]. Do not repeat info from other points.` : "";

    const langLabel = getLanguageLabel(language);
    const instruction = isOverview
        ? `You are a veteran tour guide. Explain the macro-history and background of '${landmarkName}'. ${locationInfo} ${contextInfo} Respond in ${langLabel}.`
        : `You are a veteran tour guide. Focus on the specific spot '${pointName}' within '${landmarkName}'. ${locationInfo} ${contextInfo} Tell a specific hidden secret or visual detail in ${langLabel}.`;

    const userPrompt = isOverview
        ? `Give an overview of '${landmarkName}'.`
        : `Tell me about '${pointName}' in '${landmarkName}'.`;

    // --- BYOK path ---
    if (hasUserKey()) {
        const ai = getAI();
        const stream = await ai.models.generateContentStream({
            model: "gemini-3.1-flash-lite",
            contents: userPrompt,
            config: { systemInstruction: instruction }
        });
        let full = "";
        for await (const chunk of stream) {
            if (chunk.text) {
                full += chunk.text;
                onChunk(sanitizeText(full));
            }
        }
        return;
    }

    // --- Proxy path ---
    const contents = [{ role: "user", parts: [{ text: userPrompt }] }];
    const data = await callGeminiProxy('gemini-3.1-flash-lite', contents, {
        systemInstruction: { parts: [{ text: instruction }] }
    });
    const full = extractText(data);
    onChunk(sanitizeText(full));
};
export const fetchNearbyPlaces = async (location: LocationData, language: Language) => {
    const actualLang = getLanguageLabel(language);
    const prompt = `Nearby (lat ${location.latitude}, lng ${location.longitude}). Find 5 hot places.
            CRITICAL: Respond COMPLETELY in the language: ${actualLang}. Provide names and descriptions in that language.
            For 'type', strictly use one of English constants: 'landmark', 'restaurant', 'cafe', 'park', 'museum'.
            'mapQuery' MUST be a clean, single-language search term for Google Maps.
            Respond in JSON: { areaName, weather{emoji, tempC}, places[{name, type, rating, reviewCount, description, mapQuery}] }`;

    let responseText: string;

    // --- BYOK path ---
    if (hasUserKey()) {
        const ai = getAI();
        const response = await ai.models.generateContent({
            model: "gemini-3.1-flash-lite",
            contents: prompt,
            config: {
                tools: [{ googleSearch: {} }],
                responseMimeType: "application/json"
            }
        });
        responseText = response.text || "{}";
    } else {
        // --- Proxy path ---
        const contents = [{ role: "user", parts: [{ text: prompt }] }];
        const data = await callGeminiProxy('gemini-3.1-flash-lite', contents, {
            responseMimeType: "application/json"
        }, [{ googleSearch: {} }]);
        responseText = extractText(data) || "{}";
    }

    const parsedData = JSON.parse(responseText);
    const areaName = parsedData.areaName || "Nearby";

    const places = (parsedData.places || []).map((p: any) => ({
        ...p,
        url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.mapQuery || p.name)}`
    }));

    return {
        areaName,
        weather: parsedData.weather || { emoji: "🌤️", tempC: 22 },
        places
    };
};
export const fetchMoreNearbyPlaces = async (location: LocationData, language: Language, excludeNames: string[]) => {
    const actualLang = getLanguageLabel(language);
    const prompt = `Nearby (lat ${location.latitude}, lng ${location.longitude}). Find 5 MORE places excluding: [${excludeNames.join(', ')}].
            CRITICAL: Respond COMPLETELY in the language: ${actualLang}. Provide names and descriptions in that language.
            For 'type', strictly use one of English constants: 'landmark', 'restaurant', 'cafe', 'park', 'museum'.
            'mapQuery' MUST be a clean, single-language search term for Google Maps.
            Respond in JSON: { places[{name, type, rating, reviewCount, description, mapQuery}] }`;

    let responseText: string;

    try {
        // --- BYOK path ---
        if (hasUserKey()) {
            const ai = getAI();
            const response = await ai.models.generateContent({
                model: "gemini-3.1-flash-lite",
                contents: prompt,
                config: {
                    tools: [{ googleSearch: {} }],
                    responseMimeType: "application/json"
                }
            });
            responseText = response.text || "{}";
        } else {
            // --- Proxy path ---
            const contents = [{ role: "user", parts: [{ text: prompt }] }];
            const data = await callGeminiProxy('gemini-3.1-flash-lite', contents, {
                responseMimeType: "application/json"
            }, [{ googleSearch: {} }]);
            responseText = extractText(data) || "{}";
        }

        const parsedData = JSON.parse(responseText);
        const places = (parsedData.places || []).map((p: any) => ({
            ...p,
            url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.mapQuery || p.name)}`
        }));

        return places;
    } catch (e) {
        return [];
    }
};
