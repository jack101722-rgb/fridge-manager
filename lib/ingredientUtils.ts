import { supabase } from './supabase';
import { Ingredient } from '../types';

/** 이름 정규화: 소문자 + 공백 제거 */
export function normalizeName(s: string) {
  return s.toLowerCase().replace(/\s/g, '');
}

/**
 * 동의어 그룹: 같은 그룹 안에 있으면 유사 재료로 판단
 */
const SYNONYM_GROUPS: string[][] = [
  ['계란', '달걀', '대란', '왕란', '특란', '중란', '소란', '유정란', '메추리알'],
  ['돼지고기', '돼지', '삼겹살', '목살', '앞다리살', '뒷다리살', '항정살'],
  ['소고기', '쇠고기', '한우', '수입우', '등심', '안심', '갈비', '사태'],
  ['닭고기', '닭', '닭가슴살', '닭다리', '닭날개', '닭봉', '통닭'],
  ['우유', '흰우유', '저지방우유', '무지방우유', '두유'],
  ['소금', '꽃소금', '천일염', '굵은소금', '맛소금', '죽염'],
  ['설탕', '백설탕', '황설탕', '흑설탕', '올리고당', '물엿'],
  ['간장', '진간장', '국간장', '양조간장', '조선간장'],
  ['고추', '청양고추', '홍고추', '풋고추', '오이고추', '꽈리고추'],
  ['파', '대파', '쪽파', '실파', '양파'],
  ['마늘', '깐마늘', '다진마늘', '통마늘', '마늘종'],
  ['생강', '생강가루', '생강청'],
  ['식용유', '포도씨유', '카놀라유', '올리브유', '해바라기씨유', '참기름', '들기름'],
  ['버터', '무염버터', '가염버터', '마가린'],
  ['치즈', '모짜렐라치즈', '슬라이스치즈', '크림치즈', '파마산치즈', '고다치즈'],
  ['두부', '순두부', '연두부', '단단한두부', '부침두부'],
  ['김치', '배추김치', '포기김치', '깍두기', '총각김치', '열무김치', '파김치'],
  ['고추장', '태양초고추장', '순고추장'],
  ['된장', '청국장', '쌈장'],
  ['참기름', '들기름'],
  ['밀가루', '중력분', '강력분', '박력분', '부침가루', '튀김가루'],
  ['쌀', '찹쌀', '현미', '백미', '잡곡'],
  ['감자', '고구마', '자색고구마'],
  ['당근', '미니당근'],
  ['양배추', '방울양배추', '적양배추'],
  ['시금치', '시금치나물'],
  ['오이', '취청오이', '가시오이'],
  ['애호박', '주키니호박', '단호박'],
  ['버섯', '느타리버섯', '표고버섯', '새송이버섯', '팽이버섯', '양송이버섯', '목이버섯'],
  ['새우', '냉동새우', '칵테일새우', '중새우', '대새우', '왕새우'],
  ['오징어', '냉동오징어', '한치'],
  ['고등어', '고등어살', '고등어통조림'],
  ['참치', '참치통조림', '참치캔'],
  ['햄', '스팸', '런천미트', '소시지', '비엔나소시지'],
  ['요거트', '플레인요거트', '그릭요거트'],
];

/** 두 이름이 같은 동의어 그룹에 속하는지 확인 */
function isSynonym(a: string, b: string): boolean {
  const aNorm = normalizeName(a);
  const bNorm = normalizeName(b);
  return SYNONYM_GROUPS.some((group) => {
    const words = group.map(normalizeName);
    const aMatch = words.some((w) => aNorm === w || (aNorm.includes(w) && w.length >= 2));
    const bMatch = words.some((w) => bNorm === w || (bNorm.includes(w) && w.length >= 2));
    return aMatch && bMatch;
  });
}

/** 레벤슈타인 거리 (오타 허용) */
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * 유사 재료 탐지
 * 1) 완전 일치 또는 포함 관계
 * 2) 동의어 사전
 * 3) 레벤슈타인 거리 ≤1 (글자 수 ≥4인 경우만)
 */
export function findSimilarIngredient(
  newName: string,
  existing: Ingredient[],
): Ingredient | null {
  const newNorm = normalizeName(newName);
  return (
    existing.find((ing) => {
      if (ing.is_consumed) return false;
      const exNorm = normalizeName(ing.name);
      if (newNorm === exNorm) return true;
      if (newNorm.includes(exNorm) && exNorm.length >= 2) return true;
      if (exNorm.includes(newNorm) && newNorm.length >= 2) return true;
      if (isSynonym(newName, ing.name)) return true;
      // 오타 허용: 4글자 이상일 때 레벤슈타인 거리 1 이하
      if (newNorm.length >= 4 && exNorm.length >= 4 && levenshtein(newNorm, exNorm) <= 1) return true;
      return false;
    }) ?? null
  );
}

/**
 * 유사 재료 확인 후 수량 합산 여부 결정
 * confirmFn: 커스텀 UI(CustomAlert 등)로 사용자에게 묻는 콜백
 * - true 반환: 합산 완료 (새 insert 불필요)
 * - false 반환: 따로 저장 또는 유사 재료 없음
 */
export async function checkAndMergeSimilar(
  newName: string,
  newQuantity: number,
  existing: Ingredient[],
  onMerged: (updated: Ingredient) => void,
  confirmFn: (title: string, message: string, onConfirm: () => void, onCancel: () => void) => void,
): Promise<boolean> {
  const similar = findSimilarIngredient(newName, existing);
  if (!similar) return false;

  return new Promise((resolve) => {
    confirmFn(
      '비슷한 재료가 있어요',
      `냉장고에 이미 "${similar.name}"이(가) ${similar.quantity}${similar.unit} 있어요.\n"${newName}"와 같은 재료인가요?`,
      async () => {
        const newQty = similar.quantity + newQuantity;
        const now = new Date().toISOString();
        const { error } = await supabase
          .from('ingredients')
          .update({ quantity: newQty, updated_at: now })
          .eq('id', similar.id);
        if (!error) {
          onMerged({ ...similar, quantity: newQty, updated_at: now });
        }
        resolve(true);
      },
      () => resolve(false),
    );
  });
}
