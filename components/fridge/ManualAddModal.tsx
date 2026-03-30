import { useRef, useState } from 'react';
import { scheduleExpiryNotifications } from '../../lib/notifications';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { inferIngredients } from '../../lib/claudeApi';
import { checkAndMergeSimilar } from '../../lib/ingredientUtils';
import { supabase } from '../../lib/supabase';
import { useFridgeStore } from '../../store/fridgeStore';
import { Ingredient, IngredientInference } from '../../types';
import { useCustomAlert } from '../common/CustomAlert';

interface Props {
  visible: boolean;
  onClose: () => void;
}

type Step = 'input' | 'loading' | 'review';

const CATEGORY_LABELS: Record<Ingredient['category'], string> = {
  vegetable: '🥦 채소',
  meat: '🥩 육류/수산',
  dairy: '🥛 유제품',
  processed: '🍱 가공식품',
  beverage: '🧃 음료',
  condiment: '🫙 양념/소스',
  other: '📦 기타',
};

const STORAGE_OPTIONS: { value: Ingredient['storage_type']; label: string }[] = [
  { value: 'fridge', label: '❄️ 냉장' },
  { value: 'freezer', label: '🧊 냉동' },
  { value: 'room_temp', label: '🌡️ 실온' },
];

const CONTAINER_OPTIONS = ['밀폐용기', '지퍼백·봉투', '랩으로 감싸기', '원래 포장째', '그냥 보관'];

const COMMON_UNITS = ['개', '봉지', '팩', 'g', 'kg', 'mL', 'L', '병', '캔', '줄기', '묶음'];

interface ReviewItem {
  inference: IngredientInference;
  storage_type: Ingredient['storage_type'];
  quantity: string;
  unit: string;
  expiryDate: string;
}

