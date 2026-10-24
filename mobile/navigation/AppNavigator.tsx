/**
 * JChat 3.0 — Root Navigator (Task 0.7, auth upgraded in Stage 1)
 *
 * Auth guard: if isAuthenticated (+ 18+ confirmed) → MainStack (tabs + modal screens)
 *             otherwise         → AuthStack (Splash → Welcome → Login → Register)
 *
 * Deep linking: jchat://room/:id  →  ChatRoomScreen
 * Auth comes from AuthContext (useAuth); screens consume it directly.
 */

import { setEntryTableToken } from '../services/venueTable';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import {
  CommonActions,
  NavigationContainer,
  StackActions,
  LinkingOptions,
} from '@react-navigation/native';
import type { NavigatorScreenParams } from '@react-navigation/native';
import {
  createNativeStackNavigator,
  NativeStackNavigationOptions,
} from '@react-navigation/native-stack';

import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../hooks/useNotifications';
import type { NotificationRoute } from '../services/notifications';
import {
  getOnboardingCompleted,
  hasLocalOnboardingCompletion,
} from '../services/onboarding';
// iOS / Android: the bottom tabs. Web: WebNoVenueScreen (no tabs, no map) — navigation/rootTabs.web.tsx.
import RootTabs from './rootTabs';
import { navigationRef } from './navigationRef';
import { HomeStatusBar } from '../components/venue/HomeStatusBar';
import { venueBarPlacement } from './venueBarPlacement';
import { HomeBarInsetProvider } from '../components/venue/HomeBarInset';
import { OrdersBarProvider } from '../context/OrdersBarContext';
import {
  clearPendingEntry,
  loadPendingEntry,
  resolveEntry,
  savePendingEntry,
  subscribePendingEntry,
} from '../services/venueEntry';
import { confirm, showAlert } from '../utils/dialog';
import { planVenueChatNavigation } from '../utils/venueChatNav';
import { shouldLinkingHandle } from '../utils/entryUrl';
import type { BottomTabParamList } from './tabs/BottomTabs';

// Auth screens
import SplashScreen from '../screens/auth/SplashScreen';
import WelcomeScreen from '../screens/auth/WelcomeScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import LoginEmailScreen from '../screens/auth/LoginEmailScreen';
import RegisterStep1Screen from '../screens/auth/RegisterStep1Screen';
import RegisterStep2Screen from '../screens/auth/RegisterStep2Screen';
import LockScreen from '../screens/auth/LockScreen';
import ConfirmAgeScreen from '../screens/auth/ConfirmAgeScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
import ResetPasswordScreen from '../screens/auth/ResetPasswordScreen';
import BiometricEnrollGate from '../components/auth/BiometricEnrollGate';

// Non-tab screens that live inside the main (authenticated) stack
import ChatRoomScreen from '../screens/chat/ChatRoomScreen';
import OnboardingScreen from '../screens/onboarding/OnboardingScreen';
import EditProfileScreen from '../screens/profile/EditProfileScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';
import ProfileSheetScreen from '../screens/profile/ProfileSheetScreen';
import CreatePostScreen from '../screens/feed/CreatePostScreen';
import PostDetailScreen from '../screens/posts/PostDetailScreen';
import DMStack, { type DMStackParamList } from './DMStack';
import FriendsScreen from '../screens/friends/FriendsScreen';
import OffersScreen from '../screens/offers/OffersScreen';
import SettingsStack from './SettingsStack';
import MenuScreen from '../screens/menu/MenuScreen';
import MenuWebPreviewScreen from '../screens/menu/MenuWebPreviewScreen';
import MenuSheetScreen from '../screens/menu/MenuSheetScreen';
import ProductDetailScreen from '../screens/menu/ProductDetailScreen';
import CartScreen from '../screens/menu/CartScreen';
import CheckoutScreen from '../screens/checkout/CheckoutScreen';
import PaymentSuccessScreen from '../screens/checkout/PaymentSuccessScreen';
import OrderTrackingScreen from '../screens/orders/OrderTrackingScreen';
import MyOrdersScreen from '../screens/orders/MyOrdersScreen';
import MyReservationsScreen from '../screens/reservations/MyReservationsScreen';
import MatchHomeScreen from '../screens/match/MatchHomeScreen';
import MatchMyProfileScreen from '../screens/match/MatchMyProfileScreen';
import MatchInterestsScreen from '../screens/match/MatchInterestsScreen';
import MatchProfileScreen from '../screens/match/MatchProfileScreen';
import MatchItsAMatchScreen from '../screens/match/MatchItsAMatchScreen';
import MatchActivityScreen from '../screens/match/MatchActivityScreen';
import TodHomeScreen from '../screens/games/TodHomeScreen';
import type { MatchCard } from '../services/matchTypes';
import type { MenuItem } from '../services/menu';

