/**
 * JChat 3.0 — Root Navigator (Task 0.7, auth upgraded in Stage 1)
 *
 * Auth guard: if isAuthenticated → MainStack (tabs + modal screens)
 *             otherwise         → AuthStack (Splash → Welcome → Login → Register)
 *
 * Deep linking: jchat://room/:id  →  ChatRoomScreen
 * Auth comes from AuthContext (useAuth); screens consume it directly.
 */

import React from 'react';
import { NavigationContainer, LinkingOptions } from '@react-navigation/native';
import {
  createNativeStackNavigator,
  NativeStackNavigationOptions,
} from '@react-navigation/native-stack';

import { useAuth } from '../context/AuthContext';
import BottomTabs from './tabs/BottomTabs';

// Auth screens
import SplashScreen from '../screens/auth/SplashScreen';
import WelcomeScreen from '../screens/auth/WelcomeScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterStep1Screen from '../screens/auth/RegisterStep1Screen';
import RegisterStep2Screen from '../screens/auth/RegisterStep2Screen';

// Non-tab screens that live inside the main (authenticated) stack
import ChatRoomScreen from '../screens/chat/ChatRoomScreen';
import OnboardingScreen from '../screens/onboarding/OnboardingScreen';
import EditProfileScreen from '../screens/profile/EditProfileScreen';
import SettingsStack from './SettingsStack';
import MenuScreen from '../screens/menu/MenuScreen';

export type AuthStackParamList = {
  Splash: undefined;
  Welcome: undefined;
  Login: undefined;
  RegisterStep1: undefined;
  RegisterStep2: { name?: string; email?: string; password?: string };
};

/** Tabs are nested under BottomTabs — only ChatRoom is a "push" screen here */
export type MainStackParamList = {
  Tabs: undefined;
  ChatRoom: { id: string };
  /**
   * Onboarding — 4-screen flow for brand-new users.
   * TODO(Task 1.7): gate on users.onboarding_completed so it only shows once.
   * For now Skip/Complete always navigate to Tabs.
   */
  Onboarding: undefined;
  EditProfile: undefined;
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
  };
};

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const MainStack = createNativeStackNavigator<MainStackParamList>();

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

export default function AppNavigator() {
  const { isAuthenticated } = useAuth();

  return (
    <NavigationContainer linking={linking}>
      {!isAuthenticated ? (
        <AuthStack.Navigator screenOptions={defaultScreenOptions}>
          <AuthStack.Screen name="Splash" component={SplashScreen} />
          <AuthStack.Screen name="Welcome" component={WelcomeScreen} />
          <AuthStack.Screen name="Login" component={LoginScreen} />
          <AuthStack.Screen name="RegisterStep1" component={RegisterStep1Screen} />
          <AuthStack.Screen name="RegisterStep2" component={RegisterStep2Screen} />
        </AuthStack.Navigator>
      ) : (
        <MainStack.Navigator screenOptions={defaultScreenOptions}>
          <MainStack.Screen name="Tabs" component={BottomTabs} />
          <MainStack.Screen name="ChatRoom" component={ChatRoomScreen} />
          <MainStack.Screen name="Onboarding" component={OnboardingScreen} />
          <MainStack.Screen name="EditProfile" component={EditProfileScreen} />
          <MainStack.Screen name="Settings" component={SettingsStack} />
          <MainStack.Screen name="Menu" component={MenuScreen} />
        </MainStack.Navigator>
      )}
    </NavigationContainer>
  );
}
