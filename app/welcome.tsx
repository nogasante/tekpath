import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { CaneScene, CrutchesScene, KenteBand, WheelchairScene } from '@/components/Illustrations';
import { Wordmark } from '@/components/Logo';
import { AppText, Button, Screen } from '@/components/ui';
import { useTheme } from '@/context/Theme';
import { WELCOME_KEY } from '@/lib/welcome';
import { spacing, type as typeScale } from '@/lib/theme';

const slides = [
  {
    art: WheelchairScene,
    title: 'The long way, when it is the step-free way',
    body: 'TekPath only offers routes a wheelchair can take. Stairs are never treated as a shortcut.',
  },
  {
    art: CrutchesScene,
    title: 'Lifts and ramps, told plainly',
    body: 'Working, Broken, and Unknown always show an icon and a word, so colour is never the only clue.',
  },
  {
    art: CaneScene,
    title: 'One landmark at a time',
    body: 'Scan a checkpoint indoors. If the phone has a barometer, it can notice when a lift changes floor.',
  },
];

export default function WelcomeScreen() {
  const { colors } = useTheme();
  const [index, setIndex] = useState(0);
  const slide = slides[index];
  const Art = slide.art;
  const last = index === slides.length - 1;

  async function finish() {
    await AsyncStorage.setItem(WELCOME_KEY, '1');
    router.replace('/');
  }

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']} padded={false}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, padding: spacing.lg, paddingTop: spacing.md, justifyContent: 'space-between', gap: spacing.lg }}
        keyboardShouldPersistTaps="handled">
        <View style={{ gap: spacing.md }}>
          <KenteBand />
          <Wordmark size={26} />
        </View>
        <Art />
        <View style={{ gap: spacing.sm }}>
          <AppText accessibilityRole="header" size={typeScale.title} weight="700">
            {slide.title}
          </AppText>
          <AppText color={colors.muted}>{slide.body}</AppText>
          <View style={{ flexDirection: 'row', gap: 8, minHeight: 48, alignItems: 'center' }} accessibilityLabel={`Intro ${index + 1} of ${slides.length}`}>
            {slides.map((item, dot) => (
              <View
                key={item.title}
                style={{
                  width: dot === index ? 22 : 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: dot === index ? colors.primary : colors.line,
                }}
              />
            ))}
          </View>
        </View>
        <View style={{ gap: spacing.sm }}>
          <Button
            label={last ? 'Open the campus map' : 'Next'}
            icon={last ? 'map' : 'arrow-forward'}
            haptic="light"
            onPress={() => {
              if (last) void finish();
              else setIndex((value) => value + 1);
            }}
          />
          {!last ? <Button label="Skip" variant="ghost" onPress={() => void finish()} /> : null}
        </View>
      </ScrollView>
    </Screen>
  );
}
