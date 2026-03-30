import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

const METHODS = [
  {
    id: 'receipt',
    emoji: '🧾',
    title: '영수증 촬영',
    desc: '마트에서 받은 영수증을 찍으면 AI가 재료를 자동으로 등록해요',
    color: '#3182F6',
    bg: '#EEF4FF',
  },
  {
    id: 'order',
    emoji: '📱',
    title: '온라인 주문내역 캡처',
    desc: '쿠팡·마켓컬리 등 주문내역 화면을 캡처해서 올리면 자동으로 등록돼요',
    color: '#0EA5E9',
    bg: '#F0F9FF',
  },
  {
    id: 'camera',
    emoji: '📸',
    title: '냉장고 촬영',
    desc: '냉장고 안을 찍으면 AI가 재료를 인식해요',
    color: '#00B050',
    bg: '#EEFFF5',
  },
  {
    id: 'barcode',
    emoji: '🔍',
    title: '바코드 스캔',
    desc: '바코드를 스캔하면 상품 정보가 자동 입력돼요',
    color: '#F56B2A',
    bg: '#FFF4EE',
  },
  {
    id: 'manual',
    emoji: '✏️',
    title: '직접 입력',
    desc: '재료 이름, 수량, 유통기한을 직접 입력할 수 있어요',
    color: '#8B5CF6',
    bg: '#F5F0FF',
  },
];

export default function RegisterScreen() {
  const [selected, setSelected] = useState<string | null>(null);

  function handleNext() {
    router.replace('/(onboarding)/complete');
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      {/* 헤더 */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.replace('/(onboarding)/permissions')}>
          <Text style={styles.backText}>{'‹'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>재료는 이렇게{'\n'}등록할 수 있어요</Text>
        <Text style={styles.sub}>원하는 방법을 골라 바로 시작해보세요</Text>

        {/* 등록 방법 카드 */}
        <View style={styles.cards}>
          {METHODS.map((m) => {
            const isOn = selected === m.id;
            return (
              <TouchableOpacity
                key={m.id}
                style={[
                  styles.card,
                  { borderColor: isOn ? m.color : '#E5E8EB' },
                  isOn && { backgroundColor: m.bg },
                ]}
                onPress={() => setSelected(m.id)}
                activeOpacity={0.8}
              >
                <View style={[styles.emojiBox, { backgroundColor: m.bg }]}>
                  <Text style={styles.emoji}>{m.emoji}</Text>
                </View>
                <View style={styles.cardText}>
                  <Text style={[styles.cardTitle, isOn && { color: m.color }]}>
                    {m.title}
                  </Text>
                  <Text style={styles.cardDesc}>{m.desc}</Text>
                </View>
                {isOn && (
                  <View style={[styles.checkBadge, { backgroundColor: m.color }]}>
                    <Text style={styles.checkMark}>✓</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* 하단 버튼 */}
      <View style={styles.footer}>
        {!selected ? (
          <TouchableOpacity style={styles.skipBtn} onPress={handleNext}>
            <Text style={styles.skipText}>나중에 할게요</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.btn} onPress={handleNext} activeOpacity={0.85}>
            <Text style={styles.btnText}>시작하기</Text>
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

  body: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 24 },
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
    marginBottom: 32,
  },

  cards: { gap: 12 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E5E8EB',
    backgroundColor: '#FAFAFA',
  },
  emojiBox: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  emoji: { fontSize: 26 },
  cardText: { flex: 1 },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111111',
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 13,
    color: '#6B7684',
    lineHeight: 18,
  },
  checkBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkMark: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },

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
