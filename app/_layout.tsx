import { useEffect, useState } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, LogBox } from 'react-native';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';

LogBox.ignoreLogs([
  'expo-notifications: Android Push notifications (remote notifications)',
]);
import { supabase } from '../lib/supabase';
import { useFridgeStore } from '../store/fridgeStore';
import { Ingredient, User } from '../types';
import { requestNotificationPermission, rescheduleAllNotifications } from '../lib/notifications';
import EditIngredientModal from '../components/fridge/EditIngredientModal';

export default function RootLayout() {
  const [initializing, setInitializing] = useState(true);
  const setUser = useFridgeStore((s) => s.setUser);
  const setFridge = useFridgeStore((s) => s.setFridge);
  const setIngredients = useFridgeStore((s) => s.setIngredients);
  const setIsLoading = useFridgeStore((s) => s.setIsLoading);
  const ingredients = useFridgeStore((s) => s.ingredients);
  const pendingIngredientId = useFridgeStore((s) => s.pendingIngredientId);
  const setPendingIngredientId = useFridgeStore((s) => s.setPendingIngredientId);

  // 방법 3: useLastNotificationResponse 훅 (Expo 공식 권장, 개발 빌드에서 검증 예정)
  const lastNotificationResponse = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!lastNotificationResponse) return;
    const ingredientId = lastNotificationResponse.notification.request.content.data?.ingredientId as string | undefined;
    if (!ingredientId) return;
    setPendingIngredientId(ingredientId);
  }, [lastNotificationResponse]);
  const pendingIngredient = pendingIngredientId
    ? ingredients.find((i) => i.id === pendingIngredientId) ?? null
    : null;

  useEffect(() => {
    requestNotificationPermission();

    // OAuth 딥링크 핸들러 (Android: WebBrowser가 URL을 못 잡을 때 fallback)
    async function handleOAuthUrl(url: string) {
      if (!url) return;
      try {
        let success = false;
        if (url.includes('code=')) {
          const { error } = await supabase.auth.exchangeCodeForSession(url);
          if (!error) success = true;
        } else if (url.includes('access_token=')) {
          const fragment = url.split('#')[1] ?? '';
          const params = Object.fromEntries(new URLSearchParams(fragment));
          if (params.access_token) {
            const { error } = await supabase.auth.setSession({
              access_token: params.access_token,
              refresh_token: params.refresh_token,
            });
            if (!error) success = true;
          }
        }
        // 세션 교환 성공 — 네비게이션은 onAuthStateChange(SIGNED_IN)에서 처리
        // (onAuthStateChange는 loadUserProfile 완료 후 router.replace를 호출함)
      } catch (e) {
        console.warn('OAuth deep link error:', e);
      }
    }
    // 앱이 딥링크로 열렸을 때 (cold start)
    Linking.getInitialURL().then((url) => { if (url) handleOAuthUrl(url); });
    // 앱이 포그라운드에 있을 때 딥링크 수신
    const linkingSub = Linking.addEventListener('url', ({ url }) => handleOAuthUrl(url));

    // 방법 1: 앱이 실행 중일 때 알림 탭 감지
    const notifSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const ingredientId = response.notification.request.content.data?.ingredientId as string | undefined;
      if (!ingredientId) return;
      setPendingIngredientId(ingredientId);
    });

    // 앱 시작 시 로그인 세션 확인 (10초 타임아웃)
    const sessionTimeout = setTimeout(() => {
      console.warn('getSession timeout — forcing initializing=false');
      setInitializing(false);
    }, 10000);

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      clearTimeout(sessionTimeout);
      try {
        if (session?.user) {
          await loadUserProfile(session.user.id, session.user.email!);
        }
      } catch (e) {
        console.warn('loadUserProfile error:', e);
      } finally {
        setInitializing(false);
      }
    });

    // 로그인/로그아웃 상태 변화 자동 감지
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          try {
            await loadUserProfile(session.user.id, session.user.email!);
          } catch (e) {
            console.warn('loadUserProfile error:', e);
          }
          if (event === 'SIGNED_IN') {
            router.replace('/');
          }
        } else {
          setUser(null);
          setFridge(null);
        }
      }
    );

    return () => {
      notifSub.remove();
      subscription.unsubscribe();
      linkingSub.remove();
    };
  }, []);

  async function loadUserProfile(authId: string, email: string) {
    // users 테이블에서 프로필 가져오기
    const { data: userData } = await supabase
      .from('users')
      .select('*')
      .eq('id', authId)
      .single();

    if (userData) {
      setUser(userData as User);
    } else {
      // 트리거가 아직 안 된 경우 기본값으로 설정
      setUser({ id: authId, email } as User);
    }

    // 내 냉장고 가져오기
    const { data: memberData } = await supabase
      .from('fridge_members')
      .select('fridge_id, fridges(*)')
      .eq('user_id', authId)
      .single();

    if (memberData?.fridges) {
      const fridge = memberData.fridges as any;
      setFridge(fridge);

      // 재료 목록 로드 + 알림 재예약
      setIsLoading(true);
      const { data: ingredientData } = await supabase
        .from('ingredients')
        .select('*')
        .eq('fridge_id', fridge.id)
        .eq('is_consumed', false)
        .order('created_at', { ascending: false });

      if (ingredientData) {
        setIngredients(ingredientData as Ingredient[]);
        rescheduleAllNotifications(ingredientData as Ingredient[]);
      }
      setIsLoading(false);
    }
  }

  // 세션 확인 중 로딩 스피너 표시
  if (initializing) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFFFF' }}>
        <ActivityIndicator size="large" color="#3182F6" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="dark" backgroundColor="transparent" translucent />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="(onboarding)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="preferences" options={{ animation: 'slide_from_right' }} />
      </Stack>
      {/* 알림 딥링크 모달: 어떤 탭에서든 바로 열림 */}
      <EditIngredientModal
        item={pendingIngredient}
        onClose={() => setPendingIngredientId(null)}
        onConsumed={() => setPendingIngredientId(null)}
      />
    </>
  );
}
