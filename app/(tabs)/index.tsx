import { useEffect, useRef, useState } from 'react';
import { Animated, Alert, View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { supabase } from '../../lib/supabase';
import * as Notifications from 'expo-notifications';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Tabs } from 'expo-router';
import { useFridgeStore } from '../../store/fridgeStore';
import { DayInfo, Ingredient } from '../../types';
import { differenceInDays, parseISO } from 'date-fns';
import AddIngredientSheet from '../../components/fridge/AddIngredientSheet';
import ManualAddModal from '../../components/fridge/ManualAddModal';
import CameraIngredientModal from '../../components/fridge/CameraIngredientModal';
import ReceiptScanModal from '../../components/fridge/ReceiptScanModal';
import BarcodeScanModal from '../../components/fridge/BarcodeScanModal';
import EditIngredientModal from '../../components/fridge/EditIngredientModal';
import PackageSelectModal from '../../components/fridge/PackageSelectModal';
import PackageDetailModal from '../../components/fridge/PackageDetailModal';
import { IngredientPackage } from '../../lib/packageData';

// ─── 단계 정의 ───────────────────────────────────────────
const STAGE_THRESHOLDS = [1, 5, 10, 20];
const STAGE_NAMES = ['시작', '해금', '성장', '완성'];
const STAGE_UNLOCKS = ['냉장고 기본 기능', '맞춤 메뉴 추천', '장보기 자동 생성', '절약 리포트'];

const MILESTONE_MESSAGES: Record<number, string> = {
  1: '첫 번째 재료 등록! 냉장고가 깨어나고 있어요 🌱',
  5: '메뉴 추천이 열렸어요! 지금 바로 확인해볼까요? →',
  10: '장보기 목록 기능이 열렸어요!',
  20: '냉장고 완성! 이제 절약 리포트를 확인해보세요 ✨',
};

function getProgressInfo(count: number) {
  for (let i = 0; i < STAGE_THRESHOLDS.length; i++) {
    if (count < STAGE_THRESHOLDS[i]) {
      const prevThreshold = i > 0 ? STAGE_THRESHOLDS[i - 1] : 0;
      const progress = (count - prevThreshold) / (STAGE_THRESHOLDS[i] - prevThreshold);
      return {
        stageName: i > 0 ? STAGE_NAMES[i - 1] : '시작 전',
        nextThreshold: STAGE_THRESHOLDS[i],
        remaining: STAGE_THRESHOLDS[i] - count,
        nextUnlock: STAGE_UNLOCKS[i],
        progress: Math.max(0, progress),
        isComplete: false,
      };
    }
  }
  return { stageName: '완성', nextThreshold: 20, remaining: 0, nextUnlock: null, progress: 1, isComplete: true };
}

// ─── D-Day 계산 ──────────────────────────────────────────
function getDayInfo(expiryDate?: string, aiExpiryDays?: number, purchaseDate?: string): DayInfo | null {
  let targetDate: Date | null = null;
  if (expiryDate) {
    targetDate = parseISO(expiryDate);
  } else if (aiExpiryDays && purchaseDate) {
    const purchase = parseISO(purchaseDate);
    targetDate = new Date(purchase);
    targetDate.setDate(targetDate.getDate() + aiExpiryDays);
  }
  if (!targetDate) return null;
  const daysLeft = differenceInDays(targetDate, new Date());
  let status: DayInfo['status'];
  let label: string;
  if (daysLeft > 7) { status = 'safe'; label = `D-${daysLeft}`; }
  else if (daysLeft > 0) { status = 'warning'; label = `D-${daysLeft}`; }
  else if (daysLeft === 0) { status = 'danger'; label = 'D-DAY'; }
  else { status = 'expired'; label = `D+${Math.abs(daysLeft)}`; }
  return { daysLeft, status, label };
}

const DAY_COLORS = { safe: '#00B493', warning: '#F59E0B', danger: '#F04452', expired: '#8B95A1' };

const CATEGORY_EMOJI: Record<Ingredient['category'], string> = {
  vegetable: '🥦', meat: '🥩', dairy: '🥛', processed: '🍱',
  beverage: '🧃', condiment: '🫙', other: '📦',
};

