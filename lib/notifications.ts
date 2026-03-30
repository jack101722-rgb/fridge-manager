import * as Notifications from 'expo-notifications';
import { parseISO, differenceInDays, addDays, startOfDay } from 'date-fns';
import { Ingredient } from '../types';

// 앱 포그라운드에서도 알림 표시
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function requestNotificationPermission(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

function getExpiryDate(ingredient: Ingredient): Date | null {
  if (ingredient.expiry_date) {
    return parseISO(ingredient.expiry_date);
  }
  if (ingredient.ai_expiry_days && ingredient.purchase_date) {
    const purchase = parseISO(ingredient.purchase_date);
    return addDays(purchase, ingredient.ai_expiry_days);
  }
  return null;
}

function notifId(ingredientId: string, tag: string) {
  return `${ingredientId}_${tag}`;
}

// 재료 1개에 대해 D-7, D-3, D-1, D+1 알림 예약
export async function scheduleExpiryNotifications(ingredient: Ingredient): Promise<void> {
  const expiryDate = getExpiryDate(ingredient);
  if (!expiryDate) return;

  const now = new Date();
  const schedule = [
    { tag: 'd7', daysOffset: -7, title: `🥦 ${ingredient.name} 소비기한 D-7`, body: '일주일 후면 소비기한이에요. 이번 주 안에 드세요!' },
    { tag: 'd3', daysOffset: -3, title: `⚠️ ${ingredient.name} 소비기한 D-3`, body: '3일 남았어요. 오늘 요리에 활용해보세요!' },
    { tag: 'd1', daysOffset: -1, title: `🚨 ${ingredient.name} 내일이 소비기한`, body: '내일 소비기한이에요. 오늘 꼭 드세요!' },
    { tag: 'dplus1', daysOffset: 1, title: `😢 ${ingredient.name} 소비기한 초과`, body: '어제 소비기한이 지났어요. 상태를 확인해보세요.' },
  ];

  for (const item of schedule) {
    const triggerDate = startOfDay(addDays(expiryDate, item.daysOffset));
    triggerDate.setHours(9, 0, 0, 0); // 오전 9시 알림

    if (triggerDate <= now) continue; // 이미 지난 시점이면 스킵

    try {
      await Notifications.scheduleNotificationAsync({
        identifier: notifId(ingredient.id, item.tag),
        content: { title: item.title, body: item.body, sound: true, data: { ingredientId: ingredient.id } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: triggerDate },
      });
    } catch {
      // 개별 알림 실패 무시
    }
  }
}

// 재료 소진/삭제 시 예약된 알림 전부 취소
export async function cancelIngredientNotifications(ingredientId: string): Promise<void> {
  const tags = ['d7', 'd3', 'd1', 'dplus1'];
  await Promise.all(
    tags.map((tag) =>
      Notifications.cancelScheduledNotificationAsync(notifId(ingredientId, tag)).catch(() => {})
    )
  );
}

// 앱 시작 시 전체 재료 알림 재예약 (기존 알림 전부 취소 후 재등록)
export async function rescheduleAllNotifications(ingredients: Ingredient[]): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  const active = ingredients.filter((i) => !i.is_consumed);
  await Promise.all(active.map(scheduleExpiryNotifications));
}
