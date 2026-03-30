import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useFridgeStore } from '../../store/fridgeStore';
import { inferIngredients } from '../../lib/claudeApi';
import { Ingredient, ShoppingItem } from '../../types';

export default function ShoppingScreen() {
  const insets = useSafeAreaInsets();
  const { shoppingItems, fridge, updateShoppingItem, addIngredient, removeShoppingItems } = useFridgeStore();
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [addingToFridge, setAddingToFridge] = useState(false);

  // 토스트
  const [toastMsg, setToastMsg] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  const toastSlide = useRef(new Animated.Value(-80)).current;
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    setToastMsg(msg);
    setToastType(type);
    toastSlide.setValue(-80);
    Animated.spring(toastSlide, { toValue: 0, useNativeDriver: true, tension: 80, friction: 12 }).start();
    toastTimeout.current = setTimeout(() => {
      Animated.timing(toastSlide, { toValue: -80, duration: 250, useNativeDriver: true }).start();
    }, 3000);
  }

  useEffect(() => () => { if (toastTimeout.current) clearTimeout(toastTimeout.current); }, []);

  const pending = shoppingItems.filter((i) => !i.is_purchased);
  const purchased = shoppingItems.filter((i) => i.is_purchased);

  const handleToggle = async (item: ShoppingItem) => {
    if (processingId || addingToFridge) return;
    setProcessingId(item.id);
    try {
      const nowPurchased = !item.is_purchased;
      const { error } = await supabase
        .from('shopping_items')
        .update({ is_purchased: nowPurchased })
        .eq('id', item.id);
      if (error) throw error;
      updateShoppingItem(item.id, { is_purchased: nowPurchased });
    } catch {
      showToast('업데이트에 실패했어요.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleAddAllToFridge = async () => {
    if (!fridge || purchased.length === 0 || addingToFridge) return;
    setAddingToFridge(true);
    try {
      const inferences = await inferIngredients(purchased.map((i) => ({ name: i.name })));
      const now = new Date().toISOString();
      const today = now.split('T')[0];

      for (let i = 0; i < purchased.length; i++) {
        const item = purchased[i];
        const inf = inferences[i] ?? {};
        const newIngredient = {
          fridge_id: fridge.id,
          name: item.name,
          category: inf.category ?? 'other',
          storage_type: inf.storage_type ?? 'fridge',
          storage_tip: inf.storage_tip ?? null,
          quantity: item.quantity,
          unit: item.unit,
          purchase_date: today,
          ai_expiry_days: inf.ai_expiry_days ?? null,
          ai_expiry_note: inf.ai_expiry_note ?? null,
          source: 'manual' as const,
          is_consumed: false,
          created_at: now,
          updated_at: now,
        };
        const { data, error } = await supabase
          .from('ingredients')
          .insert(newIngredient)
          .select()
          .single();
        if (!error && data) addIngredient(data as Ingredient);
      }
      const purchasedIds = purchased.map((i) => i.id);
      await supabase.from('shopping_items').delete().in('id', purchasedIds);
      removeShoppingItems(purchasedIds);

      showToast(`🎉 ${purchased.length}개 재료가 냉장고에 추가됐어요!`, 'success');
    } catch {
      showToast('냉장고 추가에 실패했어요.', 'error');
    } finally {
      setAddingToFridge(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>장보기 목록</Text>
        <Text style={styles.subtitle}>
          {pending.length > 0 ? `${pending.length}개 남았어요` : purchased.length > 0 ? '다 샀어요! 아래 버튼으로 냉장고에 추가하세요 🛒' : ''}
        </Text>
      </View>

      {shoppingItems.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>🛒</Text>
          <Text style={styles.emptyTitle}>장보기 목록이 비어있어요</Text>
          <Text style={styles.emptyDesc}>메뉴 추천에서 재료를 선택하면{'\n'}자동으로 추가돼요</Text>
        </View>
      ) : (
        <FlatList
          data={[...pending, ...purchased]}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: purchased.length > 0 ? 100 : 16 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.itemRow}
              onPress={() => handleToggle(item)}
              disabled={processingId === item.id || addingToFridge}
            >
              <View style={[styles.checkbox, item.is_purchased && styles.checkboxDone]}>
                {processingId === item.id
                  ? <ActivityIndicator size="small" color="#FFFFFF" />
                  : item.is_purchased && <Text style={styles.checkmark}>✓</Text>
                }
              </View>
              <View style={styles.itemInfo}>
                <Text style={[styles.itemName, item.is_purchased && styles.itemNameDone]}>
                  {item.name}
                </Text>
                {item.menu_name && (
                  <Text style={styles.itemSource}>{item.menu_name} 레시피</Text>
                )}
              </View>
              <Text style={styles.itemQty}>{item.quantity}{item.unit}</Text>
            </TouchableOpacity>
          )}
        />
      )}

      {purchased.length > 0 && (
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
          <TouchableOpacity
            style={[styles.addButton, addingToFridge && styles.addButtonDisabled]}
            onPress={handleAddAllToFridge}
            disabled={addingToFridge}
          >
            {addingToFridge ? (
              <View style={styles.addButtonInner}>
                <ActivityIndicator color="#FFFFFF" size="small" />
                <Text style={styles.addButtonText}>AI 분석 중...</Text>
              </View>
            ) : (
              <Text style={styles.addButtonText}>냉장고에 추가하기 ({purchased.length}개)</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* 토스트 알림 */}
      <Animated.View
        style={[
          styles.toast,
          { top: insets.top + 12, transform: [{ translateY: toastSlide }] },
          toastType === 'error' && styles.toastError,
        ]}
        pointerEvents="none"
      >
        <Text style={styles.toastText}>{toastMsg}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 },
  title: { fontSize: 22, fontWeight: '700', color: '#191F28' },
  subtitle: { fontSize: 14, color: '#8B95A1', marginTop: 4 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyEmoji: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: '#191F28', marginBottom: 8 },
  emptyDesc: { fontSize: 14, color: '#8B95A1', textAlign: 'center', lineHeight: 20 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#D1D6DB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkboxDone: { backgroundColor: '#3182F6', borderColor: '#3182F6' },
  checkmark: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 15, color: '#191F28', fontWeight: '500' },
  itemNameDone: { color: '#8B95A1', textDecorationLine: 'line-through' },
  itemSource: { fontSize: 12, color: '#8B95A1', marginTop: 2 },
  itemQty: { fontSize: 13, color: '#8B95A1' },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E8EB',
  },
  addButton: {
    backgroundColor: '#3182F6',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonDisabled: { backgroundColor: '#B0C4DE' },
  addButtonInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  addButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  // 토스트
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: '#191F28',
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  toastError: { backgroundColor: '#F04452' },
  toastText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600', textAlign: 'center' },
});
