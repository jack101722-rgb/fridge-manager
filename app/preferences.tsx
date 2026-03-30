import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../lib/supabase';
import { useFridgeStore } from '../store/fridgeStore';

// ────────────────────────────────────────────
// 옵션 데이터
// ────────────────────────────────────────────

const CUISINE_OPTIONS = ['한식', '양식', '중식', '일식', '동남아', '분식'];

const FOOD_RESTRICTION_OPTIONS = [
  '돼지고기', '소고기', '달걀', '밀가루',
  '해산물', '생선류', '오징어·문어', '조개류', '해조류',
  '갑각류', '새우', '게', '랍스터·가재',
  '유제품', '우유', '치즈', '버터', '요거트',
  '견과류', '땅콩', '아몬드', '호두', '잣', '캐슈넛',
];

const PLATFORM_OPTIONS = ['쿠팡', '마켓컬리', '오아시스', '배민B마트', 'SSG닷컴', '직접장보기'];

const DIET_OPTIONS = [
  { label: '🥗 다이어트 중이에요', value: 'diet' },
  { label: '🥦 건강식을 지향해요', value: 'healthy' },
  { label: '🍽 특별히 없어요', value: 'none' },
];

const DAY_OPTIONS = ['월', '화', '수', '목', '금', '토', '일', '정해지지않음'];

const TIME_OPTIONS = [
  { label: '🌅 오전 (6시~12시)', value: 'morning' },
  { label: '☀️ 오후 (12시~6시)', value: 'afternoon' },
  { label: '🌆 저녁 (6시~10시)', value: 'evening' },
  { label: '🌙 늦은 밤 · 자기 전', value: 'night' },
];

// ────────────────────────────────────────────
// 컴포넌트
// ────────────────────────────────────────────

