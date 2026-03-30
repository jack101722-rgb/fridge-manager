import { CameraView, useCameraPermissions } from 'expo-camera';
import { scheduleExpiryNotifications } from '../../lib/notifications';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { lookupBarcode } from '../../lib/barcodeApi';
import { inferIngredient } from '../../lib/claudeApi';
import { supabase } from '../../lib/supabase';
import { useFridgeStore } from '../../store/fridgeStore';
import { Ingredient, IngredientInference } from '../../types';

interface Props {
  visible: boolean;
  onClose: () => void;
}

type Step = 'scanning' | 'looking_up' | 'review' | 'not_found';

const STORAGE_OPTIONS: { value: Ingredient['storage_type']; label: string }[] = [
  { value: 'fridge', label: '❄️ 냉장' },
  { value: 'freezer', label: '🧊 냉동' },
  { value: 'room_temp', label: '🌡️ 실온' },
];

const CATEGORY_LABELS: Record<Ingredient['category'], string> = {
  vegetable: '🥦 채소',
  meat: '🥩 육류',
  dairy: '🥛 유제품',
  processed: '🍱 가공식품',
  beverage: '🧃 음료',
  condiment: '🫙 양념',
  other: '📦 기타',
};

const COMMON_UNITS = ['개', '봉지', '팩', 'g', 'kg', 'mL', 'L', '병', '캔'];