export type AuthStackParamList = {
  Splash: undefined;
  Welcome: undefined;
  Login: undefined;
  LoginEmail: undefined;
  RegisterStep1: { passwordError?: 'leaked' } | undefined;
  RegisterStep2: { name?: string; email?: string; password?: string };
  ForgotPassword: undefined;
};

/** Tabs are nested under BottomTabs — only ChatRoom is a "push" screen here */
export type MainStackParamList = {
  /** Native: the tabs. Web: WebNoVenueScreen, which reads `leftBusinessName` ("Saliste de …"). */
  Tabs: NavigatorScreenParams<BottomTabParamList> | { leftBusinessName?: string } | undefined;
  DMs: NavigatorScreenParams<DMStackParamList>;
  Friends: { userId?: string; initialTab?: 'followers' | 'following' | 'requests' } | undefined;
  Offers: undefined;
  /** `tableLabel`: table context from a table QR (shown in the venue session / pre-filled in the waiter call). */
  ChatRoom: { id: string; tableLabel?: string };
  /**
   * Onboarding — 4-screen flow for brand-new users.
   * TODO(Task 1.7): gate on users.onboarding_completed so it only shows once.
   * For now Skip/Complete always navigate to Tabs.
   */
  Onboarding: undefined;
  EditProfile: undefined;
  UserProfile: { userId: string };
  /** The profile as a sheet ON TOP of the chat (transparentModal): mine when `userId` is absent. */
  ProfileSheet: { userId?: string } | undefined;
  CreatePost: undefined;
  PostDetail: { postId: string };
  Settings: undefined;
  /**
   * Task 3.2 — Full-screen menu for a business.
   * Navigated to from ChatRoomScreen (menu button in header).
   */
  Menu: {
    businessId: string;
    roomId?: string;
    /** Business name to show in the header while the menu loads. */
    businessName?: string;
    /** Used by the WebView preview prototype. */
    slug?: string;
  };
  /** Web only: the venue's public menu in a sheet over the chat (iframe `url` = …/m/<slug>?embed=1; `openUrl` = the plain page for "open in another tab"). */
  MenuSheet: { url: string; businessName?: string; openUrl?: string };
  /** Temporary WebView prototype — shows /m/[slug] for design validation. */
  MenuWebPreview: { slug: string; businessName?: string; businessId: string; roomId?: string };
  ProductDetail: { item: MenuItem; businessName?: string };
  Cart: undefined;
  Checkout: undefined;
  PaymentSuccess: {
    /** Present once the webhook created the order. Absent in "processing" mode. */
    orderId?: string;
    /** The real, server-assigned order number. */
    orderNumber?: number;
    businessName?: string;
    orderType: string;
    roomId?: string;
    /** The order didn't show up within the polling window: tell the user it is being processed. */
    processing?: boolean;
  };
  OrderTracking: { orderId: string; roomId?: string };
  /** The signed-in user's own orders. */
  MyOrders: undefined;
  MyReservations: undefined;
  /** Match (JChat's venue game): entry/home screen. Presence state comes from the shared store. */
  MatchHome: { businessId: string; businessName?: string };
  /** Truth or Dare: publish a card (pick a category) in the room the player was in. */
  TodHome: { businessId: string; businessName?: string; roomId: string };
  /** "Mi perfil del deck": my Match card, photos, interests and settings. */
  MatchMyProfile: undefined;
  /** Interests quiz/editor. firstTime shows "skip". */
  MatchInterests: { firstTime?: boolean } | undefined;
  /** Another person's Match profile. `card` (optional) paints instantly while the profile refreshes. */
  MatchProfile: { businessId: string; userId: string; businessName?: string; card?: MatchCard };
  /** "My activity": My likes / Liked me / Matches. */
  MatchActivity: { businessId: string; businessName?: string; tab?: 'likes' | 'likedMe' | 'matches' };
  /** "It's a match!" — `other` is the matched person, conversationId the ephemeral DM. */
  MatchItsAMatch: {
    businessId: string;
    businessName?: string;
    other: MatchCard;
    conversationId: string | null;
    matchId: string | null;
  };
};

type RecoveryStackParamList = { ResetPassword: undefined };

