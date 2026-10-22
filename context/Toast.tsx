import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui';
import { useTheme } from '@/context/Theme';
import { haptic } from '@/lib/haptics';
import { radii, spacing } from '@/lib/theme';

type Tone = 'good' | 'bad';

type ToastValue = {
  show: (message: string, tone?: Tone) => void;
};

const ToastContext = createContext<ToastValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<{ message: string; tone: Tone } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((message: string, tone: Tone = 'good') => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ message, tone });
    void haptic(tone === 'good' ? 'success' : 'warning');
    timer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <View
          pointerEvents="none"
          accessibilityRole="alert"
          style={{
            position: 'absolute',
            left: insets.left + spacing.lg,
            right: insets.right + spacing.lg,
            top: insets.top + 12,
            borderRadius: radii.md,
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.md,
            backgroundColor: toast.tone === 'good' ? colors.primary : colors.danger,
          }}>
          <AppText weight="700" color={toast.tone === 'good' ? colors.onPrimary : colors.onDanger}>
            {toast.message}
          </AppText>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast must be used within ToastProvider');
  return value;
}
