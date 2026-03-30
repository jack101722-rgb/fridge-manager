const FOOD_SAFETY_KEY = process.env.EXPO_PUBLIC_FOOD_SAFETY_API_KEY ?? '';
const NAVER_CLIENT_ID = process.env.EXPO_PUBLIC_NAVER_CLIENT_ID ?? '';
const NAVER_CLIENT_SECRET = process.env.EXPO_PUBLIC_NAVER_CLIENT_SECRET ?? '';

export interface BarcodeProduct {
  name: string;
  company?: string;
  category?: string;
  source: 'foodsafety' | 'naver' | 'openfoodfacts' | 'unknown';
}

// 1. 식약처 유통바코드 API
async function lookupFoodSafety(barcode: string): Promise<BarcodeProduct | null> {
  if (!FOOD_SAFETY_KEY) return null;
  try {
    const url = `https://openapi.food.go.kr/openApiService/rest/eciceBarcodeService/getBarcode?serviceKey=${encodeURIComponent(FOOD_SAFETY_KEY)}&barcode=${barcode}&returnType=json`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    // 응답 구조: { body: { items: [ { PRDLST_NM, BSSH_NM, PRDLST_DCNM } ] } }
    const item = data?.body?.items?.[0] ?? data?.body?.item;
    if (!item) return null;
    const name = item.PRDLST_NM ?? item.PRDT_NM ?? item.prdlstNm;
    if (!name) return null;
    return {
      name,
      company: item.BSSH_NM ?? item.bsshNm,
      category: item.PRDLST_DCNM ?? item.prdlstDcnm,
      source: 'foodsafety',
    };
  } catch {
    return null;
  }
}

// 2. 네이버 쇼핑 검색 (바코드 번호로 검색)
async function lookupNaver(barcode: string): Promise<BarcodeProduct | null> {
  if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) return null;
  try {
    const res = await fetch(
      `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(barcode)}&display=1`,
      {
        headers: {
          'X-Naver-Client-Id': NAVER_CLIENT_ID,
          'X-Naver-Client-Secret': NAVER_CLIENT_SECRET,
        },
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const item = data?.items?.[0];
    if (!item) return null;
    // HTML 태그 제거
    const name = item.title?.replace(/<[^>]+>/g, '').trim();
    if (!name) return null;
    return {
      name,
      company: item.brand || item.maker,
      category: item.category1,
      source: 'naver' as const,
    };
  } catch {
    return null;
  }
}

// 3. Open Food Facts (글로벌, 무료)
async function lookupOpenFoodFacts(barcode: string): Promise<BarcodeProduct | null> {
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=product_name,product_name_ko,brands,categories_tags`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 1) return null;
    const p = data.product;
    const name = p.product_name_ko || p.product_name;
    if (!name) return null;
    return {
      name,
      company: p.brands,
      source: 'openfoodfacts',
    };
  } catch {
    return null;
  }
}

// 메인: 식약처 → 네이버 → Open Food Facts → null 순서로 조회
export async function lookupBarcode(barcode: string): Promise<BarcodeProduct | null> {
  const fsResult = await lookupFoodSafety(barcode);
  if (fsResult) return fsResult;

  const naverResult = await lookupNaver(barcode);
  if (naverResult) return naverResult;

  const offResult = await lookupOpenFoodFacts(barcode);
  if (offResult) return offResult;

  return null;
}
