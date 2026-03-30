import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

// 탭 아이콘 (텍스트 이모지로 임시 대체, 추후 아이콘 라이브러리로 교체)
export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const bottomInset = insets.bottom;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#3182F6',
        tabBarInactiveTintColor: '#8B95A1',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#F2F4F6',
          borderTopWidth: 1,
          height: (Platform.OS === 'ios' ? 76 : 58) + bottomInset,
          paddingBottom: (Platform.OS === 'ios' ? 18 : 10) + bottomInset,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '냉장고',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'snow' : 'snow-outline'} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="menu"
        options={{
          title: '메뉴추천',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'restaurant' : 'restaurant-outline'} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="shopping"
        options={{
          title: '장보기',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'cart' : 'cart-outline'} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="mypage"
        options={{
          title: '마이페이지',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={24} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

