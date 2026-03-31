import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, SafeAreaView, KeyboardAvoidingView,
  Platform, ActivityIndicator, Alert, Image
} from 'react-native';
import { router } from 'expo-router';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { supabase } from '../lib/supabase';

GoogleSignin.configure({
  webClientId: '278313269161-pmi3vovdlt6v6kgoq0n29v07gvr753t9.apps.googleusercontent.com',
  scopes: ['email', 'profile'],
});

type Mode = 'login' | 'signup';

export default function LoginScreen() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleGoogleSignIn() {
    setLoading(true);
    try {
      await GoogleSignin.hasPlayServices();
      const response = await GoogleSignin.signIn();

      const idToken = response.data?.idToken;
      if (!idToken) throw new Error('Google 로그인 토큰을 받지 못했어요.');

      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
      });
      if (error) throw error;

      router.replace('/');
    } catch (err: any) {
      if (err.code === statusCodes.SIGN_IN_CANCELLED) {
        // 사용자가 취소 — 알림 불필요
      } else if (err.code === statusCodes.IN_PROGRESS) {
        // 이미 진행 중
      } else {
        Alert.alert('오류', err.message ?? 'Google 로그인에 실패했어요. 다시 시도해주세요.');
      }
    } finally {
      setLoading(false);
    }
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
          <Text style={styles.title}>냉장고 박사</Text>
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

        {/* 네이티브 Google 로그인 */}
        <View style={styles.socialButtons}>
          <TouchableOpacity
            style={[styles.googleBtn, loading && { opacity: 0.6 }]}
            onPress={handleGoogleSignIn}
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
