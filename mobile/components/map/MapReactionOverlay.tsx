/**
 * JChat 3.0 — Map Reaction Overlay (Task 4.5)
 *
 * Subscribes to live map reactions for each business room and renders
 * floating emoji animations over the corresponding business pins.
 *
 * Animation spec (from Task 2.18 comment + Dev Plan 4.5):
 *   translateY: 0 → -30 px
 *   opacity:    1 →  0
 *   scale:      1 →  1.3
 *   duration:   3 000 ms (ease-out via native driver)
 *
 * Multiple simultaneous reactions at the same pin are offset horizontally by
 * HORIZONTAL_STEP px per slot index (0–4). When a 6th reaction arrives, the
 * oldest active reaction for that pin is evicted first (FIFO, max 5 per pin).
 *
 * NOTE — rate-limiting & access control:
 *   Only in-room users can send reactions, and the send side enforces a
 *   1-per-user-per-10 s rate limit (Task 2.18 / sendMapReaction). This overlay
 *   is receive-only: it renders whatever the Realtime channel delivers.
 *
 * // TODO(i18n)
 */

import React, { useEffect, useRef, useCallback } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import {
  subscribeMapReactions,
  type MapReactionBroadcastPayload,
} from '../../services/mapReactions';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Total animation duration in milliseconds (translateY + opacity + scale). */
const ANIMATION_DURATION_MS = 3_000;

/** Distance (px) the emoji floats upward. */
const FLOAT_DISTANCE_PX = 30;

/** Final scale the emoji reaches by end of animation. */
const FINAL_SCALE = 1.3;

/** Maximum concurrent reactions rendered per business pin. */
const MAX_PER_PIN = 5;

/** Horizontal pixel offset between side-by-side reactions at the same pin. */
const HORIZONTAL_STEP = 24;

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/** Coordinates for a business pin on the map. */
export interface BusinessCoord {
  lat: number;
  lng: number;
}

/**
 * Map of businessId → { roomId, coord } so the overlay knows which room to
 * subscribe to and where on screen to place the floating emoji.
 *
 * The overlay positions reactions using absolute pixel offsets within a
 * full-screen View that must be laid over the MapView.
 */
export interface BusinessEntry {
  roomId: string;
  coord: BusinessCoord;
}

/** Props accepted by MapReactionOverlay. */
export interface MapReactionOverlayProps {
  /**
   * Map of businessId → { roomId, coord }.
   * The overlay subscribes to each roomId and renders reactions at the
   * corresponding coord (converted to screen pixels by coordinateToPoint).
   */
  businesses: Record<string, BusinessEntry>;

  /**
   * Converts a lat/lng pair to an absolute {x, y} pixel position within the
   * overlay View. Provided by the parent (MapScreen) so the overlay remains
   * decoupled from the MapView ref.
   *
   * Example usage in MapScreen:
   *   mapRef.current?.coordinateForPoint({ x, y }) / pointForCoordinate(...)
   *   or keep a memoized lat/lng → pixel mapping from the region's camera.
   */
  coordinateToPoint: (coord: BusinessCoord) => { x: number; y: number } | null;
}

// ---------------------------------------------------------------------------
// ActiveReaction — one animated emoji instance
// ---------------------------------------------------------------------------

interface ActiveReaction {
  /** Unique ID for React key and eviction. */
  id: string;
  /** The emoji character to display. */
  emoji: string;
  /** businessId this reaction belongs to (for eviction bookkeeping). */
  businessId: string;
  /**
   * Slot index 0–4; determines horizontal offset so simultaneous reactions
   * at the same pin don't overlap.
   */
  slot: number;
  /** Animated value driving translateY and opacity. */
  progress: Animated.Value;
}

// ---------------------------------------------------------------------------
// ReactionBubble — individual animated emoji
// ---------------------------------------------------------------------------

interface ReactionBubbleProps {
  reaction: ActiveReaction;
  position: { x: number; y: number };
  onFinished: (id: string) => void;
}

const ReactionBubble: React.FC<ReactionBubbleProps> = ({
  reaction,
  position,
  onFinished,
}) => {
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    // Interpolate translateY: 0 → -FLOAT_DISTANCE_PX
    // Interpolate opacity:    1 →  0
    // Interpolate scale:      1 →  FINAL_SCALE
    // All driven by a single Animated.Value (0 → 1) over 3 000 ms.
    Animated.timing(reaction.progress, {
      toValue: 1,
      duration: ANIMATION_DURATION_MS,
      useNativeDriver: true,
      // Ease-out: emoji decelerates as it rises and fades
      easing: (t: number) => 1 - Math.pow(1 - t, 2),
    }).start(() => {
      onFinished(reaction.id);
    });
  }, [onFinished, reaction.id, reaction.progress]);

  const translateY = reaction.progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -FLOAT_DISTANCE_PX],
  });

  const opacity = reaction.progress.interpolate({
    inputRange: [0, 0.6, 1],
    outputRange: [1, 0.8, 0],
  });

  const scale = reaction.progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, FINAL_SCALE],
  });

  const left = position.x + reaction.slot * HORIZONTAL_STEP;
  const top = position.y;

  return (
    <Animated.View
      style={[
        styles.bubble,
        {
          left,
          top,
          opacity,
          transform: [{ translateY }, { scale }],
        },
      ]}
    >
      <Text style={styles.emoji}>{reaction.emoji}</Text>
    </Animated.View>
  );
};

