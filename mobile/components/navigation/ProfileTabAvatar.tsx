import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { IconUser } from '@tabler/icons-react-native';

import { useAuth } from '../../context/AuthContext';
import { getUserById } from '../../services/users';
import { useThemeColors } from '../../theme/colors';

interface ProfileTabAvatarProps {
  active: boolean;
  refreshKey: number;
}

export default function ProfileTabAvatar({ active, refreshKey }: ProfileTabAvatarProps) {
  const colors = useThemeColors();
  const { user } = useAuth();
  const isFocused = useIsFocused();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) {
      setAvatarUrl(null);
      return () => { cancelled = true; };
    }

    void getUserById(user.id)
      .then((profile) => {
        if (!cancelled) setAvatarUrl(profile?.avatar_url ?? null);
      })
      .catch(() => {
        if (!cancelled) setAvatarUrl(null);
      });

    return () => { cancelled = true; };
  }, [isFocused, refreshKey, user?.id]);

  return (
    <View
      style={[
        styles.avatar,
        {
          backgroundColor: colors.bgElevated,
          borderColor: active ? colors.brand : colors.borderSubtle,
        },
      ]}
    >
      {avatarUrl ? (
        <Image resizeMode="cover" source={{ uri: avatarUrl }} style={styles.image} />
      ) : (
        <IconUser size={17} color={active ? colors.brand : colors.textSecondary} strokeWidth={2} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    borderRadius: 15,
    borderWidth: 2,
    height: 30,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 30,
  },
  image: { height: 26, width: 26 },
});
