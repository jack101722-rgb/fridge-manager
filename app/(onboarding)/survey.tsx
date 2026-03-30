import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  TextInput,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../../lib/supabase';
import { useFridgeStore } from '../../store/fridgeStore';

// ────────────────────────────────────────────
// 상수 정의
// ────────────────────────────────────────────

// 세부 선택이 가능한 알레르기 카테고리와 하위 항목
const EXPANDABLE: Record<string, { emoji: string; sub: string[] }> = {
  '해산물':  { emoji: '🐟', sub: ['생선류', '오징어·문어', '조개류', '해조류'] },
  '갑각류':  { emoji: '🦐', sub: ['새우', '게', '랍스터·가재'] },
  '견과류':  { emoji: '🥜', sub: ['땅콩', '아몬드', '호두', '잣', '캐슈넛'] },
  '유제품':  { emoji: '🥛', sub: ['우유', '치즈', '버터', '요거트'] },
};

// 스텝 정의 (인덱스 3은 조건부 상세 스텝)
const STEPS = [
  {
    id: 'household_size',
    question: '몇 명이 함께 드세요?',
    sub: '가족 수에 맞게 레시피와 식재료를 추천해드려요',
    type: 'single' as const,
    options: [
      { label: '1명', value: 1 },
      { label: '2명', value: 2 },
      { label: '3명', value: 3 },
      { label: '4명', value: 4 },
      { label: '5명 이상', value: 5 },
    ],
  },
  {
    id: 'cuisine_prefs',
    question: '어떤 요리를 즐겨 드세요?',
    sub: '선호하는 요리 스타일을 모두 선택해주세요',
    type: 'multi' as const,
    options: [
      { label: '🍚 한식', value: '한식' },
      { label: '🍝 양식', value: '양식' },
      { label: '🥢 중식', value: '중식' },
      { label: '🍣 일식', value: '일식' },
      { label: '🍜 동남아', value: '동남아' },
      { label: '🥙 분식', value: '분식' },
    ],
  },
  {
    id: 'food_restrictions',
    question: '못 드시는 재료가 있나요?',
    sub: '해당 재료는 레시피 추천에서 제외할게요',
    type: 'multi' as const,
    options: [
      { label: '🐷 돼지고기', value: '돼지고기' },
      { label: '🐄 소고기', value: '소고기' },
      { label: '🐟 해산물', value: '해산물' },
      { label: '🦐 갑각류', value: '갑각류' },
      { label: '🥛 유제품', value: '유제품' },
      { label: '🥚 달걀', value: '달걀' },
      { label: '🥜 견과류', value: '견과류' },
      { label: '🌾 밀가루', value: '밀가루' },
      { label: '✏️ 기타 직접 입력', value: '__food_custom__' },
      { label: '✅ 없음', value: '없음' },
    ],
  },
  // 인덱스 3: 조건부 상세 스텝 (food_restrictions_detail)
  // handleNext/handleBack에서 skip 처리
  {
    id: 'food_restrictions_detail',
    question: '어떤 것이 구체적으로 안 맞으세요?',
    sub: '정확한 항목을 선택하면 더 정확하게 제외할 수 있어요',
    type: 'multi' as const,
    options: [], // 동적으로 렌더링
  },
  {
    id: 'shopping_platforms',
    question: '주로 어디서 장을 보세요?',
    sub: '배송 알림을 연동하면 자동으로 재료가 등록돼요',
    type: 'multi' as const,
    options: [
      { label: '🛒 쿠팡', value: '쿠팡' },
      { label: '🌿 마켓컬리', value: '마켓컬리' },
      { label: '🍃 오아시스', value: '오아시스' },
      { label: '🏍 배민B마트', value: '배민B마트' },
      { label: '🏪 SSG닷컴', value: 'SSG닷컴' },
      { label: '🛍 직접 장보기', value: '직접장보기' },
      { label: '✏️ 기타 직접 입력', value: '__custom__' },
    ],
  },
  {
    id: 'diet_mode',
    question: '식단 관리를 하고 계신가요?',
    sub: '식단 목표에 맞는 레시피를 추천해드려요',
    type: 'single' as const,
    options: [
      { label: '🥗 다이어트 중이에요', value: 'diet' },
      { label: '🥦 건강식을 지향해요', value: 'healthy' },
      { label: '🍽 특별히 없어요', value: 'none' },
    ],
  },
  {
    id: 'shopping_day',
    question: '주로 언제 장을 보세요?',
    sub: '장보기 전날 필요한 재료를 알려드릴게요',
    type: 'multi' as const,
    options: [
      { label: '월', value: '월' },
      { label: '화', value: '화' },
      { label: '수', value: '수' },
      { label: '목', value: '목' },
      { label: '금', value: '금' },
      { label: '토', value: '토' },
      { label: '일', value: '일' },
      { label: '정해지지 않음', value: '정해지지않음' },
    ],
  },
  {
    id: 'shopping_time',
    question: '몇 시쯤 장을 보세요?',
    sub: '알림을 가장 편한 시간에 받아보세요',
    type: 'single' as const,
    options: [
      { label: '🌅 오전 (오전 6시 ~ 12시)', value: 'morning' },
      { label: '☀️ 오후 (오후 12시 ~ 6시)', value: 'afternoon' },
      { label: '🌆 저녁 (오후 6시 ~ 10시)', value: 'evening' },
      { label: '🌙 늦은 밤 · 자기 전 (오후 10시 이후)', value: 'night' },
    ],
  },
];

