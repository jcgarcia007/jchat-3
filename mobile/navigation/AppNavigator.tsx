/**
 * JChat 3.0 — Root Navigator (Task 0.7, auth upgraded in Stage 1)
 *
 * Auth guard: if isAuthenticated (+ 18+ confirmed) → MainStack (tabs + modal screens)
 *             otherwise         → AuthStack (Splash → Welcome → Login → Register)
 *
 * Deep linking: jchat://room/:id  →  ChatRoomScreen
 * Auth comes from AuthContext (useAuth); screens consume it directly.
 */

import React, { useEffect, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';
import {
  createNavigationContainerRef,
  NavigationContainer,
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
import BottomTabs from './tabs/BottomTabs';
import type { BottomTabParamList } from './tabs/BottomTabs';

// Auth screens
import SplashScreen from '../screens/auth/SplashScreen';
import WelcomeScreen from '../screens/auth/WelcomeScreen';
import LoginScreen from '../screens/auth/LoginScreen';
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
import CreatePostScreen from '../screens/feed/CreatePostScreen';
import PostDetailScreen from '../screens/posts/PostDetailScreen';
import DMStack, { type DMStackParamList } from './DMStack';
import FriendsScreen from '../screens/friends/FriendsScreen';
import OffersScreen from '../screens/offers/OffersScreen';
import SettingsStack from './SettingsStack';
import MenuScreen from '../screens/menu/MenuScreen';
import MenuWebPreviewScreen from '../screens/menu/MenuWebPreviewScreen';
import ProductDetailScreen from '../screens/menu/ProductDetailScreen';
import CartScreen from '../screens/menu/CartScreen';
import CheckoutScreen from '../screens/checkout/CheckoutScreen';
import PaymentSuccessScreen from '../screens/checkout/PaymentSuccessScreen';
import OrderTrackingScreen from '../screens/orders/OrderTrackingScreen';
import MyOrdersScreen from '../screens/orders/MyOrdersScreen';
import type { MenuItem } from '../services/menu';

export type AuthStackParamList = {
  Splash: undefined;
  Welcome: undefined;
  Login: undefined;
  RegisterStep1: undefined;
  RegisterStep2: { name?: string; email?: string; password?: string };
  ForgotPassword: undefined;
};

/** Tabs are nested under BottomTabs — only ChatRoom is a "push" screen here */
export type MainStackParamList = {
  Tabs: NavigatorScreenParams<BottomTabParamList> | undefined;
  DMs: NavigatorScreenParams<DMStackParamList>;
  Friends: { userId?: string; initialTab?: 'followers' | 'following' | 'requests' } | undefined;
  Offers: undefined;
  ChatRoom: { id: string };
  /**
   * Onboarding — 4-screen flow for brand-new users.
   * TODO(Task 1.7): gate on users.onboarding_completed so it only shows once.
   * For now Skip/Complete always navigate to Tabs.
   */
  Onboarding: undefined;
  EditProfile: undefined;
  UserProfile: { userId: string };
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
  /** Temporary WebView prototype — shows /m/[slug] for design validation. */
  MenuWebPreview: { slug: string; businessName?: string; businessId: string; roomId?: string };
  ProductDetail: { item: MenuItem };
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
  config: {
    screens: {
      ChatRoom: 'room/:id',
    },
  },
};

const navigationRef = createNavigationContainerRef<MainStackParamList>();

function navigateNotificationRoute(route: NotificationRoute): void {
  if (!navigationRef.isReady()) return;
  if (route.screen === 'DMs') navigationRef.navigate('DMs', route.params);
  else if (route.screen === 'UserProfile') navigationRef.navigate('UserProfile', route.params);
  else navigationRef.navigate('PostDetail', route.params);
}

function AuthenticatedNotificationsBridge({ navigationReady }: { navigationReady: boolean }) {
  const { pendingRoute, clearPendingRoute } = useNotifications({ passive: false });

  useEffect(() => {
    if (!navigationReady || !pendingRoute || !navigationRef.isReady()) return;
    navigateNotificationRoute(pendingRoute);
    clearPendingRoute();
    void Notifications.clearLastNotificationResponseAsync().catch(() => {});
  }, [clearPendingRoute, navigationReady, pendingRoute]);

  return null;
}

// Password recovery is an in-app OTP flow. AuthContext persists recovery intent
// before verifyOtp creates a session, so this navigator never exposes MainStack.

export default function AppNavigator() {
  const { isAuthenticated, locked, isRecovering, user, ageStatus } = useAuth();
  const [navigationReady, setNavigationReady] = useState(false);
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
    let cancelled = false;
    void Promise.all([
      getOnboardingCompleted(user.id),
      hasLocalOnboardingCompletion(),
    ])
      .then(([completedRemotely, completedLocally]) => {
        if (cancelled || completedRemotely || completedLocally || !navigationRef.isReady()) return;
        navigationRef.resetRoot({ index: 0, routes: [{ name: 'Onboarding' }] });
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [navigationReady, notificationsEnabled, user?.id]);

  return (
    <>
    <NavigationContainer
      linking={linking}
      onReady={() => setNavigationReady(true)}
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
          <MainStack.Screen name="Tabs" component={BottomTabs} />
          <MainStack.Screen name="DMs" component={DMStack} />
          <MainStack.Screen name="Friends" component={FriendsScreen} />
          <MainStack.Screen name="Offers" component={OffersScreen} />
          <MainStack.Screen name="ChatRoom" component={ChatRoomScreen} />
          <MainStack.Screen name="Onboarding" component={OnboardingScreen} />
          <MainStack.Screen name="EditProfile" component={EditProfileScreen} />
          <MainStack.Screen name="UserProfile" component={ProfileScreen} />
          <MainStack.Screen name="CreatePost" component={CreatePostScreen} />
          <MainStack.Screen name="PostDetail" component={PostDetailScreen} />
          <MainStack.Screen name="Settings" component={SettingsStack} />
          <MainStack.Screen name="Menu" component={MenuScreen} />
          <MainStack.Screen name="MenuWebPreview" component={MenuWebPreviewScreen} />
          <MainStack.Screen name="ProductDetail" component={ProductDetailScreen} options={{ presentation: 'modal' }} />
          <MainStack.Screen name="Cart" component={CartScreen} />
          <MainStack.Screen name="Checkout" component={CheckoutScreen} />
          <MainStack.Screen name="PaymentSuccess" component={PaymentSuccessScreen} />
          <MainStack.Screen name="OrderTracking" component={OrderTrackingScreen} />
          <MainStack.Screen name="MyOrders" component={MyOrdersScreen} />
        </MainStack.Navigator>
      )}
    </NavigationContainer>
    {notificationsEnabled ? (
      <AuthenticatedNotificationsBridge navigationReady={navigationReady} />
    ) : null}
    {/* Post-login biometric enrollment prompt — mounted only while authenticated,
        unlocked, and NOT in the password-recovery flow. */}
    {notificationsEnabled && <BiometricEnrollGate />}
    </>
  );
}
