import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { scheduleExpiryNotifications } from '../../lib/notifications';
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
import { parseReceiptImage, inferIngredients } from '../../lib/claudeApi';
import { supabase } from '../../lib/supabase';
import { useFridgeStore } from '../../store/fridgeStore';
import { Ingredient, IngredientInference } from '../../types';

interface Props {
  visible: boolean;
  onClose: () => void;
}

type Step = 'capture' | 'parsing' | 'inferring' | 'review';

const STORAGE_OPTIONS: { value: Ingredient['storage_type']; label: string }[] = [
  { value: 'fridge', label: '❄️ 냉장' },
  { value: 'freezer', label: '🧊 냉동' },
  { value: 'room_temp', label: '🌡️ 실온' },
];

const CATEGORY_LABELS: Record<Ingredient['category'], string> = {
  vegetable: '🥦 채소',
  meat: '🥩 육류',
  dairy: '🥛 유제품',
  processed: '🍱 가공',
  beverage: '🧃 음료',
  condiment: '🫙 양념',
  other: '📦 기타',
};

const COMMON_UNITS = ['개', '봉지', '팩', 'g', 'kg', 'mL', 'L', '병', '캔'];

interface ReviewItem {
  selected: boolean;
  original_name: string;
  price: number;
  inference: IngredientInference;
  storage_type: Ingredient['storage_type'];
  quantity: string;
  unit: string;
}