export default function BarcodeScanModal({ visible, onClose }: Props) {
  const { fridge, addIngredient } = useFridgeStore();
  const [permission, requestPermission] = useCameraPermissions();

  const [step, setStep] = useState<Step>('scanning');
  const [statusText, setStatusText] = useState('');
  const [scannedBarcode, setScannedBarcode] = useState('');
  const [productName, setProductName] = useState('');
  const [inference, setInference] = useState<IngredientInference | null>(null);
  const [storageType, setStorageType] = useState<Ingredient['storage_type']>('fridge');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('개');
  const [saving, setSaving] = useState(false);

  const scannedRef = useRef(false);

  function reset() {
    scannedRef.current = false;
    setStep('scanning');
    setStatusText('');
    setScannedBarcode('');
    setProductName('');
    setInference(null);
    setStorageType('fridge');
    setQuantity('1');
    setUnit('개');
    setSaving(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleBarcodeScanned({ data }: { data: string }) {
    if (scannedRef.current) return;
    scannedRef.current = true;
    setScannedBarcode(data);
    setStep('looking_up');

    // 1단계: 바코드 DB 조회
    setStatusText('제품 정보 찾는 중...');
    const product = await lookupBarcode(data);

    let name = product?.name ?? '';

    if (!name) {
      // 바코드 번호로 Claude에 추론 요청
      setStatusText('AI로 추론 중...');
      try {
        const result = await inferIngredient(data);
        if (result.is_food && result.confidence > 0.3) {
          name = result.name;
        }
      } catch {
        // ignore
      }
    }

    if (!name) {
      setStep('not_found');
      return;
    }

    // 2단계: Claude로 상세 정보 추론
    setStatusText('AI 분석 중...');
    try {
      const result = await inferIngredient(name);
      setProductName(result.name || name);
      setInference(result);
      setStorageType(result.storage_type);
      setUnit('개');
      setStep('review');
    } catch {
      Alert.alert('분석 실패', 'AI 분석에 실패했어요. 다시 시도해주세요.');
      reset();
    }
  }

  async function handleSave() {
    if (!fridge || !inference) return;
    setSaving(true);
    const today = new Date().toISOString().split('T')[0];
    const newItem: Omit<Ingredient, 'id' | 'created_at' | 'updated_at'> = {
      fridge_id: fridge.id,
      name: productName,
      category: inference.category,
      storage_type: storageType,
      storage_tip: inference.storage_tip,
      quantity: parseFloat(quantity) || 1,
      unit,
      market_price: inference.market_price,
      purchase_date: today,
      ai_expiry_days: inference.ai_expiry_days,
      ai_expiry_note: inference.ai_expiry_note,
      source: 'barcode',
      barcode: scannedBarcode,
      is_consumed: false,
    };

    const { data, error } = await supabase.from('ingredients').insert(newItem).select().single();
    setSaving(false);
    if (error) { Alert.alert('저장 실패', error.message); return; }
    addIngredient(data);
    scheduleExpiryNotifications(data);
    handleClose();
  }

  // 권한 요청
  if (!permission) return null;
  if (!permission.granted) {
    return (
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
        <View style={styles.permissionContainer}>
          <Text style={styles.permissionEmoji}>📷</Text>
          <Text style={styles.permissionTitle}>카메라 권한 필요</Text>
          <Text style={styles.permissionDesc}>바코드 스캔을 위해 카메라 접근이 필요해요</Text>
          <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
            <Text style={styles.permissionBtnText}>권한 허용하기</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelLink} onPress={handleClose}>
            <Text style={styles.cancelLinkText}>취소</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={handleClose}>

      {/* 스캔 화면 */}
      {step === 'scanning' && (
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            onBarcodeScanned={handleBarcodeScanned}
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39'] }}
          >
            <View style={styles.scanOverlay}>
              {/* 상단 */}
              <View style={styles.scanDim} />

              {/* 중간 */}
              <View style={styles.scanMiddleRow}>
                <View style={styles.scanDimSide} />
                <View style={styles.scanWindow}>
                  <View style={[styles.scanCorner, styles.scanCornerTL]} />
                  <View style={[styles.scanCorner, styles.scanCornerTR]} />
                  <View style={[styles.scanCorner, styles.scanCornerBL]} />
                  <View style={[styles.scanCorner, styles.scanCornerBR]} />
                </View>
                <View style={styles.scanDimSide} />
              </View>

              {/* 하단 */}
              <View style={styles.scanDim}>
                <Text style={styles.scanGuide}>바코드를 네모 안에 맞춰주세요</Text>
              </View>
            </View>
          </CameraView>

          {/* 닫기 버튼 */}
          <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 조회 중 */}
      {step === 'looking_up' && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3182F6" />
          <Text style={styles.loadingText}>{statusText}</Text>
          <Text style={styles.loadingBarcode}>{scannedBarcode}</Text>
        </View>
      )}

      {/* 찾을 수 없음 */}
      {step === 'not_found' && (
        <View style={styles.loadingContainer}>
          <Text style={styles.notFoundEmoji}>🔍</Text>
          <Text style={styles.notFoundTitle}>제품을 찾을 수 없어요</Text>
          <Text style={styles.notFoundDesc}>바코드: {scannedBarcode}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={reset}>
            <Text style={styles.retryBtnText}>다시 스캔하기</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelLink} onPress={handleClose}>
            <Text style={styles.cancelLinkText}>닫기</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 리뷰 화면 */}
      {step === 'review' && inference && (
        <>
          {/* 헤더 */}
          <View style={styles.header}>
            <TouchableOpacity onPress={reset}>
              <Text style={styles.cancelBtn}>다시 스캔</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle} numberOfLines={1}>스캔 결과</Text>
            <View style={{ width: 64 }} />
          </View>

          <ScrollView style={{ flex: 1, backgroundColor: '#F9FAFB' }} keyboardShouldPersistTaps="handled">

            {/* 제품 정보 카드 */}
            <View style={styles.productCard}>
              <View style={styles.productRow}>
                <Text style={styles.productName}>{productName}</Text>
                <View style={styles.categoryBadge}>
                  <Text style={styles.categoryBadgeText}>{CATEGORY_LABELS[inference.category]}</Text>
                </View>
              </View>
              {inference.ai_expiry_note && (
                <Text style={styles.aiNote}>📅 {inference.ai_expiry_note}</Text>
              )}
              {inference.storage_tip && (
                <Text style={styles.aiNote}>💡 {inference.storage_tip}</Text>
              )}
            </View>

            {/* 보관 위치 */}
            <View style={styles.section}>
              <Text style={styles.label}>보관 위치</Text>
              <View style={styles.chipRow}>
                {STORAGE_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.chip, storageType === opt.value && styles.chipSelected]}
                    onPress={() => setStorageType(opt.value)}
                  >
                    <Text style={[styles.chipText, storageType === opt.value && styles.chipTextSelected]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* 수량 & 단위 */}
              <Text style={[styles.label, { marginTop: 16 }]}>수량</Text>
              <View style={styles.qtyRow}>
                <TouchableOpacity
                  style={styles.qtyBtn}
                  onPress={() => setQuantity(String(Math.max(1, parseFloat(quantity) - 1)))}
                >
                  <Text style={styles.qtyBtnText}>－</Text>
                </TouchableOpacity>
                <Text style={styles.qtyValue}>{quantity}</Text>
                <TouchableOpacity
                  style={styles.qtyBtn}
                  onPress={() => setQuantity(String(parseFloat(quantity) + 1))}
                >
                  <Text style={styles.qtyBtnText}>＋</Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.label, { marginTop: 16 }]}>단위</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {COMMON_UNITS.map((u) => (
                  <TouchableOpacity
                    key={u}
                    style={[styles.unitChip, unit === u && styles.unitChipSelected]}
                    onPress={() => setUnit(u)}
                  >
                    <Text style={[styles.unitChipText, unit === u && styles.unitChipTextSelected]}>{u}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <View style={{ height: 120 }} />
          </ScrollView>

          {/* 저장 버튼 */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.saveBtnText}>냉장고에 추가하기</Text>
              }
            </TouchableOpacity>
          </View>
        </>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  // 권한
  permissionContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  permissionEmoji: { fontSize: 48, marginBottom: 16 },
  permissionTitle: { fontSize: 20, fontWeight: '700', color: '#191F28', marginBottom: 8 },
  permissionDesc: { fontSize: 14, color: '#8B95A1', textAlign: 'center', marginBottom: 32 },
  permissionBtn: { backgroundColor: '#3182F6', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32 },
  permissionBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  cancelLink: { marginTop: 16 },
  cancelLinkText: { fontSize: 15, color: '#8B95A1' },

  // 스캔 오버레이
  scanOverlay: { flex: 1 },
  scanDim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 20 },
  scanMiddleRow: { flexDirection: 'row', height: 200 },
  scanDimSide: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  scanWindow: { width: 260, borderColor: 'transparent' },
  scanGuide: { color: '#fff', fontSize: 14, opacity: 0.85 },

  // 스캔 코너 마커
  scanCorner: { position: 'absolute', width: 24, height: 24, borderColor: '#fff', borderWidth: 3 },
  scanCornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  scanCornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
  scanCornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
  scanCornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },

  // 닫기
  closeBtn: {
    position: 'absolute', top: 56, right: 20,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  closeBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  // 로딩 / 못찾음
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  loadingText: { fontSize: 16, color: '#191F28', marginTop: 16, fontWeight: '600' },
  loadingBarcode: { fontSize: 13, color: '#8B95A1', marginTop: 6 },
  notFoundEmoji: { fontSize: 48, marginBottom: 16 },
  notFoundTitle: { fontSize: 20, fontWeight: '700', color: '#191F28', marginBottom: 8 },
  notFoundDesc: { fontSize: 13, color: '#8B95A1', marginBottom: 32 },
  retryBtn: { backgroundColor: '#3182F6', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32, marginBottom: 12 },
  retryBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  // 헤더
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: '#F2F4F6',
    backgroundColor: '#fff',
  },
  cancelBtn: { fontSize: 15, color: '#3182F6' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#191F28', flex: 1, textAlign: 'center' },

  // 제품 카드
  productCard: {
    margin: 16, backgroundColor: '#fff',
    borderRadius: 14, padding: 16,
  },
  productRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  productName: { flex: 1, fontSize: 18, fontWeight: '700', color: '#191F28' },
  categoryBadge: { backgroundColor: '#F2F4F6', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  categoryBadgeText: { fontSize: 12, color: '#4E5968' },
  aiNote: { fontSize: 13, color: '#4E5968', lineHeight: 20, marginTop: 2 },

  // 수정 섹션
  section: { marginHorizontal: 16, backgroundColor: '#fff', borderRadius: 14, padding: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#8B95A1', marginBottom: 8 },
  chipRow: { flexDirection: 'row', gap: 8 },
  chip: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#E5E8EB',
    alignItems: 'center', backgroundColor: '#FAFAFA',
  },
  chipSelected: { backgroundColor: '#EBF3FF', borderColor: '#3182F6' },
  chipText: { fontSize: 14, color: '#4E5968', fontWeight: '500' },
  chipTextSelected: { color: '#3182F6', fontWeight: '700' },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  qtyBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#F2F4F6', alignItems: 'center', justifyContent: 'center',
  },
  qtyBtnText: { fontSize: 20, color: '#191F28', lineHeight: 24 },
  qtyValue: { fontSize: 20, fontWeight: '700', color: '#191F28', minWidth: 32, textAlign: 'center' },
  unitChip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16,
    borderWidth: 1, borderColor: '#E5E8EB', marginRight: 6, backgroundColor: '#FAFAFA',
  },
  unitChipSelected: { backgroundColor: '#3182F6', borderColor: '#3182F6' },
  unitChipText: { fontSize: 13, color: '#4E5968' },
  unitChipTextSelected: { color: '#fff', fontWeight: '600' },

  // 저장
  footer: {
    padding: 16, paddingBottom: 32,
    borderTopWidth: 1, borderTopColor: '#F2F4F6',
    backgroundColor: '#fff',
  },
  saveBtn: { backgroundColor: '#3182F6', borderRadius: 12, padding: 16, alignItems: 'center' },
  saveBtnDisabled: { backgroundColor: '#B0C4DE' },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
