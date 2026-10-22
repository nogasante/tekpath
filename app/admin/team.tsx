import { useState } from 'react';
import { View } from 'react-native';

import { AppText, Button, Card, Field, Notice, Screen } from '@/components/ui';
import { useTheme } from '@/context/Theme';
import { useToast } from '@/context/Toast';
import { canManageTeam, roleLabel, type CampusRole } from '@/lib/moderation';
import { supabase } from '@/lib/supabase';
import { useCampusRole } from '@/lib/useCampusRole';
import { spacing, type as typeScale } from '@/lib/theme';

type Person = {
  user_id: string;
  display_name: string | null;
  email: string | null;
  role: CampusRole;
};

const choices: CampusRole[] = ['admin', 'moderator', 'contributor'];

export default function TeamScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const role = useCampusRole();
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<Person[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  async function search() {
    setError(null);
    setSearched(true);
    const result = await supabase.rpc('admin_find_users', { query: query.trim() });
    if (result.error) {
      setPeople([]);
      setError(result.error.message);
      return;
    }
    setPeople((result.data ?? []) as Person[]);
  }

  async function setRole(person: Person, next: CampusRole) {
    setBusyId(person.user_id);
    setError(null);
    const result = await supabase.rpc('admin_set_role', { target_user: person.user_id, role: next });
    setBusyId(null);
    if (result.error) {
      setError(result.error.message);
      toast.show('The role did not change.', 'bad');
      return;
    }
    setPeople((current) => current.map((item) => (item.user_id === person.user_id ? { ...item, role: next } : item)));
    toast.show(next === 'contributor' ? `${person.display_name || 'This person'} is a contributor.` : `${person.display_name || 'This person'} is now ${roleLabel(next).toLowerCase()}.`);
  }

  if (role && !canManageTeam(role)) {
    return (
      <Screen scroll>
        <Notice>Only an admin can change who reviews maps.</Notice>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <AppText color={colors.muted}>Search by name or email. Emails stay on this screen.</AppText>
      <Field
        label="Find a person"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="Name or email"
        accessibilityRole="search"
      />
      <Button label="Search" icon="search" haptic="light" onPress={() => void search()} />
      {error ? <Notice tone="bad">{error}</Notice> : null}
      {searched && people.length === 0 && !error ? <AppText color={colors.muted}>No one matched.</AppText> : null}
      {people.map((person) => (
        <Card key={person.user_id}>
          <AppText weight="700" size={typeScale.headline}>
            {person.display_name || 'Student'}
          </AppText>
          <AppText color={colors.muted}>{person.email}</AppText>
          <AppText weight="700">{roleLabel(person.role)}</AppText>
          <View style={{ gap: spacing.sm }}>
            {choices.map((choice) => (
              <Button
                key={choice}
                label={choice === 'contributor' ? 'Contributor' : roleLabel(choice)}
                variant={person.role === choice ? 'primary' : 'secondary'}
                disabled={busyId === person.user_id || person.role === choice}
                onPress={() => void setRole(person, choice)}
              />
            ))}
          </View>
        </Card>
      ))}
    </Screen>
  );
}
