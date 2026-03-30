import { useEffect, useRef } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelectManual: () => void;
  onSelectCamera: () => void;
  onSelectReceipt: () => void;
  onSelectBarcode: () => void;
  onSelectPackage: () => void;
}

export default function AddIngredientSheet({
  visible,
  onClose,
  onSelectManual,
  onSelectCamera,
  onSelectReceipt,
  onSelectBarcode,
  onSelectPackage,
}: Props) {
  const slideAnim = useRef(new Animated.Value(300)).current;

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
        toValue: 300,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
        <View style={styles.handle} />
        <Text style={styles.title}>재료 추가</Text>

        <TouchableOpacity
          style={styles.option}
          onPress={() => { onClose(); setTimeout(onSelectPackage, 250); }}
        >
          <View style={[styles.optionIcon, { backgroundColor: '#F5F3FF' }]}>
            <Text style={styles.optionEmoji}>🛍️</Text>
          </View>
          <View style={styles.optionText}>
            <View style={styles.optionTitleRow}>
              <Text style={styles.optionTitle}>재료 패키지</Text>
              <View style={styles.recommendBadge}><Text style={styles.recommendBadgeText}>추천</Text></View>
            </View>
            <Text style={styles.optionDesc}>카테고리별 재료 묶음을 한 번에 추가해요</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.option}
          onPress={() => { onClose(); setTimeout(onSelectManual, 250); }}
        >
          <View style={[styles.optionIcon, { backgroundColor: '#EBF3FF' }]}>
            <Text style={styles.optionEmoji}>✏️</Text>
          </View>
          <View style={styles.optionText}>
            <Text style={styles.optionTitle}>직접 입력</Text>
            <Text style={styles.optionDesc}>재료명을 입력하면 AI가 정보를 채워줘요</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.option}
          onPress={() => { onClose(); setTimeout(onSelectCamera, 250); }}
        >
          <View style={[styles.optionIcon, { backgroundColor: '#E6FAF5' }]}>
            <Text style={styles.optionEmoji}>📸</Text>
          </View>
          <View style={styles.optionText}>
            <Text style={styles.optionTitle}>냉장고 카메라</Text>
            <Text style={styles.optionDesc}>사진 찍으면 AI가 재료를 자동으로 인식해요</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.option}
          onPress={() => { onClose(); setTimeout(onSelectReceipt, 250); }}
        >
          <View style={[styles.optionIcon, { backgroundColor: '#FFFBEB' }]}>
            <Text style={styles.optionEmoji}>🧾</Text>
          </View>
          <View style={styles.optionText}>
            <Text style={styles.optionTitle}>영수증/주문내역 스캔</Text>
            <Text style={styles.optionDesc}>영수증 찍으면 식재료를 한 번에 등록해요</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.option}
          onPress={() => { onClose(); setTimeout(onSelectBarcode, 250); }}
        >
          <View style={[styles.optionIcon, { backgroundColor: '#F0FFF4' }]}>
            <Text style={styles.optionEmoji}>📦</Text>
          </View>
          <View style={styles.optionText}>
            <View style={styles.optionTitleRow}>
              <Text style={styles.optionTitle}>바코드 스캔</Text>
              <View style={styles.betaBadge}><Text style={styles.betaBadgeText}>베타</Text></View>
            </View>
            <Text style={styles.optionDesc}>식약처 DB 참조 · 인식 못하는 상품은 업그레이드 중이에요</Text>
          </View>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
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
    marginBottom: 20,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F4F6',
  },
  optionIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  optionEmoji: { fontSize: 22 },
  optionText: { flex: 1 },
  optionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  optionTitle: { fontSize: 16, fontWeight: '600', color: '#191F28' },
  optionTitleDimmed: { color: '#8B95A1' },
  optionDesc: { fontSize: 13, color: '#8B95A1' },
  optionDimmed: { opacity: 0.7 },
  recommendBadge: { backgroundColor: '#EBF3FF', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  recommendBadgeText: { fontSize: 11, fontWeight: '700', color: '#3182F6' },
  betaBadge: { backgroundColor: '#F2F4F6', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  betaBadgeText: { fontSize: 11, fontWeight: '600', color: '#8B95A1' },
});
