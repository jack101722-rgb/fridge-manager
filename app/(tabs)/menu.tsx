import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import RecipeModal, { SelectedMenu } from '../../components/menu/RecipeModal';
import { useFridgeStore } from '../../store/fridgeStore';
import {
  CachedMenu,
  MenuCategory,
  PersonalizedMenu,
  generatePersonalizedMenus,
  getOrCreateCachedMenus,
} from '../../lib/menuApi';

// ─── 상수 ────────────────────────────────────────────────

const UNLOCK_COUNT = 5;

const CATEGORY_META: Record<MenuCategory, { label: string; emoji: string; color: string }> = {
  seasonal: { label: '계절 추천', emoji: '🌿', color: '#27AE60' },
  quick: { label: '10분 간단 요리', emoji: '⚡', color: '#F39C12' },
  korean: { label: '한식 추천', emoji: '🍚', color: '#E74C3C' },
  western: { label: '양식 추천', emoji: '🍝', color: '#9B59B6' },
};

const DIFFICULTY_LABEL: Record<string, string> = {
  easy: '쉬움',
  medium: '보통',
  hard: '어려움',
};

// ─── 컴포넌트 ────────────────────────────────────────────

function Layer1Card({ item, onPress }: { item: CachedMenu; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.l1Card} onPress={onPress} activeOpacity={0.75}>
      <Text style={styles.l1Emoji}>{item.emoji}</Text>
      <Text style={styles.l1MenuName} numberOfLines={1}>{item.menu_name}</Text>
      <Text style={styles.l1Desc} numberOfLines={2}>{item.description}</Text>
      <View style={styles.l1Meta}>
        <Text style={styles.l1MetaText}>⏱ {item.time_minutes}분</Text>
        <Text style={styles.l1MetaText}>  {DIFFICULTY_LABEL[item.difficulty] ?? item.difficulty}</Text>
      </View>
      {item.tags?.length > 0 && (
        <View style={styles.l1Tags}>
          {item.tags.slice(0, 2).map((tag) => (
            <View key={tag} style={styles.l1Tag}>
              <Text style={styles.l1TagText}>#{tag}</Text>
            </View>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
}

function Layer1Section({ category, menus, onPress }: { category: MenuCategory; menus: CachedMenu[]; onPress: (item: CachedMenu) => void }) {
  const meta = CATEGORY_META[category];
  return (
    <View style={styles.sectionBlock}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionEmoji}>{meta.emoji}</Text>
        <Text style={styles.sectionTitle}>{meta.label}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.l1Row}>
        {menus.map((m) => (
          <Layer1Card key={m.id} item={m} onPress={() => onPress(m)} />
        ))}
      </ScrollView>
    </View>
  );
}

function Layer2Card({ item, onPress }: { item: PersonalizedMenu; onPress: () => void }) {
  const hasUrgency = item.urgency_used.length > 0;
  return (
    <TouchableOpacity style={[styles.l2Card, hasUrgency && styles.l2CardUrgent]} onPress={onPress} activeOpacity={0.75}>
      {hasUrgency && (
        <View style={styles.urgentBadge}>
          <Text style={styles.urgentBadgeText}>🚨 임박 재료 활용</Text>
        </View>
      )}
      <View style={styles.l2Top}>
        <Text style={styles.l2Emoji}>{item.emoji}</Text>
        <View style={styles.l2Info}>
          <Text style={styles.l2MenuName}>{item.menu_name}</Text>
          <Text style={styles.l2Desc} numberOfLines={1}>{item.description}</Text>
          <View style={styles.l2Meta}>
            <Text style={styles.l2MetaText}>⏱ {item.time_minutes}분</Text>
            <Text style={styles.l2MetaText}>  {DIFFICULTY_LABEL[item.difficulty] ?? item.difficulty}</Text>
          </View>
        </View>
      </View>
      <View style={styles.l2Ingredients}>
        <View style={styles.l2IngRow}>
          <Text style={styles.l2IngLabel}>✅ 보유</Text>
          <Text style={styles.l2IngText} numberOfLines={1}>
            {item.available_ingredients.join(', ')}
          </Text>
        </View>
        {item.missing_ingredients.length > 0 && (
          <View style={styles.l2IngRow}>
            <Text style={[styles.l2IngLabel, styles.l2IngLabelMissing]}>🛒 필요</Text>
            <Text style={[styles.l2IngText, styles.l2IngTextMissing]} numberOfLines={1}>
              {item.missing_ingredients.join(', ')}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

function LockedLayer2({ activeCount }: { activeCount: number }) {
  const remaining = UNLOCK_COUNT - activeCount;
  return (
    <View style={styles.lockedSection}>
      <View style={styles.lockedHeader}>
        <Text style={styles.sectionEmoji}>🔒</Text>
        <View>
          <Text style={styles.sectionTitle}>내 냉장고 맞춤 추천</Text>
          <Text style={styles.lockedSubtitle}>
            {activeCount === 0
              ? `재료 ${UNLOCK_COUNT}개를 등록하면 열려요`
              : `지금 ${activeCount}개 등록됨 → ${remaining}개만 더 추가하면 열려요`}
          </Text>
        </View>
      </View>
      {/* 흐릿한 미리보기 카드 3개 */}
      <View style={styles.lockedCards}>
        {['계란볶음밥', '된장찌개', '잡채'].map((name, i) => (
          <View key={name} style={[styles.l2Card, styles.lockedCard, { opacity: 0.35 - i * 0.08 }]}>
            <View style={styles.l2Top}>
              <Text style={styles.l2Emoji}>{['🍳', '🍲', '🥢'][i]}</Text>
              <View style={styles.l2Info}>
                <Text style={styles.l2MenuName}>{name}</Text>
                <Text style={styles.l2Desc}>내 재료로 만드는 맞춤 레시피</Text>
              </View>
            </View>
          </View>
        ))}
        <View style={styles.lockedOverlay} pointerEvents="none">
          <View style={styles.lockedCTA}>
            <Text style={styles.lockedCTAEmoji}>🔒</Text>
            <Text style={styles.lockedCTAText}>
              {remaining}개 재료만 더 추가하면{'\n'}내 냉장고 맞춤 메뉴가 열려요!
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

// ─── 메인 화면 ────────────────────────────────────────────

export default function MenuScreen() {
  const insets = useSafeAreaInsets();
  const { ingredients, user } = useFridgeStore();

  const activeCount = ingredients.filter((i) => !i.is_consumed).length;
  const isUnlocked = activeCount >= UNLOCK_COUNT;

  const [layer1, setLayer1] = useState<CachedMenu[]>([]);
  const [layer2, setLayer2] = useState<PersonalizedMenu[]>([]);
  const [loadingL1, setLoadingL1] = useState(true);
  const [loadingL2, setLoadingL2] = useState(false);
  const [errorL1, setErrorL1] = useState('');
  const [errorL2, setErrorL2] = useState('');

  const [selectedMenu, setSelectedMenu] = useState<SelectedMenu | null>(null);

  // 레이어1 로드 (진입 시 1회)
  useEffect(() => {
    setLoadingL1(true);
    setErrorL1('');
    getOrCreateCachedMenus()
      .then(setLayer1)
      .catch(() => setErrorL1('메뉴를 불러오지 못했어요. 잠시 후 다시 시도해주세요.'))
      .finally(() => setLoadingL1(false));
  }, []);

  // 레이어2 로드 (해금 시 1회)
  useEffect(() => {
    if (!isUnlocked || layer2.length > 0) return;
    setLoadingL2(true);
    setErrorL2('');
    generatePersonalizedMenus(
      ingredients.filter((i) => !i.is_consumed),
      user?.cuisine_prefs ?? [],
      user?.diet_mode ?? 'none',
    )
      .then(setLayer2)
      .catch(() => setErrorL2('맞춤 메뉴 생성에 실패했어요.'))
      .finally(() => setLoadingL2(false));
  }, [isUnlocked]);

  // 레이어1 카테고리 그룹핑
  const categories: MenuCategory[] = ['seasonal', 'quick', 'korean', 'western'];
  const grouped = categories.reduce<Record<MenuCategory, CachedMenu[]>>(
    (acc, cat) => {
      acc[cat] = layer1.filter((m) => m.category === cat);
      return acc;
    },
    { seasonal: [], quick: [], korean: [], western: [] }
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* 헤더 */}
      <View style={styles.header}>
        <Text style={styles.title}>메뉴 추천</Text>
        <Text style={styles.subtitle}>냉장고 재료로 만들 수 있는 메뉴예요</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* ── 레이어 1 ── */}
        {loadingL1 ? (
          <View style={styles.loadingBlock}>
            <ActivityIndicator color="#3182F6" />
            <Text style={styles.loadingText}>이번 주 추천 메뉴 불러오는 중...</Text>
          </View>
        ) : errorL1 ? (
          <View style={styles.errorBlock}>
            <Text style={styles.errorText}>{errorL1}</Text>
            <TouchableOpacity
              onPress={() => {
                setLoadingL1(true);
                setErrorL1('');
                getOrCreateCachedMenus()
                  .then(setLayer1)
                  .catch(() => setErrorL1('메뉴를 불러오지 못했어요.'))
                  .finally(() => setLoadingL1(false));
              }}
              style={styles.retryBtn}
            >
              <Text style={styles.retryText}>다시 시도</Text>
            </TouchableOpacity>
          </View>
        ) : (
          categories.map((cat) =>
            grouped[cat].length > 0 ? (
              <Layer1Section
                key={cat}
                category={cat}
                menus={grouped[cat]}
                onPress={(item) => setSelectedMenu({ type: 'cached', item })}
              />
            ) : null
          )
        )}

        {/* 구분선 */}
        <View style={styles.divider} />

        {/* ── 레이어 2 ── */}
        {!isUnlocked ? (
          <LockedLayer2 activeCount={activeCount} />
        ) : (
          <View style={styles.sectionBlock}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionEmoji}>✨</Text>
              <View>
                <Text style={styles.sectionTitle}>내 냉장고 맞춤 추천</Text>
                <Text style={styles.unlockedBadge}>재료 {activeCount}개 기준</Text>
              </View>
            </View>

            {loadingL2 ? (
              <View style={styles.loadingBlock}>
                <ActivityIndicator color="#3182F6" />
                <Text style={styles.loadingText}>AI가 맞춤 메뉴를 분석하는 중...</Text>
              </View>
            ) : errorL2 ? (
              <View style={styles.errorBlock}>
                <Text style={styles.errorText}>{errorL2}</Text>
                <TouchableOpacity
                  onPress={() => {
                    setLoadingL2(true);
                    setErrorL2('');
                    generatePersonalizedMenus(
                      ingredients.filter((i) => !i.is_consumed),
                      user?.cuisine_prefs ?? [],
                      user?.diet_mode ?? 'none',
                    )
                      .then(setLayer2)
                      .catch(() => setErrorL2('맞춤 메뉴 생성에 실패했어요.'))
                      .finally(() => setLoadingL2(false));
                  }}
                  style={styles.retryBtn}
                >
                  <Text style={styles.retryText}>다시 시도</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {layer2.map((m, i) => (
                  <Layer2Card
                    key={`${m.menu_name}-${i}`}
                    item={m}
                    onPress={() => setSelectedMenu({ type: 'personalized', item: m })}
                  />
                ))}
                <TouchableOpacity
                  onPress={() => {
                    setLayer2([]);
                    setLoadingL2(true);
                    setErrorL2('');
                    generatePersonalizedMenus(
                      ingredients.filter((i) => !i.is_consumed),
                      user?.cuisine_prefs ?? [],
                      user?.diet_mode ?? 'none',
                    )
                      .then(setLayer2)
                      .catch(() => setErrorL2('맞춤 메뉴 생성에 실패했어요.'))
                      .finally(() => setLoadingL2(false));
                  }}
                  style={styles.refreshBtn}
                >
                  <Text style={styles.refreshText}>🔄 다른 메뉴 추천받기</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      <RecipeModal
        menu={selectedMenu}
        onClose={() => setSelectedMenu(null)}
      />
    </View>
  );
}

// ─── 스타일 ───────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 },
  title: { fontSize: 22, fontWeight: '700', color: '#191F28' },
  subtitle: { fontSize: 14, color: '#8B95A1', marginTop: 4 },
  scroll: { paddingBottom: 20 },

  // 섹션 공통
  sectionBlock: { marginBottom: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 8 },
  sectionEmoji: { fontSize: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#191F28' },

  // 레이어1 카드 (가로 스크롤)
  l1Row: { paddingHorizontal: 20, gap: 12, paddingBottom: 4 },
  l1Card: {
    width: 160,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  l1Emoji: { fontSize: 32, marginBottom: 8 },
  l1MenuName: { fontSize: 14, fontWeight: '700', color: '#191F28', marginBottom: 4 },
  l1Desc: { fontSize: 12, color: '#8B95A1', lineHeight: 17, marginBottom: 8 },
  l1Meta: { flexDirection: 'row', gap: 8 },
  l1MetaText: { fontSize: 11, color: '#B0B8C1' },
  l1Tags: { flexDirection: 'row', gap: 4, marginTop: 8, flexWrap: 'wrap' },
  l1Tag: { backgroundColor: '#F2F4F6', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  l1TagText: { fontSize: 10, color: '#6B7684' },

  // 레이어2 카드
  l2Card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  l2CardUrgent: {
    borderWidth: 1.5,
    borderColor: '#FF6B35',
  },
  urgentBadge: {
    backgroundColor: '#FFF3EE',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  urgentBadgeText: { fontSize: 11, fontWeight: '600', color: '#FF6B35' },
  l2Top: { flexDirection: 'row', gap: 12, marginBottom: 10 },
  l2Emoji: { fontSize: 36 },
  l2Info: { flex: 1 },
  l2MenuName: { fontSize: 15, fontWeight: '700', color: '#191F28', marginBottom: 3 },
  l2Desc: { fontSize: 12, color: '#8B95A1', marginBottom: 6 },
  l2Meta: { flexDirection: 'row', gap: 10 },
  l2MetaText: { fontSize: 12, color: '#B0B8C1' },
  l2Ingredients: { borderTopWidth: 1, borderTopColor: '#F2F4F6', paddingTop: 10, gap: 4 },
  l2IngRow: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  l2IngLabel: { fontSize: 12, fontWeight: '600', color: '#27AE60', minWidth: 44 },
  l2IngLabelMissing: { color: '#F39C12' },
  l2IngText: { flex: 1, fontSize: 12, color: '#4E5968' },
  l2IngTextMissing: { color: '#F39C12' },

  // 잠금 레이어2
  lockedSection: { marginBottom: 8 },
  lockedHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 8 },
  lockedSubtitle: { fontSize: 12, color: '#8B95A1', marginTop: 2 },
  lockedCards: { position: 'relative' },
  lockedCard: { shadowOpacity: 0 },
  lockedOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(249,250,251,0.6)',
    borderRadius: 16,
  },
  lockedCTA: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 18,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
  lockedCTAEmoji: { fontSize: 28, marginBottom: 8 },
  lockedCTAText: { fontSize: 14, fontWeight: '600', color: '#191F28', textAlign: 'center', lineHeight: 20 },

  // 해금 배지
  unlockedBadge: { fontSize: 12, color: '#3182F6', marginTop: 2, fontWeight: '500' },

  // 구분선
  divider: { height: 8, backgroundColor: '#F2F4F6', marginVertical: 8 },

  // 로딩/에러
  loadingBlock: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  loadingText: { fontSize: 13, color: '#8B95A1' },
  errorBlock: { alignItems: 'center', paddingVertical: 30, gap: 12, paddingHorizontal: 20 },
  errorText: { fontSize: 13, color: '#8B95A1', textAlign: 'center' },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#3182F6', borderRadius: 10 },
  retryText: { fontSize: 14, fontWeight: '600', color: '#fff' },

  // 새로고침 버튼
  refreshBtn: {
    marginHorizontal: 20,
    marginTop: 4,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 14,
  },
  refreshText: { fontSize: 14, fontWeight: '600', color: '#3182F6' },
});
