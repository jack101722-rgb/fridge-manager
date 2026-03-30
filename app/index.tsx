import { useEffect } from 'react';
import { Redirect } from 'expo-router';
import { useFridgeStore } from '../store/fridgeStore';

// 앱 시작점 — 로그인 여부에 따라 화면 이동
export default function Index() {
  const user = useFridgeStore((s) => s.user);

  if (!user) {
    return <Redirect href="/login" />;
  }

  if (!user.onboarding_completed) {
    return <Redirect href="/(onboarding)/intro" />;
  }

  return <Redirect href="/(tabs)" />;
}