const AuthStack     = createNativeStackNavigator<AuthStackParamList>();
const MainStack     = createNativeStackNavigator<MainStackParamList>();
const LockStack     = createNativeStackNavigator<{ Lock: undefined }>();
const AgeStack      = createNativeStackNavigator<{ ConfirmAge: undefined }>();
const RecoveryStack = createNativeStackNavigator<RecoveryStackParamList>();

const defaultScreenOptions: NativeStackNavigationOptions = {
  headerShown: false,
};

const linking: LinkingOptions<MainStackParamList> = {
  prefixes: ['jchat://'],
  // Venue-entry URLs (jchat://v/…, jchat://c/…) are NOT screens: useEntryLinkCapture + EntryBridge own them.
  filter: shouldLinkingHandle,
  config: {
    screens: {
      ChatRoom: 'room/:id',
      PostDetail: 'post/:postId',
    },
  },
};


/**
 * Opens a venue's chat ("Volver al chat" and QR / link entries). In React Navigation 7 navigate() pushes a second
 * ChatRoom when one is already below, and ChatRoomScreen cannot switch rooms without remounting, so
 * planVenueChatNavigation decides: the SAME room → popTo its instance; ANOTHER room → drop that ChatRoom and what
 * is above it and mount a new instance (one reset: a single transition, the routes below keep their state);
 * no ChatRoom → a plain navigate.
 */
function openVenueChat(roomId: string, tableLabel?: string): void {
  if (!navigationRef.isReady()) return;
  const rootState = navigationRef.getRootState();
  const plan = planVenueChatNavigation(rootState?.routes ?? [], roomId, tableLabel);
  if (plan.kind === 'popTo') {
    navigationRef.dispatch(StackActions.popTo('ChatRoom', plan.params));
  } else if (plan.kind === 'replace' && rootState) {
    const kept = rootState.routes.slice(0, plan.keep);
    navigationRef.dispatch(
      CommonActions.reset({ ...rootState, routes: [...kept, { name: 'ChatRoom', params: plan.params }], index: kept.length }),
    );
  } else {
    navigationRef.navigate('ChatRoom', plan.params);
  }
}

function navigateNotificationRoute(route: NotificationRoute): void {
  if (!navigationRef.isReady()) return;
  if (route.screen === 'DMs') navigationRef.navigate('DMs', route.params);
  else if (route.screen === 'UserProfile') navigationRef.navigate('UserProfile', route.params);
  else if (route.screen === 'MatchActivity') navigationRef.navigate('MatchActivity', route.params);
  else if (route.screen === 'MatchHome') navigationRef.navigate('MatchHome', route.params);
  else if (route.screen === 'OrderTracking') navigationRef.navigate('OrderTracking', route.params);
  else if (route.screen === 'MyOrders') navigationRef.navigate('MyOrders');
  else navigationRef.navigate('PostDetail', route.params);
}

function AuthenticatedNotificationsBridge({ navigationReady }: { navigationReady: boolean }) {
  const { pendingRoute, clearPendingRoute } = useNotifications({ passive: false });

  useEffect(() => {
    if (!navigationReady || !pendingRoute || !navigationRef.isReady()) return;
    navigateNotificationRoute(pendingRoute);
    clearPendingRoute();
    if (Platform.OS !== 'web') void Notifications.clearLastNotificationResponseAsync().catch(() => {});
  }, [clearPendingRoute, navigationReady, pendingRoute]);

  return null;
}

// Password recovery is an in-app OTP flow. AuthContext persists recovery intent
// before verifyOtp creates a session, so this navigator never exposes MainStack.

/**
 * EntryBridge — consumes the pending venue entry (a scanned QR / opened link saved by useEntryLinkCapture or
 * captureWebEntry) once the person is signed in, over 18, and past the onboarding. It opens that venue's chat;
 * the chat itself still asks the server for presence (geofence gate), so a QR never grants access by itself.
 * The entry is cleared BEFORE it is resolved (no loops); a network failure offers Retry (it is saved again).
 * A different venue than the active session is handled by ChatRoomScreen → venue.startSession ("Switch to …?").
 */
