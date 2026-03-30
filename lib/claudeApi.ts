import { IngredientInference } from '../types';
import { supabase } from './supabase';

const EDGE_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/claude-proxy`;

async function callClaude(messages: object[], maxTokens = 1024): Promise<string> {
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

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API 오류: ${res.status} ${err}`);
  }

  const data = await res.json();
  return data.content[0].text as string;
}

const INFERENCE_FIELDS = `
  "name": "정제된 재료명",
  "category": "vegetable|meat|dairy|processed|beverage|condiment|other 중 하나",
  "storage_type": "fridge|freezer|room_temp 중 가장 적합한 것",
  "storage_tip": "보관 팁 1줄 (20자 이내)",
  "ai_expiry_days": 미개봉/구매 상태 기준 권장 소비일수(숫자),
  "ai_expiry_note": "개봉 전/후 유통기한 차이 명시 (예: 미개봉 90일, 개봉 후 냉장 7일)",
  "market_price": 일반적인 1단위 시중가격(원, 숫자),
  "is_food": true 또는 false,
  "confidence": 0.0~1.0`;

const INFERENCE_RULES = `
유통기한 판단 기준:
- ai_expiry_days는 보수적 최솟값이 아닌 일반적인 평균 소비 가능 기간으로 제시
- 신선 식품(채소, 과일, 육류 등)은 구매 직후 신선한 상태를 기준으로 냉장 보관 시 평균 기간 제시
  예: 딸기 5일, 두부 7일, 닭고기 3일, 당근 14일 (최솟값 아닌 평균값)
- 가공/포장 제품은 실제 제품 평균 유통기한 기준으로 판단
- 개봉 후 유통기한이 크게 달라지는 경우 ai_expiry_note에 반드시 명시`;

// 재료명 1개 → 상세 추론
export async function inferIngredient(name: string): Promise<IngredientInference> {
  const prompt = `당신은 식품 전문가입니다. 다음 식재료 정보를 JSON으로 반환하세요.
${INFERENCE_RULES}

식재료명: "${name}"

반환 형식 (JSON만, 설명 없이):
{
${INFERENCE_FIELDS}
}`;

  const text = await callClaude([{ role: 'user', content: prompt }]);
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Claude 응답에서 JSON을 찾을 수 없습니다.');
  return JSON.parse(jsonMatch[0]) as IngredientInference;
}

// 재료명 여러 개 → 일괄 추론 (API 1회 호출)
export async function inferIngredients(items: { name: string; container?: string }[]): Promise<IngredientInference[]> {
  const list = items.map((item, i) => {
    const hint = item.container ? ` (보관 방식: ${item.container})` : '';
    return `${i + 1}. ${item.name}${hint}`;
  }).join('\n');
  const prompt = `당신은 식품 전문가입니다. 다음 식재료 목록을 분석해 JSON 배열로 반환하세요.
${INFERENCE_RULES}
- 보관 방식 힌트(밀폐용기/봉투에 넣기/그냥 보관 등)가 있으면 ai_expiry_days와 storage_tip에 반영하세요

식재료 목록:
${list}

반환 형식 (JSON 배열만, 설명 없이, 입력 순서대로):
[
  {
${INFERENCE_FIELDS}
  },
  ...
]`;

  const text = await callClaude([{ role: 'user', content: prompt }], Math.min(2048 * items.length, 8000));
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('Claude 응답에서 JSON 배열을 찾을 수 없습니다.');
  return JSON.parse(jsonMatch[0]) as IngredientInference[];
}

// 영수증 OCR 파싱
export interface ParsedReceiptItem {
  name: string;
  price: number;
  quantity: number;
}

export interface ParsedReceipt {
  store_name: string;
  purchase_date: string; // 'YYYY-MM-DD' 또는 ''
  items: ParsedReceiptItem[];
  total: number;
}

export async function parseReceiptImage(base64: string): Promise<ParsedReceipt> {
  const messages = [
    {
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/jpeg', data: base64 },
        },
        {
          type: 'text',
          text: `이 영수증 이미지에서 구매 정보를 추출하세요.

규칙:
- 상품명은 원본 그대로 추출 (줄임말/약자 포함)
- 날짜는 YYYY-MM-DD 형식으로 변환 (불명확하면 빈 문자열)
- 수량 명시 없으면 1로 처리
- 가격은 숫자만 (원 단위)

반환 형식 (JSON만, 설명 없이):
{
  "store_name": "매장명",
  "purchase_date": "YYYY-MM-DD",
  "items": [
    { "name": "상품명", "price": 3000, "quantity": 1 }
  ],
  "total": 15000
}

상품이 없으면 items를 빈 배열로 반환.`,
        },
      ],
    },
  ];

  const text = await callClaude(messages, 2048);
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('영수증에서 정보를 찾을 수 없어요.');
  return JSON.parse(jsonMatch[0]) as ParsedReceipt;
}

