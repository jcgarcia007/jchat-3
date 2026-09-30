import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
} from 'react-native-svg';

import { palette } from '../../theme/tokens';

const HALO_SIZE = 98;
const HALO_CENTER = HALO_SIZE / 2;

export default function PostHalo() {
  return (
    <View pointerEvents="none" style={styles.halo}>
      <Svg width={HALO_SIZE} height={HALO_SIZE}>
        <Defs>
          <SvgLinearGradient id="postHalo" x1="0" y1="0" x2="1" y2="1">
            {palette.postHalo.map((color, index) => (
              <Stop
                key={color}
                offset={`${(index / (palette.postHalo.length - 1)) * 100}%`}
                stopColor={color}
              />
            ))}
          </SvgLinearGradient>
        </Defs>
        <Circle
          cx={HALO_CENTER}
          cy={HALO_CENTER}
          r={43}
          fill="none"
          stroke="url(#postHalo)"
          strokeWidth={10}
          opacity={0.18}
        />
        <Circle
          cx={HALO_CENTER}
          cy={HALO_CENTER}
          r={39}
          fill="none"
          stroke="url(#postHalo)"
          strokeWidth={7}
          opacity={0.32}
        />
        <Circle
          cx={HALO_CENTER}
          cy={HALO_CENTER}
          r={36}
          fill="none"
          stroke="url(#postHalo)"
          strokeWidth={4}
          opacity={0.75}
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  halo: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
