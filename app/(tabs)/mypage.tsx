import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Linking, Modal, Share, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useFridgeStore } from '../../store/fridgeStore';
import { supabase } from '../../lib/supabase';

interface MemberProfile {
  user_id: string;
  role: 'owner' | 'member';
  email: string;
  nickname?: string;
}

// wasteRate: 버린 재료 / (먹은 + 버린) 비율 (0~100)
function getGrade(wasteRate: number): { emoji: string; title: string; desc: string; color: string } {
  if (wasteRate === 0)   return { emoji: '👑', title: '냉장고 정복자',      desc: '버린 재료 0개! 전설의 냉장고 관리자예요', color: '#7C3AED' };
  if (wasteRate <= 10)  return { emoji: '✨', title: '절약 생활의 달인',   desc: '거의 완벽해요. 정말 잘하고 있어요!',      color: '#059669' };
  if (wasteRate <= 25)  return { emoji: '💚', title: '냉장고 수호자',      desc: '대부분의 재료를 잘 활용하고 있어요',      color: '#3182F6' };
  if (wasteRate <= 40)  return { emoji: '😊', title: '재료 살리는 사람',   desc: '조금만 더 신경쓰면 달인이 될 수 있어요', color: '#0891B2' };
  if (wasteRate <= 60)  return { emoji: '🤔', title: '냉장고와 화해 중',   desc: '버리는 재료가 꽤 있어요. 화이팅!',       color: '#D97706' };
  return                       { emoji: '😭', title: '유통기한의 피해자',  desc: '재료 관리가 필요해요. 할 수 있어요!',    color: '#DC2626' };
}

