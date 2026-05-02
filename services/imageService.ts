
interface ImageResult {
  url: string | null;
  title: string;
}

/**
 * 실제 장소 사진을 가져오는 엔진 (위키피디아 공식 데이터만 사용)
 */
export const fetchPointImage = async (
    queryKo: string,
    queryEn: string,
    landmarkName: string,
    index: number,
    wikiTitle?: string
): Promise<ImageResult> => {
  
  // 영문 검색어 정제
  const sanitizeEn = (text: string) => {
    if (!text) return "";
    return text
      .replace(/[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/g, '')
      .replace(/["']/g, '')
      .trim();
  };
  
  const searchEn = sanitizeEn(queryEn);
  const landmarkEn = sanitizeEn(landmarkName);
  const wikiEn = wikiTitle ? sanitizeEn(wikiTitle) : null;

  try {
    // Wikipedia 영문 API (가장 정확한 역사적/공식 실사)
    const imageUrl = await getWikiImage(wikiEn || searchEn);
    
    // 이미지가 있으면 URL 반환, 없으면 null (엉뚱한 사진 방지)
    return { 
      url: imageUrl, 
      title: queryKo 
    };
  } catch (error) {
    console.error("Image Fetch Error:", error);
    return { url: null, title: queryKo };
  }
};

/**
 * Wikipedia API (English)를 통한 실사 이미지 URL 획득
 */
async function getWikiImage(title: string): Promise<string | null> {
  if (!title || title.length < 3) return null;
  try {
    // Wikipedia API - pageimages prop으로 고화질 썸네일 검색
    const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=pageimages&format=json&pithumbsize=1200&origin=*`;
    const response = await fetch(wikiUrl);
    const data = await response.json();
    const pages = data.query.pages;
    const pageId = Object.keys(pages)[0];
    
    // 유효한 이미지가 있는 경우에만 URL 반환
    if (pageId !== "-1" && pages[pageId].thumbnail) {
      const source = pages[pageId].thumbnail.source;
      // 너무 작은 아이콘성 이미지는 제외
      if (source && !source.includes('svg') && !source.includes('icon')) {
        return source;
      }
    }
  } catch (e) {
    return null;
  }
  return null;
}

export const getFallbackImageUrl = (landmarkName: string, index: number) => {
  return null;
};

export const clearImageCache = () => {};
