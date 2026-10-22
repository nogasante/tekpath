import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export type HapticKind = 'light' | 'selection' | 'success' | 'warning';

export async function haptic(kind: HapticKind = 'light') {
  if (Platform.OS === 'web') return;
  try {
    if (kind === 'selection') {
      await Haptics.selectionAsync();
      return;
    }
    if (kind === 'success') {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return;
    }
    if (kind === 'warning') {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {
    // Expo Go can refuse haptics on a simulator. The action still proceeds.
  }
}