// 이름 기반 이모지 매핑 (카테고리 fallback 전 먼저 체크)
const NAME_EMOJI_MAP: { keywords: string[]; emoji: string }[] = [
  // 과일
  { keywords: ['사과'], emoji: '🍎' },
  { keywords: ['바나나'], emoji: '🍌' },
  { keywords: ['딸기'], emoji: '🍓' },
  { keywords: ['포도'], emoji: '🍇' },
  { keywords: ['오렌지', '귤'], emoji: '🍊' },
  { keywords: ['레몬'], emoji: '🍋' },
  { keywords: ['복숭아'], emoji: '🍑' },
  { keywords: ['배'], emoji: '🍐' },
  { keywords: ['수박'], emoji: '🍉' },
  { keywords: ['멜론'], emoji: '🍈' },
  { keywords: ['체리'], emoji: '🍒' },
  { keywords: ['블루베리'], emoji: '🫐' },
  { keywords: ['망고'], emoji: '🥭' },
  { keywords: ['파인애플'], emoji: '🍍' },
  { keywords: ['코코넛'], emoji: '🥥' },
  { keywords: ['키위'], emoji: '🥝' },
  { keywords: ['토마토'], emoji: '🍅' },
  // 한국 나물·쌈채소
  { keywords: ['냉이', '쑥', '달래', '미나리', '깻잎', '부추', '취나물', '고사리'], emoji: '🌿' },
  { keywords: ['숙주', '콩나물'], emoji: '🌱' },
  { keywords: ['아보카도'], emoji: '🥑' },
  { keywords: ['대란', '왕란', '특란', '중란', '유정란', '메추리알'], emoji: '🥚' },
  { keywords: ['국수', '파스타', '스파게티', '우동', '소면', '냉면'], emoji: '🍝' },
  { keywords: ['견과', '아몬드', '호두', '땅콩', '캐슈', '잣'], emoji: '🥜' },
  // 채소
  { keywords: ['당근'], emoji: '🥕' },
  { keywords: ['브로콜리'], emoji: '🥦' },
  { keywords: ['옥수수'], emoji: '🌽' },
  { keywords: ['고추', '피망', '파프리카'], emoji: '🌶️' },
  { keywords: ['오이'], emoji: '🥒' },
  { keywords: ['가지'], emoji: '🍆' },
  { keywords: ['호박'], emoji: '🎃' },
  { keywords: ['마늘'], emoji: '🧄' },
  { keywords: ['양파'], emoji: '🧅' },
  { keywords: ['감자'], emoji: '🥔' },
  { keywords: ['고구마'], emoji: '🍠' },
  { keywords: ['버섯'], emoji: '🍄' },
  { keywords: ['상추', '양상추', '시금치', '배추', '양배추'], emoji: '🥬' },
  { keywords: ['대파', '쪽파', '파'], emoji: '🌿' },
  { keywords: ['생강'], emoji: '🫚' },
  // 고기·해산물
  { keywords: ['치킨', '닭가슴살', '닭다리', '닭날개', '닭볶음', '닭'], emoji: '🍗' },
  { keywords: ['소고기', '쇠고기', '갈비', '스테이크', '안심', '등심'], emoji: '🥩' },
  { keywords: ['돼지고기', '삼겹살', '목살', '앞다리'], emoji: '🥩' },
  { keywords: ['햄', '소시지'], emoji: '🌭' },
  { keywords: ['베이컨'], emoji: '🥓' },
  { keywords: ['새우'], emoji: '🍤' },
  { keywords: ['연어'], emoji: '🐟' },
  { keywords: ['참치', '고등어', '갈치', '생선'], emoji: '🐟' },
  { keywords: ['오징어', '낙지', '문어'], emoji: '🦑' },
  { keywords: ['조개', '굴', '홍합'], emoji: '🦪' },
  { keywords: ['게', '랍스터'], emoji: '🦀' },
  // 유제품·달걀
  { keywords: ['계란', '달걀'], emoji: '🥚' },
  { keywords: ['우유'], emoji: '🥛' },
  { keywords: ['치즈'], emoji: '🧀' },
  { keywords: ['버터'], emoji: '🧈' },
  { keywords: ['요거트', '요구르트'], emoji: '🥛' },
  { keywords: ['크림', '생크림'], emoji: '🥛' },
  // 음료
  { keywords: ['맥주'], emoji: '🍺' },
  { keywords: ['와인'], emoji: '🍷' },
  { keywords: ['주스', '음료'], emoji: '🧃' },
  { keywords: ['콜라', '사이다'], emoji: '🥤' },
  { keywords: ['커피'], emoji: '☕' },
  { keywords: ['물'], emoji: '💧' },
  // 조미료
  { keywords: ['소금'], emoji: '🧂' },
  { keywords: ['설탕', '꿀'], emoji: '🍯' },
  { keywords: ['올리브유', '식용유', '참기름', '들기름'], emoji: '🫒' },
  { keywords: ['간장', '고추장', '된장', '쌈장', '굴소스'], emoji: '🫙' },
  { keywords: ['식초'], emoji: '🫙' },
  // 가공·기타
  { keywords: ['라면'], emoji: '🍜' },
  { keywords: ['쌀', '현미'], emoji: '🌾' },
  { keywords: ['밥'], emoji: '🍚' },
  { keywords: ['빵'], emoji: '🍞' },
  { keywords: ['두부', '순두부', '연두부'], emoji: '🫘' },
  { keywords: ['김치'], emoji: '🥬' },
  { keywords: ['피자'], emoji: '🍕' },
  { keywords: ['초콜릿'], emoji: '🍫' },
  { keywords: ['아이스크림'], emoji: '🍦' },
  { keywords: ['케이크'], emoji: '🎂' },
  { keywords: ['과자', '칩'], emoji: '🍿' },
];

