import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Linking,
} from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Constants, { ExecutionEnvironment } from 'expo-constants';

// Expo Go 환경 감지 (SDK 50+)
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

type PermState = 'idle' | 'granted' | 'denied';

export default function PermissionsScreen() {
  const [pushState, setPushState] = useState<PermState>('idle');
  const [listenerState, setListenerState] = useState<PermState>('idle');

  async function requestPushPermission() {
    // Expo Go에서는 원격 푸시 미지원 — 허용됨으로 처리 후 다음 진행
    if (isExpoGo) {
      setPushState('granted');
      return;
    }
    try {
      const Notifications = await import('expo-notifications');
      const { status } = await Notifications.requestPermissionsAsync();
      setPushState(status === 'granted' ? 'granted' : 'denied');
    } catch {
      setPushState('granted');
    }
  }

  function openNotificationListenerSettings() {
    Linking.openSettings();
    setListenerState('granted');
  }

  function handleNext() {
    router.replace('/(onboarding)/register');
  }

  const allDone = pushState === 'granted';

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      {/* 헤더 */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.replace('/(onboarding)/survey')}>
          <Text style={styles.backText}>{'‹'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        <Text style={styles.title}>알림을 허용하면{'\n'}더 편하게 쓸 수 있어요</Text>
        <Text style={styles.sub}>언제든지 설정에서 변경할 수 있어요</Text>

        <View style={styles.cards}>

          {/* 푸시 알림 */}
          <View style={[styles.card, pushState === 'granted' && styles.cardGranted]}>
            <View style={[styles.iconBox, { backgroundColor: '#EEF4FF' }]}>
              <Text style={styles.icon}>🔔</Text>
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>푸시 알림</Text>
              <Text style={styles.cardDesc}>유통기한 임박, 장보기 리마인더 등 중요한 알림을 제때 받아보세요</Text>
            </View>
            {pushState === 'idle' ? (
              <TouchableOpacity style={styles.allowBtn} onPress={requestPushPermission} activeOpacity={0.8}>
                <Text style={styles.allowText}>허용</Text>
              </TouchableOpacity>
            ) : pushState === 'granted' ? (
              <View style={[styles.stateBadge, styles.badgeOn]}>
                <Text style={styles.badgeText}>✓ 허용됨</Text>
              </View>
            ) : (
              <View style={[styles.stateBadge, styles.badgeOff]}>
                <Text style={[styles.badgeText, { color: '#8B95A1' }]}>거부됨</Text>
              </View>
            )}
          </View>

          {/* 배송 알림 감지 */}
          {Platform.OS === 'android' ? (
            <View style={[styles.card, listenerState === 'granted' && styles.cardGranted]}>
              <View style={[styles.iconBox, { backgroundColor: '#FFF4EE' }]}>
                <Text style={styles.icon}>📦</Text>
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle}>배송 알림 자동 인식</Text>
                <Text style={styles.cardDesc}>쿠팡·마켓컬리 배송 완료 알림을 감지해 재료를 자동으로 등록해요</Text>
              </View>
              {listenerState === 'idle' ? (
                <TouchableOpacity
                  style={[styles.allowBtn, { backgroundColor: '#FFF4EE' }]}
                  onPress={openNotificationListenerSettings}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.allowText, { color: '#F56B2A' }]}>설정</Text>
                </TouchableOpacity>
              ) : (
                <View style={[styles.stateBadge, styles.badgeOn]}>
                  <Text style={styles.badgeText}>✓ 설정됨</Text>
                </View>
              )}
            </View>
          ) : (
            <View style={[styles.card, styles.cardInfo]}>
              <View style={[styles.iconBox, { backgroundColor: '#FFF4EE' }]}>
                <Text style={styles.icon}>📦</Text>
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle}>배송 알림 자동 인식</Text>
                <Text style={styles.cardDesc}>iOS에서는 앱 실행 시 클립보드에 복사된 배송 알림을 자동으로 인식해요</Text>
              </View>
              <View style={[styles.stateBadge, { backgroundColor: '#FFF4EE' }]}>
                <Text style={[styles.badgeText, { color: '#F56B2A' }]}>자동</Text>
              </View>
            </View>
          )}
        </View>
      </View>

      {/* 하단 버튼 */}
      <View style={styles.footer}>
        {!allDone ? (
          <TouchableOpacity style={styles.skipBtn} onPress={handleNext}>
            <Text style={styles.skipText}>나중에 설정할게요</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.btn} onPress={handleNext} activeOpacity={0.85}>
            <Text style={styles.btnText}>다음</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },

  header: {
    paddingTop: 56,
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  backText: { fontSize: 28, color: '#111111', lineHeight: 32 },

  body: { flex: 1, paddingHorizontal: 24, paddingTop: 20 },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#111111',
    lineHeight: 36,
    marginBottom: 10,
  },
  sub: {
    fontSize: 15,
    color: '#6B7684',
    lineHeight: 22,
    marginBottom: 36,
  },

  cards: { gap: 12 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E5E8EB',
    backgroundColor: '#FAFAFA',
  },
  cardGranted: {
    borderColor: '#00B050',
    backgroundColor: '#EEFFF5',
  },
  cardInfo: {
    borderColor: '#FDE5D5',
    backgroundColor: '#FFFAF7',
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  icon: { fontSize: 24 },
  cardBody: { flex: 1 },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111111',
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 13,
    color: '#6B7684',
    lineHeight: 19,
  },

  allowBtn: {
    backgroundColor: '#EEF4FF',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    flexShrink: 0,
  },
  allowText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#3182F6',
  },

  stateBadge: {
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    flexShrink: 0,
  },
  badgeOn: { backgroundColor: '#EEFFF5' },
  badgeOff: { backgroundColor: '#F2F4F6' },
  badgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#00B050',
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
  skipBtn: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  skipText: {
    fontSize: 16,
    color: '#8B95A1',
    fontWeight: '500',
  },
});
