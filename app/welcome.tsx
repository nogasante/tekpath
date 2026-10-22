import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Wordmark } from '@/components/Logo';
import { AppText, Button, Screen } from '@/components/ui';
import { useTheme } from '@/context/Theme';
import { WELCOME_KEY } from '@/lib/welcome';
import { spacing, type as typeScale } from '@/lib/theme';

const slides = [
  {
    icon: 'navigate' as const,
    title: 'Step-free routes across KNUST',
    body: 'TekPath walks you landmark by landmark. Stairs are never offered.',
  },
  {
    icon: 'warning' as const,
    title: 'Live lift and ramp status',
    body: 'Working, Broken, and Unknown always show an icon and a word, not colour alone.',
  },
  {
    icon: 'qr-code' as const,
    title: 'Indoor guidance you can trust',
    body: 'Scan a checkpoint, then follow one big instruction at a time. A barometer can notice a lift floor change.',
  },
];

export default function WelcomeScreen() {
  const { colors } = useTheme();
  const [index, setIndex] = useState(0);
  const slide = slides[index];
  const last = index === slides.length - 1;

  async function finish() {
    await AsyncStorage.setItem(WELCOME_KEY, '1');
    router.replace('/');
  }

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']} scroll>
      <View style={{ gap: spacing.xl, paddingTop: spacing.lg }}>
        <Wordmark size={28} />
        <View
          accessibilityRole="summary"
          style={{
            backgroundColor: colors.primaryMuted,
            borderRadius: 28,
            padding: spacing.xl,
            gap: spacing.md,
            minHeight: 220,
            justifyContent: 'center',
          }}>
          <Ionicons name={slide.icon} size={36} color={colors.primary} aria-hidden />
          <AppText accessibilityRole="header" size={typeScale.title} weight="700">
            {slide.title}
          </AppText>
          <AppText color={colors.muted}>{slide.body}</AppText>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }} accessibilityLabel={`Slide ${index + 1} of ${slides.length}`}>
          {slides.map((item, dot) => (
            <View
              key={item.title}
              style={{
                width: dot === index ? 28 : 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: dot === index ? colors.primary : colors.line,
              }}
            />
          ))}
        </View>
        <Button
          label={last ? 'Open the campus map' : 'Next'}
          icon={last ? 'map' : 'arrow-forward'}
          haptic="light"
          onPress={() => {
            if (last) void finish();
            else setIndex((value) => value + 1);
          }}
        />
        {!last ? (
          <Button label="Skip" variant="ghost" onPress={() => void finish()} />
        ) : null}
      </View>
    </Screen>
  );
}
