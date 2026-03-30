import { supabase } from './supabase';
import { Ingredient } from '../types';

const EDGE_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/claude-proxy`;

async function callClaude(messages: object[], maxTokens = 2048): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('로그인이 필요합니다.');

  const res = await fetch(EDGE_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messages, max_tokens: maxTokens }),
  });
  if (!res.ok) throw new Error(`Claude API 오류: ${res.status}`);
  const data = await res.json();
  return data.content[0].text as string;
}

// 현재 연도-주차 키 (예: '2026-W13')
function getWeekKey(): string {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const week = Math.ceil(
    ((now.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7
  );
  return `${now.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

// ─── 타입 정의 ────────────────────────────────────────────

export type MenuCategory = 'seasonal' | 'quick' | 'korean' | 'western';

export interface CachedMenu {
  id: string;
  category: MenuCategory;
  menu_name: string;
  description: string;
  emoji: string;
  time_minutes: number;
  difficulty: 'easy' | 'medium' | 'hard';
  tags: string[];
  week_key: string;
  created_at: string;
}

export interface PersonalizedMenu {
  menu_name: string;
  emoji: string;
  description: string;
  time_minutes: number;
  difficulty: 'easy' | 'medium' | 'hard';
  available_ingredients: string[];
  missing_ingredients: string[];
  urgency_used: string[];
}

export interface RecipeStep {
  step: number;
  desc: string;
}

export interface RecipeIngredient {
  name: string;
  amount: string;
}

export interface CachedRecipe {
  id: string;
  menu_name: string;
  steps: RecipeStep[];
  ingredients: RecipeIngredient[];
  time_minutes: number;
  difficulty: 'easy' | 'medium' | 'hard';
  created_at: string;
}

// ─── 레이어 1: 캐시 메뉴 ─────────────────────────────────

export async function fetchCachedMenus(): Promise<CachedMenu[]> {
  const weekKey = getWeekKey();
  const { data, error } = await supabase
    .from('cached_menus')
    .select('*')
    .eq('week_key', weekKey)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as CachedMenu[];
}

export async function generateAndCacheMenus(): Promise<CachedMenu[]> {
  const weekKey = getWeekKey();
  const now = new Date();
  const month = now.getMonth() + 1;
  const season =
    month >= 3 && month <= 5 ? '봄' :
    month >= 6 && month <= 8 ? '여름' :
    month >= 9 && month <= 11 ? '가을' : '겨울';

  const prompt = `당신은 한국 요리 전문가입니다. ${season} 시즌(${now.getFullYear()}년 ${month}월)에 맞는 메뉴를 추천해주세요.

다음 4가지 카테고리별로 각 4개씩, 총 16개 메뉴를 JSON 배열로 반환하세요.

카테고리:
- seasonal: ${season} 제철 재료를 활용한 계절 메뉴 (계절 특성 반영)
- quick: 10분 이내 완성 초간단 레시피 (time_minutes 10 이하 필수)
- korean: 누구나 좋아하는 대표 한식 메뉴
- western: 집에서 만들기 좋은 양식/퓨전 메뉴

반환 형식 (JSON 배열만, 설명 없이):
[
  {
    "category": "seasonal|quick|korean|western",
    "menu_name": "메뉴명",
    "description": "한 줄 설명 (30자 이내)",
    "emoji": "대표 이모지 1개",
    "time_minutes": 조리시간(숫자),
    "difficulty": "easy|medium|hard",
    "tags": ["태그1", "태그2"]
  }
]`;

  const text = await callClaude([{ role: 'user', content: prompt }], 3000);
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('메뉴 생성 실패');

  const menus = JSON.parse(jsonMatch[0]) as Omit<CachedMenu, 'id' | 'week_key' | 'created_at'>[];
  const rows = menus.map((m) => ({ ...m, week_key: weekKey }));

  const { data, error } = await supabase.from('cached_menus').insert(rows).select();
  if (error) throw error;
  return (data ?? []) as CachedMenu[];
}

// 캐시 읽기 → 없으면 생성 (주 1회 자동)
export async function getOrCreateCachedMenus(): Promise<CachedMenu[]> {
  const cached = await fetchCachedMenus();
  if (cached.length > 0) return cached;
  return generateAndCacheMenus();
}

// ─── 레시피: Claude 생성 + DB 캐시 ───────────────────────

export async function getOrCreateRecipe(
  menuName: string,
  timeMinutes: number,
  difficulty: 'easy' | 'medium' | 'hard',
): Promise<CachedRecipe> {
  // 1. DB 캐시 확인
  const { data: cached } = await supabase
    .from('recipes')
    .select('*')
    .eq('menu_name', menuName)
    .single();
  if (cached) return cached as CachedRecipe;

  // 2. Claude로 레시피 생성
  const prompt = `당신은 한국 요리 전문가입니다. "${menuName}" 레시피를 JSON으로 반환해주세요.

규칙:
- steps: 단계별 조리 순서 (4~7단계), 각 단계는 구체적이고 따라하기 쉽게
- ingredients: 재료명과 양 (예: "달걀 2개", "간장 1큰술")
- time_minutes: 총 조리 시간 (대략 ${timeMinutes}분)
- difficulty: "${difficulty}"

반환 형식 (JSON만, 설명 없이):
{
  "menu_name": "${menuName}",
  "steps": [
    { "step": 1, "desc": "조리 단계 설명" }
  ],
  "ingredients": [
    { "name": "재료명", "amount": "양" }
  ],
  "time_minutes": ${timeMinutes},
  "difficulty": "${difficulty}"
}`;

  const text = await callClaude([{ role: 'user', content: prompt }], 2000);
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('레시피 생성 실패');
  const recipe = JSON.parse(jsonMatch[0]);

  // 3. DB에 저장 (이후 같은 메뉴는 캐시에서 읽기)
  const { data, error } = await supabase.from('recipes').insert(recipe).select().single();
  if (error) throw error;
  return data as CachedRecipe;
}

// ─── 레이어 2: 맞춤 추천 ─────────────────────────────────

export async function generatePersonalizedMenus(
  ingredients: Ingredient[],
  cuisinePrefs: string[],
  dietMode: string,
): Promise<PersonalizedMenu[]> {
  const active = ingredients.filter((i) => !i.is_consumed);

  const today = new Date();
  const urgency = active
    .filter((i) => {
      if (!i.expiry_date) return false;
      const diff = Math.ceil(
        (new Date(i.expiry_date).getTime() - today.getTime()) / 86400000
      );
      return diff >= 0 && diff <= 3;
    })
    .map((i) => i.name);

  const ingredientList = active.map((i) => i.name).join(', ');
  const urgencyList = urgency.length > 0 ? urgency.join(', ') : '없음';
  const prefText = cuisinePrefs.length > 0 ? cuisinePrefs.join(', ') : '특별히 없음';
  const dietText =
    dietMode === 'diet' ? '다이어트 중' :
    dietMode === 'healthy' ? '건강식 선호' : '일반';

  const prompt = `당신은 한국 요리 전문가입니다. 다음 냉장고 재료로 만들 수 있는 메뉴를 추천해주세요.

보유 재료: ${ingredientList}
유통기한 임박 재료 (우선 사용): ${urgencyList}
선호 음식: ${prefText}
식단 목표: ${dietText}

규칙:
- 총 6개 메뉴 추천
- 임박 재료가 있으면 최소 2개 메뉴에 우선 활용
- available_ingredients: 보유 재료 중 사용하는 것만
- missing_ingredients: 추가로 필요한 재료 (최소화)
- urgency_used: 임박 재료 중 사용하는 것만

반환 형식 (JSON 배열만, 설명 없이):
[
  {
    "menu_name": "메뉴명",
    "emoji": "대표 이모지 1개",
    "description": "한 줄 설명 (30자 이내)",
    "time_minutes": 조리시간(숫자),
    "difficulty": "easy|medium|hard",
    "available_ingredients": ["재료1", "재료2"],
    "missing_ingredients": ["재료명"],
    "urgency_used": ["임박재료명"]
  }
]`;

  const text = await callClaude([{ role: 'user', content: prompt }], 3000);
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('맞춤 메뉴 생성 실패');
  return JSON.parse(jsonMatch[0]) as PersonalizedMenu[];
}