function EntryBridge({ active }: { active: boolean }) {
  const { t } = useTranslation('chat');
  const { t: tc } = useTranslation('common');
  const busyRef = useRef(false);
  const activeRef = useRef(active);
  activeRef.current = active;

  const consume = useCallback(async () => {
    if (busyRef.current || !activeRef.current) return;
    busyRef.current = true;
    let retry = false;
    try {
      const target = await loadPendingEntry();
      if (!target) return;
      await clearPendingEntry();
      try {
        const entry = await resolveEntry(target);
        if (!entry) {
          showAlert(t('entry.invalidTitle'), t('entry.invalidBody'));
          return;
        }
        // The table QR token stays in memory (never a route param: those can reach the browser URL); the web menu
        // sheet hands it to the framed menu by postMessage.
        setEntryTableToken(entry.roomId, entry.tableQrToken);
        openVenueChat(entry.roomId, entry.tableLabel ?? undefined);
      } catch {
        const again = await confirm(t('entry.networkTitle'), t('entry.networkBody'), {
          confirmText: t('entry.retry'),
          cancelText: tc('actions.cancel'),
        });
        if (again) {
          await savePendingEntry(target);
          retry = true;
        }
      }
    } finally {
      busyRef.current = false;
    }
    if (retry) void consume();
  }, [t, tc]);

  // Conditions became true (signed in, age confirmed, onboarding done): consume what is waiting.
  useEffect(() => {
    if (active) void consume();
  }, [active, consume]);

  // A link that arrives with the app already open.
  useEffect(() => subscribePendingEntry(() => void consume()), [consume]);

  return null;
}