// STEPS에서 상세 스텝을 제외한 기본 스텝 수
const BASE_TOTAL = STEPS.length - 1; // 상세 스텝 제외하면 7개
const DETAIL_STEP_IDX = 3;

// ────────────────────────────────────────────
// 컴포넌트
// ────────────────────────────────────────────

export default function SurveyScreen() {
  const user = useFridgeStore((s) => s.user);
  const setUser = useFridgeStore((s) => s.setUser);

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // 텍스트 입력 상태
  const [customFood, setCustomFood] = useState('');
  const [customFoodDetail, setCustomFoodDetail] = useState('');
  const [customPlatform, setCustomPlatform] = useState('');

  const [answers, setAnswers] = useState<Record<string, any>>({
    household_size: null,
    cuisine_prefs: [] as string[],
    food_restrictions: [] as string[],
    food_restrictions_detail: [] as string[],
    shopping_platforms: [] as string[],
    diet_mode: null,
    shopping_day: [] as string[],
    shopping_time: null,
  });

  // 현재 선택된 확장 가능한 카테고리 목록
  const selectedExpandable = (answers.food_restrictions as string[]).filter(
    (v) => v in EXPANDABLE
  );
  const hasExpandable = selectedExpandable.length > 0;

  // 실질적인 총 스텝 수와 표시용 현재 스텝
  const visibleTotal = hasExpandable ? STEPS.length : BASE_TOTAL;
  const visibleCurrent = step >= DETAIL_STEP_IDX && !hasExpandable ? step : step + 1;
  const progress = visibleCurrent / visibleTotal;

  const current = STEPS[step];
  const answer = answers[current.id];

  const isFoodStep = current.id === 'food_restrictions';
  const isFoodDetailStep = current.id === 'food_restrictions_detail';
  const isPlatformStep = current.id === 'shopping_platforms';
  const isWeekdayStep = current.id === 'shopping_day';

  const showFoodCustomInput = isFoodStep && Array.isArray(answer) && answer.includes('__food_custom__');
  const showPlatformCustomInput = isPlatformStep && Array.isArray(answer) && answer.includes('__custom__');

  // Android 하드웨어 백 버튼
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBack();
      return true;
    });
    return () => sub.remove();
  }, [step, hasExpandable]);

  function isSelected(value: any): boolean {
    if (current.type === 'single') return answer === value;
    return Array.isArray(answer) && answer.includes(value);
  }

  function toggleOption(value: any, field?: string) {
    const targetField = field ?? current.id;
    const targetType = field ? 'multi' : current.type;

    if (targetType === 'single') {
      setAnswers((prev) => ({ ...prev, [targetField]: value }));
      return;
    }

    setAnswers((prev) => {
      const arr: any[] = prev[targetField] ?? [];

      if (value === '없음' || value === '정해지지않음') {
        return { ...prev, [targetField]: [value] };
      }

      const filtered = arr.filter((v) => v !== '없음' && v !== '정해지지않음');

      if (filtered.includes(value)) {
        return { ...prev, [targetField]: filtered.filter((v) => v !== value) };
      }
      return { ...prev, [targetField]: [...filtered, value] };
    });
  }

  function isDetailSelected(value: string): boolean {
    return (answers.food_restrictions_detail as string[]).includes(value);
  }

  function canProceed(): boolean {
    if (isFoodDetailStep) return true; // 상세는 선택 없어도 진행 가능
    if (current.type === 'single') return answer !== null;
    if (!Array.isArray(answer) || answer.length === 0) return false;
    if (isFoodStep && answer.includes('__food_custom__') && customFood.trim() === '') return false;
    if (isPlatformStep && answer.includes('__custom__') && customPlatform.trim() === '') return false;
    return true;
  }

  function handleBack() {
    if (step === 0) {
      router.replace('/(onboarding)/intro');
      return;
    }
    // shopping_platforms(4)에서 뒤로 → 상세 스텝 있으면 3, 없으면 2
    if (step === DETAIL_STEP_IDX + 1) {
      setStep(hasExpandable ? DETAIL_STEP_IDX : DETAIL_STEP_IDX - 1);
      return;
    }
    setStep((s) => s - 1);
  }

  async function handleNext() {
    const isLast = step === STEPS.length - 1;

    if (isLast) {
      await saveAndProceed();
      return;
    }

    // food_restrictions(2)에서 다음 → 상세 스텝 있으면 3, 없으면 4
    if (step === DETAIL_STEP_IDX - 1) {
      setStep(hasExpandable ? DETAIL_STEP_IDX : DETAIL_STEP_IDX + 1);
      return;
    }

    setStep((s) => s + 1);
  }

  function resolveFoodRestrictions(): string[] {
    const main: string[] = answers.food_restrictions ?? [];
    const detail: string[] = answers.food_restrictions_detail ?? [];

    const result: string[] = [];

    for (const item of main) {
      if (item === '없음' || item === '__food_custom__') continue;

      if (item in EXPANDABLE) {
        // 이 카테고리의 세부 항목이 선택됐으면 세부 항목만 추가
        const subItems = detail.filter((d) =>
          EXPANDABLE[item].sub.includes(d)
        );
        if (subItems.length > 0) {
          result.push(...subItems);
        } else {
          result.push(item); // 세부 선택 없으면 상위 카테고리 유지
        }
      } else {
        result.push(item);
      }
    }

    if (customFood.trim()) result.push(customFood.trim());
    if (customFoodDetail.trim()) result.push(customFoodDetail.trim());
    return result;
  }

  function resolvePlatforms(): string[] {
    const arr: string[] = answers.shopping_platforms ?? [];
    return arr
      .filter((v) => v !== '__custom__')
      .concat(customPlatform.trim() ? [customPlatform.trim()] : []);
  }

  async function saveAndProceed() {
    if (!user) return;
    setSaving(true);
    try {
      const foodRestrictions = resolveFoodRestrictions();
      const platforms = resolvePlatforms();

      const { error } = await supabase
        .from('users')
        .update({
          household_size: answers.household_size,
          cuisine_prefs: answers.cuisine_prefs,
          food_restrictions: foodRestrictions,
          shopping_platforms: platforms,
          diet_mode: answers.diet_mode,
          shopping_day: answers.shopping_day,
          shopping_time: answers.shopping_time,
        })
        .eq('id', user.id);

      if (error) throw error;

      setUser({
        ...user,
        household_size: answers.household_size,
        cuisine_prefs: answers.cuisine_prefs,
        food_restrictions: foodRestrictions,
        shopping_platforms: platforms,
        diet_mode: answers.diet_mode,
        shopping_day: answers.shopping_day,
        shopping_time: answers.shopping_time,
      });

      router.replace('/(onboarding)/permissions');
    } catch (e) {
      Alert.alert('오류', '저장 중 문제가 생겼어요. 다시 시도해주세요.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar style="dark" />

      {/* 상단 진행 바 */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
          <Text style={styles.backText}>{'‹'}</Text>
        </TouchableOpacity>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={styles.stepLabel}>{visibleCurrent} / {visibleTotal}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.question}>{current.question}</Text>
        <Text style={styles.sub}>{current.sub}</Text>

        {/* ── 식재료 상세 스텝 ── */}
        {isFoodDetailStep ? (
          <FoodDetailSection
            selectedExpandable={selectedExpandable}
            detailAnswers={answers.food_restrictions_detail as string[]}
            onToggle={(value) => toggleOption(value, 'food_restrictions_detail')}
            customValue={customFoodDetail}
            onCustomChange={setCustomFoodDetail}
          />
        ) : isWeekdayStep ? (
          /* ── 요일 칩 ── */
          <View style={styles.weekRow}>
            {current.options.map((opt) => {
              const isSpecial = opt.value === '정해지지않음';
              return (
                <TouchableOpacity
                  key={String(opt.value)}
                  style={[
                    isSpecial ? styles.weekChipWide : styles.weekChip,
                    isSelected(opt.value) && styles.chipSelected,
                  ]}
                  onPress={() => toggleOption(opt.value)}
                  activeOpacity={0.75}
                >
                  <Text style={[
                    styles.weekChipText,
                    isSelected(opt.value) && styles.chipTextSelected,
                    isSpecial && { fontSize: 13 },
                  ]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          /* ── 일반 옵션 목록 ── */
          <>
            <View style={styles.options}>
              {current.options.map((opt) => (
                <TouchableOpacity
                  key={String(opt.value)}
                  style={[styles.option, isSelected(opt.value) && styles.optionSelected]}
                  onPress={() => toggleOption(opt.value)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.optionText, isSelected(opt.value) && styles.optionTextSelected]}>
                    {opt.label}
                  </Text>
                  {isSelected(opt.value) && <Text style={styles.check}>✓</Text>}
                </TouchableOpacity>
              ))}
            </View>

            {/* 음식 직접 입력 */}
            {showFoodCustomInput && (
              <TextInput
                style={styles.customInput}
                placeholder="예) 고수, 두리안, 트러플..."
                placeholderTextColor="#B0B8C1"
                value={customFood}
                onChangeText={setCustomFood}
                autoFocus
                returnKeyType="done"
              />
            )}

            {/* 플랫폼 직접 입력 */}
            {showPlatformCustomInput && (
              <TextInput
                style={styles.customInput}
                placeholder="예) 네이버 장보기, 이마트몰..."
                placeholderTextColor="#B0B8C1"
                value={customPlatform}
                onChangeText={setCustomPlatform}
                autoFocus
                returnKeyType="done"
              />
            )}
          </>
        )}
      </ScrollView>

      {/* 하단 버튼 */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.btn, !canProceed() && styles.btnDisabled]}
          onPress={handleNext}
          disabled={!canProceed() || saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.btnText}>
              {step === STEPS.length - 1 ? '완료' : '다음'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ────────────────────────────────────────────
// 식재료 상세 선택 컴포넌트
// ────────────────────────────────────────────

function FoodDetailSection({
  selectedExpandable,
  detailAnswers,
  onToggle,
  customValue,
  onCustomChange,
}: {
  selectedExpandable: string[];
  detailAnswers: string[];
  onToggle: (value: string) => void;
  customValue: string;
  onCustomChange: (v: string) => void;
}) {
  return (
    <View style={{ gap: 28 }}>
      {selectedExpandable.map((category) => {
        const { emoji, sub } = EXPANDABLE[category];
        return (
          <View key={category}>
            <Text style={detailStyles.categoryLabel}>
              {emoji} {category}
            </Text>
            <View style={detailStyles.subOptions}>
              {sub.map((item) => {
                const selected = detailAnswers.includes(item);
                return (
                  <TouchableOpacity
                    key={item}
                    style={[detailStyles.chip, selected && detailStyles.chipOn]}
                    onPress={() => onToggle(item)}
                    activeOpacity={0.75}
                  >
                    <Text style={[detailStyles.chipText, selected && detailStyles.chipTextOn]}>
                      {item}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );
      })}

      <View>
        <Text style={detailStyles.categoryLabel}>✏️ 기타</Text>
        <Text style={detailStyles.categoryHint}>위 목록에 없는 항목이 있다면 직접 입력해주세요</Text>
        <TextInput
          style={detailStyles.input}
          placeholder="예) 고수, 두리안, 특정 향신료..."
          placeholderTextColor="#B0B8C1"
          value={customValue}
          onChangeText={onCustomChange}
          returnKeyType="done"
        />
      </View>
    </View>
  );
}

// ────────────────────────────────────────────
// 스타일
// ────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 56,
    paddingHorizontal: 24,
    paddingBottom: 16,
    gap: 12,
  },
  backBtn: { paddingRight: 4 },
  backText: { fontSize: 28, color: '#111111', lineHeight: 32 },
  progressTrack: {
    flex: 1,
    height: 4,
    backgroundColor: '#E5E8EB',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: '#3182F6', borderRadius: 2 },
  stepLabel: { fontSize: 13, color: '#8B95A1', fontWeight: '500' },

  body: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 24 },
  question: { fontSize: 24, fontWeight: '700', color: '#111111', lineHeight: 34, marginBottom: 8 },
  sub: { fontSize: 15, color: '#6B7684', lineHeight: 22, marginBottom: 32 },

  options: { gap: 10 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E5E8EB',
    backgroundColor: '#FAFAFA',
  },
  optionSelected: { borderColor: '#3182F6', backgroundColor: '#EEF4FF' },
  optionText: { fontSize: 16, color: '#333D4B' },
  optionTextSelected: { color: '#3182F6', fontWeight: '600' },
  check: { fontSize: 16, color: '#3182F6', fontWeight: '700' },

  customInput: {
    marginTop: 12,
    borderWidth: 1.5,
    borderColor: '#3182F6',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
    fontSize: 16,
    color: '#111111',
    backgroundColor: '#FAFCFF',
  },

  weekRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  weekChip: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: '#E5E8EB',
    backgroundColor: '#FAFAFA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekChipWide: {
    paddingHorizontal: 16,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: '#E5E8EB',
    backgroundColor: '#FAFAFA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: { borderColor: '#3182F6', backgroundColor: '#3182F6' },
  weekChipText: { fontSize: 15, fontWeight: '600', color: '#333D4B' },
  chipTextSelected: { color: '#FFFFFF' },

  footer: {
    paddingHorizontal: 24,
    paddingBottom: 48,
    paddingTop: 12,
    backgroundColor: '#FFFFFF',
  },
  btn: {
    backgroundColor: '#3182F6',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnDisabled: { backgroundColor: '#D1D5DB' },
  btnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
});

const detailStyles = StyleSheet.create({
  categoryLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333D4B',
    marginBottom: 12,
  },
  categoryHint: {
    fontSize: 13,
    color: '#8B95A1',
    marginTop: -8,
    marginBottom: 4,
  },
  subOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#E5E8EB',
    backgroundColor: '#FAFAFA',
  },
  chipOn: { borderColor: '#3182F6', backgroundColor: '#EEF4FF' },
  chipText: { fontSize: 15, color: '#333D4B', fontWeight: '500' },
  chipTextOn: { color: '#3182F6', fontWeight: '700' },
  input: {
    marginTop: 8,
    borderWidth: 1.5,
    borderColor: '#E5E8EB',
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
    fontSize: 15,
    color: '#111111',
    backgroundColor: '#FAFAFA',
  },
});
