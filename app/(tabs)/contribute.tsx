import { router } from 'expo-router';

import { AppText, Button, Card, Screen } from '@/components/ui';
import { useAppState } from '@/context/AppState';
import { useTheme } from '@/context/Theme';
import { type as typeScale } from '@/lib/theme';

export default function ContributeScreen() {
  const { colors } = useTheme();
  const { session } = useAppState();
  return (
    <Screen scroll>
      <AppText size={typeScale.body} color={colors.muted}>
        Browsing is open to everyone. Adding a point, a floor, or a report needs a signed-in student account.
      </AppText>
      {!session ? (
        <Button label="Sign in to contribute" icon="log-in" haptic="light" onPress={() => router.push('/login')} />
      ) : (
        <Card>
          <AppText weight="700">Signed in</AppText>
          <AppText color={colors.muted}>{session.user.email}</AppText>
        </Card>
      )}
      <Button label="Add an accessibility point" icon="location" haptic="light" onPress={() => router.push('/add-point')} />
      <Button label="Map a building" icon="business" variant="secondary" onPress={() => router.push('/map-building')} />
      <Button label="Print QR checkpoints" icon="qr-code" variant="secondary" onPress={() => router.push('/qr')} />
      <AppText size={typeScale.label} color={colors.muted}>
        A new point is saved to the campus database and shows on the map for everyone. Mapping a building adds floors, nodes, and the edges the router walks.
      </AppText>
    </Screen>
  );
}