export default function PreferencesScreen() {
  const user = useFridgeStore((s) => s.user);
  const setUser = useFridgeStore((s) => s.setUser);

  // 현재 유저 데이터로 초기화
  const [householdSize, setHouseholdSize] = useState<number>(user?.household_size ?? 1);
  const [cuisinePrefs, setCuisinePrefs] = useState<string[]>(user?.cuisine_prefs ?? []);
  const [foodRestrictions, setFoodRestrictions] = useState<string[]>(
    (user?.food_restrictions ?? []).filter((v) => FOOD_RESTRICTION_OPTIONS.includes(v))
  );
  const [customFood, setCustomFood] = useState<string>(
    (user?.food_restrictions ?? []).filter((v) => !FOOD_RESTRICTION_OPTIONS.includes(v) && v !== '없음').join(', ')
  );
  const [platforms, setPlatforms] = useState<string[]>(
    (user?.shopping_platforms ?? []).filter((v) => PLATFORM_OPTIONS.includes(v))
  );
  const [customPlatform, setCustomPlatform] = useState<string>(
    (user?.shopping_platforms ?? []).filter((v) => !PLATFORM_OPTIONS.includes(v)).join(', ')
  );
  const [dietMode, setDietMode] = useState<string>(user?.diet_mode ?? 'none');
  const [shoppingDay, setShoppingDay] = useState<string[]>(user?.shopping_day ?? []);
  const [shoppingTime, setShoppingTime] = useState<string>(user?.shopping_time ?? 'morning');
  const [noRestriction, setNoRestriction] = useState<boolean>(
    (user?.food_restrictions ?? []).includes('없음') || (user?.food_restrictions ?? []).length === 0
  );

  const [saving, setSaving] = useState(false);

  // ── 토글 헬퍼 ──

  function toggleMulti(value: string, arr: string[], setArr: (v: string[]) => void) {
    if (arr.includes(value)) setArr(arr.filter((v) => v !== value));
    else setArr([...arr, value]);
  }

  function toggleDay(value: string) {
    if (value === '정해지지않음') {
      setShoppingDay(['정해지지않음']);
      return;
    }
    const filtered = shoppingDay.filter((v) => v !== '정해지지않음');
    if (filtered.includes(value)) setShoppingDay(filtered.filter((v) => v !== value));
    else setShoppingDay([...filtered, value]);
  }

  function toggleFoodRestriction(value: string) {
    setNoRestriction(false);
    toggleMulti(value, foodRestrictions, setFoodRestrictions);
  }

  function toggleNoRestriction() {
    setNoRestriction(true);
    setFoodRestrictions([]);
    setCustomFood('');
  }

  // ── 저장 ──

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    try {
      const resolvedFood = noRestriction
        ? ['없음']
        : [
            ...foodRestrictions,
            ...customFood.split(',').map((s) => s.trim()).filter(Boolean),
          ];

      const resolvedPlatforms = [
        ...platforms,
        ...customPlatform.split(',').map((s) => s.trim()).filter(Boolean),
      ];

      const updates = {
        household_size: householdSize,
        cuisine_prefs: cuisinePrefs,
        food_restrictions: resolvedFood,
        shopping_platforms: resolvedPlatforms,
        diet_mode: dietMode,
        shopping_day: shoppingDay,
        shopping_time: shoppingTime,
      };

      const { error } = await supabase.from('users').update(updates).eq('id', user.id);
      if (error) throw error;

      setUser({ ...user, ...updates });
      router.back();
    } catch {
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

      {/* 헤더 */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>내 정보 수정</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>

        {/* ── 가족 수 ── */}
        <Section title="👨‍👩‍👧 가족 수">
          <View style={styles.pillRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <TouchableOpacity
                key={n}
                style={[styles.pill, householdSize === n && styles.pillOn]}
                onPress={() => setHouseholdSize(n)}
              >
                <Text style={[styles.pillText, householdSize === n && styles.pillTextOn]}>
                  {n === 5 ? '5명+' : `${n}명`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Section>

        {/* ── 선호 요리 ── */}
        <Section title="🍽 선호 요리">
          <View style={styles.chipWrap}>
            {CUISINE_OPTIONS.map((c) => (
              <Chip
                key={c} label={c}
                on={cuisinePrefs.includes(c)}
                onPress={() => toggleMulti(c, cuisinePrefs, setCuisinePrefs)}
              />
            ))}
          </View>
        </Section>

        {/* ── 못 먹는 재료 ── */}
        <Section title="🚫 못 먹는 재료">
          <View style={styles.chipWrap}>
            {FOOD_RESTRICTION_OPTIONS.map((f) => (
              <Chip
                key={f} label={f}
                on={!noRestriction && foodRestrictions.includes(f)}
                onPress={() => toggleFoodRestriction(f)}
              />
            ))}
            <Chip label="없음 ✅" on={noRestriction} onPress={toggleNoRestriction} />
          </View>
          {!noRestriction && (
            <TextInput
              style={styles.textInput}
              placeholder="기타 직접 입력 (쉼표로 구분)"
              placeholderTextColor="#B0B8C1"
              value={customFood}
              onChangeText={setCustomFood}
            />
          )}
        </Section>

        {/* ── 쇼핑 플랫폼 ── */}
        <Section title="🛒 주로 이용하는 쇼핑몰">
          <View style={styles.chipWrap}>
            {PLATFORM_OPTIONS.map((p) => (
              <Chip
                key={p} label={p}
                on={platforms.includes(p)}
                onPress={() => toggleMulti(p, platforms, setPlatforms)}
              />
            ))}
          </View>
          <TextInput
            style={styles.textInput}
            placeholder="기타 직접 입력 (쉼표로 구분)"
            placeholderTextColor="#B0B8C1"
            value={customPlatform}
            onChangeText={setCustomPlatform}
          />
        </Section>

        {/* ── 식단 모드 ── */}
        <Section title="🥗 식단 목표">
          <View style={styles.optionList}>
            {DIET_OPTIONS.map((d) => (
              <TouchableOpacity
                key={d.value}
                style={[styles.optionRow, dietMode === d.value && styles.optionRowOn]}
                onPress={() => setDietMode(d.value)}
              >
                <Text style={[styles.optionText, dietMode === d.value && styles.optionTextOn]}>
                  {d.label}
                </Text>
                {dietMode === d.value && <Text style={styles.optionCheck}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </Section>

        {/* ── 장보는 날 ── */}
        <Section title="📅 장보는 날">
          <View style={styles.dayRow}>
            {DAY_OPTIONS.map((d) => {
              const isSpecial = d === '정해지지않음';
              const on = shoppingDay.includes(d);
              return (
                <TouchableOpacity
                  key={d}
                  style={[isSpecial ? styles.dayChipWide : styles.dayChip, on && styles.dayChipOn]}
                  onPress={() => toggleDay(d)}
                >
                  <Text style={[styles.dayChipText, on && styles.dayChipTextOn, isSpecial && { fontSize: 12 }]}>
                    {d}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Section>

        {/* ── 장보는 시간 ── */}
        <Section title="⏰ 장보는 시간">
          <View style={styles.optionList}>
            {TIME_OPTIONS.map((t) => (
              <TouchableOpacity
                key={t.value}
                style={[styles.optionRow, shoppingTime === t.value && styles.optionRowOn]}
                onPress={() => setShoppingTime(t.value)}
              >
                <Text style={[styles.optionText, shoppingTime === t.value && styles.optionTextOn]}>
                  {t.label}
                </Text>
                {shoppingTime === t.value && <Text style={styles.optionCheck}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </Section>

      </ScrollView>

      {/* 저장 버튼 */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving} activeOpacity={0.85}>
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveBtnText}>저장하기</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ── 서브 컴포넌트 ──

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={sectionStyles.wrap}>
      <Text style={sectionStyles.title}>{title}</Text>
      {children}
    </View>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[chipStyles.chip, on && chipStyles.chipOn]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={[chipStyles.text, on && chipStyles.textOn]}>{label}</Text>
    </TouchableOpacity>
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
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  backText: { fontSize: 28, color: '#111111', lineHeight: 32, width: 32 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: '#111111' },

  body: { paddingHorizontal: 20, paddingBottom: 24 },

  pillRow: { flexDirection: 'row', gap: 8 },
  pill: {
    paddingVertical: 9,
    paddingHorizontal: 18,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#E5E8EB',
    backgroundColor: '#FAFAFA',
  },
  pillOn: { borderColor: '#3182F6', backgroundColor: '#EEF4FF' },
  pillText: { fontSize: 15, color: '#333D4B', fontWeight: '500' },
  pillTextOn: { color: '#3182F6', fontWeight: '700' },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  textInput: {
    marginTop: 10,
    borderWidth: 1.5,
    borderColor: '#E5E8EB',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 14,
    color: '#111111',
    backgroundColor: '#FAFAFA',
  },

  optionList: { gap: 8 },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E5E8EB',
    backgroundColor: '#FAFAFA',
  },
  optionRowOn: { borderColor: '#3182F6', backgroundColor: '#EEF4FF' },
  optionText: { fontSize: 15, color: '#333D4B' },
  optionTextOn: { color: '#3182F6', fontWeight: '600' },
  optionCheck: { fontSize: 15, color: '#3182F6', fontWeight: '700' },

  dayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dayChip: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 1.5, borderColor: '#E5E8EB', backgroundColor: '#FAFAFA',
    alignItems: 'center', justifyContent: 'center',
  },
  dayChipWide: {
    paddingHorizontal: 14, height: 44, borderRadius: 22,
    borderWidth: 1.5, borderColor: '#E5E8EB', backgroundColor: '#FAFAFA',
    alignItems: 'center', justifyContent: 'center',
  },
  dayChipOn: { borderColor: '#3182F6', backgroundColor: '#3182F6' },
  dayChipText: { fontSize: 14, fontWeight: '600', color: '#333D4B' },
  dayChipTextOn: { color: '#FFFFFF' },

  footer: {
    paddingHorizontal: 20,
    paddingBottom: 48,
    paddingTop: 12,
    backgroundColor: '#FFFFFF',
  },
  saveBtn: {
    backgroundColor: '#3182F6',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveBtnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
});

const sectionStyles = StyleSheet.create({
  wrap: { marginBottom: 32 },
  title: { fontSize: 15, fontWeight: '700', color: '#111111', marginBottom: 14 },
});

const chipStyles = StyleSheet.create({
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#E5E8EB',
    backgroundColor: '#FAFAFA',
  },
  chipOn: { borderColor: '#3182F6', backgroundColor: '#EEF4FF' },
  text: { fontSize: 14, color: '#333D4B', fontWeight: '500' },
  textOn: { color: '#3182F6', fontWeight: '700' },
});
