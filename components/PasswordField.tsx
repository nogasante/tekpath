import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { AppText } from '@/components/ui';
import { useAppState } from '@/context/AppState';
import { useTheme } from '@/context/Theme';
import { font, radii, type as typeScale } from '@/lib/theme';

export function PasswordField({
  label = 'Password',
  value,
  onChangeText,
  error,
}: {
  label?: string;
  value: string;
  onChangeText: (value: string) => void;
  error?: string | null;
}) {
  const { colors } = useTheme();
  const { textScale } = useAppState();
  const [shown, setShown] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <AppText size={typeScale.label} weight="700" nativeID="password-label">
        {label}
      </AppText>
      <View
        style={{
          minHeight: 52,
          borderWidth: 1,
          borderColor: error ? colors.danger : colors.line,
          borderRadius: radii.md,
          backgroundColor: colors.bgElevated,
          flexDirection: 'row',
          alignItems: 'center',
        }}>
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!shown}
          autoCapitalize="none"
          autoComplete="password"
          textContentType="password"
          placeholder="At least 6 characters"
          placeholderTextColor={colors.muted}
          style={{
            flex: 1,
            minHeight: 52,
            paddingHorizontal: 14,
            color: colors.ink,
            fontFamily: font.regular,
            fontSize: 16 * textScale,
          }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={shown ? 'Hide password' : 'Show password'}
          onPress={() => setShown((current) => !current)}
          style={{ minWidth: 64, minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingRight: 8 }}>
          <AppText weight="700" color={colors.primary}>
            {shown ? 'Hide' : 'Show'}
          </AppText>
        </Pressable>
      </View>
      {error ? (
        <AppText accessibilityRole="alert" size={typeScale.label} color={colors.danger}>
          {error}
        </AppText>
      ) : null}
    </View>
  );
}
