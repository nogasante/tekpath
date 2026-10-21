import { router } from 'expo-router';

import { AppText, Button, Screen } from '@/components/ui';
import { useAppState } from '@/context/AppState';
import { colors } from '@/lib/theme';

export default function ContributeScreen() {
  const { session } = useAppState();
  return (
    <Screen scroll>
      <AppText size={16} color={colors.muted}>
        Browsing is open to everyone. Adding a point, a floor, or a report needs a signed-in student account.
      </AppText>
      {!session ? (
        <Button label="Sign in to contribute" icon="log-in" onPress={() => router.push('/login')} />
      ) : (
        <AppText>Signed in as {session.user.email}.</AppText>
      )}
      <Button label="Add an accessibility point" icon="location" onPress={() => router.push('/add-point')} />
      <Button label="Map a building" icon="business" variant="secondary" onPress={() => router.push('/map-building')} />
      <Button label="Print QR checkpoints" icon="qr-code" variant="secondary" onPress={() => router.push('/qr')} />
      <AppText size={16}>
        A new point is saved to the campus database and shows on the map for everyone. Mapping a building adds floors, nodes, and the edges the router walks.
      </AppText>
    </Screen>
  );
}