function getIngredientEmoji(name: string, category: Ingredient['category']): string {
  const lower = name.toLowerCase();
  for (const { keywords, emoji } of NAME_EMOJI_MAP) {
    if (keywords.some((k) => lower.includes(k))) return emoji;
  }
  return CATEGORY_EMOJI[category] ?? '📦';
}

// ─── 현황 카드 ───────────────────────────────────────────
function StatusCard({ activeCount, nudgeMessage }: { activeCount: number; nudgeMessage: string | null }) {
  const info = getProgressInfo(activeCount);
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: info.progress,
      duration: 600,
      useNativeDriver: false,
    }).start();
  }, [info.progress]);

  if (activeCount === 0) return null;

  return (
    <View style={scStyles.card}>
      <View style={scStyles.topRow}>
        <Text style={scStyles.stageName}>{info.stageName} 단계</Text>
        <Text style={scStyles.count}>{activeCount}개 등록됨</Text>
      </View>

      <View style={scStyles.barBg}>
        <Animated.View
          style={[scStyles.barFill, {
            width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
          }]}
        />
      </View>

      {!info.isComplete && (
        <Text style={scStyles.hint}>
          <Text style={scStyles.hintBold}>{info.remaining}개</Text>
          {' '}더 추가하면{' '}
          <Text style={scStyles.hintBold}>{info.nextUnlock}</Text>
          {' '}해금
        </Text>
      )}

      {nudgeMessage ? (
        <Text style={scStyles.nudge}>{nudgeMessage}</Text>
      ) : (
        <Text style={scStyles.motivation}>재료를 상세히 등록한 유저는 평균 월 34,000원 절약해요</Text>
      )}
    </View>
  );
}

