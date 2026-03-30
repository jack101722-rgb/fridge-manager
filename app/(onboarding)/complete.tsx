import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../../lib/supabase';
import { useFridgeStore } from '../../store/fridgeStore';

const FLOW_STEPS = [
  {
    emoji: '📸',
    title: '재료 등록',
    desc: '영수증·주문내역·바코드·직접 입력으로 냉장고 속 재료를 등록해요',
  },
  {
    emoji: '⏰',
    title: '유통기한 자동 계산',
    desc: 'AI가 재료별 소비 기한을 예측하고, 임박하면 미리 알려줘요',
  },
  {
    emoji: '🍳',
    title: 'AI 메뉴 추천',
    desc: '냉장고 재료를 기반으로 지금 바로 만들 수 있는 메뉴를 추천해줘요',
  },
  {
    emoji: '📊',
    title: '월간 절약 리포트',
    desc: '버린 음식이 얼마나 줄었는지, 얼마나 절약했는지 매달 리포트로 알 수 있어요',
  },
];

export default function CompleteScreen() {
  const user = useFridgeStore((s) => s.user);
  const setUser = useFridgeStore((s) => s.setUser);

  const [saving, setSaving] = useState(false);

  const badgeScale = useRef(new Animated.Value(0)).current;
  const badgeOpacity = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.parallel([
        Animated.spring(badgeScale, {
          toValue: 1,
          friction: 5,
          tension: 80,
          useNativeDriver: true,
        }),
        Animated.timing(badgeOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, []);

  async function handleStart() {
    if (!user) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('users')
        .update({
          onboarding_completed: true,
          onboarding_completed_at: now,
          is_earlybird: true,
        })
        .eq('id', user.id);

      if (error) throw error;

      setUser({
        ...user,
        onboarding_completed: true,
        onboarding_completed_at: now,
        is_earlybird: true,
      });

      router.replace('/(tabs)');
    } catch (e) {
      Alert.alert('오류', '잠시 후 다시 시도해주세요.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Animated.View style={{ opacity: contentOpacity, width: '100%', alignItems: 'center' }}>

          {/* 상단 */}
          <Text style={styles.topEmoji}>🎉</Text>
          <Text style={styles.title}>준비 완료!</Text>
          <Text style={styles.sub}>이제 냉장고를 스마트하게 관리할 준비가 됐어요</Text>

          {/* 얼리버드 뱃지 */}
          <Animated.View
            style={[
              styles.badge,
              { opacity: badgeOpacity, transform: [{ scale: badgeScale }] },
            ]}
          >
            <Text style={styles.badgeEmoji}>🐦</Text>
            <View style={styles.badgeInfo}>
              <View style={styles.badgeRow}>
                <Text style={styles.badgeName}>얼리버드 뱃지</Text>
                <View style={styles.badgeNewTag}>
                  <Text style={styles.badgeNewText}>NEW</Text>
                </View>
              </View>
              <Text style={styles.badgeDesc}>앱 출시 초기 가입자에게만 드리는 특별 뱃지예요. 추후 업데이트되는 프리미엄 기능을 가장 먼저 무료로 체험할 수 있어요.</Text>
            </View>
          </Animated.View>

          {/* 기능 흐름 */}
          <Text style={styles.flowTitle}>이렇게 연결돼요</Text>

          <View style={styles.flowList}>
            {FLOW_STEPS.map((step, i) => (
              <View key={step.title}>
                <View style={styles.flowItem}>
                  <View style={styles.flowEmojiBox}>
                    <Text style={styles.flowEmoji}>{step.emoji}</Text>
                  </View>
                  <View style={styles.flowText}>
                    <Text style={styles.flowItemTitle}>{step.title}</Text>
                    <Text style={styles.flowItemDesc}>{step.desc}</Text>
                  </View>
                </View>
                {i < FLOW_STEPS.length - 1 && (
                  <Text style={styles.flowArrow}>↓</Text>
                )}
              </View>
            ))}
          </View>

        </Animated.View>
      </ScrollView>

      {/* 시작하기 버튼 */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.btn}
          onPress={handleStart}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.btnText}>냉장고 관리 시작하기</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },

  body: {
    paddingTop: 72,
    paddingHorizontal: 24,
    paddingBottom: 24,
    alignItems: 'center',
  },

  topEmoji: { fontSize: 56, marginBottom: 16, textAlign: 'center' },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 10,
    textAlign: 'center',
  },
  sub: {
    fontSize: 16,
    color: '#6B7684',
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 32,
  },

  // 얼리버드 뱃지
  badge: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    width: '100%',
    padding: 18,
    borderRadius: 18,
    backgroundColor: '#FFFBEB',
    borderWidth: 1.5,
    borderColor: '#FCD34D',
    marginBottom: 36,
  },
  badgeEmoji: { fontSize: 32, marginTop: 2 },
  badgeInfo: { flex: 1 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  badgeName: { fontSize: 16, fontWeight: '700', color: '#92400E' },
  badgeNewTag: {
    backgroundColor: '#F59E0B',
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 7,
  },
  badgeNewText: { fontSize: 11, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.5 },
  badgeDesc: { fontSize: 13, color: '#B45309', lineHeight: 19 },

  // 기능 흐름
  flowTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111111',
    alignSelf: 'flex-start',
    marginBottom: 20,
  },
  flowList: { width: '100%', gap: 0 },
  flowItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  flowEmojiBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F2F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  flowEmoji: { fontSize: 22 },
  flowText: { flex: 1, paddingTop: 2 },
  flowItemTitle: { fontSize: 15, fontWeight: '700', color: '#111111', marginBottom: 3 },
  flowItemDesc: { fontSize: 13, color: '#6B7684', lineHeight: 19 },
  flowArrow: {
    fontSize: 18,
    color: '#D1D5DB',
    textAlign: 'center',
    marginLeft: 13,
    paddingVertical: 6,
  },

  footer: {
    paddingHorizontal: 24,
    paddingBottom: 48,
    paddingTop: 12,
    backgroundColor: '#FFFFFF',
  },
  btn: {
    backgroundColor: '#3182F6',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
});
