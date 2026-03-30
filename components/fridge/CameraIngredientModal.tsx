import * as ImageManipulator from 'expo-image-manipulator';
import { scheduleExpiryNotifications } from '../../lib/notifications';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { analyzeIngredientImageFull, FullDetectedIngredient } from '../../lib/claudeApi';
import { supabase } from '../../lib/supabase';
import { useFridgeStore } from '../../store/fridgeStore';
import { Ingredient } from '../../types';

interface Props {
  visible: boolean;
  onClose: () => void;
}

type Step = 'capture' | 'analyzing' | 'review';

const STORAGE_OPTIONS: { value: Ingredient['storage_type']; label: string }[] = [
  { value: 'fridge', label: '❄️ 냉장' },
  { value: 'freezer', label: '🧊 냉동' },
  { value: 'room_temp', label: '🌡️ 실온' },
];


interface ReviewItem extends FullDetectedIngredient {
  selected: boolean;
  quantity: string;
}

export default function CameraIngredientModal({ visible, onClose }: Props) {
  const { fridge, addIngredient } = useFridgeStore();

  const [step, setStep] = useState<Step>('capture');
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [saving, setSaving] = useState(false);

  function reset() {
    setStep('capture');
    setItems([]);
    setSaving(false);
  }

  async function handlePickImage(fromCamera: boolean) {
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert('권한 필요', fromCamera ? '카메라 권한이 필요해요.' : '사진 라이브러리 권한이 필요해요.');
      return;
    }

    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.8 });

    if (result.canceled || !result.assets[0]) return;

    setStep('analyzing');

    try {
      const resized = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 1024 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      if (!resized.base64) throw new Error('이미지 변환에 실패했어요.');

      const detected = await analyzeIngredientImageFull(resized.base64);

      if (detected.length === 0) {
        Alert.alert('인식 실패', '사진에서 식재료를 찾지 못했어요.\n냉장고 안쪽 전체가 보이도록 다시 찍어보세요.');
        setStep('capture');
        return;
      }

      setItems(
        detected.map((item) => ({
          ...item,
          selected: true,
          quantity: String(item.estimated_quantity),
        }))
      );
      setStep('review');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('분석 실패', `AI 분석 중 오류가 발생했어요.\n\n${msg}`);
      setStep('capture');
    }
  }

  function toggleItem(idx: number) {
    setItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, selected: !item.selected } : item))
    );
  }

  function updateQuantity(idx: number, value: string) {
    setItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, quantity: value } : item))
    );
  }

  function updateStorage(idx: number, storage: Ingredient['storage_type']) {
    setItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, storage_type: storage } : item))
    );
  }

  async function handleSave() {
    if (!fridge) return;
    const selected = items.filter((i) => i.selected);
    if (selected.length === 0) {
      Alert.alert('선택된 재료 없음', '저장할 재료를 하나 이상 선택해주세요.');
      return;
    }

    setSaving(true);
    const now = new Date().toISOString();
    const today = now.split('T')[0];

    const rows = selected.map((item) => ({
      fridge_id: fridge.id,
      name: item.name,
      category: item.category,
      storage_type: item.storage_type,
      storage_tip: item.storage_tip,
      quantity: parseFloat(item.quantity) || 1,
      unit: item.unit,
      market_price: item.market_price,
      purchase_date: today,
      ai_expiry_days: item.ai_expiry_days,
      ai_expiry_note: item.ai_expiry_note,
      source: 'camera' as const,
      is_consumed: false,
      created_at: now,
      updated_at: now,
    }));

    const { data, error } = await supabase.from('ingredients').insert(rows).select();
    setSaving(false);

    if (error) {
      Alert.alert('저장 실패', error.message);
      return;
    }

    (data as Ingredient[]).forEach((item) => {
      addIngredient(item);
      scheduleExpiryNotifications(item);
    });
    reset();
    onClose();
  }

  const selectedCount = items.filter((i) => i.selected).length;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => { reset(); onClose(); }}
    >
      {/* 헤더 */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => {
          if (step === 'review') { setStep('capture'); setItems([]); }
          else { reset(); onClose(); }
        }}>
          <Text style={styles.headerBack}>{step === 'review' ? '← 다시' : '취소'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>냉장고 카메라</Text>
        <View style={{ width: 48 }} />
      </View>

      {/* STEP 1: 촬영 가이드 */}
      {step === 'capture' && (
        <View style={styles.captureContainer}>
          {/* 예시 이미지 플레이스홀더 */}
          <View style={styles.exampleImageBox}>
            <View style={styles.exampleImageInner}>
              <Text style={styles.exampleImageEmoji}>🧊</Text>
              <Text style={styles.exampleImageLabel}>냉장고 전체가 나오게</Text>
              <Text style={styles.exampleImageSub}>예시 사진</Text>
            </View>
          </View>

          {/* 가이드 카드 */}
          <View style={styles.guide}>
            <Text style={styles.guideTitle}>📸 이렇게 찍어주세요</Text>
            <Text style={styles.guideItem}>• 냉장고 안쪽 전체가 보이게 찍어주세요</Text>
            <Text style={styles.guideItem}>• 재료를 앞쪽으로 꺼내놓으면 더 잘 인식돼요</Text>
            <Text style={styles.guideItem}>• 밝은 곳에서 찍으면 인식률이 올라가요</Text>
            <Text style={styles.guideItem}>• AI가 카테고리·보관법·유통기한을 자동 분석해요</Text>
          </View>

          <TouchableOpacity style={styles.primaryBtn} onPress={() => handlePickImage(true)}>
            <Text style={styles.primaryBtnText}>📷  카메라로 찍기</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => handlePickImage(false)}>
            <Text style={styles.secondaryBtnText}>🖼️  갤러리에서 선택</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* STEP 2: 분석 중 */}
      {step === 'analyzing' && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3182F6" />
          <Text style={styles.loadingText}>사진 분석 중...</Text>
          <Text style={styles.loadingSubText}>
            식재료를 인식하고 보관정보를 정리하고 있어요{'\n'}잠시만 기다려주세요
          </Text>
        </View>
      )}

      {/* STEP 3: 결과 검토 */}
      {step === 'review' && (
        <>
          <View style={styles.reviewHeader}>
            <Text style={styles.reviewTitle}>
              {items.length}개 발견 · {selectedCount}개 선택됨
            </Text>
            <TouchableOpacity
              onPress={() => setItems((prev) => prev.map((i) => ({ ...i, selected: !i.selected })))}
            >
              <Text style={styles.selectAllText}>
                {selectedCount === items.length ? '전체 해제' : '전체 선택'}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
            {items.map((item, idx) => (
              <View
                key={idx}
                style={[styles.reviewCard, !item.selected && styles.reviewCardUnselected]}
              >
                {/* 상단: 체크 + 이름 + 수량 */}
                <TouchableOpacity style={styles.cardTopRow} onPress={() => toggleItem(idx)} activeOpacity={0.7}>
                  <View style={[styles.checkbox, item.selected && styles.checkboxSelected]}>
                    {item.selected && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={[styles.itemName, !item.selected && styles.textDimmed]}>{item.name}</Text>
                  <View style={styles.qtyContainer}>
                    <TextInput
                      style={[styles.qtyInput, !item.selected && styles.qtyInputDimmed]}
                      value={item.quantity}
                      onChangeText={(v) => updateQuantity(idx, v)}
                      keyboardType="decimal-pad"
                      editable={item.selected}
                    />
                    <Text style={styles.qtyUnit}>{item.unit}</Text>
                  </View>
                </TouchableOpacity>

                {/* AI 정보 */}
                {item.selected && (
                  <>
                    <Text style={styles.itemMeta}>
                      📅 {item.ai_expiry_note || `권장 소비 ${item.ai_expiry_days}일`}
                      {item.storage_tip ? `  ·  💡 ${item.storage_tip}` : ''}
                    </Text>

                    {/* 보관 위치 선택 */}
                    <View style={styles.storageRow}>
                      {STORAGE_OPTIONS.map((opt) => (
                        <TouchableOpacity
                          key={opt.value}
                          style={[styles.storageChip, item.storage_type === opt.value && styles.storageChipSelected]}
                          onPress={() => updateStorage(idx, opt.value)}
                        >
                          <Text style={[styles.storageChipText, item.storage_type === opt.value && styles.storageChipTextSelected]}>
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}
              </View>
            ))}
            <View style={{ height: 120 }} />
          </ScrollView>

          {/* 저장 버튼 */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.primaryBtn, (saving || selectedCount === 0) && styles.primaryBtnDisabled]}
              onPress={handleSave}
              disabled={saving || selectedCount === 0}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>
                  {selectedCount}개 냉장고에 추가하기
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </>
      )}
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
  captureContainer: {
    flex: 1,
    padding: 20,
  },
  exampleImageBox: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#E8F0FE',
    borderWidth: 1.5,
    borderColor: '#B8D0F8',
    borderStyle: 'dashed',
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exampleImageInner: {
    alignItems: 'center',
  },
  exampleImageEmoji: { fontSize: 48, marginBottom: 8 },
  exampleImageLabel: { fontSize: 14, fontWeight: '600', color: '#3182F6', marginBottom: 4 },
  exampleImageSub: { fontSize: 11, color: '#8B95A1' },
  guide: {
    backgroundColor: '#F0F6FF',
    borderRadius: 10,
    padding: 14,
    marginBottom: 24,
  },
  guideTitle: { fontSize: 13, fontWeight: '700', color: '#3182F6', marginBottom: 8 },
  guideItem: { fontSize: 13, color: '#4E5968', lineHeight: 22 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  loadingText: { fontSize: 18, fontWeight: '600', color: '#191F28', marginTop: 24, marginBottom: 8 },
  loadingSubText: { fontSize: 14, color: '#8B95A1', textAlign: 'center', lineHeight: 22 },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#F8FBFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E8EB',
  },
  reviewTitle: { fontSize: 14, fontWeight: '600', color: '#4E5968' },
  selectAllText: { fontSize: 14, color: '#3182F6', fontWeight: '500' },
  reviewCard: {
    marginHorizontal: 16,
    marginTop: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E8EB',
  },
  reviewCardUnselected: { backgroundColor: '#FAFAFA', borderColor: '#F2F4F6' },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  checkboxSelected: { backgroundColor: '#3182F6', borderColor: '#3182F6' },
  checkmark: { color: '#fff', fontSize: 13, fontWeight: '700' },
  itemName: { fontSize: 15, fontWeight: '600', color: '#191F28', flex: 1 },
  textDimmed: { color: '#B0B8C1' },
  qtyContainer: { flexDirection: 'row', alignItems: 'center', marginLeft: 8 },
  qtyInput: {
    width: 44,
    borderWidth: 1,
    borderColor: '#E5E8EB',
    borderRadius: 6,
    padding: 6,
    textAlign: 'center',
    fontSize: 14,
    color: '#191F28',
  },
  qtyInputDimmed: { color: '#B0B8C1', borderColor: '#F2F4F6' },
  qtyUnit: { fontSize: 12, color: '#8B95A1', marginLeft: 4 },
  itemMeta: { fontSize: 12, color: '#8B95A1', marginTop: 8, marginBottom: 10, lineHeight: 18 },
  storageRow: { flexDirection: 'row', gap: 6 },
  storageChip: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#E5E8EB',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
  },
  storageChipSelected: { backgroundColor: '#EBF3FF', borderColor: '#3182F6' },
  storageChipText: { fontSize: 12, color: '#4E5968', fontWeight: '500' },
  storageChipTextSelected: { color: '#3182F6', fontWeight: '700' },
  footer: {
    padding: 16,
    paddingBottom: 32,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F2F4F6',
  },
  primaryBtn: {
    backgroundColor: '#3182F6',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  primaryBtnDisabled: { backgroundColor: '#B0C4DE' },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: '#3182F6',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  secondaryBtnText: { fontSize: 16, fontWeight: '600', color: '#3182F6' },
});