export default function ReceiptScanModal({ visible, onClose }: Props) {
  const { fridge, addIngredient } = useFridgeStore();

  const [step, setStep] = useState<Step>('capture');
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [skippedCount, setSkippedCount] = useState(0);
  const [storeName, setStoreName] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [pickedAssetId, setPickedAssetId] = useState<string | null>(null);

  function reset() {
    setStep('capture');
    setItems([]);
    setSkippedCount(0);
    setStoreName('');
    setPurchaseDate('');
    setSaving(false);
    setPickedAssetId(null);
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
      ? await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.9 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.9 });

    if (result.canceled || !result.assets[0]) return;

    // 갤러리 선택 시 assetId 또는 uri 저장
    if (!fromCamera) {
      setPickedAssetId(result.assets[0].assetId ?? result.assets[0].uri ?? null);
    }

    setStep('parsing');

    try {
      const resized = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 1024 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      if (!resized.base64) throw new Error('이미지 변환에 실패했어요.');

      // 1단계: 영수증 OCR
      const receipt = await parseReceiptImage(resized.base64);

      if (receipt.items.length === 0) {
        Alert.alert('인식 실패', '영수증에서 상품을 찾지 못했어요.\n영수증 전체가 보이도록 다시 찍어보세요.');
        setStep('capture');
        return;
      }

      setStoreName(receipt.store_name || '');
      setPurchaseDate(receipt.purchase_date || new Date().toISOString().split('T')[0]);

      // 2단계: 식재료 AI 추론
      setStep('inferring');

      const inferences = await inferIngredients(
        receipt.items.map((item) => ({ name: item.name }))
      );

      const foodItems: ReviewItem[] = [];
      let skipped = 0;

      receipt.items.forEach((receiptItem, idx) => {
        const inf = inferences[idx];
        if (!inf || inf.is_food === false) {
          skipped++;
          return;
        }
        foodItems.push({
          selected: true,
          original_name: receiptItem.name,
          price: receiptItem.price,
          inference: inf,
          storage_type: inf.storage_type,
          quantity: String(receiptItem.quantity || 1),
          unit: '개',
        });
      });

      if (foodItems.length === 0) {
        Alert.alert(
          '식재료 없음',
          `영수증에서 식재료를 찾지 못했어요.\n비식품 ${skipped}개는 자동으로 제외됐어요.`
        );
        setStep('capture');
        return;
      }

      setSkippedCount(skipped);
      setItems(foodItems);
      setStep('review');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('분석 실패', `분석 중 오류가 발생했어요.\n\n${msg}`);
      setStep('capture');
    }
  }

  function toggleItem(idx: number) {
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, selected: !item.selected } : item)));
  }

  function updateField(idx: number, field: 'quantity' | 'unit', value: string) {
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));
  }

  function updateStorage(idx: number, storage: Ingredient['storage_type']) {
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, storage_type: storage } : item)));
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
    const today = purchaseDate || now.split('T')[0];

    const rows = selected.map((item) => ({
      fridge_id: fridge.id,
      name: item.inference.name,
      original_name: item.original_name,
      category: item.inference.category,
      storage_type: item.storage_type,
      storage_tip: item.inference.storage_tip,
      quantity: parseFloat(item.quantity) || 1,
      unit: item.unit,
      market_price: item.price || item.inference.market_price || null,
      purchase_date: today,
      ai_expiry_days: item.inference.ai_expiry_days,
      ai_expiry_note: item.inference.ai_expiry_note,
      source: 'receipt' as const,
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

    // 갤러리에서 가져온 이미지 삭제 제안
    const assetId = pickedAssetId;
    reset();
    onClose();

    if (assetId) {
      setTimeout(() => {
        Alert.alert(
          '스크린샷 삭제',
          '등록에 사용한 이미지를 갤러리에서 삭제할까요?',
          [
            { text: '유지', style: 'cancel' },
            {
              text: '삭제', style: 'destructive',
              onPress: async () => {
                try {
                  const { status } = await MediaLibrary.requestPermissionsAsync();
                  if (status !== 'granted') return;
                  // assetId가 ph:// 형식이면 직접 사용, URI면 최근 사진에서 검색
                  if (assetId.startsWith('ph://') || /^\d+$/.test(assetId)) {
                    await MediaLibrary.deleteAssetsAsync([assetId]);
                  } else {
                    const { assets } = await MediaLibrary.getAssetsAsync({ mediaType: 'photo', first: 30, sortBy: 'creationTime' });
                    const match = assets.find((a) => a.uri === assetId);
                    if (match) await MediaLibrary.deleteAssetsAsync([match.id]);
                  }
                } catch {
                  // 삭제 실패해도 조용히 무시
                }
              },
            },
          ]
        );
      }, 400);
    }
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
        <Text style={styles.headerTitle}>영수증/주문내역 스캔</Text>
        <View style={{ width: 48 }} />
      </View>

      {/* STEP 1: 촬영 */}
      {step === 'capture' && (
        <View style={styles.captureContainer}>
          {/* 예시 이미지 플레이스홀더 */}
          <View style={styles.exampleImageBox}>
            <View style={styles.exampleImageInner}>
              <Text style={styles.exampleImageEmoji}>🧾</Text>
              <Text style={styles.exampleImageLabel}>영수증 전체가 나오게</Text>
              <Text style={styles.exampleImageSub}>예시 사진</Text>
            </View>
          </View>

          {/* 가이드 */}
          <View style={styles.guide}>
            <Text style={styles.guideTitle}>📋 이런 것도 됩니다</Text>
            <Text style={styles.guideItem}>• 쿠팡·마켓컬리 등 주문내역 캡처 이미지</Text>
            <Text style={styles.guideItem}>• 종이 영수증 사진</Text>
            <Text style={styles.guideItem}>• AI가 식재료만 골라 보관법·유통기한을 분석해요</Text>
          </View>

          <TouchableOpacity style={styles.primaryBtn} onPress={() => handlePickImage(false)}>
            <Text style={styles.primaryBtnText}>🖼️  갤러리에서 가져오기</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => handlePickImage(true)}>
            <Text style={styles.secondaryBtnText}>📷  카메라로 직접 찍기</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* STEP 2: 영수증 파싱 중 */}
      {step === 'parsing' && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3182F6" />
          <Text style={styles.loadingText}>영수증 읽는 중...</Text>
          <Text style={styles.loadingSubText}>상품 목록을 인식하고 있어요{'\n'}잠시만 기다려주세요</Text>
        </View>
      )}

      {/* STEP 3: 식재료 추론 중 */}
      {step === 'inferring' && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3182F6" />
          <Text style={styles.loadingText}>식재료 분석 중...</Text>
          <Text style={styles.loadingSubText}>카테고리·보관법·유통기한을{'\n'}한 번에 알아보고 있어요</Text>
        </View>
      )}

      {/* STEP 4: 검토 */}
      {step === 'review' && (
        <>
          {/* 매장/날짜 배너 */}
          {(storeName || purchaseDate) && (
            <View style={styles.receiptBanner}>
              <Text style={styles.receiptBannerText}>
                {storeName ? `🏪 ${storeName}` : ''}
                {storeName && purchaseDate ? '  ·  ' : ''}
                {purchaseDate ? `📅 ${purchaseDate}` : ''}
              </Text>
            </View>
          )}

          {/* 비식품 제외 안내 */}
          {skippedCount > 0 && (
            <View style={styles.skippedBanner}>
              <Text style={styles.skippedBannerText}>
                비식품 {skippedCount}개는 자동으로 제외됐어요
              </Text>
            </View>
          )}

          {/* 선택 헤더 */}
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
                {/* 상단: 체크 + 이름 + 뱃지 */}
                <TouchableOpacity style={styles.cardTopRow} onPress={() => toggleItem(idx)} activeOpacity={0.7}>
                  <View style={[styles.checkbox, item.selected && styles.checkboxSelected]}>
                    {item.selected && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.itemName, !item.selected && styles.textDimmed]}>
                      {item.inference.name}
                    </Text>
                    {item.original_name !== item.inference.name && (
                      <Text style={styles.originalName}>{item.original_name}</Text>
                    )}
                  </View>
                  <View style={styles.badgeRow}>
                    <Text style={styles.categoryBadge}>
                      {CATEGORY_LABELS[item.inference.category as Ingredient['category']] ?? item.inference.category}
                    </Text>
                    {item.price > 0 && (
                      <Text style={styles.priceBadge}>{item.price.toLocaleString()}원</Text>
                    )}
                  </View>
                </TouchableOpacity>

                {item.selected && (
                  <>
                    {/* AI 정보 */}
                    <Text style={styles.itemMeta}>
                      📅 {item.inference.ai_expiry_note || `권장 소비 ${item.inference.ai_expiry_days}일`}
                      {item.inference.storage_tip ? `  ·  💡 ${item.inference.storage_tip}` : ''}
                    </Text>

                    {/* 보관 위치 */}
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

                    {/* 수량 + 단위 */}
                    <View style={styles.qtyRow}>
                      <View style={styles.qtyWrap}>
                        <Text style={styles.inputLabel}>수량</Text>
                        <TextInput
                          style={styles.qtyInput}
                          keyboardType="decimal-pad"
                          value={item.quantity}
                          onChangeText={(v) => updateField(idx, 'quantity', v)}
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
                              onPress={() => updateField(idx, 'unit', u)}
                            >
                              <Text style={[styles.unitChipText, item.unit === u && styles.unitChipTextSelected]}>
                                {u}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
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
                <Text style={styles.primaryBtnText}>{selectedCount}개 냉장고에 추가하기</Text>
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
  captureContainer: { flex: 1, padding: 20 },
  exampleImageBox: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    backgroundColor: '#FFF8EC',
    borderWidth: 1.5,
    borderColor: '#F5D88A',
    borderStyle: 'dashed',
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exampleImageInner: { alignItems: 'center' },
  exampleImageEmoji: { fontSize: 48, marginBottom: 8 },
  exampleImageLabel: { fontSize: 14, fontWeight: '600', color: '#B45309', marginBottom: 4 },
  exampleImageSub: { fontSize: 11, color: '#8B95A1' },
  guide: {
    backgroundColor: '#FFFBF0',
    borderRadius: 10,
    padding: 14,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  guideTitle: { fontSize: 13, fontWeight: '700', color: '#B45309', marginBottom: 8 },
  guideItem: { fontSize: 13, color: '#4E5968', lineHeight: 22 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  loadingText: { fontSize: 18, fontWeight: '600', color: '#191F28', marginTop: 24, marginBottom: 8 },
  loadingSubText: { fontSize: 14, color: '#8B95A1', textAlign: 'center', lineHeight: 22 },
  receiptBanner: {
    backgroundColor: '#F8FBFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E8EB',
  },
  receiptBannerText: { fontSize: 13, color: '#4E5968', fontWeight: '500' },
  skippedBanner: {
    backgroundColor: '#FFF7ED',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#FDE68A',
  },
  skippedBannerText: { fontSize: 12, color: '#B45309' },
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
  cardTopRow: { flexDirection: 'row', alignItems: 'flex-start' },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginTop: 2,
    flexShrink: 0,
  },
  checkboxSelected: { backgroundColor: '#3182F6', borderColor: '#3182F6' },
  checkmark: { color: '#fff', fontSize: 13, fontWeight: '700' },
  itemName: { fontSize: 15, fontWeight: '600', color: '#191F28' },
  originalName: { fontSize: 11, color: '#B0B8C1', marginTop: 2 },
  textDimmed: { color: '#B0B8C1' },
  badgeRow: { flexDirection: 'column', alignItems: 'flex-end', gap: 4, marginLeft: 8 },
  categoryBadge: {
    fontSize: 11,
    color: '#4E5968',
    backgroundColor: '#F2F4F6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  priceBadge: {
    fontSize: 11,
    color: '#3182F6',
    backgroundColor: '#EBF3FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontWeight: '600',
  },
  itemMeta: { fontSize: 12, color: '#8B95A1', marginTop: 10, marginBottom: 10, lineHeight: 18 },
  storageRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
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
  qtyRow: { flexDirection: 'row', gap: 12 },
  qtyWrap: { width: 80 },
  unitWrap: { flex: 1 },
  inputLabel: { fontSize: 12, fontWeight: '600', color: '#8B95A1', marginBottom: 6 },
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