// ─── 홈 화면 ─────────────────────────────────────────────
export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const bottomInset = insets.bottom;

  const TAB_BAR_STYLE = {
    backgroundColor: '#FFFFFF',
    borderTopColor: '#F2F4F6',
    borderTopWidth: 1,
    height: (Platform.OS === 'ios' ? 76 : 58) + bottomInset,
    paddingBottom: (Platform.OS === 'ios' ? 18 : 10) + bottomInset,
    paddingTop: 8,
  };

  const { fridge, ingredients, updateIngredient, isLoading } = useFridgeStore();

  const [sheetVisible, setSheetVisible] = useState(false);
  const [manualVisible, setManualVisible] = useState(false);
  const [cameraVisible, setCameraVisible] = useState(false);
  const [receiptVisible, setReceiptVisible] = useState(false);
  const [barcodeVisible, setBarcodeVisible] = useState(false);
  const [packageSelectVisible, setPackageSelectVisible] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<IngredientPackage | null>(null);
  const [editItem, setEditItem] = useState<Ingredient | null>(null);
  const [undoItem, setUndoItem] = useState<{ item: Ingredient; type: 'eaten' | 'discarded' } | null>(null);
  const [milestoneMsg, setMilestoneMsg] = useState<string | null>(null);
  const [storageTab, setStorageTab] = useState<'fridge' | 'freezer' | 'room_temp'>('fridge');
  const [sortBy, setSortBy] = useState<'recent' | 'name' | 'dday'>('recent');

  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const milestoneTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressAnim = useRef(new Animated.Value(1)).current;
  const toastSlide = useRef(new Animated.Value(80)).current;
  const milestoneSlide = useRef(new Animated.Value(120)).current;
  const prevActiveCountRef = useRef<number | null>(null);

  const activeIngredients = ingredients.filter((i) => !i.is_consumed);
  const activeCount = activeIngredients.length;

  // 카테고리 밸런스 넛지
  const hasFridge = activeIngredients.some((i) => i.storage_type === 'fridge');
  const hasFreezer = activeIngredients.some((i) => i.storage_type === 'freezer');
  const hasRoomTemp = activeIngredients.some((i) => i.storage_type === 'room_temp');

  let nudgeMessage: string | null = null;
  if (activeCount >= 3) {
    if (hasFridge && !hasFreezer && !hasRoomTemp) {
      nudgeMessage = '냉동/양념류도 등록하면 메뉴 추천이 더 정확해져요';
    } else if ((hasFridge || hasFreezer) && !hasRoomTemp) {
      nudgeMessage = '간장·된장 같은 양념류 등록하면 레시피가 2배 풍부해져요';
    }
  }

  // 인치스톤 감지
  useEffect(() => {
    if (prevActiveCountRef.current === null) {
      prevActiveCountRef.current = activeCount;
      return;
    }
    const prev = prevActiveCountRef.current;
    prevActiveCountRef.current = activeCount;

    for (const milestone of [20, 10, 5, 1]) {
      if (activeCount >= milestone && prev < milestone) {
        showMilestoneToast(MILESTONE_MESSAGES[milestone]);
        break;
      }
    }
  }, [activeCount]);

  function showMilestoneToast(msg: string) {
    setMilestoneMsg(msg);
    milestoneSlide.setValue(120);
    Animated.spring(milestoneSlide, { toValue: 0, useNativeDriver: true, tension: 80, friction: 12 }).start();
    if (milestoneTimeoutRef.current) clearTimeout(milestoneTimeoutRef.current);
    milestoneTimeoutRef.current = setTimeout(() => {
      Animated.timing(milestoneSlide, { toValue: 120, duration: 300, useNativeDriver: true }).start(() => setMilestoneMsg(null));
    }, 3500);
  }

  // 되돌리기 토스트
  useEffect(() => {
    if (undoItem) {
      toastSlide.setValue(80);
      progressAnim.setValue(1);
      Animated.spring(toastSlide, { toValue: 0, useNativeDriver: true, tension: 80, friction: 12 }).start();
      Animated.timing(progressAnim, { toValue: 0, duration: 3000, useNativeDriver: false }).start();
      undoTimeoutRef.current = setTimeout(() => setUndoItem(null), 3000);
    }
    return () => { if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current); };
  }, [undoItem]);

  async function handleUndo() {
    if (!undoItem) return;
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    progressAnim.stopAnimation();
    const { item } = undoItem;
    const rollback: Partial<Ingredient> = {
      is_consumed: false, consumed_type: undefined, consumed_at: undefined,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('ingredients').update({
      is_consumed: false, consumed_type: null, consumed_at: null, updated_at: rollback.updated_at,
    }).eq('id', item.id);
    if (error) { Alert.alert('되돌리기 실패', error.message); }
    else { updateIngredient(item.id, rollback); }
    setUndoItem(null);
  }

  const anyModalOpen = sheetVisible || manualVisible || cameraVisible || receiptVisible || barcodeVisible || packageSelectVisible || !!selectedPackage || !!editItem;

  function sortItems(items: Ingredient[]) {
    if (sortBy === 'name') return [...items].sort((a, b) => a.name.localeCompare(b.name));
    if (sortBy === 'dday') {
      return [...items].sort((a, b) => {
        const da = getDayInfo(a.expiry_date, a.ai_expiry_days, a.purchase_date);
        const db = getDayInfo(b.expiry_date, b.ai_expiry_days, b.purchase_date);
        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        return da.daysLeft - db.daysLeft;
      });
    }
    return items; // 'recent': 기본 등록 역순 (store에서 이미 최신순)
  }

  const fridgeItems = sortItems(activeIngredients.filter((i) => i.storage_type === 'fridge'));
  const freezerItems = sortItems(activeIngredients.filter((i) => i.storage_type === 'freezer'));
  const roomTempItems = sortItems(activeIngredients.filter((i) => i.storage_type === 'room_temp'));
  const urgentItems = activeIngredients.filter((i) => {
    const info = getDayInfo(i.expiry_date, i.ai_expiry_days, i.purchase_date);
    return info && info.daysLeft <= 3;
  });

  return (
    <>
      <Tabs.Screen options={{ tabBarStyle: anyModalOpen ? { display: 'none' } : TAB_BAR_STYLE }} />
      <View style={[styles.container, { paddingTop: insets.top }]}>

        {/* 헤더 — 고정 */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>{fridge?.name ?? '우리 냉장고'}</Text>
            {__DEV__ && (
              <TouchableOpacity
                style={styles.testNotifBtn}
                onPress={async () => {
                  const testIngredient = ingredients.find((i) => !i.is_consumed);
                  await Notifications.scheduleNotificationAsync({
                    content: {
                      title: `⚠️ ${testIngredient?.name ?? '두부'} 소비기한 D-3`,
                      body: '3일 남았어요. 오늘 요리에 활용해보세요!',
                      sound: true,
                      data: testIngredient ? { ingredientId: testIngredient.id } : {},
                    },
                    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5 },
                  });
                  Alert.alert('테스트 알림 예약됨', `5초 후 알림이 와요.\n앱을 백그라운드로 내려보세요.`);
                }}
              >
                <Text style={styles.testNotifBtnText}>🔔 테스트</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.headerSubtitle}>
            전체 {activeCount}개
            {urgentItems.length > 0 && (
              <Text style={styles.urgentBadge}> · 임박 {urgentItems.length}개</Text>
            )}
          </Text>
        </View>

        {/* 전체 스크롤 — 현황/임박은 스크롤, 보관탭은 sticky */}
        <ScrollView showsVerticalScrollIndicator={false} stickyHeaderIndices={[1]}>

          {/* index 0: scrollable — 현황 카드 + 임박 재료 */}
          <View>
            <StatusCard activeCount={activeCount} nudgeMessage={nudgeMessage} />
            {urgentItems.length > 0 && (
              <View style={[styles.section, { marginBottom: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }]}>
                <View style={styles.urgentHeader}>
                  <Text style={styles.sectionTitle}>⚠️ 곧 소비해야 해요</Text>
                  <View style={styles.urgentCountBadge}>
                    <Text style={styles.urgentCountText}>{urgentItems.length}</Text>
                  </View>
                </View>
                {urgentItems.map((item) => {
                  const info = getDayInfo(item.expiry_date, item.ai_expiry_days, item.purchase_date);
                  const borderColor = info ? DAY_COLORS[info.status] : '#F59E0B';
                  const bgColor = info?.status === 'danger' ? '#FFF5F5' :
                                  info?.status === 'expired' ? '#F9FAFB' : '#FFFBEB';
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.urgentCard, { borderLeftWidth: 3, borderLeftColor: borderColor, backgroundColor: bgColor, paddingLeft: 10 }]}
                      onPress={() => setEditItem(item)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.itemEmoji}>{getIngredientEmoji(item.name, item.category)}</Text>
                      <Text style={styles.ingredientName}>{item.name}</Text>
                      {info && <Text style={[styles.dayBadge, { color: DAY_COLORS[info.status] }]}>{info.label}</Text>}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>

          {/* index 1: sticky — 보관 유형 탭 */}
          <View style={{ backgroundColor: '#F9FAFB' }}>
          <View style={styles.storageTabs}>
            {([
              { key: 'fridge', label: '❄️ 냉장', count: fridgeItems.length },
              { key: 'freezer', label: '🧊 냉동', count: freezerItems.length },
              { key: 'room_temp', label: '🌡️ 실온', count: roomTempItems.length },
            ] as const).map((tab) => (
              <TouchableOpacity
                key={tab.key}
                style={[styles.storageTab, storageTab === tab.key && styles.storageTabActive]}
                onPress={() => setStorageTab(tab.key)}
              >
                <Text style={[styles.storageTabText, storageTab === tab.key && styles.storageTabTextActive]}>
                  {tab.label}
                </Text>
                {tab.count > 0 && (
                  <View style={[styles.storageTabBadge, storageTab === tab.key && styles.storageTabBadgeActive]}>
                    <Text style={[styles.storageTabBadgeText, storageTab === tab.key && styles.storageTabBadgeTextActive]}>
                      {tab.count}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
          </View>

          {/* 정렬 토글 */}
          {activeCount > 0 && (
            <View style={styles.sortRow}>
              {([
                { key: 'recent', label: '최근 등록' },
                { key: 'dday', label: 'D-day순' },
                { key: 'name', label: '이름순' },
              ] as const).map((s) => (
                <TouchableOpacity
                  key={s.key}
                  style={[styles.sortChip, sortBy === s.key && styles.sortChipActive]}
                  onPress={() => setSortBy(s.key)}
                >
                  <Text style={[styles.sortChipText, sortBy === s.key && styles.sortChipTextActive]}>
                    {s.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* index 2+: scrollable — 재료 목록 */}
          {storageTab === 'fridge' && <IngredientSection items={fridgeItems} onPressItem={setEditItem} />}
          {storageTab === 'freezer' && <IngredientSection items={freezerItems} onPressItem={setEditItem} />}
          {storageTab === 'room_temp' && <IngredientSection items={roomTempItems} onPressItem={setEditItem} />}

          {isLoading && activeCount === 0 && (
            <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <View key={n} style={styles.skeletonRow}>
                  <View style={styles.skeletonEmoji} />
                  <View style={{ flex: 1, gap: 6 }}>
                    <View style={[styles.skeletonLine, { width: `${45 + (n % 3) * 20}%` }]} />
                    <View style={[styles.skeletonLine, { width: '30%', height: 10 }]} />
                  </View>
                  <View style={styles.skeletonBadge} />
                </View>
              ))}
            </View>
          )}
          {!isLoading && activeCount === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>🫙</Text>
              <Text style={styles.emptyTitle}>냉장고가 비어있어요</Text>
              <Text style={styles.emptyDesc}>
                재료를 5개 이상 등록하면{'\n'}
                맞춤 메뉴 추천이 열려요 🍳
              </Text>
              <View style={styles.emptyHints}>
                <Text style={styles.emptyHint}>📸 카메라로 재료 스캔</Text>
                <Text style={styles.emptyHint}>🧾 영수증으로 일괄 등록</Text>
                <Text style={styles.emptyHint}>📦 자주 쓰는 재료 패키지</Text>
              </View>
              <TouchableOpacity style={styles.emptyCta} onPress={() => setSheetVisible(true)}>
                <Text style={styles.emptyCtaText}>+ 첫 재료 등록하기</Text>
              </TouchableOpacity>
            </View>
          )}
          {activeCount > 0 && [fridgeItems, freezerItems, roomTempItems][[0,1,2][['fridge','freezer','room_temp'].indexOf(storageTab)]].length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>📭</Text>
              <Text style={styles.emptyTitle}>등록된 재료가 없어요</Text>
            </View>
          )}
          <View style={{ height: 100 }} />
        </ScrollView>

        {/* FAB */}
        <TouchableOpacity style={styles.fab} onPress={() => setSheetVisible(true)}>
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>

        <AddIngredientSheet
          visible={sheetVisible} onClose={() => setSheetVisible(false)}
          onSelectManual={() => setManualVisible(true)} onSelectCamera={() => setCameraVisible(true)}
          onSelectReceipt={() => setReceiptVisible(true)} onSelectBarcode={() => setBarcodeVisible(true)}
          onSelectPackage={() => setPackageSelectVisible(true)}
        />
        <ManualAddModal visible={manualVisible} onClose={() => setManualVisible(false)} />
        <CameraIngredientModal visible={cameraVisible} onClose={() => setCameraVisible(false)} />
        <ReceiptScanModal visible={receiptVisible} onClose={() => setReceiptVisible(false)} />
        <BarcodeScanModal visible={barcodeVisible} onClose={() => setBarcodeVisible(false)} />
        <EditIngredientModal item={editItem} onClose={() => setEditItem(null)} onConsumed={(item, type) => setUndoItem({ item, type })} />
        <PackageSelectModal
          visible={packageSelectVisible}
          onClose={() => setPackageSelectVisible(false)}
          onSelectPackage={(pkg) => {
            setPackageSelectVisible(false);
            setTimeout(() => setSelectedPackage(pkg), 300);
          }}
        />
        <PackageDetailModal
          visible={!!selectedPackage}
          pkg={selectedPackage}
          onClose={() => setSelectedPackage(null)}
          onAdded={(count) => {
            setSelectedPackage(null);
            showMilestoneToast(`${count}가지 재료를 한 번에 추가했어요! 🎉`);
          }}
        />

        {/* 인치스톤 토스트 (하단 플로팅) */}
        {milestoneMsg && (
          <Animated.View style={[styles.milestoneToast, { transform: [{ translateY: milestoneSlide }] }]}>
            <Text style={styles.milestoneText}>{milestoneMsg}</Text>
          </Animated.View>
        )}

        {/* 소진 처리 되돌리기 토스트 (하단) */}
        {undoItem && (
          <Animated.View style={[styles.toast, { transform: [{ translateY: toastSlide }] }]}>
            <View style={styles.toastProgressBar}>
              <Animated.View
                style={[
                  styles.toastProgress,
                  undoItem.type === 'eaten' ? styles.toastProgressEaten : styles.toastProgressDiscarded,
                  { width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
                ]}
              />
            </View>
            <View style={styles.toastContent}>
              <Text style={styles.toastText}>
                {undoItem.type === 'eaten' ? '😋 먹었어요로 기록했어요' : '🗑️ 버렸어요로 기록했어요'}
              </Text>
              <TouchableOpacity style={styles.undoBtn} onPress={handleUndo}>
                <Text style={styles.undoBtnText}>되돌리기</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}
      </View>
    </>
  );
}

// ─── 재료 섹션 ───────────────────────────────────────────
function IngredientSection({ items, onPressItem }: {
  items: Ingredient[]; onPressItem: (item: Ingredient) => void;
}) {
  if (items.length === 0) return null;
  return (
    <View style={styles.section}>
      {items.map((item) => {
        const info = getDayInfo(item.expiry_date, item.ai_expiry_days, item.purchase_date);
        return (
          <TouchableOpacity key={item.id} style={styles.ingredientRow} onPress={() => onPressItem(item)} activeOpacity={0.7}>
            <Text style={styles.itemEmoji}>{getIngredientEmoji(item.name, item.category)}</Text>
            <Text style={styles.ingredientName}>{item.name}</Text>
            <Text style={styles.ingredientQty}>{item.quantity}{item.unit}</Text>
            {info && <Text style={[styles.dayBadge, { color: DAY_COLORS[info.status] }]}>{info.label}</Text>}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── 현황 카드 스타일 ─────────────────────────────────────
const scStyles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#F2F4F6',
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  stageName: { fontSize: 13, fontWeight: '600', color: '#3182F6' },
  count: { fontSize: 13, color: '#8B95A1' },
  barBg: { height: 6, backgroundColor: '#F2F4F6', borderRadius: 3, marginBottom: 8 },
  barFill: { height: 6, backgroundColor: '#3182F6', borderRadius: 3 },
  hint: { fontSize: 12, color: '#4E5968', marginBottom: 4 },
  hintBold: { fontWeight: '700', color: '#191F28' },
  motivation: { fontSize: 12, color: '#8B95A1' },
  nudge: { fontSize: 12, color: '#F59E0B', fontWeight: '500' },
});

// ─── 메인 스타일 ──────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#191F28' },
  headerSubtitle: { fontSize: 14, color: '#8B95A1', marginTop: 4 },
  testNotifBtn: { backgroundColor: '#FFF3CD', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  testNotifBtnText: { fontSize: 12, color: '#856404', fontWeight: '600' },
  urgentBadge: { color: '#F04452', fontWeight: '600' },
  section: {
    backgroundColor: '#FFFFFF', marginHorizontal: 16, marginBottom: 12,
    borderRadius: 12, padding: 16,
  },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: '#191F28' },
  urgentHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  urgentCountBadge: {
    backgroundColor: '#F04452', borderRadius: 10,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  urgentCountText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
  urgentCard: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#F2F4F6',
  },
  ingredientRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#F2F4F6',
  },
  itemEmoji: { fontSize: 20, marginRight: 10, width: 28, textAlign: 'center' },
  ingredientName: { flex: 1, fontSize: 15, color: '#191F28' },
  ingredientQty: { fontSize: 13, color: '#8B95A1', marginRight: 12 },
  dayBadge: { fontSize: 13, fontWeight: '600', minWidth: 44, textAlign: 'right' },
  storageTabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    backgroundColor: '#F2F4F6',
    borderRadius: 10,
    padding: 3,
  },
  storageTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 5,
  },
  storageTabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 2,
  },
  storageTabText: { fontSize: 13, fontWeight: '500', color: '#8B95A1' },
  storageTabTextActive: { color: '#191F28', fontWeight: '700' },
  storageTabBadge: {
    backgroundColor: '#D1D6DB',
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: 'center',
  },
  storageTabBadgeActive: { backgroundColor: '#3182F6' },
  storageTabBadgeText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
  storageTabBadgeTextActive: { color: '#FFFFFF' },
  sortRow: {
    flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 8, gap: 6,
  },
  sortChip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14,
    borderWidth: 1, borderColor: '#E5E8EB', backgroundColor: '#FFFFFF',
  },
  sortChipActive: { backgroundColor: '#191F28', borderColor: '#191F28' },
  sortChipText: { fontSize: 12, color: '#8B95A1', fontWeight: '500' },
  sortChipTextActive: { color: '#FFFFFF', fontWeight: '600' },
  emptyState: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 32 },
  emptyEmoji: { fontSize: 56, marginBottom: 20 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#191F28', marginBottom: 10 },
  emptyDesc: { fontSize: 14, color: '#8B95A1', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  emptyHints: { gap: 8, marginBottom: 28, alignSelf: 'stretch' },
  emptyHint: {
    fontSize: 13, color: '#4E5968', backgroundColor: '#F9FAFB',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    textAlign: 'center',
  },
  emptyCta: {
    backgroundColor: '#3182F6', borderRadius: 14, paddingVertical: 14,
    paddingHorizontal: 32,
  },
  emptyCtaText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  // 스켈레톤 로딩
  skeletonRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F2F4F6',
  },
  skeletonEmoji: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#E5E8EB' },
  skeletonLine: { height: 14, borderRadius: 7, backgroundColor: '#E5E8EB' },
  skeletonBadge: { width: 40, height: 22, borderRadius: 11, backgroundColor: '#E5E8EB' },
  fab: {
    position: 'absolute', bottom: 20, right: 20,
    width: 56, height: 56, borderRadius: 28, backgroundColor: '#3182F6',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#3182F6', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 8,
  },
  fabText: { fontSize: 28, color: '#FFFFFF', lineHeight: 32 },
  // 인치스톤 토스트 (하단 플로팅 카드)
  milestoneToast: {
    position: 'absolute', bottom: 90, left: 16, right: 16,
    backgroundColor: '#191F28', paddingHorizontal: 20, paddingVertical: 14,
    borderRadius: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 8, elevation: 8,
  },
  milestoneText: { fontSize: 14, color: '#FFFFFF', fontWeight: '600', textAlign: 'center' },
  // 소진 토스트 (하단)
  toast: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#1F2937', borderTopLeftRadius: 16, borderTopRightRadius: 16, overflow: 'hidden',
  },
  toastProgressBar: { height: 3, backgroundColor: 'rgba(255,255,255,0.15)' },
  toastProgress: { height: 3 },
  toastProgressEaten: { backgroundColor: '#34D399' },
  toastProgressDiscarded: { backgroundColor: '#F87171' },
  toastContent: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 18,
  },
  toastText: { fontSize: 15, color: '#FFFFFF', fontWeight: '500' },
  undoBtn: { backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8 },
  undoBtnText: { fontSize: 14, color: '#FFFFFF', fontWeight: '600' },
});
