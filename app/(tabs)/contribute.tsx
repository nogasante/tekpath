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
        The map, search, routes, and indoor guidance work with no account. Adding a point or a report asks you to continue as a guest, or with an email.
      </AppText>
      {!session ? (
        <Button label="Continue as guest or with email" icon="person" haptic="light" onPress={() => router.push('/login')} />
      ) : (
        <Card>
          <AppText weight="700">{session.user.is_anonymous ? 'Guest' : 'Signed in'}</AppText>
          <AppText color={colors.muted}>
            {session.user.is_anonymous ? 'Reports stay on this phone until you add an email.' : session.user.email}
          </AppText>
        </Card>
      )}
      <Button label="Add an accessibility point" icon="location" haptic="light" onPress={() => router.push('/add-point')} />
      <Button label="Map a building by walking" icon="walk" variant="secondary" onPress={() => router.push('/walk')} />
      <Button label="Enter floors and nodes by hand" icon="business" variant="ghost" onPress={() => router.push('/map-building')} />
      <Button label="Print QR checkpoints" icon="qr-code" variant="secondary" onPress={() => router.push('/qr')} />
      <AppText size={typeScale.label} color={colors.muted}>
        A new point is saved to the campus database and shows on the map for everyone. Walking a building uses its outline, then adds the floors, nodes, and edges the router walks.
      </AppText>
    </Screen>
  );
}