export default function AppNavigator() {
  const { isAuthenticated, locked, isRecovering, user, ageStatus } = useAuth();
  const [navigationReady, setNavigationReady] = useState(false);
  const [currentRoute, setCurrentRoute] = useState<string | null>(null);
  // The onboarding check (below) has finished for this user: until then an entry must not navigate, because a
  // brand-new user is reset to Onboarding and the chat would be wiped.
  const [onboardingResolvedFor, setOnboardingResolvedFor] = useState<string | null>(null);
  const notificationsEnabled = isAuthenticated && !locked && !isRecovering && ageStatus === 'confirmed';
  const onboardingCheckedUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user?.id) {
      onboardingCheckedUserRef.current = null;
      return;
    }
    if (!notificationsEnabled || !navigationReady || !navigationRef.isReady()) return;
    if (onboardingCheckedUserRef.current === user.id) return;

    onboardingCheckedUserRef.current = user.id;
    const userId = user.id;
    let cancelled = false;
    void Promise.all([
      getOnboardingCompleted(user.id),
      hasLocalOnboardingCompletion(),
    ])
      .then(([completedRemotely, completedLocally]) => {
        if (cancelled || completedRemotely || completedLocally || !navigationRef.isReady()) return;
        navigationRef.resetRoot({ index: 0, routes: [{ name: 'Onboarding' }] });
        // Same batch as the "resolved" flag below, so EntryBridge never sees "resolved" with the old route.
        setCurrentRoute('Onboarding');
      })
      .catch(() => undefined)
      .finally(() => setOnboardingResolvedFor(userId));

    return () => {
      cancelled = true;
    };
  }, [navigationReady, notificationsEnabled, user?.id]);

  return (
    <HomeBarInsetProvider>
    <OrdersBarProvider>
    <NavigationContainer
      linking={linking}
      onReady={() => {
        setNavigationReady(true);
        setCurrentRoute(navigationRef.getCurrentRoute()?.name ?? null);
      }}
      onStateChange={() => setCurrentRoute(navigationRef.getCurrentRoute()?.name ?? null)}
      ref={navigationRef}
    >
      {isAuthenticated && isRecovering ? (
        // The verified OTP creates a session, but the user must save or cancel
        // before leaving this isolated stack.
        <RecoveryStack.Navigator screenOptions={{ ...defaultScreenOptions, gestureEnabled: false }}>
          <RecoveryStack.Screen name="ResetPassword" component={ResetPasswordScreen} />
        </RecoveryStack.Navigator>
      ) : !isAuthenticated ? (
        <AuthStack.Navigator screenOptions={defaultScreenOptions}>
          <AuthStack.Screen name="Splash" component={SplashScreen} />
          <AuthStack.Screen name="Welcome" component={WelcomeScreen} />
          <AuthStack.Screen name="Login" component={LoginScreen} />
          <AuthStack.Screen name="LoginEmail" component={LoginEmailScreen} />
          <AuthStack.Screen name="RegisterStep1" component={RegisterStep1Screen} />
          <AuthStack.Screen name="RegisterStep2" component={RegisterStep2Screen} />
          <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
        </AuthStack.Navigator>
      ) : locked ? (
        // Biometric gate — a restored session must pass Face ID before the app.
        <LockStack.Navigator screenOptions={defaultScreenOptions}>
          <LockStack.Screen name="Lock" component={LockScreen} />
        </LockStack.Navigator>
      ) : ageStatus !== 'confirmed' ? (
        // 18+ gate — no tabs/app until users.age_confirmed_at is set server-side.
        <AgeStack.Navigator screenOptions={{ ...defaultScreenOptions, gestureEnabled: false }}>
          <AgeStack.Screen name="ConfirmAge" component={ConfirmAgeScreen} />
        </AgeStack.Navigator>
      ) : (
        <MainStack.Navigator screenOptions={defaultScreenOptions}>
          <MainStack.Screen name="Tabs" component={RootTabs} />
          <MainStack.Screen name="DMs" component={DMStack} />
          <MainStack.Screen name="Friends" component={FriendsScreen} />
          <MainStack.Screen name="Offers" component={OffersScreen} />
          <MainStack.Screen name="ChatRoom" component={ChatRoomScreen} />
          <MainStack.Screen name="Onboarding" component={OnboardingScreen} />
          <MainStack.Screen name="EditProfile" component={EditProfileScreen} />
          <MainStack.Screen name="UserProfile" component={ProfileScreen} />
          {/* transparentModal: the screen below (the chat) stays mounted and visible; ProfileSheetFrame draws the dim + sheet. */}
          <MainStack.Screen
            name="ProfileSheet"
            component={ProfileSheetScreen}
            options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }}
          />
          <MainStack.Screen name="CreatePost" component={CreatePostScreen} />
          <MainStack.Screen name="PostDetail" component={PostDetailScreen} />
          <MainStack.Screen name="Settings" component={SettingsStack} />
          <MainStack.Screen name="Menu" component={MenuScreen} />
          <MainStack.Screen name="MenuWebPreview" component={MenuWebPreviewScreen} />
          <MainStack.Screen
            name="MenuSheet"
            component={MenuSheetScreen}
            options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }}
          />
          <MainStack.Screen name="ProductDetail" component={ProductDetailScreen} options={{ presentation: 'modal' }} />
          <MainStack.Screen name="Cart" component={CartScreen} />
          <MainStack.Screen name="Checkout" component={CheckoutScreen} />
          <MainStack.Screen name="PaymentSuccess" component={PaymentSuccessScreen} />
          <MainStack.Screen name="OrderTracking" component={OrderTrackingScreen} />
          <MainStack.Screen name="MyOrders" component={MyOrdersScreen} />
          <MainStack.Screen name="MyReservations" component={MyReservationsScreen} />
          <MainStack.Screen name="MatchHome" component={MatchHomeScreen} />
          <MainStack.Screen name="TodHome" component={TodHomeScreen} />
          <MainStack.Screen name="MatchMyProfile" component={MatchMyProfileScreen} />
          <MainStack.Screen name="MatchInterests" component={MatchInterestsScreen} />
          <MainStack.Screen name="MatchProfile" component={MatchProfileScreen} />
          <MainStack.Screen name="MatchItsAMatch" component={MatchItsAMatchScreen} />
          <MainStack.Screen name="MatchActivity" component={MatchActivityScreen} />
        </MainStack.Navigator>
      )}
    </NavigationContainer>
    {notificationsEnabled ? (
      <AuthenticatedNotificationsBridge navigationReady={navigationReady} />
    ) : null}
    {/* QR / link entry → the venue's chat, once signed in, over 18 and past the onboarding. */}
    <EntryBridge
      active={
        notificationsEnabled &&
        navigationReady &&
        !!user?.id &&
        onboardingResolvedFor === user.id &&
        currentRoute !== null &&
        currentRoute !== 'Onboarding'
      }
    />
    {/* Post-login biometric enrollment prompt — mounted only while authenticated,
        unlocked, and NOT in the password-recovery flow. */}
    {notificationsEnabled && <BiometricEnrollGate />}
    {/* Venue session + order in progress: one bar above the tab bar (tab screens only). Not on the web: it has
        no tabs, and "Volver al chat" is the QR. */}
    {notificationsEnabled && Platform.OS !== 'web' ? (
      <HomeStatusBar
        placement={venueBarPlacement(currentRoute)}
        onOpenChat={openVenueChat}
        onOpenOrder={(orderId) => navigationRef.isReady() && navigationRef.navigate('OrderTracking', { orderId })}
        onOpenOrders={() => navigationRef.isReady() && navigationRef.navigate('MyOrders')}
      />
    ) : null}
    </OrdersBarProvider>
    </HomeBarInsetProvider>
  );
}
