/**
 * JChat 3.0 — Root Navigator (Task 0.7)
 *
 * Auth guard: if isAuthenticated → MainStack (tabs + modal screens)
 *             otherwise         → AuthStack (Splash → Welcome → Login → Register)
 *
 * Deep linking: jchat://room/:id  →  ChatRoomScreen
 * TODO(Task 1.3): swap useAuthStub with real Supabase AuthContext
 */

import React from 'react';
import { NavigationContainer, LinkingOptions } from '@react-navigation/native';
import {
  createNativeStackNavigator,
  NativeStackNavigationOptions,
} from '@react-navigation/native-stack';

import { useAuthStub } from './useAuthStub';
import BottomTabs from './tabs/BottomTabs';

// Auth screens
import SplashScreen from '../screens/auth/SplashScreen';
import WelcomeScreen from '../screens/auth/WelcomeScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterStep1Screen from '../screens/auth/RegisterStep1Screen';
import RegisterStep2Screen from '../screens/auth/RegisterStep2Screen';

// Non-tab screens that live inside the main (authenticated) stack
import ChatRoomScreen from '../screens/chat/ChatRoomScreen';

// ---------------------------------------------------------------------------
// Param lists — exported so screens can import them for typed navigation hooks
// ---------------------------------------------------------------------------

export type AuthStackParamList = {
  Splash: undefined;
  Welcome: undefined;
  Login: undefined;
  RegisterStep1: undefined;
  RegisterStep2: undefined;
};

/** Tabs are nested under BottomTabs — only ChatRoom is a "push" screen here */
export type MainStackParamList = {
  Tabs: undefined;
  ChatRoom: { id: string };
};

// ---------------------------------------------------------------------------
// Stacks
// ---------------------------------------------------------------------------

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const MainStack = createNativeStackNavigator<MainStackParamList>();

const defaultScreenOptions: NativeStackNavigationOptions = {
  headerShown: false,
};

// ---------------------------------------------------------------------------
// Deep linking
// ---------------------------------------------------------------------------

const linking: LinkingOptions<MainStackParamList> = {
  prefixes: ['jchat://'],
  config: {
    screens: {
      ChatRoom: 'room/:id',
    },
  },
};

// ---------------------------------------------------------------------------
// Auth guard component — switches tree based on isAuthenticated
// ---------------------------------------------------------------------------

interface AuthGuardProps {
  isAuthenticated: boolean;
  signIn: () => void;
  signOut: () => void;
}

function AuthGuard({ isAuthenticated, signIn, signOut }: AuthGuardProps) {
  if (!isAuthenticated) {
    return (
      <AuthStack.Navigator screenOptions={defaultScreenOptions}>
        <AuthStack.Screen name="Splash" component={SplashScreen} />
        <AuthStack.Screen name="Welcome">
          {() => <WelcomeScreen onSignIn={signIn} />}
        </AuthStack.Screen>
        <AuthStack.Screen name="Login">
          {() => <LoginScreen onSignIn={signIn} />}
        </AuthStack.Screen>
        <AuthStack.Screen
          name="RegisterStep1"
          component={RegisterStep1Screen}
        />
        <AuthStack.Screen
          name="RegisterStep2"
          component={RegisterStep2Screen}
        />
      </AuthStack.Navigator>
    );
  }

  return (
    <MainStack.Navigator screenOptions={defaultScreenOptions}>
      <MainStack.Screen name="Tabs">
        {() => <BottomTabs onSignOut={signOut} />}
      </MainStack.Screen>
      <MainStack.Screen name="ChatRoom" component={ChatRoomScreen} />
    </MainStack.Navigator>
  );
}

// ---------------------------------------------------------------------------
// Root navigator
// ---------------------------------------------------------------------------

export default function AppNavigator() {
  const { isAuthenticated, signIn, signOut } = useAuthStub();

  return (
    <NavigationContainer linking={linking}>
      <AuthGuard
        isAuthenticated={isAuthenticated}
        signIn={signIn}
        signOut={signOut}
      />
    </NavigationContainer>
  );
}