// AI 맞춤 패키지 생성
export interface AIPackageItem {
  name: string;
  quantity: number;
  unit: string;
  category: 'vegetable' | 'meat' | 'dairy' | 'processed' | 'beverage' | 'condiment' | 'other';
  storage_type: 'fridge' | 'freezer' | 'room_temp';
}

export async function generateAIPackage(
  householdSize: number,
  cuisinePrefs: string[],
  dietMode: string,
): Promise<AIPackageItem[]> {
  const prefText = cuisinePrefs.length > 0 ? cuisinePrefs.join(', ') : '특별히 없음';
  const dietText = dietMode === 'diet' ? '다이어트 중' : dietMode === 'healthy' ? '건강식 선호' : '일반';
  const prompt = `당신은 식품 전문가입니다. 다음 가구 정보에 맞는 일주일치 기본 냉장고 재료 패키지를 추천해주세요.

가구 정보:
- 인원: ${householdSize}명
- 선호 음식: ${prefText}
- 식단 목표: ${dietText}

규칙:
- 7~12개 재료로 구성
- 중복 없이 실용적인 재료만
- 가구 인원에 맞게 수량 조정
- 선호 음식과 식단 목표를 반영

반환 형식 (JSON 배열만, 설명 없이):
[
  {
    "name": "재료명",
    "quantity": 숫자,
    "unit": "개|봉지|팩|병|g|mL|묶음|통 중 하나",
    "category": "vegetable|meat|dairy|processed|beverage|condiment|other",
    "storage_type": "fridge|freezer|room_temp"
  }
]`;

  const text = await callClaude([{ role: 'user', content: prompt }], 1024);
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('AI 패키지 생성에 실패했어요.');
  return JSON.parse(jsonMatch[0]) as AIPackageItem[];
}

// 카메라용: 이미지에서 재료 + 상세정보 한번에 추출
export interface FullDetectedIngredient {
  name: string;
  estimated_quantity: number;
  unit: string;
  category: 'vegetable' | 'meat' | 'dairy' | 'processed' | 'beverage' | 'condiment' | 'other';
  storage_type: 'fridge' | 'freezer' | 'room_temp';
  storage_tip: string;
  ai_expiry_days: number;
  ai_expiry_note: string;
  market_price: number;
}

export async function analyzeIngredientImageFull(base64: string, containerHint?: string): Promise<FullDetectedIngredient[]> {
  const containerNote = containerHint
    ? `\n- 보관 방식 힌트: "${containerHint}" — ai_expiry_days와 storage_tip에 반영`
    : '';
  const messages = [
    {
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/jpeg', data: base64 },
        },
        {
          type: 'text',
          text: `이 냉장고/식품 사진에서 식재료를 모두 찾아 JSON 배열로 반환하세요.

규칙:
- 명확히 보이는 식재료만 포함
- 수량은 보이는 만큼 추정 (불확실하면 1)
- 단위는 "개", "봉지", "팩", "병", "캔", "묶음", "g", "mL" 중 적합한 것
- 가공/포장 제품은 실제 평균 유통기한 기준으로 판단
- ai_expiry_days는 현재 보관 상태(미개봉/개봉) 추정 기준, ai_expiry_note에 개봉 전후 차이 명시${containerNote}

반환 형식 (JSON 배열만, 설명 없이):
[
  {
    "name": "재료명",
    "estimated_quantity": 숫자,
    "unit": "단위",
    "category": "vegetable|meat|dairy|processed|beverage|condiment|other",
    "storage_type": "fridge|freezer|room_temp",
    "storage_tip": "보관 팁 1줄",
    "ai_expiry_days": 권장소비일수(숫자),
    "ai_expiry_note": "개봉 전후 유통기한 차이 포함",
    "market_price": 일반가격(원,숫자)
  }
]

식재료가 없으면 빈 배열 [] 반환.`,
        },
      ],
    },
  ];

  const text = await callClaude(messages, 4096);
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];
  return JSON.parse(jsonMatch[0]) as FullDetectedIngredient[];
}