// ---------------------------------------------------------------------------
// MapReactionOverlay — main component
// ---------------------------------------------------------------------------

/**
 * Mount this as a sibling (or child) of <JChatMap> inside an absolute-
 * positioned, full-screen, pointer-events-none View so it sits above the map
 * without capturing touches:
 *
 *   <View style={StyleSheet.absoluteFill} pointerEvents="none">
 *     <MapReactionOverlay
 *       businesses={businessMap}
 *       coordinateToPoint={coordToPoint}
 *     />
 *   </View>
 */
const MapReactionOverlay: React.FC<MapReactionOverlayProps> = ({
  businesses,
  coordinateToPoint,
}) => {
  /**
   * Stable ref holding the live set of active reactions so the Realtime
   * callback (set up once per roomId subscription) always reads the latest
   * state without needing to be re-registered on every render.
   */
  const reactionsRef = useRef<ActiveReaction[]>([]);

  /**
   * Force-render trigger: we only need to re-render when a reaction is added
   * or removed. A simple counter suffices — no need to store reactions in
   * React state directly (avoids stale-closure problems in the callback).
   */
  const [, forceUpdate] = React.useReducer((n: number) => n + 1, 0);

  // ---------------------------------------------------------------------------
  // Handler: called by the Realtime callback for each incoming reaction
  // ---------------------------------------------------------------------------

  const handleReaction = useCallback(
    (businessId: string, payload: MapReactionBroadcastPayload) => {
      const current = reactionsRef.current;

      // Reactions for this specific pin.
      const pinReactions = current.filter((r) => r.businessId === businessId);

      // Evict the oldest reaction if we're at the max.
      let updated = current;
      if (pinReactions.length >= MAX_PER_PIN) {
        const oldest = pinReactions[0];
        updated = current.filter((r) => r.id !== oldest.id);
      }

      // Determine the next available slot (0–4).
      const usedSlots = new Set(
        updated.filter((r) => r.businessId === businessId).map((r) => r.slot),
      );
      let slot = 0;
      while (usedSlots.has(slot) && slot < MAX_PER_PIN - 1) slot++;

      const newReaction: ActiveReaction = {
        id: `${businessId}-${Date.now()}-${Math.random()}`,
        emoji: payload.emoji,
        businessId,
        slot,
        progress: new Animated.Value(0),
      };

      reactionsRef.current = [...updated, newReaction];
      forceUpdate();
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // Handler: remove a finished reaction from state
  // ---------------------------------------------------------------------------

  const handleFinished = useCallback((id: string) => {
    reactionsRef.current = reactionsRef.current.filter((r) => r.id !== id);
    forceUpdate();
  }, []);

  // ---------------------------------------------------------------------------
  // Subscribe to each business room's Realtime channel
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const entries = Object.entries(businesses);
    if (entries.length === 0) return;

    const unsubFns: Array<() => void> = entries.map(([businessId, entry]) => {
      return subscribeMapReactions(entry.roomId, (payload) => {
        handleReaction(businessId, payload);
      });
    });

    return () => {
      // Unsubscribe from ALL channels on unmount or when `businesses` changes.
      unsubFns.forEach((unsub) => unsub());
    };
  }, [businesses, handleReaction]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const reactions = reactionsRef.current;

  if (reactions.length === 0) {
    return null;
  }

  return (
    <>
      {reactions.map((reaction) => {
        const entry = businesses[reaction.businessId];
        if (!entry) return null;

        const point = coordinateToPoint(entry.coord);
        if (!point) return null;

        return (
          <ReactionBubble
            key={reaction.id}
            reaction={reaction}
            position={point}
            onFinished={handleFinished}
          />
        );
      })}
    </>
  );
};

// ---------------------------------------------------------------------------
// Styles — no hardcoded hex; emoji needs no background color
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  /**
   * Each bubble is positioned absolutely within the overlay View.
   * The parent must be StyleSheet.absoluteFill with pointerEvents="none".
   */
  bubble: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    // No backgroundColor — the emoji floats transparently over the map.
  },
  emoji: {
    fontSize: 24,
    // Line-height clamped to match font size to avoid extra vertical space.
    lineHeight: 28,
  },
});

export default MapReactionOverlay;
