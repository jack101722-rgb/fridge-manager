import { Redirect } from 'expo-router';
import { useFridgeStore } from '../store/fridgeStore';

// 앱 시작점 — 서비스 소개 → 로그인 → 온보딩 → 메인
export default function Index() {
  const user = useFridgeStore((s) => s.user);
  const hasSeenWelcome = useFridgeStore((s) => s.hasSeenWelcome);

  if (!hasSeenWelcome) {
    return <Redirect href="/welcome" />;
  }

  if (!user) {
    return <Redirect href="/login" />;
  }

  if (!user.onboarding_completed) {
    return <Redirect href="/(onboarding)/intro" />;
  }

  return <Redirect href="/(tabs)" />;
}
