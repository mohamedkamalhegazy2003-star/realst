import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as BackgroundTask from 'expo-background-task';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';

export const REMINDER_TASK = 'estate-manager-four-hour-reminder';
const FALLBACK_NOTIFICATION_KEY = 'estate-manager-reminder-notification';
const REMINDER_CONTENT = {
  title: 'تذكير إدارة العقارات',
  body: 'حان وقت مراجعة التحصيلات والمستحقات.',
  sound: true,
  channelId: 'property-reminders',
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

if (Platform.OS !== 'web') {
  TaskManager.defineTask(REMINDER_TASK, async () => {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          ...REMINDER_CONTENT,
        },
        trigger: null,
      });
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

export async function enableFourHourReminders(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('property-reminders', {
        name: 'تذكيرات العقارات',
        importance: Notifications.AndroidImportance.DEFAULT,
        sound: 'default',
      });
    }
    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted) permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted) return false;

    const status = await BackgroundTask.getStatusAsync();
    if (status === BackgroundTask.BackgroundTaskStatus.Available) {
      const registered = await TaskManager.isTaskRegisteredAsync(REMINDER_TASK);
      if (!registered) {
        await BackgroundTask.registerTaskAsync(REMINDER_TASK, { minimumInterval: 240 });
      }
      return true;
    }
  } catch {
    // Fall through to a repeating OS notification when the background task API is unavailable.
  }

  const existing = await AsyncStorage.getItem(FALLBACK_NOTIFICATION_KEY);
  if (existing) await Notifications.cancelScheduledNotificationAsync(existing).catch(() => undefined);
  const id = await Notifications.scheduleNotificationAsync({
    content: REMINDER_CONTENT,
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 4 * 60 * 60,
      repeats: true,
    },
  });
  await AsyncStorage.setItem(FALLBACK_NOTIFICATION_KEY, id);
  return true;
}

export async function disableFourHourReminders(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    if (await TaskManager.isTaskRegisteredAsync(REMINDER_TASK)) {
      await BackgroundTask.unregisterTaskAsync(REMINDER_TASK);
    }
  } finally {
    const id = await AsyncStorage.getItem(FALLBACK_NOTIFICATION_KEY);
    if (id) await Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined);
    await AsyncStorage.removeItem(FALLBACK_NOTIFICATION_KEY);
  }
}

export async function areFourHourRemindersEnabled(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    if (await TaskManager.isTaskRegisteredAsync(REMINDER_TASK)) return true;
  } catch {
    // A scheduled notification is the supported fallback on this device.
  }
  return Boolean(await AsyncStorage.getItem(FALLBACK_NOTIFICATION_KEY));
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('property-reminders', {
      name: 'تذكيرات العقارات',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: 'default',
    });
  }
  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) permission = await Notifications.requestPermissionsAsync();
  return permission.granted;
}
