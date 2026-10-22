import { View } from 'react-native';

import { AppText } from '@/components/ui';
import { useTheme } from '@/context/Theme';
import { reviewBadge } from '@/lib/moderation';
import { radii, type as typeScale } from '@/lib/theme';

export function ReviewMark({ status }: { status: string | null | undefined }) {
  const { colors } = useTheme();
  const label = reviewBadge(status);
  if (!label) return null;
  const rejected = status === 'rejected';
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        backgroundColor: rejected ? colors.brokenBg : colors.accentMuted,
        borderRadius: radii.pill,
        paddingHorizontal: 10,
        paddingVertical: 4,
      }}>
      <AppText size={typeScale.caption} weight="700" color={rejected ? colors.brokenFg : colors.accent}>
        {label}
      </AppText>
    </View>
  );
}
