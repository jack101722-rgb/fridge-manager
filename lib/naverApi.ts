const CLIENT_ID = process.env.EXPO_PUBLIC_NAVER_CLIENT_ID ?? '';
const CLIENT_SECRET = process.env.EXPO_PUBLIC_NAVER_CLIENT_SECRET ?? '';
const BLOG_SEARCH_URL = 'https://openapi.naver.com/v1/search/blog.json';

export interface NaverBlogResult {
  title: string;        // HTML 태그 포함될 수 있음
  link: string;
  description: string;  // HTML 태그 포함될 수 있음
  bloggername: string;
  bloggerlink: string;
  postdate: string;     // 'YYYYMMDD'
}

// HTML 태그 및 엔티티 제거
function stripHtml(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

// 메뉴명으로 네이버 블로그 레시피 검색
export async function searchBlogRecipes(menuName: string, count = 5): Promise<NaverBlogResult[]> {
  const query = encodeURIComponent(`${menuName} 레시피 만드는법`);
  const url = `${BLOG_SEARCH_URL}?query=${query}&display=${count}&sort=sim`;

  const res = await fetch(url, {
    headers: {
      'X-Naver-Client-Id': CLIENT_ID,
      'X-Naver-Client-Secret': CLIENT_SECRET,
    },
  });

  if (!res.ok) throw new Error(`네이버 검색 오류: ${res.status}`);

  const data = await res.json();
  const items: NaverBlogResult[] = (data.items ?? []).map((item: NaverBlogResult) => ({
    ...item,
    title: stripHtml(item.title),
    description: stripHtml(item.description),
  }));

  return items;
}

// postdate 'YYYYMMDD' → 'YYYY.MM.DD'
export function formatPostDate(postdate: string): string {
  if (postdate.length !== 8) return postdate;
  return `${postdate.slice(0, 4)}.${postdate.slice(4, 6)}.${postdate.slice(6, 8)}`;
}
