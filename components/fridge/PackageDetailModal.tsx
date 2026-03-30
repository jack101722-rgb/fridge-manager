import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { IngredientPackage, PackageItem } from '../../lib/packageData';
import { inferIngredients } from '../../lib/claudeApi';
import { useFridgeStore } from '../../store/fridgeStore';
import { supabase } from '../../lib/supabase';
import { Ingredient } from '../../types';

const CATEGORY_EMOJI: Record<string, string> = {
  vegetable: '🥬',
  meat: '🥩',
  dairy: '🥛',
  processed: '🥫',
  beverage: '🧃',
  condiment: '🧂',
  other: '📦',
};

interface Props {
  visible: boolean;
  pkg: IngredientPackage | null;
  onClose: () => void;
  onAdded: (count: number) => void;
}

export default function PackageDetailModal({ visible, pkg, onClose, onAdded }: Props) {
  const slideAnim = useRef(new Animated.Value(600)).current;
  const fridge = useFridgeStore((s) => s.fridge);
  const ingredients = useFridgeStore((s) => s.ingredients);
  const setIngredients = useFridgeStore((s) => s.setIngredients);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);

  // 이미 보유한 재료명 Set (소문자 비교)
  const ownedNames = new Set(
    ingredients.filter((i) => !i.is_consumed).map((i) => i.name.toLowerCase()),
  );

  function isOwned(name: string) {
    return ownedNames.has(name.toLowerCase());
  }

  // 새 패키지가 열릴 때 — 보유 중인 재료는 기본 선택 해제
  useEffect(() => {
    if (pkg) {
      setSelected(new Set(pkg.items.filter((i) => !isOwned(i.name)).map((i) => i.name)));
    }
  }, [pkg]);

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 600,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  function toggleItem(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }

  function selectAll() {
    if (!pkg) return;
    setSelected(new Set(pkg.items.map((i) => i.name)));
  }

  function deselectAll() {
    setSelected(new Set());
  }

  async function handleAdd() {
    if (!pkg || selected.size === 0) return;
    if (!fridge) {
      Alert.alert('오류', '냉장고 정보를 불러오지 못했어요. 앱을 다시 시작해주세요.');
      return;
    }
    setAdding(true);
    try {
      const chosenItems = pkg.items.filter((i) => selected.has(i.name));

      // Infer AI info for all selected items at once
      const inferred = await inferIngredients(
        chosenItems.map((i) => ({ name: i.name })),
      );

      const today = new Date().toISOString().split('T')[0];
      const rows = chosenItems.map((item, idx) => {
        const inf = inferred[idx];
        const expiryDate = inf?.ai_expiry_days
          ? new Date(Date.now() + inf.ai_expiry_days * 86400000).toISOString().split('T')[0]
          : undefined;
        return {
          fridge_id: fridge.id,
          name: inf?.name ?? item.name,
          category: inf?.category ?? item.category,
          storage_type: inf?.storage_type ?? item.storage_type,
          storage_tip: inf?.storage_tip ?? null,
          quantity: item.quantity,
          unit: item.unit,
          market_price: inf?.market_price ?? null,
          purchase_date: today,
          expiry_date: expiryDate ?? null,
          ai_expiry_days: inf?.ai_expiry_days ?? null,
          ai_expiry_note: inf?.ai_expiry_note ?? null,
          source: 'package' as const,
          is_consumed: false,
        };
      });

      const { data, error } = await supabase
        .from('ingredients')
        .insert(rows)
        .select();

      if (error) throw error;

      if (data) {
        setIngredients([...(data as Ingredient[]), ...ingredients]);
        onAdded(data.length);
        onClose();
      }
    } catch (e) {
      console.error('패키지 추가 오류:', e);
      Alert.alert('추가 실패', '재료 추가 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.');
    } finally {
      setAdding(false);
    }
  }

  if (!pkg) return null;

  const allSelected = selected.size === pkg.items.length;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.pkgEmoji}>{pkg.emoji}</Text>
            <View>
              <Text style={styles.title}>{pkg.title}</Text>
              <Text style={styles.subtitle}>{pkg.items.length}가지 재료</Text>
            </View>
          </View>
          <TouchableOpacity onPress={allSelected ? deselectAll : selectAll}>
            <Text style={styles.toggleAll}>{allSelected ? '전체 해제' : '전체 선택'}</Text>
          </TouchableOpacity>
        </View>

        {/* Item list */}
        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
          {pkg.items.map((item: PackageItem) => {
            const checked = selected.has(item.name);
            const owned = isOwned(item.name);
            return (
              <TouchableOpacity
                key={item.name}
                style={styles.item}
                onPress={() => toggleItem(item.name)}
                activeOpacity={0.7}
              >
                <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                  {checked && <Text style={styles.checkMark}>✓</Text>}
                </View>
                <View style={styles.itemIcon}>
                  <Text style={{ fontSize: 18 }}>{CATEGORY_EMOJI[item.category] ?? '📦'}</Text>
                </View>
                <View style={styles.itemInfo}>
                  <View style={styles.itemNameRow}>
                    <Text style={[styles.itemName, !checked && styles.dimmed]}>{item.name}</Text>
                    {owned && (
                      <View style={styles.ownedBadge}>
                        <Text style={styles.ownedBadgeText}>보유 중</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.itemMeta}>
                    {item.quantity}{item.unit} · {
                      item.storage_type === 'fridge' ? '냉장' :
                      item.storage_type === 'freezer' ? '냉동' : '상온'
                    }
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
          <View style={{ height: 16 }} />
        </ScrollView>

        {/* Add button */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.addBtn, (selected.size === 0 || adding) && styles.addBtnDisabled]}
            onPress={handleAdd}
            disabled={selected.size === 0 || adding}
          >
            {adding ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.addBtnText}>
                {selected.size > 0 ? `${selected.size}가지 재료 추가하기` : '재료를 선택해주세요'}
              </Text>
            )}
          </TouchableOpacity>
          {adding && (
            <Text style={styles.addingNote}>AI가 유통기한 등 정보를 채우고 있어요...</Text>
          )}
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: '80%',
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#E5E8EB',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pkgEmoji: { fontSize: 28 },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#191F28',
  },
  subtitle: {
    fontSize: 12,
    color: '#8B95A1',
    marginTop: 2,
  },
  toggleAll: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3182F6',
  },
  list: { flex: 1 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F4F6',
  },
  itemChecked: {
    // subtle highlight when checked
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#D1D6DB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkboxChecked: {
    backgroundColor: '#3182F6',
    borderColor: '#3182F6',
  },
  checkMark: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  itemIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F2F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  itemInfo: { flex: 1 },
  itemNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  itemName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#191F28',
  },
  dimmed: { color: '#B0B8C1' },
  itemMeta: {
    fontSize: 12,
    color: '#8B95A1',
    marginTop: 2,
  },
  ownedBadge: {
    backgroundColor: '#F2F4F6',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  ownedBadgeText: { fontSize: 11, fontWeight: '600', color: '#8B95A1' },
  footer: {
    paddingVertical: 16,
  },
  addBtn: {
    backgroundColor: '#3182F6',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  addBtnDisabled: {
    backgroundColor: '#C9CDD2',
  },
  addBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  addingNote: {
    fontSize: 12,
    color: '#8B95A1',
    textAlign: 'center',
    marginTop: 8,
  },
});
