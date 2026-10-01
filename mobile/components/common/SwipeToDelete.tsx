import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { IconTrash } from '@tabler/icons-react-native';

import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';

const ACTION_WIDTH = 88;
const OPEN_THRESHOLD = ACTION_WIDTH / 2;

type CloseOpenRow = () => void;

let closeOpenRow: CloseOpenRow | null = null;

interface SwipeToDeleteProps {
  children: ReactNode;
  deleteLabel: string;
  onDelete: () => void;
}

export default function SwipeToDelete({
  children,
  deleteLabel,
  onDelete,
}: SwipeToDeleteProps) {
  const colors = useThemeColors();
  const translateX = useRef(new Animated.Value(0)).current;
  const dragStartX = useRef(0);
  const dragX = useRef(0);

  const close = useCallback(() => {
    Animated.spring(translateX, {
      friction: 9,
      tension: 90,
      toValue: 0,
      useNativeDriver: true,
    }).start();
    dragX.current = 0;
    if (closeOpenRow === close) closeOpenRow = null;
  }, [translateX]);

  const open = useCallback(() => {
    if (closeOpenRow && closeOpenRow !== close) closeOpenRow();
    closeOpenRow = close;
    Animated.spring(translateX, {
      friction: 9,
      tension: 90,
      toValue: -ACTION_WIDTH,
      useNativeDriver: true,
    }).start();
    dragX.current = -ACTION_WIDTH;
  }, [close, translateX]);

  useEffect(() => () => {
    if (closeOpenRow === close) closeOpenRow = null;
  }, [close]);

  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gestureState) => (
      Math.abs(gestureState.dx) > Math.abs(gestureState.dy)
      && Math.abs(gestureState.dx) > 10
    ),
    onPanResponderGrant: () => {
      translateX.stopAnimation((value) => {
        dragStartX.current = value;
        dragX.current = value;
      });
    },
    onPanResponderMove: (_event, gestureState) => {
      const nextX = Math.max(-ACTION_WIDTH, Math.min(0, dragStartX.current + gestureState.dx));
      dragX.current = nextX;
      translateX.setValue(nextX);
    },
    onPanResponderRelease: () => {
      if (dragX.current <= -OPEN_THRESHOLD) open();
      else close();
    },
    onPanResponderTerminate: () => {
      if (dragX.current <= -OPEN_THRESHOLD) open();
      else close();
    },
  }), [close, open, translateX]);

  const closeAnotherRow = useCallback(() => {
    if (closeOpenRow && closeOpenRow !== close) closeOpenRow();
  }, [close]);

  const handleDelete = useCallback(() => {
    translateX.stopAnimation();
    translateX.setValue(0);
    dragX.current = 0;
    if (closeOpenRow === close) closeOpenRow = null;
    onDelete();
  }, [close, onDelete, translateX]);

  return (
    <View onTouchStart={closeAnotherRow} style={styles.container}>
      <View style={[styles.actionContainer, { backgroundColor: colors.danger }]}>
        <Pressable
          accessibilityLabel={deleteLabel}
          accessibilityRole="button"
          onPress={handleDelete}
          style={styles.deleteButton}
        >
          <IconTrash color={palette.bgSurfaceLight} size={20} strokeWidth={2} />
          <Text style={[styles.deleteText, { color: palette.bgSurfaceLight }]}>
            {deleteLabel}
          </Text>
        </Pressable>
      </View>
      <Animated.View
        accessibilityActions={[{ name: 'delete', label: deleteLabel }]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'delete') handleDelete();
        }}
        style={{ transform: [{ translateX }] }}
        {...panResponder.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  actionContainer: {
    bottom: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    width: ACTION_WIDTH,
  },
  container: { overflow: 'hidden' },
  deleteButton: {
    alignItems: 'center',
    flex: 1,
    gap: 3,
    justifyContent: 'center',
    width: ACTION_WIDTH,
  },
  deleteText: { fontSize: 12, fontWeight: '700' },
});