export default function ManualAddModal({ visible, onClose }: Props) {
  const { fridge, addIngredient, ingredients, updateIngredient } = useFridgeStore();
  const { showAlert, alertElement } = useCustomAlert();

  const [step, setStep] = useState<Step>('input');
  const [names, setNames] = useState<string[]>(['']);
  const [containerTypes, setContainerTypes] = useState<string[]>(['그냥 보관']);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [saving, setSaving] = useState(false);

  const inputRefs = useRef<(TextInput | null)[]>([]);

  function reset() {
    setStep('input');
    setNames(['']);
    setContainerTypes(['그냥 보관']);
    setReviewItems([]);
    setSaving(false);
  }

  function addRow() {
    setNames((prev) => [...prev, '']);
    setContainerTypes((prev) => [...prev, '그냥 보관']);
    setTimeout(() => {
      inputRefs.current[names.length]?.focus();
    }, 100);
  }

  function updateName(idx: number, value: string) {
    setNames((prev) => prev.map((n, i) => (i === idx ? value : n)));
  }

  function updateContainerType(idx: number, value: string) {
    setContainerTypes((prev) => prev.map((c, i) => (i === idx ? value : c)));
  }

  function removeName(idx: number) {
    if (names.length === 1) {
      setNames(['']);
      setContainerTypes(['그냥 보관']);
      return;
    }
    setNames((prev) => prev.filter((_, i) => i !== idx));
    setContainerTypes((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleAnalyze() {
    const validItems = names
      .map((n, i) => ({ name: n.trim(), container: containerTypes[i] }))
      .filter((item) => item.name.length > 0);
    if (validItems.length === 0) return;

    setStep('loading');
    try {
      const results = await inferIngredients(validItems);
      setReviewItems(
        results.map((inf) => ({
          inference: inf,
          storage_type: inf.storage_type,
          quantity: '1',
          unit: '개',
          expiryDate: '',
        }))
      );
      setStep('review');
    } catch (e) {
      setStep('input');
      showAlert('분석 실패', 'AI 분석 중 오류가 발생했어요. 다시 시도해주세요.');
    }
  }

  function updateReview(idx: number, field: keyof Omit<ReviewItem, 'inference' | 'storage_type'>, value: string) {
    setReviewItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item))
    );
  }

  function updateReviewStorage(idx: number, storage: Ingredient['storage_type']) {
    setReviewItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, storage_type: storage } : item))
    );
  }

  function removeReviewItem(idx: number) {
    setReviewItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    if (!fridge || reviewItems.length === 0) return;
    setSaving(true);

    const now = new Date().toISOString();
    const today = now.split('T')[0];
    const rowsToInsert: object[] = [];

    for (const item of reviewItems) {
      const qty = parseFloat(item.quantity) || 1;
      const merged = await checkAndMergeSimilar(
        item.inference.name,
        qty,
        useFridgeStore.getState().ingredients,
        (updated) => useFridgeStore.getState().updateIngredient(updated.id, updated),
        (title, message, onConfirm, onCancel) =>
          showAlert(title, message, [
            { text: '따로 저장', style: 'cancel', onPress: onCancel },
            { text: '수량 합산', onPress: onConfirm },
          ]),
      );
      if (!merged) {
        rowsToInsert.push({
          fridge_id: fridge.id,
          name: item.inference.name,
          category: item.inference.category,
          storage_type: item.storage_type,
          storage_tip: item.inference.storage_tip,
          quantity: qty,
          unit: item.unit,
          market_price: item.inference.market_price,
          purchase_date: today,
          expiry_date: item.expiryDate || null,
          ai_expiry_days: item.inference.ai_expiry_days,
          ai_expiry_note: item.inference.ai_expiry_note,
          source: 'manual' as const,
          is_consumed: false,
          created_at: now,
          updated_at: now,
        });
      }
    }

    if (rowsToInsert.length > 0) {
      const { data, error } = await supabase.from('ingredients').insert(rowsToInsert).select();
      if (error) {
        setSaving(false);
        Alert.alert('저장 실패', error.message);
        return;
      }
      (data as Ingredient[]).forEach((ing) => {
        addIngredient(ing);
        scheduleExpiryNotifications(ing);
      });
    }

    setSaving(false);
    reset();
    onClose();
  }

  const validCount = names.filter((n) => n.trim()).length;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => { reset(); onClose(); }}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* 헤더 */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => {
              if (step === 'review') setStep('input');
              else { reset(); onClose(); }
            }}
          >
            <Text style={styles.headerBack}>{step === 'review' ? '← 다시' : '취소'}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>직접 입력</Text>
          <View style={{ width: 48 }} />
        </View>

        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">

          {/* ─── STEP 1: 재료명 입력 ─── */}
          {step === 'input' && (
            <View style={styles.section}>
              {/* 입력 가이드 */}
              <View style={styles.guide}>
                <Text style={styles.guideTitle}>💡 이렇게 입력해주세요</Text>
                <Text style={styles.guideItem}>• 재료명만 입력하면 AI가 보관법·유통기한을 자동으로 채워줘요</Text>
                <Text style={styles.guideItem}>• 예시: 당근, 계란 10개, 우유, 삼겹살 500g</Text>
                <Text style={styles.guideItem}>• 여러 재료를 한 번에 분석할 수 있어요</Text>
              </View>

              {names.map((name, idx) => (
                <View key={idx} style={styles.nameBlock}>
                  <View style={styles.nameRow}>
                    <TextInput
                      ref={(r) => { inputRefs.current[idx] = r; }}
                      style={styles.nameInput}
                      placeholder={`재료 ${idx + 1} (예: 당근)`}
                      value={name}
                      onChangeText={(v) => updateName(idx, v)}
                      returnKeyType="next"
                      onSubmitEditing={addRow}
                      autoFocus={idx === 0}
                    />
                    <TouchableOpacity style={styles.removeBtn} onPress={() => removeName(idx)}>
                      <Text style={styles.removeBtnText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.containerRow}>
                    {CONTAINER_OPTIONS.map((opt) => (
                      <TouchableOpacity
                        key={opt}
                        style={[styles.containerChip, containerTypes[idx] === opt && styles.containerChipSelected]}
                        onPress={() => updateContainerType(idx, opt)}
                      >
                        <Text style={[styles.containerChipText, containerTypes[idx] === opt && styles.containerChipTextSelected]}>
                          {opt}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ))}

              <TouchableOpacity style={styles.addRowBtn} onPress={addRow}>
                <Text style={styles.addRowBtnText}>+ 재료 추가</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.primaryBtn, validCount === 0 && styles.primaryBtnDisabled]}
                onPress={handleAnalyze}
                disabled={validCount === 0}
              >
                <Text style={styles.primaryBtnText}>
                  {validCount > 0 ? `AI로 ${validCount}개 분석하기` : 'AI로 분석하기'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ─── STEP 2: 분석 중 ─── */}
          {step === 'loading' && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#3182F6" />
              <Text style={styles.loadingText}>
                {validCount}개 재료 분석 중...
              </Text>
              <Text style={styles.loadingSubText}>
                카테고리·보관방법·유통기한을 한 번에 알아보고 있어요
              </Text>
            </View>
          )}

          {/* ─── STEP 3: 결과 검토 ─── */}
          {step === 'review' && reviewItems.map((item, idx) => (
            <View key={idx} style={styles.reviewCard}>
              {/* 카드 헤더 */}
              <View style={styles.reviewCardHeader}>
                <Text style={styles.reviewCardName}>{item.inference.name}</Text>
                <Text style={styles.badge}>
                  {CATEGORY_LABELS[item.inference.category] ?? item.inference.category}
                </Text>
                <TouchableOpacity onPress={() => removeReviewItem(idx)}>
                  <Text style={styles.removeCardBtn}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* AI 분석 요약 */}
              <Text style={styles.expiryText}>
                📅 {item.inference.ai_expiry_note || `${item.inference.ai_expiry_days}일 이내`}
              </Text>
              {item.inference.storage_tip ? (
                <Text style={styles.storageTip}>💡 {item.inference.storage_tip}</Text>
              ) : null}

              {/* 보관 위치 선택 */}
              <Text style={styles.inputLabel}>보관 위치</Text>
              <View style={styles.storageRow}>
                {STORAGE_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.storageChip, item.storage_type === opt.value && styles.storageChipSelected]}
                    onPress={() => updateReviewStorage(idx, opt.value)}
                  >
                    <Text style={[styles.storageChipText, item.storage_type === opt.value && styles.storageChipTextSelected]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* 수량 + 단위 */}
              <View style={styles.inputRow}>
                <View style={styles.qtyWrap}>
                  <Text style={styles.inputLabel}>수량</Text>
                  <TextInput
                    style={styles.qtyInput}
                    keyboardType="decimal-pad"
                    value={item.quantity}
                    onChangeText={(v) => updateReview(idx, 'quantity', v)}
                    placeholder="1"
                    selectTextOnFocus
                  />
                </View>
                <View style={styles.unitWrap}>
                  <Text style={styles.inputLabel}>단위</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {COMMON_UNITS.map((u) => (
                      <TouchableOpacity
                        key={u}
                        style={[styles.unitChip, item.unit === u && styles.unitChipSelected]}
                        onPress={() => updateReview(idx, 'unit', u)}
                      >
                        <Text style={[styles.unitChipText, item.unit === u && styles.unitChipTextSelected]}>
                          {u}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              </View>

              {/* 유통기한 */}
              <View style={{ marginTop: 8 }}>
                <Text style={styles.inputLabel}>
                  유통기한 <Text style={styles.optional}>(선택 · YYYY-MM-DD)</Text>
                </Text>
                <TextInput
                  style={styles.expiryInput}
                  placeholder="예: 2026-06-01"
                  value={item.expiryDate}
                  onChangeText={(v) => updateReview(idx, 'expiryDate', v)}
                  keyboardType="numbers-and-punctuation"
                />
              </View>
            </View>
          ))}

          <View style={{ height: 120 }} />
        </ScrollView>

        {/* 저장 버튼 */}
        {step === 'review' && (
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.primaryBtn, (saving || reviewItems.length === 0) && styles.primaryBtnDisabled]}
              onPress={handleSave}
              disabled={saving || reviewItems.length === 0}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>
                  {reviewItems.length}개 냉장고에 추가하기
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
      {alertElement}
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F4F6',
  },
  headerBack: { fontSize: 15, color: '#3182F6', width: 48 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#191F28' },
  section: { padding: 20 },
  guide: {
    backgroundColor: '#F0F6FF',
    borderRadius: 10,
    padding: 14,
    marginBottom: 20,
  },
  guideTitle: { fontSize: 13, fontWeight: '700', color: '#3182F6', marginBottom: 8 },
  guideItem: { fontSize: 13, color: '#4E5968', lineHeight: 22 },
  nameBlock: {
    marginBottom: 14,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  containerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingLeft: 2,
  },
  containerChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FAFAFA',
  },
  containerChipSelected: {
    backgroundColor: '#EBF3FF',
    borderColor: '#3182F6',
  },
  containerChipText: {
    fontSize: 12,
    color: '#6B7280',
  },
  containerChipTextSelected: {
    color: '#3182F6',
    fontWeight: '600',
  },
  nameInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E5E8EB',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: '#191F28',
    backgroundColor: '#FAFAFA',
  },
  removeBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  removeBtnText: { fontSize: 16, color: '#B0B8C1' },
  addRowBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D6E4FF',
    borderRadius: 10,
    borderStyle: 'dashed',
    marginBottom: 20,
  },
  addRowBtnText: { fontSize: 15, color: '#3182F6', fontWeight: '500' },
  loadingContainer: { alignItems: 'center', paddingVertical: 80, paddingHorizontal: 40 },
  loadingText: { fontSize: 17, fontWeight: '600', color: '#191F28', marginTop: 20, marginBottom: 8 },
  loadingSubText: { fontSize: 14, color: '#8B95A1', textAlign: 'center', lineHeight: 22 },
  reviewCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E8EB',
  },
  reviewCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  reviewCardName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#191F28',
    flex: 1,
  },
  badge: {
    fontSize: 11,
    color: '#4E5968',
    backgroundColor: '#F2F4F6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 8,
  },
  removeCardBtn: { fontSize: 16, color: '#B0B8C1', padding: 2 },
  expiryText: { fontSize: 13, color: '#3182F6', fontWeight: '500', marginBottom: 2 },
  storageTip: { fontSize: 12, color: '#8B95A1', marginBottom: 12 },
  storageRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  storageChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#E5E8EB',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
  },
  storageChipSelected: { backgroundColor: '#EBF3FF', borderColor: '#3182F6' },
  storageChipText: { fontSize: 12, color: '#4E5968', fontWeight: '500' },
  storageChipTextSelected: { color: '#3182F6', fontWeight: '700' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 4, gap: 12 },
  qtyWrap: { width: 80 },
  unitWrap: { flex: 1 },
  inputLabel: { fontSize: 12, fontWeight: '600', color: '#8B95A1', marginBottom: 6 },
  optional: { fontWeight: '400', color: '#B0B8C1' },
  qtyInput: {
    borderWidth: 1,
    borderColor: '#E5E8EB',
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    color: '#191F28',
    textAlign: 'center',
    backgroundColor: '#FAFAFA',
  },
  unitChip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E8EB',
    marginRight: 6,
    backgroundColor: '#FAFAFA',
  },
  unitChipSelected: { backgroundColor: '#3182F6', borderColor: '#3182F6' },
  unitChipText: { fontSize: 13, color: '#4E5968' },
  unitChipTextSelected: { color: '#FFFFFF', fontWeight: '600' },
  expiryInput: {
    borderWidth: 1,
    borderColor: '#E5E8EB',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: '#191F28',
    backgroundColor: '#FAFAFA',
  },
  footer: {
    padding: 16,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderTopColor: '#F2F4F6',
    backgroundColor: '#FFFFFF',
  },
  primaryBtn: {
    backgroundColor: '#3182F6',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  primaryBtnDisabled: { backgroundColor: '#B0C4DE' },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
});
