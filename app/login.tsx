import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, SafeAreaView, KeyboardAvoidingView,
  Platform, ActivityIndicator, Alert, Image
} from 'react-native';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../lib/supabase';

WebBrowser.maybeCompleteAuthSession();

type Mode = 'login' | 'signup';

export default function LoginScreen() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleOAuth(provider: 'google' | 'kakao') {
    setLoading(true);
    try {
      const redirectTo = Linking.createURL('/');
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error) throw error;
      if (!data.url) throw new Error('OAuth URL을 받지 못했어요.');

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

      if (result.type === 'success' && result.url) {
        // WebBrowser가 URL을 직접 캡처한 경우 (iOS 또는 일부 Android)
        await processOAuthUrl(result.url);
      } else {
        // Android에서 흔히 발생: WebBrowser가 'dismiss'를 반환하지만
        // _layout.tsx의 Linking 리스너가 딥링크를 처리함
        // 세션이 설정될 때까지 최대 6초 대기
        const session = await waitForSession(6000);
        if (!session) {
          throw new Error('로그인에 실패했어요. 다시 시도해주세요.');
        }
        router.replace('/');
      }
    } catch (err: any) {
      Alert.alert('오류', err.message ?? '로그인에 실패했어요. 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  }

  async function processOAuthUrl(url: string) {
    if (url.includes('code=')) {
      const { error } = await supabase.auth.exchangeCodeForSession(url);
      if (error) throw error;
    } else if (url.includes('access_token=')) {
      const fragment = url.split('#')[1] ?? '';
      const params = Object.fromEntries(new URLSearchParams(fragment));
      const { error } = await supabase.auth.setSession({
        access_token: params.access_token,
        refresh_token: params.refresh_token,
      });
      if (error) throw error;
    } else {
      throw new Error('로그인 응답에서 인증 정보를 찾을 수 없어요.');
    }
    router.replace('/');
  }

  async function waitForSession(maxWaitMs: number): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      const { data: { session } } = await supabase.auth.getSession();
      if (session) return true;
    }
    return false;
  }

  async function handleEmailAuth() {
    if (!email || !password) {
      Alert.alert('입력 오류', '이메일과 비밀번호를 모두 입력해주세요.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('입력 오류', '비밀번호는 6자 이상이어야 해요.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        // 가입 즉시 로그인 후 이동 (이메일 인증 OFF 상태)
        const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
        if (loginError) throw loginError;
        router.replace('/');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace('/');
      }
    } catch (err: any) {
      const msg = err.message?.includes('Invalid login credentials')
        ? '이메일 또는 비밀번호가 틀렸어요.'
        : err.message?.includes('User already registered')
        ? '이미 가입된 이메일이에요. 로그인해주세요.'
        : err.message ?? '오류가 발생했어요. 다시 시도해주세요.';
      Alert.alert('오류', msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.inner}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* 상단 타이틀 */}
        <View style={styles.topSection}>
          <Text style={styles.emoji}>🧊</Text>
          <Text style={styles.title}>냉장고 매니저</Text>
          <Text style={styles.subtitle}>
            {mode === 'login'
              ? '다시 오셨군요! 로그인해주세요.'
              : '나 혼자도, 둘이서도 시작해봐요.'}
          </Text>
        </View>

        {/* 입력 폼 */}
        <View style={styles.form}>
          <View style={styles.inputWrapper}>
            <Text style={styles.inputLabel}>이메일</Text>
            <TextInput
              style={styles.input}
              placeholder="example@email.com"
              placeholderTextColor="#B0B8C1"
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />
          </View>

          <View style={styles.inputWrapper}>
            <Text style={styles.inputLabel}>비밀번호</Text>
            <TextInput
              style={styles.input}
              placeholder={mode === 'signup' ? '6자 이상 입력해주세요' : '비밀번호 입력'}
              placeholderTextColor="#B0B8C1"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
            onPress={handleEmailAuth}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#FFFFFF" />
              : <Text style={styles.primaryBtnText}>
                  {mode === 'login' ? '로그인' : '회원가입'}
                </Text>
            }
          </TouchableOpacity>
        </View>

        {/* 구분선 */}
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>또는</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* 소셜 로그인 버튼 (추후 연동) */}
        <View style={styles.socialButtons}>
          <TouchableOpacity
            style={[styles.googleBtn, loading && { opacity: 0.6 }]}
            onPress={() => handleOAuth('google')}
            disabled={loading}
          >
            <View style={styles.googleBtnInner}>
              <Image source={require('../assets/google-logo.png')} style={styles.googleLogoImg} />
              <Text style={styles.googleBtnText}>Google로 시작하기</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* 로그인/회원가입 전환 */}
        <TouchableOpacity
          style={styles.switchMode}
          onPress={() => setMode(mode === 'login' ? 'signup' : 'login')}
        >
          <Text style={styles.switchModeText}>
            {mode === 'login'
              ? '아직 계정이 없어요 → 회원가입'
              : '이미 계정이 있어요 → 로그인'}
          </Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  inner: { flex: 1, paddingHorizontal: 24, justifyContent: 'center' },
  topSection: { alignItems: 'center', marginBottom: 40 },
  emoji: { fontSize: 56, marginBottom: 12 },
  title: { fontSize: 26, fontWeight: '700', color: '#191F28', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#8B95A1', textAlign: 'center' },
  form: { marginBottom: 24 },
  inputWrapper: { marginBottom: 16 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#4E5968', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#E5E8EB',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: '#191F28',
    backgroundColor: '#F9FAFB',
  },
  primaryBtn: {
    backgroundColor: '#3182F6',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnDisabled: { backgroundColor: '#B0C4DE' },
  primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#E5E8EB' },
  dividerText: { marginHorizontal: 12, color: '#8B95A1', fontSize: 13 },
  socialButtons: { gap: 10, marginBottom: 24 },
  kakaoBtn: {
    backgroundColor: '#FEE500',
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
  },
  kakaoBtnText: { fontSize: 15, fontWeight: '700', color: '#191919' },
  googleBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 50,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  googleBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  googleLogoImg: { width: 22, height: 22 },
  googleBtnText: { fontSize: 15, fontWeight: '600', color: '#3C4043' },
  switchMode: { alignItems: 'center' },
  switchModeText: { fontSize: 14, color: '#3182F6', fontWeight: '500' },
});
