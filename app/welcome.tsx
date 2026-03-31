import { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, Dimensions,
  TouchableOpacity, NativeSyntheticEvent, NativeScrollEvent, Image,
} from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFridgeStore } from '../store/fridgeStore';

const { width } = Dimensions.get('window');

const SLIDES = [
  {
    id: '1',
    emoji: '🧊',
    title: '냉장고 박사에\n오신 걸 환영해요!',
    desc: '냉장고 속 재료를 스마트하게 관리하고\n음식 낭비를 줄여보세요',
    bg: '#EEF4FF',
    accent: '#3182F6',
  },
  {
    id: '2',
    emoji: '📷',
    title: '영수증 촬영 한 번으로\n재료 등록 끝!',
    desc: '바코드 스캔, 영수증 촬영, 직접 입력까지\n다양한 방법으로 쉽게 등록해요',
    bg: '#FFF4EE',
    accent: '#F56B2A',
  },
  {
    id: '3',
    emoji: '⏰',
    title: '유통기한이 다가오면\n미리 알려줄게요',
    desc: 'AI가 소비 기한을 자동 계산하고\n버리는 음식이 없도록 도와줘요',
    bg: '#EEFFF5',
    accent: '#00B050',
  },
  {
    id: '4',
    emoji: '🍳',
    title: '지금 있는 재료로\n오늘 메뉴를 추천해요',
    desc: '냉장고 속 재료에 맞춰\nAI가 딱 맞는 레시피를 골라줘요',
    bg: '#FFF8EE',
    accent: '#F5A623',
  },
];

export default function WelcomeScreen() {
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const setHasSeenWelcome = useFridgeStore((s) => s.setHasSeenWelcome);

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const index = Math.round(e.nativeEvent.contentOffset.x / width);
    setActiveIndex(index);
  }

  async function handleStart() {
    await AsyncStorage.setItem('hasSeenWelcome', 'true');
    setHasSeenWelcome(true);
    router.replace('/login');
  }

  function goNext() {
    if (activeIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: activeIndex + 1, animated: true });
    } else {
      handleStart();
    }
  }

  const isLast = activeIndex === SLIDES.length - 1;

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      {/* 건너뛰기 */}
      {!isLast && (
        <TouchableOpacity style={styles.skipBtn} onPress={handleStart}>
          <Text style={styles.skipText}>건너뛰기</Text>
        </TouchableOpacity>
      )}

      <FlatList
        ref={flatListRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={[styles.slide, { backgroundColor: item.bg, width }]}>
            <View style={[styles.emojiCircle, { backgroundColor: item.accent + '22' }]}>
              <Text style={styles.emoji}>{item.emoji}</Text>
            </View>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.desc}>{item.desc}</Text>
          </View>
        )}
      />

      <View style={styles.bottom}>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === activeIndex
                  ? { backgroundColor: '#3182F6', width: 20 }
                  : { backgroundColor: '#D1D5DB', width: 8 },
              ]}
            />
          ))}
        </View>

        <TouchableOpacity style={styles.btn} onPress={goNext} activeOpacity={0.85}>
          <Text style={styles.btnText}>{isLast ? '시작하기' : '다음'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  skipBtn: {
    position: 'absolute',
    top: 56,
    right: 24,
    zIndex: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  skipText: { fontSize: 15, color: '#8B95A1', fontWeight: '500' },
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
    paddingBottom: 120,
  },
  emojiCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
  },
  emoji: { fontSize: 56 },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#111111',
    textAlign: 'center',
    lineHeight: 36,
    marginBottom: 16,
  },
  desc: {
    fontSize: 16,
    color: '#6B7684',
    textAlign: 'center',
    lineHeight: 24,
  },
  bottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingBottom: 48,
    paddingTop: 20,
    backgroundColor: '#FFFFFF',
    gap: 20,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  dot: { height: 8, borderRadius: 4 },
  btn: {
    backgroundColor: '#3182F6',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
});