export default function MyPageScreen() {
  const insets = useSafeAreaInsets();
  const { user, fridge, ingredients, setUser, setFridge } = useFridgeStore();
  const [notifGranted, setNotifGranted] = useState<boolean | null>(null);
  const [showConsumedList, setShowConsumedList] = useState(false);
  const [showDiscardedList, setShowDiscardedList] = useState(false);
  const [showSavingsTooltip, setShowSavingsTooltip] = useState(false);
  const [members, setMembers] = useState<MemberProfile[]>([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joiningCode, setJoiningCode] = useState(false);
  const [showGradeTooltip, setShowGradeTooltip] = useState(false);

  useEffect(() => {
    checkNotifPermission();
    if (fridge) loadMembers();
  }, [fridge]);

  async function checkNotifPermission() {
    try {
      const Notifications = await import('expo-notifications');
      const { status } = await Notifications.getPermissionsAsync();
      setNotifGranted(status === 'granted');
    } catch {
      setNotifGranted(null);
    }
  }

  async function loadMembers() {
    if (!fridge) return;
    const { data } = await supabase
      .from('fridge_members')
      .select('user_id, role, users(email, nickname)')
      .eq('fridge_id', fridge.id);
    if (data) {
      setMembers(data.map((m: any) => ({
        user_id: m.user_id,
        role: m.role,
        email: m.users?.email ?? '',
        nickname: m.users?.nickname,
      })));
    }
  }

  async function generateInviteCode() {
    if (!fridge || !user) return;
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase
      .from('fridge_invites')
      .insert({ fridge_id: fridge.id, code, created_by: user.id, expires_at: expiresAt });
    if (!error) {
      setInviteCode(code);
      setShowInviteModal(true);
    } else {
      Alert.alert('초대 코드 생성 실패', '잠시 후 다시 시도해주세요.');
    }
  }

  async function handleShare() {
    await Share.share({
      message: `냉장고 매니저 앱에서 우리 냉장고를 함께 관리해요! 🧊\n초대 코드: ${inviteCode}\n(24시간 유효)`,
    });
  }

  async function joinWithCode() {
    if (!joinCodeInput.trim() || !user) return;
    setJoiningCode(true);
    try {
      const { data: invite } = await supabase
        .from('fridge_invites')
        .select('*')
        .eq('code', joinCodeInput.trim().toUpperCase())
        .gt('expires_at', new Date().toISOString())
        .single();
      if (!invite) {
        Alert.alert('코드 오류', '유효하지 않거나 만료된 코드예요.');
        return;
      }
      const { error } = await supabase
        .from('fridge_members')
        .insert({ fridge_id: invite.fridge_id, user_id: user.id, role: 'member' });
      if (error?.code === '23505') {
        Alert.alert('이미 참여 중', '이미 해당 냉장고에 참여하고 있어요.');
        return;
      }
      if (error) throw error;
      Alert.alert('참여 완료! 🎉', '냉장고에 합류했어요. 앱을 재시작하면 적용돼요.');
      setShowJoinModal(false);
      setJoinCodeInput('');
    } catch {
      Alert.alert('오류 발생', '잠시 후 다시 시도해주세요.');
    } finally {
      setJoiningCode(false);
    }
  }

  async function removeMember(targetUserId: string) {
    if (!fridge) return;
    Alert.alert('멤버 내보내기', '정말 이 멤버를 냉장고에서 내보낼까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '내보내기', style: 'destructive',
        onPress: async () => {
          await supabase.from('fridge_members').delete()
            .eq('fridge_id', fridge.id).eq('user_id', targetUserId);
          loadMembers();
        },
      },
    ]);
  }

  async function handleLogout() {
    Alert.alert('로그아웃', '정말 로그아웃할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '로그아웃', style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
          setUser(null);
          setFridge(null);
          router.replace('/login');
        },
      },
    ]);
  }

  async function handleDeleteAccount() {
    Alert.alert(
      '회원 탈퇴',
      '탈퇴하면 냉장고, 재료, 설정 등 모든 데이터가 영구적으로 삭제돼요. 정말 탈퇴할까요?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '탈퇴하기', style: 'destructive',
          onPress: async () => {
            if (!user) return;
            try {
              // 사용자 데이터 삭제 (cascade 설정에 따라 DB에서 자동 삭제될 수 있음)
              await supabase.from('fridge_members').delete().eq('user_id', user.id);
              await supabase.from('users').delete().eq('id', user.id);
              // Auth 계정 삭제
              await supabase.rpc('delete_user');
              await supabase.auth.signOut();
              setUser(null);
              setFridge(null);
              router.replace('/login');
            } catch (e) {
              Alert.alert('오류', '탈퇴 처리 중 문제가 생겼어요. 잠시 후 다시 시도해주세요.');
            }
          },
        },
      ]
    );
  }

  const consumed = ingredients.filter((i) => i.is_consumed && i.consumed_type === 'eaten');
  const discarded = ingredients.filter((i) => i.is_consumed && i.consumed_type === 'discarded');
  const total = ingredients.length;
  const consumptionRate = total > 0 ? Math.round((consumed.length / total) * 100) : 0;
  const wastedAmount = discarded.reduce((sum, i) => sum + (i.market_price ?? 0), 0);
  const consumedAmount = consumed.reduce((sum, i) => sum + (i.market_price ?? 0), 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expired = ingredients.filter((i) =>
    !i.is_consumed && i.expiry_date && new Date(i.expiry_date) < today
  );
  const effectiveWastedCount = discarded.length + expired.length;
  const resolvedCount = consumed.length + effectiveWastedCount;
  const wasteRate = resolvedCount > 0 ? Math.round((effectiveWastedCount / resolvedCount) * 100) : 0;
  const grade = resolvedCount > 0 ? getGrade(wasteRate) : null;

  const now = new Date();
  const monthlyData = [-2, -1, 0].map((offset) => {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const y = d.getFullYear();
    const m = d.getMonth();
    const filterAmount = (arr: typeof ingredients) =>
      arr.filter((i) => {
        if (!i.consumed_at) return false;
        const cd = new Date(i.consumed_at);
        return cd.getFullYear() === y && cd.getMonth() === m;
      }).reduce((sum, i) => sum + (i.market_price ?? 0), 0);
    return { label: `${m + 1}월`, consumed: filterAmount(consumed), wasted: filterAmount(discarded) };
  });
  const maxVal = Math.max(...monthlyData.flatMap((d) => [d.consumed, d.wasted]), 1);

  const fridgeCount = ingredients.filter((i) => !i.is_consumed && i.storage_type === 'fridge').length;
  const freezerCount = ingredients.filter((i) => !i.is_consumed && i.storage_type === 'freezer').length;
  const roomTempCount = ingredients.filter((i) => !i.is_consumed && i.storage_type === 'room_temp').length;

  const isOwner = members.find((m) => m.user_id === user?.id)?.role === 'owner';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>마이페이지</Text>
          {user?.is_earlybird && (
            <View style={styles.earlybird}>
              <Text style={styles.earlybirdText}>🐣 얼리버드</Text>
            </View>
          )}
        </View>

        {/* 이번 달 리포트 */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>이번 달 냉장고 리포트</Text>

          {/* 등급 배지 */}
          {grade && (
            <View style={[styles.gradeBadge, { backgroundColor: grade.color + '12', borderColor: grade.color + '30' }]}>
              <Text style={styles.gradeEmoji}>{grade.emoji}</Text>
              <View style={styles.gradeTextWrap}>
                <Text style={[styles.gradeTitle, { color: grade.color }]}>{grade.title}</Text>
                <Text style={styles.gradeDesc}>{grade.desc}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowGradeTooltip(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={[styles.tooltipBtn, { color: grade.color, borderColor: grade.color }]}>?</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.statRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{consumptionRate}%</Text>
              <Text style={styles.statLabel}>소진율</Text>
            </View>
            <View style={styles.statDivider} />
            <TouchableOpacity style={styles.stat} onPress={() => consumed.length > 0 && setShowConsumedList(true)} activeOpacity={0.7}>
              <Text style={styles.statValue}>{consumed.length}개</Text>
              <Text style={[styles.statLabel, consumed.length > 0 && styles.statLabelClickable]}>먹은 재료 {consumed.length > 0 ? '›' : ''}</Text>
            </TouchableOpacity>
            <View style={styles.statDivider} />
            <TouchableOpacity style={styles.stat} onPress={() => discarded.length > 0 && setShowDiscardedList(true)} activeOpacity={0.7}>
              <Text style={styles.statValue}>{discarded.length}개</Text>
              <Text style={[styles.statLabel, discarded.length > 0 && styles.statLabelClickable]}>버린 재료 {discarded.length > 0 ? '›' : ''}</Text>
            </TouchableOpacity>
          </View>

          {/* 소진율 게이지바 */}
          {total > 0 && (
            <View style={styles.gaugeWrap}>
              <View style={styles.gaugeBg}>
                <View style={[
                  styles.gaugeFill,
                  { width: `${consumptionRate}%` as any },
                  consumptionRate >= 80 ? styles.gaugeFillGood :
                  consumptionRate >= 50 ? styles.gaugeFillMid :
                  styles.gaugeFillLow,
                ]} />
              </View>
            </View>
          )}

          {total > 0 && (
            <View style={[styles.savedBanner, wastedAmount > 0 ? styles.savedBannerWarn : styles.savedBannerGood]}>
              {wastedAmount === 0 ? (
                <>
                  <Text style={styles.savedText}>🎉 이번 달 버린 식재료 없음!</Text>
                  {consumedAmount > 0 && (
                    <Text style={styles.savedAmount}>{consumedAmount.toLocaleString()}원 어치 활용</Text>
                  )}
                </>
              ) : (
                <>
                  <View style={styles.savedLabelRow}>
                    <Text style={[styles.savedText, styles.savedTextWarn]}>🗑️ 버린 식재료 예상 비용</Text>
                    <TouchableOpacity onPress={() => setShowSavingsTooltip(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={[styles.tooltipBtn, styles.tooltipBtnWarn]}>?</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.savedAmount, styles.savedAmountWarn]}>{wastedAmount.toLocaleString()}원</Text>
                </>
              )}
            </View>
          )}

          {/* 최근 3개월 소진 vs 낭비 추이 */}
          {total > 0 && (
            <View style={styles.chartSection}>
              <View style={styles.chartTitleRow}>
                <Text style={styles.chartTitle}>최근 3개월 추이</Text>
                <View style={styles.chartLegend}>
                  <View style={[styles.legendDot, { backgroundColor: '#059669' }]} />
                  <Text style={styles.legendText}>소진</Text>
                  <View style={[styles.legendDot, { backgroundColor: '#F59E0B' }]} />
                  <Text style={styles.legendText}>낭비</Text>
                </View>
              </View>
              <View style={styles.chartBars}>
                {monthlyData.map((d, i) => {
                  const consumedH = d.consumed > 0 ? Math.max(4, Math.round((d.consumed / maxVal) * 60)) : 4;
                  const wastedH = d.wasted > 0 ? Math.max(4, Math.round((d.wasted / maxVal) * 60)) : 4;
                  const isCurrent = i === 2;
                  return (
                    <View key={i} style={styles.chartBarGroup}>
                      <View style={styles.chartBarPair}>
                        <View style={styles.chartBarWrap}>
                          <Text style={styles.chartAmount}>
                            {d.consumed > 0 ? `${(d.consumed / 1000).toFixed(0)}k` : ''}
                          </Text>
                          <View style={styles.chartBarBg}>
                            <View style={[styles.chartBarFill, { height: consumedH, backgroundColor: d.consumed > 0 ? '#059669' : '#F2F4F6' }]} />
                          </View>
                        </View>
                        <View style={styles.chartBarWrap}>
                          <Text style={styles.chartAmount}>
                            {d.wasted > 0 ? `${(d.wasted / 1000).toFixed(0)}k` : ''}
                          </Text>
                          <View style={styles.chartBarBg}>
                            <View style={[styles.chartBarFill, { height: wastedH, backgroundColor: d.wasted > 0 ? '#F59E0B' : '#F2F4F6' }]} />
                          </View>
                        </View>
                      </View>
                      <Text style={[styles.chartLabel, isCurrent && styles.chartLabelCurrent]}>
                        {d.label}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* 현재 재료 현황 */}
          {(fridgeCount + freezerCount + roomTempCount) > 0 && (
            <View style={styles.stockSection}>
              <Text style={styles.stockTitle}>지금 냉장고에는</Text>
              <View style={styles.stockRow}>
                <StockBadge emoji="❄️" label="냉장" count={fridgeCount} />
                <StockBadge emoji="🧊" label="냉동" count={freezerCount} />
                <StockBadge emoji="🌡️" label="실온" count={roomTempCount} />
              </View>
            </View>
          )}
        </View>

        {/* 데이터 없을 때 */}
        {total === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>📊</Text>
            <Text style={styles.emptyTitle}>아직 데이터가 없어요</Text>
            <Text style={styles.emptyDesc}>재료를 등록하고 소비 기록을 남기면{'\n'}월별 리포트를 볼 수 있어요</Text>
          </View>
        )}

        {/* 알림 설정 */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>알림 설정</Text>
            <TouchableOpacity onPress={() => Linking.openSettings()}>
              <Text style={styles.editBtn}>설정 열기</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.notifRow}>
            <View>
              <Text style={styles.notifLabel}>유통기한 임박 알림</Text>
              <Text style={styles.notifDesc}>재료 소비 기한이 다가오면 알려드려요</Text>
            </View>
            {notifGranted !== null && (
              <View style={[styles.notifBadge, notifGranted ? styles.notifBadgeOn : styles.notifBadgeOff]}>
                <Text style={[styles.notifBadgeText, notifGranted ? styles.notifBadgeTextOn : styles.notifBadgeTextOff]}>
                  {notifGranted ? '켜짐' : '꺼짐'}
                </Text>
              </View>
            )}
          </View>
          {notifGranted === false && (
            <TouchableOpacity style={styles.notifCta} onPress={() => Linking.openSettings()}>
              <Text style={styles.notifCtaText}>📲 알림을 켜면 임박 재료를 놓치지 않아요 →</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* 냉장고 멤버 */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>냉장고 멤버</Text>
          <View style={styles.memberList}>
            {members.length === 0 ? (
              <Text style={styles.memberEmpty}>멤버 정보를 불러오는 중이에요</Text>
            ) : members.map((m) => (
              <View key={m.user_id} style={styles.memberRow}>
                <View style={styles.memberAvatar}>
                  <Text style={styles.memberAvatarText}>
                    {(m.nickname || m.email)?.[0]?.toUpperCase() ?? '?'}
                  </Text>
                </View>
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName} numberOfLines={1}>{m.nickname || m.email}</Text>
                  <Text style={styles.memberRole}>{m.role === 'owner' ? '관리자' : '멤버'}</Text>
                </View>
                {isOwner && m.user_id !== user?.id && (
                  <TouchableOpacity onPress={() => removeMember(m.user_id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.removeMemberBtn}>내보내기</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
          <View style={styles.memberActions}>
            {isOwner && (
              <TouchableOpacity style={styles.memberActionBtn} onPress={generateInviteCode}>
                <Text style={styles.memberActionBtnText}>+ 초대하기</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.memberActionBtn, styles.memberActionBtnSecondary]}
              onPress={() => setShowJoinModal(true)}
            >
              <Text style={[styles.memberActionBtnText, styles.memberActionBtnTextSecondary]}>코드로 참여</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 내 정보 카드 */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>내 정보</Text>
            <TouchableOpacity onPress={() => router.push('/preferences')}>
              <Text style={styles.editBtn}>수정</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.prefList}>
            <PrefRow label="가족 수" value={user?.household_size ? `${user.household_size}명` : '-'} />
            <PrefRow label="선호 요리" value={user?.cuisine_prefs?.join(', ') || '-'} />
            <PrefRow label="못 먹는 재료" value={user?.food_restrictions?.join(', ') || '없음'} />
            <PrefRow label="쇼핑 플랫폼" value={user?.shopping_platforms?.join(', ') || '-'} />
            <PrefRow label="식단 목표" value={
              user?.diet_mode === 'diet' ? '다이어트' :
              user?.diet_mode === 'healthy' ? '건강식' : '특별히 없음'
            } />
            <PrefRow label="장보는 날" value={user?.shopping_day?.join(', ') || '-'} />
            <PrefRow label="장보는 시간" value={
              user?.shopping_time === 'morning' ? '오전' :
              user?.shopping_time === 'afternoon' ? '오후' :
              user?.shopping_time === 'evening' ? '저녁' :
              user?.shopping_time === 'night' ? '늦은 밤' : '-'
            } />
          </View>
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutText}>로그아웃</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.deleteAccountBtn} onPress={handleDeleteAccount}>
          <Text style={styles.deleteAccountText}>회원 탈퇴</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* 먹은 재료 목록 모달 */}
      <Modal visible={showConsumedList} transparent animationType="slide" onRequestClose={() => setShowConsumedList(false)}>
        <TouchableOpacity style={listStyles.overlay} activeOpacity={1} onPress={() => setShowConsumedList(false)}>
          <View style={listStyles.sheet}>
            <View style={listStyles.handle} />
            <Text style={listStyles.title}>😋 먹은 재료 목록</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {consumed.map((item, i) => (
                <View key={item.id} style={[listStyles.row, i === consumed.length - 1 && { borderBottomWidth: 0 }]}>
                  <Text style={listStyles.itemName}>{item.name}</Text>
                  <Text style={listStyles.itemDate}>{item.consumed_at ? item.consumed_at.split('T')[0] : '-'}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 버린 재료 목록 모달 */}
      <Modal visible={showDiscardedList} transparent animationType="slide" onRequestClose={() => setShowDiscardedList(false)}>
        <TouchableOpacity style={listStyles.overlay} activeOpacity={1} onPress={() => setShowDiscardedList(false)}>
          <View style={listStyles.sheet}>
            <View style={listStyles.handle} />
            <Text style={listStyles.title}>🗑️ 버린 재료 목록</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {discarded.map((item, i) => (
                <View key={item.id} style={[listStyles.row, i === discarded.length - 1 && { borderBottomWidth: 0 }]}>
                  <Text style={listStyles.itemName}>{item.name}</Text>
                  <Text style={listStyles.itemDate}>{item.consumed_at ? item.consumed_at.split('T')[0] : '-'}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 절약 금액 툴팁 모달 */}
      <Modal visible={showSavingsTooltip} transparent animationType="fade" onRequestClose={() => setShowSavingsTooltip(false)}>
        <TouchableOpacity style={listStyles.overlay} activeOpacity={1} onPress={() => setShowSavingsTooltip(false)}>
          <View style={listStyles.tooltip}>
            <Text style={listStyles.tooltipTitle}>💡 버린 식재료 예상 비용이란?</Text>
            <Text style={listStyles.tooltipBody}>
              재료를 등록할 때 예상 시장가가 함께 기록돼요.{'\n\n'}
              '버렸어요'로 처리된 재료들의 시장가를 합산한 금액이에요.{'\n\n'}
              이 금액이 낮을수록 냉장고 관리를 잘 하고 있다는 신호예요.{'\n\n'}
              목표: 매달 0원에 도전해보세요! 🎯
            </Text>
            <TouchableOpacity style={listStyles.tooltipClose} onPress={() => setShowSavingsTooltip(false)}>
              <Text style={listStyles.tooltipCloseText}>확인</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 등급 설명 모달 */}
      <Modal visible={showGradeTooltip} transparent animationType="fade" onRequestClose={() => setShowGradeTooltip(false)}>
        <TouchableOpacity style={listStyles.overlay} activeOpacity={1} onPress={() => setShowGradeTooltip(false)}>
          <View style={listStyles.tooltip}>
            <Text style={listStyles.tooltipTitle}>🏆 냉장고 등급이란?</Text>
            <Text style={listStyles.tooltipBody}>
              {'장기 보관 재료에 불리하지 않도록,\n소진율이 아닌 \'낭비율\'로 계산해요.\n\n'}
              {'📊 계산 방식\n'}
              {'낭비율 = (버린 재료 + 유통기한 초과 미처리)\n        ÷ (먹은 + 버린 + 기한초과) × 100\n\n'}
              {'📋 등급 기준\n'}
              {'👑 냉장고 정복자   낭비율 0%\n'}
              {'✨ 절약 생활의 달인  ~10%\n'}
              {'💚 냉장고 수호자   ~25%\n'}
              {'😊 재료 살리는 사람  ~40%\n'}
              {'🤔 냉장고와 화해 중  ~60%\n'}
              {'😭 유통기한의 피해자  60% 초과'}
            </Text>
            <TouchableOpacity style={listStyles.tooltipClose} onPress={() => setShowGradeTooltip(false)}>
              <Text style={listStyles.tooltipCloseText}>확인</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 초대 코드 모달 */}
      <Modal visible={showInviteModal} transparent animationType="fade" onRequestClose={() => setShowInviteModal(false)}>
        <TouchableOpacity style={listStyles.overlay} activeOpacity={1} onPress={() => setShowInviteModal(false)}>
          <View style={listStyles.tooltip}>
            <Text style={listStyles.tooltipTitle}>🔗 냉장고 초대 코드</Text>
            <Text style={[listStyles.tooltipBody, { textAlign: 'center' }]}>
              아래 코드를 공유해서{'\n'}냉장고에 초대하세요
            </Text>
            <View style={inviteStyles.codeBox}>
              <Text style={inviteStyles.code}>{inviteCode}</Text>
            </View>
            <Text style={inviteStyles.expiry}>24시간 동안 유효해요</Text>
            <TouchableOpacity style={listStyles.tooltipClose} onPress={handleShare}>
              <Text style={listStyles.tooltipCloseText}>공유하기</Text>
            </TouchableOpacity>
            <TouchableOpacity style={inviteStyles.cancelBtn} onPress={() => setShowInviteModal(false)}>
              <Text style={inviteStyles.cancelBtnText}>닫기</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 코드로 참여 모달 */}
      <Modal visible={showJoinModal} transparent animationType="fade" onRequestClose={() => setShowJoinModal(false)}>
        <TouchableOpacity style={listStyles.overlay} activeOpacity={1} onPress={() => setShowJoinModal(false)}>
          <View style={listStyles.tooltip}>
            <Text style={listStyles.tooltipTitle}>🏠 코드로 냉장고 참여</Text>
            <Text style={[listStyles.tooltipBody, { marginBottom: 12 }]}>
              초대받은 6자리 코드를 입력해주세요
            </Text>
            <TextInput
              style={inviteStyles.input}
              placeholder="예: AB1C2D"
              placeholderTextColor="#C2C8D0"
              value={joinCodeInput}
              onChangeText={setJoinCodeInput}
              autoCapitalize="characters"
              maxLength={6}
            />
            <TouchableOpacity
              style={[listStyles.tooltipClose, joiningCode && { opacity: 0.6 }]}
              onPress={joinWithCode}
              disabled={joiningCode}
            >
              <Text style={listStyles.tooltipCloseText}>{joiningCode ? '참여 중...' : '참여하기'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={inviteStyles.cancelBtn}
              onPress={() => { setShowJoinModal(false); setJoinCodeInput(''); }}
            >
              <Text style={inviteStyles.cancelBtnText}>취소</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function StockBadge({ emoji, label, count }: { emoji: string; label: string; count: number }) {
  return (
    <View style={stockBadgeStyles.wrap}>
      <Text style={stockBadgeStyles.emoji}>{emoji}</Text>
      <Text style={stockBadgeStyles.count}>{count}개</Text>
      <Text style={stockBadgeStyles.label}>{label}</Text>
    </View>
  );
}

const stockBadgeStyles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 10, paddingVertical: 10 },
  emoji: { fontSize: 20, marginBottom: 4 },
  count: { fontSize: 16, fontWeight: '700', color: '#191F28' },
  label: { fontSize: 11, color: '#8B95A1', marginTop: 2 },
});

function PrefRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={prefRowStyles.row}>
      <Text style={prefRowStyles.label}>{label}</Text>
      <Text style={prefRowStyles.value} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const prefRowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F2F4F6',
  },
  label: { fontSize: 14, color: '#8B95A1', flex: 1 },
  value: { fontSize: 14, color: '#191F28', fontWeight: '500', flex: 2, textAlign: 'right' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16,
  },
  title: { fontSize: 22, fontWeight: '700', color: '#191F28', flex: 1 },
  earlybird: { backgroundColor: '#FFF7ED', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  earlybirdText: { fontSize: 12, color: '#D97706', fontWeight: '600' },
  card: {
    backgroundColor: '#FFFFFF', marginHorizontal: 16, marginBottom: 12,
    borderRadius: 12, padding: 20,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#191F28' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  editBtn: { fontSize: 14, color: '#3182F6', fontWeight: '600' },
  prefList: {},
  // 등급 배지
  gradeBadge: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 10, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 12,
    marginTop: 14, marginBottom: 4,
  },
  gradeEmoji: { fontSize: 28, marginRight: 12 },
  gradeTextWrap: { flex: 1 },
  gradeTitle: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  gradeDesc: { fontSize: 12, color: '#8B95A1' },
  // 통계
  statRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16, marginBottom: 16 },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 24, fontWeight: '700', color: '#3182F6' },
  statLabel: { fontSize: 12, color: '#8B95A1', marginTop: 4 },
  statDivider: { width: 1, height: 40, backgroundColor: '#F2F4F6' },
  statLabelClickable: { color: '#3182F6' },
  // 게이지
  gaugeWrap: { marginBottom: 16 },
  gaugeBg: { height: 6, backgroundColor: '#F2F4F6', borderRadius: 3, overflow: 'hidden' },
  gaugeFill: { height: 6, borderRadius: 3 },
  gaugeFillGood: { backgroundColor: '#059669' },
  gaugeFillMid: { backgroundColor: '#3182F6' },
  gaugeFillLow: { backgroundColor: '#F59E0B' },
  // 배너
  savedBanner: { borderRadius: 8, padding: 14, flexDirection: 'column', marginBottom: 16 },
  savedBannerGood: { backgroundColor: '#F0FDF4' },
  savedBannerWarn: { backgroundColor: '#FFF7ED' },
  savedLabelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  savedText: { fontSize: 13, color: '#166534', flex: 1 },
  savedTextWarn: { color: '#92400E' },
  tooltipBtn: {
    fontSize: 11, color: '#166534', fontWeight: '700',
    borderWidth: 1, borderColor: '#166534', borderRadius: 10,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  tooltipBtnWarn: { color: '#92400E', borderColor: '#92400E' },
  savedAmount: { fontSize: 18, fontWeight: '700', color: '#166534' },
  savedAmountWarn: { color: '#B45309' },
  // 차트
  chartSection: { borderTopWidth: 1, borderTopColor: '#F2F4F6', paddingTop: 16, marginBottom: 4 },
  chartTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  chartTitle: { fontSize: 13, fontWeight: '600', color: '#8B95A1' },
  chartLegend: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: '#8B95A1', marginRight: 8 },
  chartBars: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', height: 90 },
  chartBarGroup: { alignItems: 'center', flex: 1 },
  chartBarPair: { flexDirection: 'row', gap: 4, alignItems: 'flex-end' },
  chartBarWrap: { alignItems: 'center' },
  chartAmount: { fontSize: 10, color: '#8B95A1', marginBottom: 3, height: 14 },
  chartBarBg: { width: 20, height: 60, justifyContent: 'flex-end' },
  chartBarFill: { width: 20, borderRadius: 4 },
  chartLabel: { fontSize: 12, color: '#8B95A1', marginTop: 6 },
  chartLabelCurrent: { color: '#191F28', fontWeight: '700' },
  // 재고 현황
  stockSection: { borderTopWidth: 1, borderTopColor: '#F2F4F6', paddingTop: 16 },
  stockTitle: { fontSize: 13, color: '#8B95A1', fontWeight: '600', marginBottom: 10 },
  stockRow: { flexDirection: 'row', gap: 8 },
  // 빈 상태
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyEmoji: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: '#191F28', marginBottom: 8 },
  emptyDesc: { fontSize: 14, color: '#8B95A1', textAlign: 'center', lineHeight: 20 },
  // 알림
  notifRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  notifLabel: { fontSize: 15, color: '#191F28', fontWeight: '500' },
  notifDesc: { fontSize: 12, color: '#8B95A1', marginTop: 2 },
  notifBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  notifBadgeOn: { backgroundColor: '#ECFDF5' },
  notifBadgeOff: { backgroundColor: '#F2F4F6' },
  notifBadgeText: { fontSize: 13, fontWeight: '600' },
  notifBadgeTextOn: { color: '#059669' },
  notifBadgeTextOff: { color: '#8B95A1' },
  notifCta: { marginTop: 12, backgroundColor: '#FFF7ED', borderRadius: 8, padding: 12 },
  notifCtaText: { fontSize: 13, color: '#D97706', fontWeight: '500' },
  // 멤버
  memberList: { marginTop: 12, marginBottom: 12 },
  memberEmpty: { fontSize: 13, color: '#8B95A1', textAlign: 'center', paddingVertical: 8 },
  memberRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F2F4F6' },
  memberAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  memberAvatarText: { fontSize: 15, fontWeight: '700', color: '#3182F6' },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 14, fontWeight: '600', color: '#191F28' },
  memberRole: { fontSize: 12, color: '#8B95A1', marginTop: 2 },
  removeMemberBtn: { fontSize: 13, color: '#F04438', fontWeight: '500' },
  memberActions: { flexDirection: 'row', gap: 8 },
  memberActionBtn: {
    flex: 1, backgroundColor: '#3182F6', borderRadius: 8,
    paddingVertical: 10, alignItems: 'center',
  },
  memberActionBtnSecondary: { backgroundColor: '#F2F4F6' },
  memberActionBtnText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
  memberActionBtnTextSecondary: { color: '#4E5968' },
  // 로그아웃
  logoutBtn: {
    marginHorizontal: 16, marginTop: 8, marginBottom: 32,
    paddingVertical: 16, borderRadius: 12,
    borderWidth: 1, borderColor: '#E5E8EB', alignItems: 'center',
  },
  logoutText: { fontSize: 15, color: '#8B95A1', fontWeight: '600' },
  deleteAccountBtn: {
    marginHorizontal: 16, marginTop: 4, marginBottom: 48,
    paddingVertical: 16, borderRadius: 12,
    alignItems: 'center',
  },
  deleteAccountText: { fontSize: 14, color: '#B0B8C1', fontWeight: '500' },
});

const listStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, maxHeight: '60%', paddingBottom: 40,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#E5E8EB', alignSelf: 'center', marginBottom: 16 },
  title: { fontSize: 17, fontWeight: '700', color: '#191F28', marginBottom: 16 },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F2F4F6',
  },
  itemName: { fontSize: 15, color: '#191F28', flex: 1 },
  itemDate: { fontSize: 13, color: '#8B95A1' },
  tooltip: {
    backgroundColor: '#FFFFFF', borderRadius: 16, margin: 32, padding: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12, shadowRadius: 12, elevation: 8,
  },
  tooltipTitle: { fontSize: 16, fontWeight: '700', color: '#191F28', marginBottom: 12 },
  tooltipBody: { fontSize: 14, color: '#4E5968', lineHeight: 22 },
  tooltipClose: {
    marginTop: 20, backgroundColor: '#3182F6',
    borderRadius: 10, paddingVertical: 12, alignItems: 'center',
  },
  tooltipCloseText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
});

const inviteStyles = StyleSheet.create({
  codeBox: {
    backgroundColor: '#F2F4F6', borderRadius: 10,
    paddingVertical: 16, alignItems: 'center', marginTop: 16,
  },
  code: { fontSize: 28, fontWeight: '800', color: '#191F28', letterSpacing: 6 },
  expiry: { fontSize: 12, color: '#8B95A1', textAlign: 'center', marginTop: 8, marginBottom: 4 },
  cancelBtn: { marginTop: 10, paddingVertical: 10, alignItems: 'center' },
  cancelBtnText: { fontSize: 14, color: '#8B95A1' },
  input: {
    borderWidth: 1, borderColor: '#E5E8EB', borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    fontSize: 18, fontWeight: '700', color: '#191F28',
    textAlign: 'center', letterSpacing: 4, marginBottom: 4,
  },
});
