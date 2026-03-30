import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { PRESET_PACKAGES, IngredientPackage } from '../../lib/packageData';
import { generateAIPackage, AIPackageItem } from '../../lib/claudeApi';
import { useFridgeStore } from '../../store/fridgeStore';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelectPackage: (pkg: IngredientPackage) => void;
}

export default function PackageSelectModal({ visible, onClose, onSelectPackage }: Props) {
  const slideAnim = useRef(new Animated.Value(600)).current;
  const user = useFridgeStore((s) => s.user);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

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

  async function handleAIPackage() {
    if (!user) return;
    setAiLoading(true);
    setAiError('');
    try {
      const items = await generateAIPackage(
        user.household_size ?? 2,
        user.cuisine_prefs ?? [],
        user.diet_mode ?? 'none',
      );
      const aiPkg: IngredientPackage = {
        id: 'ai_custom',
        emoji: '🤖',
        title: 'AI 맞춤 패키지',
        description: '내 식단 정보를 분석해 추천한 맞춤 재료예요',
        tag: '나만의 추천',
        tagColor: '#3182F6',
        tagBg: '#EBF3FF',
        items: items.map((i: AIPackageItem) => ({
          name: i.name,
          quantity: i.quantity,
          unit: i.unit,
          category: i.category,
          storage_type: i.storage_type,
        })),
      };
      onSelectPackage(aiPkg);
    } catch {
      setAiError('AI 추천 생성에 실패했어요. 다시 시도해주세요.');
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
        <View style={styles.handle} />
        <Text style={styles.title}>재료 패키지 선택</Text>
        <Text style={styles.subtitle}>자주 쓰는 재료 묶음을 한 번에 추가해요</Text>

        <ScrollView showsVerticalScrollIndicator={false} style={styles.list}>
          {/* AI 맞춤 패키지 */}
          <TouchableOpacity style={[styles.card, styles.aiCard]} onPress={handleAIPackage} disabled={aiLoading}>
            <View style={styles.cardLeft}>
              <View style={[styles.emojiBox, { backgroundColor: '#EBF3FF' }]}>
                {aiLoading ? (
                  <ActivityIndicator size="small" color="#3182F6" />
                ) : (
                  <Text style={styles.emoji}>🤖</Text>
                )}
              </View>
              <View style={styles.cardInfo}>
                <View style={styles.titleRow}>
                  <Text style={styles.cardTitle}>AI 맞춤 패키지</Text>
                  <View style={[styles.tag, { backgroundColor: '#EBF3FF' }]}>
                    <Text style={[styles.tagText, { color: '#3182F6' }]}>내 식단 분석</Text>
                  </View>
                </View>
                <Text style={styles.cardDesc}>
                  {aiLoading ? 'AI가 재료를 추천 중이에요...' : '내 인원·음식 취향·식단 목표를 반영해요'}
                </Text>
                {aiError ? <Text style={styles.errorText}>{aiError}</Text> : null}
              </View>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>

          {/* 프리셋 패키지 */}
          {PRESET_PACKAGES.map((pkg) => (
            <TouchableOpacity key={pkg.id} style={styles.card} onPress={() => onSelectPackage(pkg)}>
              <View style={styles.cardLeft}>
                <View style={[styles.emojiBox, { backgroundColor: '#F2F4F6' }]}>
                  <Text style={styles.emoji}>{pkg.emoji}</Text>
                </View>
                <View style={styles.cardInfo}>
                  <View style={styles.titleRow}>
                    <Text style={styles.cardTitle}>{pkg.title}</Text>
                    <View style={[styles.tag, { backgroundColor: pkg.tagBg }]}>
                      <Text style={[styles.tagText, { color: pkg.tagColor }]}>{pkg.tag}</Text>
                    </View>
                  </View>
                  <Text style={styles.cardDesc}>{pkg.description}</Text>
                  <Text style={styles.itemCount}>{pkg.items.length}가지 재료</Text>
                </View>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          ))}

          <View style={{ height: 32 }} />
        </ScrollView>
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
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#191F28',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#8B95A1',
    marginBottom: 16,
  },
  list: {
    flex: 1,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F4F6',
  },
  aiCard: {
    backgroundColor: '#FAFCFF',
    marginHorizontal: -20,
    paddingHorizontal: 20,
    borderBottomColor: '#E8F0FE',
  },
  cardLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  emojiBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  emoji: { fontSize: 22 },
  cardInfo: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#191F28' },
  tag: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  tagText: { fontSize: 11, fontWeight: '700' },
  cardDesc: { fontSize: 12, color: '#8B95A1', lineHeight: 17 },
  itemCount: { fontSize: 12, color: '#B0B8C1', marginTop: 2 },
  chevron: { fontSize: 20, color: '#C9CDD2', marginLeft: 8 },
  errorText: { fontSize: 12, color: '#EF4444', marginTop: 3 },
});
