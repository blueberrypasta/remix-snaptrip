// Deno environment handler for Google Places menu search and reviews
declare const Deno: any;

export function isSafeGoogleUri(uriStr: unknown): string | undefined {
  if (typeof uriStr !== 'string' || !uriStr.trim()) return undefined;
  try {
    const parsed = new URL(uriStr.trim());
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return undefined;
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'maps.google.com' ||
      host === 'www.google.com' ||
      host === 'google.com' ||
      host.endsWith('.google.com')
    ) {
      return parsed.toString();
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

export async function handleMenuAction(payload: any): Promise<Response> {
  const apiKey = Deno?.env?.get('GOOGLE_PLACES_API_KEY');
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    return jsonResponse({ error: 'config_missing' }, 503);
  }

  const action = payload?.action;

  if (action === 'menu_search') {
    const rawQuery = payload?.query;
    if (typeof rawQuery !== 'string') {
      return jsonResponse({ error: 'invalid_query' }, 400);
    }
    const query = rawQuery.trim();
    if (query.length < 1 || query.length > 200) {
      return jsonResponse({ error: 'invalid_query_length' }, 400);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    try {
      const upstreamRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.googleMapsUri'
        },
        body: JSON.stringify({
          textQuery: query,
          includedType: 'restaurant',
          strictTypeFiltering: true,
          pageSize: 5
        }),
        signal: controller.signal
      });

      if (upstreamRes.status === 429) {
        return jsonResponse({ error: 'google_quota_exceeded' }, 429);
      }
      if (!upstreamRes.ok) {
        return jsonResponse({ error: 'upstream_places_error' }, 502);
      }

      const data = await upstreamRes.json();
      const rawPlaces = Array.isArray(data?.places) ? data.places : [];
      const places = rawPlaces.slice(0, 5).map((p: any) => ({
        id: typeof p?.id === 'string' && /^[A-Za-z0-9_-]{1,256}$/.test(p.id) ? p.id : '',
        displayName: typeof p?.displayName?.text === 'string' ? p.displayName.text : undefined,
        formattedAddress: typeof p?.formattedAddress === 'string' ? p.formattedAddress : undefined,
        googleMapsUri: isSafeGoogleUri(p?.googleMapsUri)
      })).filter((p: any) => p.id.length > 0);

      return jsonResponse({ places }, 200);
    } catch {
      return jsonResponse({ error: 'upstream_timeout_or_network' }, 502);
    } finally {
      clearTimeout(timer);
    }
  }

  if (action === 'menu_reviews') {
    const placeId = payload?.placeId;
    if (typeof placeId !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(placeId)) {
      return jsonResponse({ error: 'invalid_place_id' }, 400);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    try {
      const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`;
      const upstreamRes = await fetch(url, {
        method: 'GET',
        headers: {
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'id,displayName,formattedAddress,googleMapsUri,reviews,attributions'
        },
        signal: controller.signal
      });

      if (upstreamRes.status === 429) {
        return jsonResponse({ error: 'google_quota_exceeded' }, 429);
      }
      if (!upstreamRes.ok) {
        return jsonResponse({ error: 'upstream_places_error' }, 502);
      }

      const data = await upstreamRes.json();
      if (!data || data.id !== placeId) {
        return jsonResponse({ error: 'mismatched_place_id' }, 502);
      }

      const rawReviews = Array.isArray(data.reviews) ? data.reviews : [];
      const reviews = rawReviews.slice(0, 5).map((r: any) => {
        const textContent = (typeof r?.originalText?.text === 'string' && r.originalText.text)
          ? r.originalText.text
          : (typeof r?.text?.text === 'string' ? r.text.text : '');

        const ratingNum = typeof r?.rating === 'number' ? r.rating : 0;
        const normalizedRating = Number.isInteger(ratingNum) && ratingNum >= 1 && ratingNum <= 5 ? ratingNum : 0;

        return {
          id: typeof r?.name === 'string' ? r.name : undefined,
          authorName: typeof r?.authorAttribution?.displayName === 'string' ? r.authorAttribution.displayName : undefined,
          authorPhotoUri: isSafeGoogleUri(r?.authorAttribution?.photoUri),
          authorUri: isSafeGoogleUri(r?.authorAttribution?.uri),
          rating: normalizedRating,
          text: textContent.slice(0, 4000),
          publishTime: typeof r?.publishTime === 'string' ? r.publishTime.slice(0, 40) : undefined,
          visitDate: Number.isInteger(r?.visitDate?.year) && Number.isInteger(r?.visitDate?.month) && r.visitDate.month >= 1 && r.visitDate.month <= 12 ? `${r.visitDate.year}-${String(r.visitDate.month).padStart(2, '0')}` : undefined,
          relativePublishTimeDescription: typeof r?.relativePublishTimeDescription === 'string' ? r.relativePublishTimeDescription : undefined,
          googleMapsUri: isSafeGoogleUri(r?.googleMapsUri)
        };
      }).filter((r: any) => r.text && r.rating > 0);

      const rawAttributions = Array.isArray(data.attributions) ? data.attributions : [];
      const attributions = rawAttributions.map((att: any) => ({
        providerName: typeof att?.provider === 'string' ? att.provider : undefined,
        providerUri: isSafeGoogleUri(att?.providerUri)
      }));

      const place = {
        id: data.id,
        displayName: typeof data?.displayName?.text === 'string' ? data.displayName.text : undefined,
        formattedAddress: typeof data?.formattedAddress === 'string' ? data.formattedAddress : undefined,
        googleMapsUri: isSafeGoogleUri(data?.googleMapsUri)
      };

      return jsonResponse({
        place,
        reviews,
        attributions
      }, 200);
    } catch {
      return jsonResponse({ error: 'upstream_timeout_or_network' }, 502);
    } finally {
      clearTimeout(timer);
    }
  }

  return jsonResponse({ error: 'unknown_action' }, 400);
}
