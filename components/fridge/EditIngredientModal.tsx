import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCustomAlert } from '../common/CustomAlert';
import { supabase } from '../../lib/supabase';
import { cancelIngredientNotifications } from '../../lib/notifications';
import { useFridgeStore } from '../../store/fridgeStore';
import { Ingredient } from '../../types';

interface Props {
  item: Ingredient | null;
  onClose: () => void;
  onConsumed: (item: Ingredient, type: 'eaten' | 'discarded') => void;
}

const STORAGE_OPTIONS: { value: Ingredient['storage_type']; label: string }[] = [
  { value: 'fridge', label: '❄️ 냉장' },
  { value: 'freezer', label: '🧊 냉동' },
  { value: 'room_temp', label: '🌡️ 실온' },
];

const COMMON_UNITS = ['개', '봉지', '팩', 'g', 'kg', 'mL', 'L', '병', '캔', '줄기', '묶음'];

export default function EditIngredientModal({ item, onClose, onConsumed }: Props) {
  const { updateIngredient, removeIngredient } = useFridgeStore();
  const { showAlert, alertElement } = useCustomAlert();

  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('개');
  const [storageType, setStorageType] = useState<Ingredient['storage_type']>('fridge');
  const [expiryDate, setExpiryDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [consuming, setConsuming] = useState(false);
  const [partialMode, setPartialMode] = useState<'eaten' | 'discarded' | null>(null);
  const [partialAmount, setPartialAmount] = useState('');
  const [localLog, setLocalLog] = useState<NonNullable<Ingredient['consumption_log']>>([]);

  const consumingRef = useRef(false);

  useEffect(() => {
    if (item) {
      setName(item.name);
      setQuantity(String(item.quantity));
      setUnit(item.unit);
      setStorageType(item.storage_type);
      setExpiryDate(item.expiry_date ?? '');
      setLocalLog(item.consumption_log ?? []);
      consumingRef.current = false;
      setConsuming(false);
      setPartialMode(null);
      setPartialAmount('');
    }
  }, [item]);

  if (!item) return null;

  function handleConsume(type: 'eaten' | 'discarded') {
    if (!item || consumingRef.current) return;
    showAlert(
      type === 'eaten' ? '얼마나 드셨나요?' : '얼마나 버리셨나요?',
      `현재 ${item.quantity}${item.unit} 있어요`,
      [
        { text: '취소', style: 'cancel' },
        { text: '일부만', onPress: () => { setPartialAmount(''); setPartialMode(type); } },
        { text: type === 'eaten' ? '전부 다 먹었어요' : '전부 버렸어요', onPress: () => handleFullConsume(type) },
      ]
    );
  }

  async function handleFullConsume(type: 'eaten' | 'discarded') {
    if (!item || consumingRef.current) return;
    consumingRef.current = true;
    setConsuming(true);

    const updates: Partial<Ingredient> = {
      is_consumed: true,
      consumed_type: type,
      consumed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('ingredients').update(updates).eq('id', item.id);
    if (error) {
      showAlert('처리 실패', error.message);
      consumingRef.current = false;
      setConsuming(false);
      return;
    }
    updateIngredient(item.id, updates);
    cancelIngredientNotifications(item.id);
    onConsumed(item, type);
    onClose();
  }

  async function handlePartialConsume() {
    if (!item || !partialMode) return;
    const amount = parseFloat(partialAmount);
    if (isNaN(amount) || amount <= 0) {
      showAlert('입력 오류', '소비한 양을 올바르게 입력해주세요.');
      return;
    }
    setConsuming(true);
    const newQuantity = Math.max(0, item.quantity - amount);
    const logEntry = { date: new Date().toISOString().split('T')[0], amount, unit: item.unit, type: partialMode };
    const newLog = [...(item.consumption_log ?? []), logEntry];
    const updates: Partial<Ingredient> = {
      quantity: newQuantity,
      consumption_log: newLog,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('ingredients').update(updates).eq('id', item.id);
    setConsuming(false);
    if (error) { showAlert('저장 실패', error.message); return; }
    updateIngredient(item.id, updates);
    setLocalLog(newLog);
    setPartialMode(null);
    if (newQuantity === 0) {
      handleFullConsume(partialMode);
    } else {
      setQuantity(String(newQuantity));
      showAlert('기록 완료', `${amount}${item.unit} ${partialMode === 'eaten' ? '소비' : '폐기'} 기록했어요.\n남은 양: ${newQuantity}${item.unit}`);
    }
  }

  async function handleSave() {
    if (!item) return;
    setSaving(true);
    const updates: Partial<Ingredient> = {
      name: name.trim() || item.name,
      quantity: parseFloat(quantity) || item.quantity,
      unit,
      storage_type: storageType,
      expiry_date: expiryDate || undefined,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('ingredients').update(updates).eq('id', item.id);
    setSaving(false);
    if (error) { showAlert('저장 실패', error.message); return; }
    updateIngredient(item.id, updates);
    onClose();
  }

  async function handleDelete() {
    if (!item) return;
    const currentItem = item;
    showAlert(`${currentItem.name} 삭제`, '냉장고에서 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제', style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('ingredients').delete().eq('id', currentItem.id);
          if (error) { showAlert('삭제 실패', error.message); return; }
          cancelIngredientNotifications(currentItem.id);
          removeIngredient(currentItem.id);
          onClose();
        },
      },
    ]);
  }

  return (
    <Modal
      visible={!!item}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      {/* 헤더 */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.cancelBtn}>취소</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{name || item.name}</Text>
        <TouchableOpacity onPress={handleDelete}>
          <Text style={styles.deleteBtn}>삭제</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">

        {/* ── 소진 처리 카드 (최상단) ── */}
        <View style={styles.consumeSection}>
          <Text style={styles.consumeLabel}>소진 처리</Text>
          <View style={styles.consumeRow}>

            {/* 먹었어요 */}
            <TouchableOpacity
              style={[styles.consumeCard, styles.consumeCardEaten, consuming && styles.consumeCardDimmed]}
              onPress={() => handleConsume('eaten')}
              disabled={consuming}
              activeOpacity={0.75}
            >
              <Text style={styles.consumeCardEmoji}>😋</Text>
              <Text style={styles.consumeCardTitle}>먹었어요</Text>
              <Text style={styles.consumeCardDesc}>절약 리포트에{'\n'}기록돼요</Text>
            </TouchableOpacity>

            {/* 버렸어요 */}
            <TouchableOpacity
              style={[styles.consumeCard, styles.consumeCardDiscarded, consuming && styles.consumeCardDimmed]}
              onPress={() => handleConsume('discarded')}
              disabled={consuming}
              activeOpacity={0.75}
            >
              <Text style={styles.consumeCardEmoji}>🗑️</Text>
              <Text style={[styles.consumeCardTitle, styles.consumeCardTitleDiscarded]}>버렸어요</Text>
              <Text style={[styles.consumeCardDesc, styles.consumeCardDescDiscarded]}>낭비로{'\n'}기록돼요</Text>
            </TouchableOpacity>

          </View>
        </View>

        {/* ── 부분 소비 입력 ── */}
        {partialMode && (
          <View style={styles.partialSection}>
            <Text style={styles.partialTitle}>
              {partialMode === 'eaten' ? '얼마나 드셨나요?' : '얼마나 버리셨나요?'}
            </Text>
            <View style={styles.partialRow}>
              <TextInput
                style={styles.partialInput}
                value={partialAmount}
                onChangeText={setPartialAmount}
                keyboardType="decimal-pad"
                placeholder="수량"
                autoFocus
              />
              <Text style={styles.partialUnit}>{item.unit}</Text>
            </View>
            <View style={styles.partialBtns}>
              <TouchableOpacity style={styles.partialCancelBtn} onPress={() => setPartialMode(null)}>
                <Text style={styles.partialCancelText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.partialConfirmBtn, consuming && { opacity: 0.6 }]}
                onPress={handlePartialConsume}
                disabled={consuming}
              >
                <Text style={styles.partialConfirmText}>기록하기</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── AI 정보 ── */}
        {(item.ai_expiry_note || item.storage_tip) && (
          <View style={styles.aiInfoBox}>
            {item.ai_expiry_note && (
              <Text style={styles.aiInfoText}>📅 {item.ai_expiry_note}</Text>
            )}
            {item.storage_tip && (
              <Text style={[styles.aiInfoText, item.ai_expiry_note && { marginTop: 4 }]}>
                💡 {item.storage_tip}
              </Text>
            )}
          </View>
        )}

        {/* ── 수정 섹션 ── */}
        <View style={styles.editSection}>
          <Text style={styles.editSectionTitle}>수정</Text>

          <Text style={styles.label}>재료 이름</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="재료 이름"
            returnKeyType="done"
          />

          <Text style={styles.label}>보관 위치</Text>
          <View style={styles.storageRow}>
            {STORAGE_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.storageChip, storageType === opt.value && styles.storageChipSelected]}
                onPress={() => setStorageType(opt.value)}
              >
                <Text style={[styles.storageChipText, storageType === opt.value && styles.storageChipTextSelected]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>수량</Text>
          <TextInput
            style={styles.input}
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="decimal-pad"
            selectTextOnFocus
          />

          <Text style={styles.label}>단위</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
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

          <Text style={styles.label}>
            유통기한 <Text style={styles.optional}>(선택 · YYYY-MM-DD)</Text>
          </Text>
          <TextInput
            style={styles.input}
            value={expiryDate}
            onChangeText={setExpiryDate}
            placeholder="예: 2026-06-01"
            keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
          />
        </View>

        {/* ── 소비 기록 ── */}
        {localLog.length > 0 && (
          <View style={styles.logSection}>
            <Text style={styles.logTitle}>소비 기록</Text>
            {[...localLog].reverse().map((log, i) => (
              <View key={i} style={styles.logRow}>
                <Text style={styles.logDate}>{log.date}</Text>
                <Text style={styles.logAmount}>
                  {log.type === 'eaten' ? '😋' : '🗑️'} {log.amount}{log.unit}
                </Text>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* 저장 버튼 */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>수정 저장하기</Text>}
        </TouchableOpacity>
      </View>
      {alertElement}
      </SafeAreaView>
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
  cancelBtn: { fontSize: 15, color: '#3182F6', width: 40 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#191F28', flex: 1, textAlign: 'center' },
  deleteBtn: { fontSize: 15, color: '#F04452', width: 40, textAlign: 'right' },

  // 소진 카드
  consumeSection: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8 },
  consumeLabel: { fontSize: 12, fontWeight: '700', color: '#4E5968', marginBottom: 12, letterSpacing: 0.3 },
  consumeRow: { flexDirection: 'row', gap: 10 },
  consumeCard: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 22,
    paddingHorizontal: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  consumeCardEaten: { backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#D1FAE5' },
  consumeCardDiscarded: { backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#E5E8EB' },
  consumeCardDimmed: { opacity: 0.4 },
  consumeCardEmoji: { fontSize: 32, marginBottom: 10 },
  consumeCardTitle: { fontSize: 15, fontWeight: '700', color: '#059669', marginBottom: 4 },
  consumeCardTitleDiscarded: { color: '#6B7280' },
  consumeCardDesc: { fontSize: 11, color: '#6EE7B7', textAlign: 'center', lineHeight: 16 },
  consumeCardDescDiscarded: { color: '#9CA3AF' },

  // 부분 소비
  partialSection: {
    marginHorizontal: 16, marginBottom: 12, padding: 16,
    backgroundColor: '#F0F7FF', borderRadius: 12,
  },
  partialTitle: { fontSize: 15, fontWeight: '600', color: '#191F28', marginBottom: 12 },
  partialRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  partialInput: {
    flex: 1, borderWidth: 1, borderColor: '#3182F6', borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, color: '#191F28', backgroundColor: '#FFFFFF',
  },
  partialUnit: { fontSize: 15, color: '#4E5968', marginLeft: 8, fontWeight: '500' },
  partialBtns: { flexDirection: 'row', gap: 8 },
  partialCancelBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 8,
    borderWidth: 1, borderColor: '#D1D6DB', alignItems: 'center',
  },
  partialCancelText: { fontSize: 14, color: '#8B95A1', fontWeight: '500' },
  partialConfirmBtn: {
    flex: 2, paddingVertical: 10, borderRadius: 8,
    backgroundColor: '#3182F6', alignItems: 'center',
  },
  partialConfirmText: { fontSize: 14, color: '#FFFFFF', fontWeight: '700' },

  // 소비 기록
  logSection: { marginHorizontal: 16, marginBottom: 12 },
  logTitle: { fontSize: 14, fontWeight: '600', color: '#4E5968', marginBottom: 8 },
  logRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F2F4F6',
  },
  logDate: { fontSize: 13, color: '#8B95A1' },
  logAmount: { fontSize: 13, color: '#191F28', fontWeight: '500' },

  // AI 정보
  aiInfoBox: {
    marginHorizontal: 16,
    marginTop: 14,
    backgroundColor: '#F8FBFF',
    borderRadius: 10,
    padding: 12,
  },
  aiInfoText: { fontSize: 13, color: '#4E5968', lineHeight: 20 },

  // 수정 섹션
  editSection: { paddingHorizontal: 16, paddingTop: 20 },
  editSectionTitle: { fontSize: 12, fontWeight: '600', color: '#8B95A1', marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#8B95A1', marginBottom: 8 },
  optional: { fontWeight: '400', color: '#B0B8C1' },
  storageRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  storageChip: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#E5E8EB',
    alignItems: 'center', backgroundColor: '#FAFAFA',
  },
  storageChipSelected: { backgroundColor: '#EBF3FF', borderColor: '#3182F6' },
  storageChipText: { fontSize: 14, color: '#4E5968', fontWeight: '500' },
  storageChipTextSelected: { color: '#3182F6', fontWeight: '700' },
  input: {
    borderWidth: 1, borderColor: '#E5E8EB', borderRadius: 10,
    padding: 14, fontSize: 16, color: '#191F28',
    backgroundColor: '#FAFAFA', marginBottom: 20,
  },
  unitChip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16,
    borderWidth: 1, borderColor: '#E5E8EB', marginRight: 6, backgroundColor: '#FAFAFA',
  },
  unitChipSelected: { backgroundColor: '#3182F6', borderColor: '#3182F6' },
  unitChipText: { fontSize: 13, color: '#4E5968' },
  unitChipTextSelected: { color: '#FFFFFF', fontWeight: '600' },

  // 저장 버튼
  footer: {
    padding: 16, paddingBottom: 32,
    borderTopWidth: 1, borderTopColor: '#F2F4F6',
    backgroundColor: '#FFFFFF',
  },
  saveBtn: {
    backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, alignItems: 'center',
    borderWidth: 1.5, borderColor: '#D1D6DB',
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { fontSize: 16, fontWeight: '600', color: '#4E5968' },
});
