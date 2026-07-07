# JChat 3.0 — Development Task Plan (HISTÓRICO)

> Convertido de `JCHAT_3.0_DEV_PLAN.docx` a Markdown. **Histórico**: las 68 tareas
> ya se completaron (Stages 0-4). Se conserva por referencia; el `.docx` original
> está junto a este archivo en `docs/archive/`.

---

**JChat 3.0**

Development Task Plan

Optimized for Claude Code — Atomic tasks with verification

Version 3.0 | June 2026

Use with: JCHAT_3.0_MASTER_SPEC.docx + JCHAT_3.0_DESIGN_SYSTEM.docx

**How to Use This Plan with Claude Code**

This plan divides JChat 3.0 into atomic tasks. Each task is independent and verifiable. When something breaks, you know exactly which task to revisit.

**Instructions for each Claude Code session:**

- Open a new Claude Code session for each task

- Paste: "Read JCHAT_3.0_MASTER_SPEC.docx and JCHAT_3.0_DESIGN_SYSTEM.docx first"

- Then: "Execute Task \[X.Y\] from the Development Task Plan"

- After completion, run the verification checklist before moving to the next task

- If something breaks, return to that task number and say "Fix Task \[X.Y\]"

|  |  |
|----|----|
| **Symbol** | **Meaning** |
| XS / S / M / L / XL | Estimated effort: XS=30min, S=1h, M=2-3h, L=4-6h, XL=1+ day |
| Foundation | Core setup — no UI, just structure and config |
| UI Component | Reusable component — used across multiple screens |
| Screen | Full screen or page implementation |
| Logic | Business logic, state management, API calls |
| Integration | Connecting frontend to backend / third-party services |
| Testing | Validation and QA |

**Plan Overview — 4 Stages, 68 Tasks**

|  |  |  |  |  |
|----|----|----|----|----|
| **Stage** | **Name** | **Tasks** | **Scope** | **Deliverable** |
| Stage 0 | Project Foundation | 8 tasks | Repo, config, tokens, navigation shell | Running app skeleton with design system |
| Stage 1 | Social & Auth | 18 tasks | Auth, profiles, feed, stories, DMs | Complete social layer — users can register, post, follow |
| Stage 2 | Businesses & Chat | 20 tasks | Business setup, chat rooms, employees, QR, pin, offers | Chat works with businesses, owners can manage rooms |
| Stage 3 | POS & Payments | 16 tasks | Menu, orders, KDS, Stripe, analytics, Super Admin | Full commerce — users can order and pay |
| Stage 4 | Native Map | 6 tasks | Google Maps, heatmap, geolocation, proximity | Live map with heatmap, pins, and proximity alerts |

**STAGE 0 — Project Foundation**

Set up the project skeleton, design tokens, and navigation before writing any feature code. Every task in Stages 1-4 depends on this stage being correct.

**TASK 0.1 Project Initialization & Repo Setup**

Type: **Foundation** | Effort: **S** | Dependencies: None

Files: package.json, .env.example, tsconfig.json, README.md

1.  Initialize React Native project with Expo (latest SDK)

2.  Initialize Next.js 14+ project for web/dashboard in /web subfolder

3.  Install core dependencies: supabase-js, stripe, tabler-icons-react-native, tabler-icons-react

4.  Configure TypeScript strict mode in both projects

5.  Set up .env.example with all required keys: SUPABASE_URL, SUPABASE_ANON_KEY, STRIPE_PK, GOOGLE_MAPS_KEY

6.  Initialize Git repo with .gitignore — never commit .env files

7.  Create README.md referencing the 3 spec documents

**Verification checklist:**

- [ ] App launches without errors on iOS simulator and Android emulator

- [ ] Web project runs on localhost:3000

- [ ] TypeScript compiles with zero errors

- [ ] No .env file committed to repo

**TASK 0.2 Design System Tokens — CSS & React Native**

Type: **Foundation** | Effort: **M** | Dependencies: 0.1

Files: /web/styles/tokens.css, /mobile/theme/tokens.ts, /mobile/theme/colors.ts

8.  Create tokens.css with ALL variables from Design System Section 1 (Core Colors)

9.  Create tokens.ts for React Native with identical values as JS constants

10. Implement dark/light mode switching via data-theme attribute (web) and useColorScheme (mobile)

11. Create colors.ts exporting brand, surface, text, border, success, warning, danger tokens

12. Test: render a div with each token color to verify all 40+ colors are correct

**Verification checklist:**

- [ ] All hex values match DESIGN_SYSTEM.docx Section 1 exactly

- [ ] Dark mode and light mode switch correctly

- [ ] No hardcoded hex values anywhere in the codebase

- [ ] TypeScript has full type safety on all color tokens

**TASK 0.3 Dashboard Themes — 10 themes CSS**

Type: **UI Component** | Effort: **M** | Dependencies: 0.2

Files: /web/styles/themes/dashboard.css, /web/hooks/useDashboardTheme.ts

13. Create CSS class for each of the 10 dashboard themes from Design System Section 5

14. Each class must define all 11 CSS variables: db-bg-base, db-bg-surface, db-bg-elevated, db-border, db-accent, db-accent-text, db-accent-bg, db-text-primary, db-text-secondary, db-text-tertiary, db-success

15. Create useDashboardTheme hook that applies theme class to dashboard root

16. Store selected theme in Supabase business profile (theme_id column)

17. Create ThemePreview miniature component showing KPI card + chart in that theme

**Verification checklist:**

- [ ] All 10 themes render correctly with correct colors

- [ ] Switching themes updates UI instantly without page reload

- [ ] Theme persists after page refresh (stored in DB)

- [ ] ThemePreview component matches Design System Section 5 table exactly

**TASK 0.4 Chat Room Themes — 15 themes**

Type: **UI Component** | Effort: **M** | Dependencies: 0.2

Files: /mobile/theme/chatThemes.ts, /web/constants/chatThemes.ts

18. Create CHAT_THEMES constant object with all 15 themes from Design System Section 6

19. Each theme object must have: bg, topBg, border, accent, bubbleInBg, bubbleInText, bubbleOutBg, bubbleOutText, inputBg, tabActive, tabInactive

20. Create ChatThemePreview miniature component (used in dashboard selector)

21. Wire theme selection in dashboard to save theme_id per room in Supabase

22. Create getChatTheme(themeId) helper function used by ChatRoom component

**Verification checklist:**

- [ ] All 15 chat themes render with correct colors in preview

- [ ] Theme object has all required keys with no undefined values

- [ ] getChatTheme returns correct object for each themeId 1-15

- [ ] Themes match Design System Section 6 table exactly

**TASK 0.5 Profile Themes — 15 themes**

Type: **UI Component** | Effort: **M** | Dependencies: 0.2

Files: /mobile/theme/profileThemes.ts, /mobile/components/profile/ProfileThemeSelector.tsx

23. Create PROFILE_THEMES constant with all 15 themes from Design System Section 7

24. Each theme: coverBg, avatarBorder, nameColor, statsBg, statsBorder, statsValColor, btn1Bg, btn1Color, btn2Bg, btn2Color, tabActive, tabInactive, cellColors(array)

25. Build ProfileThemeSelector grid component (15 miniature previews in 3-col grid)

26. Wire selection to save profile_theme_id in Supabase users table

27. Apply theme in ProfileScreen using user.profileThemeId

**Verification checklist:**

- [ ] All 15 profile themes render in selector grid

- [ ] Selecting a theme updates the profile immediately

- [ ] Theme persists after app restart

- [ ] Miniature previews match Design System Section 7 exactly

**TASK 0.6 Supabase Schema — Full Database Setup**

Type: **Foundation** | Effort: **L** | Dependencies: 0.1

Files: /supabase/migrations/001_initial_schema.sql

28. Create all tables: users, businesses, rooms, messages, orders, order_items, menu_categories, menu_items, employees, offers, pinned_messages, gifts, check_ins, loyalty_points, reviews, disputes, trials

29. Add columns for theme IDs: businesses.dashboard_theme_id, rooms.chat_theme_id, users.profile_theme_id

30. Add rooms.password_hash column (bcrypt), rooms.is_password_protected boolean

31. Set up Row Level Security (RLS) policies for all tables

32. Create Supabase Realtime subscriptions for messages, orders, service_calls

33. Add indexes on frequently queried columns: user_id, business_id, room_id, created_at

34. Create database triggers for: updated_at timestamps, order status changes

**Verification checklist:**

- [ ] All tables created with correct columns and types

- [ ] RLS policies prevent unauthorized data access

- [ ] Realtime subscriptions work for messages table

- [ ] All foreign key constraints are set correctly

- [ ] Migrations run cleanly from scratch

**TASK 0.7 Navigation Shell — Mobile**

Type: **Foundation** | Effort: **M** | Dependencies: 0.3-0.6

Files: /mobile/navigation/AppNavigator.tsx, /mobile/navigation/tabs/BottomTabs.tsx

35. Set up React Navigation v6 with bottom tabs: Map, Nearby, DMs, Friends, Profile

36. Bottom tab icons: ti-map, ti-building-store, ti-message, ti-users, ti-user (from Design System Section 10)

37. Active tab color: #5C7CFA | Inactive: #636366

38. Create Auth stack (Splash, Welcome, Login, Register Step 1, Register Step 2)

39. Create placeholder screens for all 5 tabs — empty screens with correct titles

40. Implement auth guard: unauthenticated → Auth stack, authenticated → Main tabs

41. Handle deep linking for QR code scans (jchat://room/:id)

**Verification checklist:**

- [ ] App shows auth stack when not logged in

- [ ] App shows bottom tabs when logged in

- [ ] All 5 tabs are tappable with correct icons

- [ ] Auth guard redirects correctly

- [ ] Deep link opens correct room screen

**TASK 0.8 Navigation Shell — Dashboard (Web)**

Type: **Foundation** | Effort: **M** | Dependencies: 0.3-0.7

Files: /web/app/dashboard/layout.tsx, /web/components/dashboard/Sidebar.tsx

42. Create dashboard layout with 48px sidebar + main content area

43. Implement all 13 sidebar icons from Design System Section 10.2

44. Active state: background #1a1d2e + left border 2px #5C7CFA + icon color #378ADD

45. Add notification badges on Orders (pending count) and Alerts (unread count)

46. Create placeholder pages for all 13 dashboard sections

47. Implement theme application: apply data-db-theme class from business.dashboard_theme_id

48. Top bar: business name + plan badge + Cmd+K search trigger + clock + avatar

49. Protect all dashboard routes — redirect to login if not authenticated as business owner

**Verification checklist:**

- [ ] Sidebar renders all 13 icons correctly

- [ ] Active state shows blue accent and left border

- [ ] Theme switching updates all dashboard colors instantly

- [ ] All 13 section pages are reachable

- [ ] Unauthenticated users are redirected to login

**STAGE 1 — Social & Auth**

Build the complete user-facing social layer. All screens must implement both light and dark mode.

**TASK 1.1 Splash Screen**

Type: **Screen** | Effort: **XS** | Dependencies: 0.2, 0.5

Files: /mobile/screens/auth/SplashScreen.tsx

50. Dark background #060810 with animated city map SVG (streets, blocks, heatmap circles)

51. Map pins visible through dark gradient overlay

52. Center: logo icon (map pin in #5C7CFA square, 72x72, radius 20px) + wordmark "JChat" + tagline "WHERE YOU ARE"

53. Loading dots animation (3 dots fade in sequence)

54. Auto-navigate to Welcome after 2.5 seconds (or after auth check completes)

55. No user interaction required on this screen

**Verification checklist:**

- [ ] Splash renders in under 300ms

- [ ] Map background is visible through gradient

- [ ] Logo matches Design System brand identity exactly

- [ ] Auto-navigates after 2.5s or auth check

**TASK 1.2 Welcome Screen**

Type: **Screen** | Effort: **S** | Dependencies: 1.1

Files: /mobile/screens/auth/WelcomeScreen.tsx

56. Full-screen dark gradient background (#060810 → #0d1030)

57. Logo icon (56px) + title "The people around you are waiting" + subtitle

58. Navigation dots (4 dots, first active in #5C7CFA)

59. Two buttons: "Get started" (primary #5C7CFA) + "Log in" (ghost, border #2a2a3e)

60. Both buttons full width, 44px height, radius 14px

**Verification checklist:**

- [ ] "Get started" navigates to Register Step 1

- [ ] "Log in" navigates to Login screen

- [ ] Buttons are tappable with 44px minimum touch target

- [ ] Both dark and light system themes render correctly

**TASK 1.3 Login Screen**

Type: **Screen** | Effort: **M** | Dependencies: 1.1, 0.6

Files: /mobile/screens/auth/LoginScreen.tsx

61. Face ID / Touch ID button as PRIMARY option (large card, 36x36 icon, #5C7CFA background)

62. Social login row: Google + Apple side by side (secondary style)

63. Divider: "or continue with email"

64. Email input + Password input with show/hide toggle (ti-eye)

65. "Forgot password?" link right-aligned in #5C7CFA

66. Sign in button (primary, full width)

67. "Don't have an account? Sign up" link at bottom

68. Implement Supabase Auth: email/password + Google OAuth + Apple Sign-In

69. Show error toast for wrong credentials

**Verification checklist:**

- [ ] Face ID login works on device

- [ ] Google OAuth opens browser and returns token

- [ ] Apple Sign-In works on iOS

- [ ] Wrong password shows error toast not crash

- [ ] Successful login navigates to main tabs

**TASK 1.4 Register Screen — Step 1**

Type: **Screen** | Effort: **M** | Dependencies: 1.3

Files: /mobile/screens/auth/RegisterStep1Screen.tsx

70. Progress bar: 2 dots at top (first filled, second empty)

71. Title "Create account" + subtitle

72. Social signup row: Google, Apple, Facebook (3 equal buttons)

73. Divider "or with email"

74. Fields: Full name, Email, Password (with show/hide), Confirm password

75. Validate: password min 8 chars, emails match, no empty fields

76. "Continue" button navigates to Step 2 only if validation passes

77. "Already have an account? Log in" link

78. Store temp data in local state (not yet saved to Supabase)

**Verification checklist:**

- [ ] All 4 fields validate correctly before proceeding

- [ ] Mismatched passwords show inline error

- [ ] Social signup buttons navigate to OAuth flows

- [ ] Step 2 receives name/email/password from Step 1

**TASK 1.5 Register Screen — Step 2**

Type: **Screen** | Effort: **M** | Dependencies: 1.4

Files: /mobile/screens/auth/RegisterStep2Screen.tsx

79. Progress bar: both dots filled

80. Title "Almost there!" + subtitle

81. Date of birth picker — enforce 18+ on submission (show error if under 18)

82. Language selector: dropdown showing flag + "English" or "Espanol"

83. @username field with @ prefix icon, real-time availability check via Supabase

84. Terms checkbox: links open in-app browser to Terms and Privacy Policy

85. "Create my account" button with celebration emoji

86. On success: create user in Supabase Auth + users table, navigate to Onboarding

**Verification checklist:**

- [ ] Users under 18 get clear error message and cannot proceed

- [ ] Username availability checks debounced (300ms)

- [ ] Duplicate username shows error inline

- [ ] Account creation writes to both Supabase Auth and users table

- [ ] Terms links open correctly in in-app browser

**TASK 1.6 Onboarding — 4 Screens**

Type: **Screen** | Effort: **M** | Dependencies: 1.5

Files: /mobile/screens/onboarding/OnboardingScreen.tsx

87. Single screen component with 4 states (currentStep 0-3)

88. Background: dark gradient matching splash

89. Each screen: illustration icon (60px, themed color, rounded square), title, description

90. Screen 1: ti-users icon #5C7CFA | "The people around you are waiting"

91. Screen 2: ti-map icon #1D9E75 | "See what's happening right now"

92. Screen 3: ti-messages icon #D85A30 | "Chat, order, and connect"

93. Screen 4: ti-rocket icon #5C7CFA glow | "You're all set"

94. Progress dots: active = 20px wide pill, inactive = 8px dot

95. Next button: steps 1-3 show "Next", step 4 shows "Explore the map" with gradient

96. Skip button: top-right on steps 1-3, hidden on step 4

97. Mark onboarding_completed = true in Supabase after step 4

**Verification checklist:**

- [ ] All 4 screens render with correct copy from MASTER_SPEC Section 4.3

- [ ] Progress dots update correctly on each step

- [ ] Skip navigates directly to main tabs

- [ ] Step 4 button has indigo-to-purple gradient

- [ ] Completing onboarding sets flag in DB so it never shows again

**TASK 1.7 User Profile Screen**

Type: **Screen** | Effort: **L** | Dependencies: 0.5, 1.5, 1.6

Files: /mobile/screens/profile/ProfileScreen.tsx, /mobile/components/profile/ProfileHeader.tsx

98. Cover photo (full width, 80px height) with edit button overlay for own profile

99. Avatar (44px, circle, border 3px in theme color) positioned bottom-left of cover

100. Name, @username, verified badge (if applicable)

101. Bio text (up to 150 chars)

102. Stats row: Posts count, Followers count, Following count

103. Action buttons: Follow (primary) + Message (secondary) for other users; Edit Profile for own

104. Profile tabs with ICONS only (no text): ti-grid-dots, ti-movie, ti-map-pin, ti-gift, ti-bookmark

105. Tab active underline in profile theme accent color

106. Posts grid: 3-column, square thumbnails

107. Apply profileTheme from user.profile_theme_id (Section 7)

108. ProfileThemeSelector accessible from Edit Profile

**Verification checklist:**

- [ ] All 5 tabs are tappable and show correct content

- [ ] Profile theme applies cover, buttons, and tab colors correctly

- [ ] Own profile shows Edit Profile button not Follow

- [ ] Follow/unfollow updates count in real-time

- [ ] Avatar and cover photo upload work correctly

**TASK 1.8 Edit Profile Screen**

Type: **Screen** | Effort: **M** | Dependencies: 1.7

Files: /mobile/screens/profile/EditProfileScreen.tsx

109. Fields: display name, @username (with availability check), bio, city of residence

110. Avatar photo picker + cover photo picker

111. Language selector (EN/ES)

112. Profile Theme Selector (opens full-screen selector from Task 0.5)

113. Save button — updates Supabase users table

114. Cancel button — discards changes with confirmation alert

**Verification checklist:**

- [ ] All fields save correctly to Supabase

- [ ] Username change checks availability

- [ ] Photo upload stores in Supabase Storage and updates URL in DB

- [ ] Theme change takes effect immediately after save

**TASK 1.9 Social Feed Screen**

Type: **Screen** | Effort: **M** | Dependencies: 1.7, 0.6

Files: /mobile/screens/feed/FeedScreen.tsx, /mobile/components/feed/PostCard.tsx

115. Following-only feed, chronological, no algorithm

116. Post card: avatar + name + timestamp + content + photo(s) + like/comment/share actions

117. Like button with animated heart + real-time count

118. Comment count opens CommentSheet

119. Infinite scroll pagination (20 posts per page)

120. Pull-to-refresh

121. Empty state: "Follow people to see their posts. Find them inside business chats."

122. Fetch from Supabase: SELECT posts WHERE user_id IN (following list) ORDER BY created_at DESC

**Verification checklist:**

- [ ] Feed shows only posts from followed users

- [ ] Infinite scroll loads more posts correctly

- [ ] Like updates in real-time without page refresh

- [ ] Pull-to-refresh fetches latest posts

- [ ] Empty state shows when user follows nobody

**TASK 1.10 Create Post Screen**

Type: **Screen** | Effort: **S** | Dependencies: 1.9

Files: /mobile/screens/feed/CreatePostScreen.tsx

123. Photo picker (single or multi from gallery or camera)

124. Caption text field (500 char limit with counter)

125. Optional geotag field: text input only — NO GPS auto-fill (Privacy Rule from spec)

126. Post button — uploads photo to Supabase Storage, creates post record

127. Cancel with discard confirmation

**Verification checklist:**

- [ ] Photo uploads successfully to Supabase Storage

- [ ] Post appears in own profile grid immediately after creation

- [ ] Geotag is manual text only — no GPS used

- [ ] Caption character limit enforced with counter shown

**TASK 1.11 Stories — Create & View**

Type: **Screen** | Effort: **M** | Dependencies: 1.9, 0.6

Files: /mobile/screens/stories/StoryViewerScreen.tsx, /mobile/components/stories/StoriesRow.tsx

128. Stories row at top of feed: avatar circles with colored ring if unseen story

129. Tap avatar: opens full-screen story viewer

130. Story viewer: full-screen photo/video, progress bar, 5s auto-advance

131. Swipe left/right to navigate between users' stories

132. Tap left/right halves to go back/forward within same user

133. Create story: photo picker + optional text overlay

134. Stories expire after 24 hours (Supabase scheduled job or check on fetch)

135. Viewers list (own story only): shows who viewed

**Verification checklist:**

- [ ] Story rings appear only for unseen stories

- [ ] Auto-advance after 5 seconds works correctly

- [ ] Swipe navigation between users works

- [ ] 24h expiry removes stories from feed

- [ ] Viewers list shows correct users for own stories

**TASK 1.12 Direct Messages — Inbox**

Type: **Screen** | Effort: **M** | Dependencies: 1.7, 0.6

Files: /mobile/screens/dms/DMInboxScreen.tsx, /mobile/screens/dms/DMChatScreen.tsx

136. DM inbox: list of conversations sorted by latest message

137. Each row: avatar, name, last message preview, timestamp, unread badge

138. Unread badge count on bottom tab

139. Open conversation: full chat interface with same bubble styles as chat rooms

140. Real-time messages via Supabase Realtime subscription

141. Send text, photo, voice note in DMs

142. Read receipts: show single/double check marks (Design System Section 4.2)

143. Respect privacy setting: only accept DMs from allowed users

**Verification checklist:**

- [ ] New messages appear instantly via Realtime

- [ ] Unread count on tab updates correctly

- [ ] Read receipts toggle correctly per privacy settings

- [ ] DMs from blocked users do not appear

- [ ] Photo and voice note sending work correctly

**TASK 1.13 Privacy & Security Screen**

Type: **Screen** | Effort: **M** | Dependencies: 1.7

Files: /mobile/screens/settings/PrivacyScreen.tsx

144. Implement ALL settings from MASTER_SPEC Section 13 and DESIGN_SYSTEM

145. Red warning banner at top: "Your real-time location is never shared — this cannot be changed"

146. Sections: Profile visibility, Content, Messages & chat, Location (locked), Blocked users

147. Location row: shows ti-shield-lock icon in red + "Always off — Locked" badge — NO toggle

148. All other settings save to Supabase users.privacy_settings JSONB column

149. Blocked users list: show count, "Manage" link to BlockedUsersScreen

**Verification checklist:**

- [ ] Location row has NO toggle — it is visually locked

- [ ] All privacy settings save and persist after app restart

- [ ] Blocked users list is accurate

- [ ] Settings match MASTER_SPEC Section 13 table exactly

- [ ] Warning banner is always visible at top

**TASK 1.14 Settings Screen**

Type: **Screen** | Effort: **S** | Dependencies: 1.13

Files: /mobile/screens/settings/SettingsScreen.tsx

150. Account: email, change password, @username

151. Notifications: work vs social (separate toggles), proximity alerts (4 modes)

152. Proximity notification settings: mode selector (All/Favorites/Visited/Off)

153. Language: EN / ES toggle

154. Appearance: dark/light/system

155. Privacy & Security (navigates to Task 1.13)

156. Sign out button (with confirmation)

157. Delete account (with confirmation + 24h delay)

**Verification checklist:**

- [ ] Language change takes effect immediately across app

- [ ] Appearance toggle switches theme without restart

- [ ] Sign out clears all auth tokens

- [ ] Proximity mode selection saves correctly

**TASK 1.15 Follow System & User Discovery**

Type: **Logic** | Effort: **M** | Dependencies: 0.6, 1.7

Files: /mobile/hooks/useFollowSystem.ts, /mobile/services/users.ts

158. Follow / unfollow: creates/deletes record in follows table

159. Follower count and following count update in real-time on profile

160. Follow request system for private accounts: pending state with notification

161. User discovery: users can only be found INSIDE business/event chats (no global search)

162. Blocking: creates block record, removes from follower/following lists, hides all content

163. Reporting: creates report record, sends to Super Admin review queue

**Verification checklist:**

- [ ] Follow creates DB record and updates counts

- [ ] Private account creates pending request not immediate follow

- [ ] Users cannot be searched globally — only discoverable in chats

- [ ] Block removes user from all lists and hides content

- [ ] Report creates record in reports table

**TASK 1.16 Notifications — Push Setup**

Type: **Integration** | Effort: **M** | Dependencies: 1.3-1.15

Files: /mobile/services/notifications.ts, /mobile/hooks/useNotifications.ts

164. Set up Firebase Cloud Messaging (FCM) for iOS and Android

165. Request push permission on first login

166. Register FCM token in Supabase users.fcm_token

167. Notification types: new DM, new follower, post like, post comment, work alert (differentiated)

168. Work notifications: different icon style (ti-briefcase) and accent color (#f59e0b amber)

169. Social notifications: standard icon and #5C7CFA accent

170. Handle tap on notification: navigate to correct screen

171. Proximity notifications: local geofence trigger (Stage 4 will enhance)

**Verification checklist:**

- [ ] Push notifications arrive on device

- [ ] Tapping notification opens correct screen

- [ ] Work vs social notifications have visually different icons

- [ ] FCM token stored in Supabase and updated on refresh

**TASK 1.17 Gifts System**

Type: **Logic** | Effort: **M** | Dependencies: 1.7, 0.6

Files: /mobile/services/gifts.ts, /mobile/screens/profile/GiftsReceivedScreen.tsx

172. Gift flow: during order checkout, user selects "Gift" order type + picks recipient from chat

173. Gift creates gift record in DB linking sender, recipient, business, and item

174. Recipient gets push notification: "You received a gift at \[Business\]!"

175. Gifts Received tab on profile (ti-gift icon) shows gift history

176. Gift visibility controlled by privacy setting (Task 1.13)

177. Gift item is delivered same as regular order (appears in KDS)

**Verification checklist:**

- [ ] Gift order type creates gift record in DB

- [ ] Recipient receives push notification

- [ ] Gifts appear in recipient profile Gifts tab

- [ ] Visibility respects privacy settings

**TASK 1.18 Check-In System**

Type: **Logic** | Effort: **S** | Dependencies: 0.6, Stage 2

Files: /mobile/components/chat/CheckInButton.tsx, /mobile/services/checkIn.ts

178. Check-in button visible inside chat room (owner activates per business)

179. One check-in per user per business per 24 hours — enforce in DB with unique constraint

180. Check-in requires user to be within venue radius (geofence check)

181. Creates check-in record and posts system message in chat: "@username checked in at \[Business\]"

182. Check-in history appears in user profile Places tab (ti-map-pin)

183. Places tab respects privacy settings (no timestamps shown)

**Verification checklist:**

- [ ] Second check-in attempt within 24h is blocked with clear message

- [ ] Check-in outside radius is blocked

- [ ] System message appears in chat

- [ ] Check-in appears in user Places tab without timestamp

**STAGE 2 — Businesses & Chat**

Build business management, chat rooms, and all owner/moderator tools.

**TASK 2.1 Business Registration Wizard (Web)**

Type: **Screen** | Effort: **L** | Dependencies: 0.8, 0.6

Files: /web/app/business/register/page.tsx

184. Step 1: Business name, category, description, photos upload (cover + icon emoji)

185. Step 2: Address + draw radius on map (Google Maps API) + phone number

186. Step 3: Operating hours (7 days) + working days selector (7-pill row)

187. Step 4: Stripe Connect onboarding (redirect to Stripe, return with account_id)

188. Business saved to Supabase with status = "pending_verification"

189. Create default Main Room automatically on business creation

190. Redirect to verification flow after registration

**Verification checklist:**

- [ ] All 4 steps validate before proceeding

- [ ] Radius drawing works on map

- [ ] Stripe Connect redirect works and returns account_id

- [ ] Business record created with correct status

- [ ] Main Room created automatically

**TASK 2.2 Business Verification Flow**

Type: **Logic** | Effort: **L** | Dependencies: 2.1, 0.6

Files: /web/app/business/verify/page.tsx, /api/verify/

191. Step 1 status check: poll Stripe Identity status — show pending/approved/failed

192. Step 2: Generate unique 6-character code per business per day. Show code to Owner. Accept selfie upload. Store for Super Admin review.

193. Step 3: Send SMS via Twilio with 6-digit code. Owner enters code. Verify and mark step complete.

194. Show verification progress bar (3 steps) with green checkmarks

195. After Step 1 approved: set business.status = "pending" — shows on map with Pending badge

196. After all 3 steps: set business.status = "verified" — enables payments

**Verification checklist:**

- [ ] Pending badge appears on map after Step 1

- [ ] Payments are blocked until all 3 steps complete

- [ ] SMS code expires after 10 minutes

- [ ] Incorrect SMS code shows error and allows retry

- [ ] Verified badge appears after all 3 steps

**TASK 2.3 Business Profile Card (Mobile)**

Type: **UI Component** | Effort: **L** | Dependencies: 2.1, 0.4

Files: /mobile/components/map/BusinessPreviewCard.tsx

197. Implement EXACT spec from MASTER_SPEC Section 5.2 and DESIGN_SYSTEM Section 11

198. Cover photo (120px height) with gradient overlay (rgba(bg,0.96))

199. Business emoji icon: 52x52px, radius 14px, border 3px in bg color, z-index 3

200. Open/Closed badge: real-time based on business hours

201. Name, category, distance, star rating (stars in #FFCC00)

202. Address with ti-map-pin icon in #5C7CFA

203. Hours grid: today highlighted in #34C759, 2-column grid for other days

204. Working days: 7 circles 24px, today filled green

205. Photo gallery: horizontal scroll, 58x58 thumbnails, +N counter

206. Live strip: green dot + active count + room chips

207. Buttons: Enter Chat (primary) + View Menu (secondary) + ti-navigation + ti-share

208. Both dark and light versions — see Design System Section 4.5

**Verification checklist:**

- [ ] Card matches DESIGN_SYSTEM Section 11 exactly

- [ ] Open/Closed badge updates based on current time and hours

- [ ] Photo gallery scrolls horizontally

- [ ] Room chips show correct room names

- [ ] Both light and dark modes render correctly

**TASK 2.4 Chat Room Screen**

Type: **Screen** | Effort: **XL** | Dependencies: 0.4, 2.3, 0.6

Files: /mobile/screens/chat/ChatRoomScreen.tsx, /mobile/components/chat/

209. Top bar: business icon + name + active count, sub-rooms horizontal scroll, menu icon (right, with divider)

210. Menu icon: only visible if business.menu_enabled = true

211. User avatars row below top bar (horizontal scroll)

212. Messages list: real-time via Supabase Realtime, infinite scroll upward

213. Chat input: text field + + button (expands Photo/Voice/GIF/Offer panel)

214. Message types: text, photo, voice note, GIF, system messages, offer cards, pinned banner

215. Apply chat room theme from room.chat_theme_id (Task 0.4)

216. Incognito mode: toggle before entering, nickname picker, shows names/avatars only

217. Long press message: bottom sheet with actions based on user role

218. Map reaction: 3-second emoji animation (Stage 4 enhancement)

219. Check-in button if business has it enabled

**Verification checklist:**

- [ ] Messages appear in real-time via Supabase Realtime

- [ ] Theme applies correctly from room.chat_theme_id

- [ ] Incognito mode hides full profiles correctly

- [ ] Long press shows correct actions per user role

- [ ] + button panel shows all 4 options

- [ ] Menu icon only appears when business.menu_enabled is true

**TASK 2.5 Pin Message Feature**

Type: **Logic** | Effort: **M** | Dependencies: 2.4

Files: /mobile/components/chat/PinMessageSheet.tsx, /mobile/components/chat/PinnedBanner.tsx

220. Long press message → bottom sheet with Pin option (Owner/Moderator only)

221. Pin config screen: notification choice (yes/silent), room selector, auto-unpin timer

222. Save pinned message to pinned_messages table with expires_at

223. Pinned banner: sticky below sub-rooms row, pin icon + truncated text + countdown + X

224. System message in chat: "\[Owner\] pinned a message"

225. X button removes pin (Owner/Mod only)

226. Multiple pins: banner shows latest, tap to see all pinned

227. Countdown timer updates every minute

228. Auto-unpin: cron job or check on load compares expires_at to now

**Verification checklist:**

- [ ] Only Owner/Moderator can see Pin option in long press sheet

- [ ] Pinned banner appears immediately after pinning

- [ ] Countdown timer shows correct remaining time

- [ ] Auto-unpin removes banner at correct time

- [ ] System message appears in chat after pinning

- [ ] X only visible to Owner/Moderator

**TASK 2.6 Offers Feature**

Type: **Logic** | Effort: **M** | Dependencies: 2.4

Files: /mobile/components/chat/CreateOfferSheet.tsx, /mobile/components/chat/OfferCard.tsx

229. Offer type selector: Discount / 2x1 Bundle / Happy hour / Free item (2x2 grid)

230. Fields: title, discount amount, min purchase, description

231. Duration: 1h/2h/Tonight/Custom

232. Room selector: checkboxes with active user count

233. OfferCard component: gradient header (#5C7CFA to #7C3AED), discount badge, countdown, Order now button

234. Order now: navigates to menu filtered to offer item/category

235. Owner tag: ti-crown + "Posted by Owner" at card bottom

236. Share button on card

237. If duration \> 0: also creates pinned_messages entry

238. Save offer to offers table with expires_at

239. Offer card renders in dark and light themes

**Verification checklist:**

- [ ] Offer card renders with correct gradient header

- [ ] Countdown timer is accurate

- [ ] Order now button opens menu to correct filter

- [ ] Offer also appears as pinned banner

- [ ] Share button works

- [ ] Only Owner sees the offer creation option in + panel

**TASK 2.7 Room Manager — Dashboard**

Type: **Screen** | Effort: **L** | Dependencies: 0.8, 0.4

Files: /web/app/dashboard/chat/page.tsx

240. List of rooms: main room (required, blue left border) + sub-rooms (purple border)

241. Each row: room icon + name + active count + theme name + buttons

242. Buttons per room: QR code (ti-qrcode) + Edit (ti-edit) + Delete (trash, not on main room)

243. Expand/collapse each room to show full settings panel

244. Settings panel: room name, description, icon selector (Task 0.4 mini selector), color, password toggle, TTL toggle, notify toggle

245. Password toggle: enables password_hash field, Owner sets password, hash with bcrypt

246. QR button opens QR modal (Task 2.8)

247. "Add sub-room" button at bottom with plan limit indicator

248. Chat room theme selector: 15 miniature previews (Task 0.4)

249. Save changes updates Supabase rooms table

**Verification checklist:**

- [ ] Room list shows correct active counts

- [ ] Password can be set and changed

- [ ] Theme selector shows all 15 themes and saves correctly

- [ ] QR modal opens for each room

- [ ] Delete works for sub-rooms (not for main room)

- [ ] Plan limit shows correct usage (e.g. 2 of 5)

**TASK 2.8 QR Code Generator — Dashboard**

Type: **UI Component** | Effort: **M** | Dependencies: 2.7

Files: /web/components/dashboard/QRModal.tsx, /web/services/qr.ts

250. Generate QR code SVG for each room URL: jchat.app/r/\[business-slug\]/\[room-slug\]

251. QR modal: full-size preview + room name title + note for sub-rooms

252. Sub-room note: "Scanning enters Main Room + \[SubRoom\] simultaneously"

253. Download options: PNG (high-res 1024px), SVG (vector), PDF (print-ready A4)

254. Share row: Copy link, Share (Web Share API), Print

255. Business Pro: render logo inside QR center (upload logo in business settings)

256. QR accent color matches room theme accent color

257. Inline mini QR visible in room row (not just modal)

**Verification checklist:**

- [ ] QR code is valid and scannable

- [ ] PNG download is at least 1024x1024px

- [ ] SVG is valid vector format

- [ ] PDF is print-ready A4

- [ ] Sub-room QR URL contains both main and sub-room IDs

- [ ] Pro logo embedding works

**TASK 2.9 Employee System**

Type: **Logic** | Effort: **L** | Dependencies: 0.6, 2.4

Files: /mobile/components/chat/AddEmployeeSheet.tsx, /web/app/dashboard/employees/page.tsx

258. Mobile: long press user in chat → "Add as employee" (Owner only) → role picker bottom sheet

259. Roles: Manager, Cashier, Waiter, Kitchen, Chat Moderator, Analyst

260. Creates employee record + sends push notification to user

261. User accepts: business appears in linked_businesses on their profile

262. Staff section on business profile: only visible to linked employees

263. Dashboard employees page: list, roles, permissions, last active, remove button

264. Physical presence check for moderators: compare user GPS to business location (Stage 4)

265. Business plan limit: max 10 employees; Pro: unlimited

**Verification checklist:**

- [ ] Add employee creates DB record and sends notification

- [ ] User can accept or decline invitation

- [ ] Staff section only visible to linked employees

- [ ] Role determines which actions are available in chat

- [ ] Plan limit enforced at employee count

**TASK 2.10 Business Chat Moderation Tools**

Type: **Logic** | Effort: **M** | Dependencies: 2.4, 2.9

Files: /mobile/components/chat/UserActionSheet.tsx

266. Long press user avatar in chat → action sheet based on role

267. Regular user options: View profile, DM, Follow/Add friend, Mute (personal), Report, Block (personal)

268. Owner/Moderator extra options: Warn, Mute in room, Remove from room, Ban permanently

269. Block (personal): hides that user from own view — does NOT expel from room

270. Ban: creates ban record, removes from room, prevents re-entry

271. Mute in room: silences user messages for duration (1h/24h/permanent)

272. Moderator requires physical presence (Stage 4 geofence check)

273. All moderation actions logged to moderation_logs table

**Verification checklist:**

- [ ] Regular users only see their 6 options

- [ ] Owner/Mod see all 10 options

- [ ] Personal block hides user without expelling

- [ ] Ban prevents re-entry to room

- [ ] All actions log to moderation_logs

**TASK 2.11 Incognito Mode**

Type: **Logic** | Effort: **S** | Dependencies: 2.4

Files: /mobile/components/chat/IncognitoToggle.tsx

274. Slider/toggle before entering a chat room

275. Nickname input field (required if incognito on)

276. Incognito user sees other users' display names and avatars (not full profiles or photos)

277. Other users see the incognito user's nickname, no real name or avatar

278. Incognito user can still use all chat features (send messages, order, etc.)

279. Incognito mode is per-room-entry — not a global setting

280. Cannot be changed after entering the room (must exit and re-enter)

**Verification checklist:**

- [ ] Incognito user appears as nickname to others

- [ ] Incognito user sees real names/avatars of others

- [ ] Full profile tap shows limited info for incognito users

- [ ] Toggle is only accessible before entering room

**TASK 2.12 Business Preview Page (Web)**

Type: **Screen** | Effort: **M** | Dependencies: 2.3

Files: /web/app/b/\[slug\]/page.tsx

281. Web-accessible business page (no app required)

282. Same information as mobile business card but full page layout

283. Business hours, photos, menu preview, room list

284. CTA: "Download JChat to enter the chat room"

285. Share page URL works for SEO

286. Structured data (JSON-LD) for Google rich results

**Verification checklist:**

- [ ] Page renders without authentication

- [ ] SEO meta tags are correct

- [ ] JSON-LD structured data is valid

- [ ] CTA links to App Store / Play Store

**TASK 2.13 Nearby Businesses (Web & Mobile)**

Type: **Screen** | Effort: **M** | Dependencies: 0.5, 2.3

Files: /mobile/screens/nearby/NearbyScreen.tsx, /web/app/nearby/page.tsx

287. List view of active businesses sorted by distance

288. Search bar with text search

289. Category filter chips

290. Each item: business name, category, distance, active user count, rooms count, open/closed badge

291. Tap: opens business preview card/page

292. Web version: no GPS — shows businesses by city/area selected

293. Mobile version: sorted by GPS distance (Stage 4 will use live GPS)

**Verification checklist:**

- [ ] Business list fetches from Supabase with active user counts

- [ ] Search filters list in real-time

- [ ] Category chips filter correctly

- [ ] Distance shows on mobile

- [ ] Web version allows city selection

**TASK 2.14 Sub-room Password Entry**

Type: **UI Component** | Effort: **S** | Dependencies: 2.4, 2.7

Files: /mobile/components/chat/PasswordEntrySheet.tsx

294. Bottom sheet appears when trying to enter a password-protected sub-room

295. Title: "This room is members-only" with ti-lock icon

296. Password text input (secure entry, show/hide toggle)

297. "Enter room" button: verifies password hash via Supabase function (never send plaintext)

298. Wrong password: shows error "Incorrect password" and allows retry

299. Correct password: caches auth for this session, enters room

300. No brute force: after 5 failed attempts, 30-minute lockout

**Verification checklist:**

- [ ] Wrong password shows error without revealing hash

- [ ] Correct password grants entry

- [ ] Lockout activates after 5 wrong attempts

- [ ] Password entry is visually secure (dots not chars by default)

**TASK 2.15 Reviews & Ratings**

Type: **Logic** | Effort: **M** | Dependencies: 0.6, 2.3

Files: /mobile/components/reviews/, /web/app/dashboard/reviews/

301. Post-order rating prompt: 1-5 stars after order delivered (Task 7.6)

302. Reviews stored with user_id, business_id, rating, text, created_at

303. Business profile shows average rating + review count

304. Business dashboard: reviews list, average, response ability

305. Reported reviews go to Super Admin queue

306. Cannot review same business twice in 7 days

**Verification checklist:**

- [ ] Rating prompt appears after order marked delivered

- [ ] Average rating updates immediately

- [ ] Business owner can see all reviews in dashboard

- [ ] Duplicate review prevention works

**TASK 2.16 Business Settings — Dashboard**

Type: **Screen** | Effort: **M** | Dependencies: 0.8, 2.1

Files: /web/app/dashboard/configuration/page.tsx

307. Business info: name, description, category, address, phone, website

308. Hours editor: 7-day grid with open/close times + closed toggle per day

309. Radius display (read-only — change requires Super Admin)

310. Cover photo + icon emoji upload

311. Photo gallery manager: upload, reorder, delete

312. Menu enabled toggle (shows menu icon in chat)

313. Dashboard theme selector (Task 0.3)

314. Tip configuration: enabled toggle, suggested percentages

315. Payout frequency: Daily/Weekly/Monthly (calls Stripe API)

**Verification checklist:**

- [ ] Hours save correctly for all 7 days

- [ ] Cover photo and gallery upload work

- [ ] Dashboard theme changes instantly

- [ ] Tip config saves and appears in checkout

- [ ] Payout frequency change updates Stripe schedule

**TASK 2.17 Public Locations Manager (Super Admin)**

Type: **Screen** | Effort: **M** | Dependencies: Super Admin access

Files: /web/app/super-admin/locations/page.tsx

316. Create public locations: parks, events, public squares that appear on map without business account

317. Fields: name, type, coordinates, radius, description, active dates

318. Public locations appear on map same as businesses but with different pin style

319. Users can enter public location chats without ordering

320. Manage: list, edit, deactivate, delete

**Verification checklist:**

- [ ] Public location pins appear on map correctly

- [ ] Chat room opens for public locations

- [ ] Only Communications Admin or Super Admin can manage locations

**TASK 2.18 Map Reactions**

Type: **Logic** | Effort: **S** | Dependencies: 2.4, Stage 4

Files: /mobile/components/chat/MapReactionButton.tsx

321. Reaction button in chat (emoji picker, max 5 options)

322. Tap emoji: sends reaction event to Supabase Realtime channel

323. On map (Stage 4): emoji floats up from business pin for 3 seconds then fades

324. Only users currently inside the chat room can send map reactions

325. Rate limit: 1 reaction per user per 10 seconds

326. Animation: 3s ease-out, translateY(-30px) + opacity 0 + scale 1.3

**Verification checklist:**

- [ ] Only in-room users see the reaction button

- [ ] Reaction event broadcasts via Realtime

- [ ] Rate limit prevents spam

- [ ] Animation duration is exactly 3 seconds

**TASK 2.19 Event Creation (Business Owner)**

Type: **Screen** | Effort: **M** | Dependencies: 2.3, 0.8

Files: /web/app/dashboard/events/page.tsx, /mobile/screens/events/

327. Create event: name, date, time, description, cover photo, location (defaults to business)

328. Event appears on map with special event pin style

329. Event has its own chat room (auto-created)

330. Event chat room has TTL: auto-closes X hours after event end time

331. Event visible in Nearby screen with date/time

332. Owner can close event early from dashboard

**Verification checklist:**

- [ ] Event appears on map at correct location

- [ ] Event chat room auto-closes at set time

- [ ] Event shows in Nearby with correct date

- [ ] Owner can close event from dashboard

**TASK 2.20 Loyalty Program — Setup & Points**

Type: **Logic** | Effort: **L** | Dependencies: 0.6, 2.3

Files: /web/app/dashboard/loyalty/page.tsx, /mobile/screens/loyalty/

333. Dashboard: configure point rules (e.g. 1 point per $1 spent), tiers, rewards catalog

334. Point award: triggered on order completion, adds to loyalty_points table

335. User mobile: loyalty balance on profile, points history, rewards to redeem

336. Redemption: user selects reward in checkout, discount applied, points deducted

337. Tiers: Bronze/Silver/Gold based on total points earned

338. Business Pro only: ROI reporting in Analytics (Task 3.12)

**Verification checklist:**

- [ ] Points awarded correctly after order completion

- [ ] Balance shown in user profile

- [ ] Redemption deducts points and applies discount

- [ ] Tiers update based on total points

**STAGE 3 — POS & Payments**

Complete commerce layer: menu, ordering, payments, KDS, and analytics.

**TASK 3.1 Menu Editor — Dashboard**

Type: **Screen** | Effort: **L** | Dependencies: 0.8, 0.6

Files: /web/app/dashboard/menu/page.tsx

339. Category list with drag-to-reorder

340. Create/edit category: name + icon selector (Task 0.4 dual emoji/SF icon selector)

341. Product card: name, description, price, photo upload, dietary tags, ID-required toggle

342. Product customization options editor: add size options (required) + extras (optional)

343. Best Seller / New / Hot badge toggle per product

344. Publish/unpublish toggle per product and per category

345. Low stock: manual stock count, auto-hide when 0 (if inventory enabled)

346. All changes save to Supabase menu_categories and menu_items tables

**Verification checklist:**

- [ ] Categories can be reordered via drag

- [ ] Icon selector shows both emoji and SF icons

- [ ] Product save creates/updates DB record

- [ ] ID-required flag saves correctly

- [ ] Unpublished items hidden from customer menu

**TASK 3.2 Menu Screen — Mobile (Customer)**

Type: **Screen** | Effort: **L** | Dependencies: 3.1, 2.4

Files: /mobile/screens/menu/MenuScreen.tsx, /mobile/components/menu/

347. Full-screen menu (not bottom sheet)

348. Header: back button (returns to chat) + business name + cart icon with badge

349. Search bar within menu

350. Horizontal category tabs (sticky on scroll)

351. Featured banner: shows active offer if any

352. Product list: card layout with photo (large) + compact layout (no photo)

353. Best Seller / New / Hot badges

354. Add button: + icon on each product (inline, no navigate away)

355. Cart bar at bottom: quantity badge + "View cart" + total price

356. Cart bar only shows when cart has items

**Verification checklist:**

- [ ] Menu loads products from Supabase correctly

- [ ] Category tabs scroll and filter products

- [ ] Featured offer banner shows current active offer

- [ ] Add button updates cart count in real-time

- [ ] Cart bar shows correct total

- [ ] Back button returns to chat room

**TASK 3.3 Product Detail Screen**

Type: **Screen** | Effort: **M** | Dependencies: 3.2

Files: /mobile/screens/menu/ProductDetailScreen.tsx

357. Full-width product photo (140px height)

358. Back button (top-left, semi-transparent circle)

359. Best Seller badge (top-right)

360. Product name, description, price

361. Dietary/spice tags

362. Required options: size selector (radio buttons)

363. Optional extras: checkbox list

364. Special instructions: text field

365. Quantity selector: - count + with - disabled at 1

366. Price updates dynamically as options are selected

367. "Add to cart" button with current price

368. Navigate back to menu with updated cart

**Verification checklist:**

- [ ] Required options must be selected before Add to Cart

- [ ] Price updates correctly when options change

- [ ] Quantity cannot go below 1

- [ ] Adding same product twice increases quantity in cart not duplicates

**TASK 3.4 Cart Screen**

Type: **Screen** | Effort: **M** | Dependencies: 3.3

Files: /mobile/screens/menu/CartScreen.tsx

369. Order type selector: Table (waiter) / Counter (pickup) / Gift (send to user) — 3 equal cards

370. Gift: shows user picker (users in same chat room)

371. Items list: product name + options + price + qty controls

372. Swipe to delete item

373. Promo code field with "Apply" button

374. Subtotal + Tax (auto-calculated based on business location) + discount if promo applied

375. Proceed to checkout button

376. Empty cart state: "Your cart is empty" + "Browse menu" CTA

**Verification checklist:**

- [ ] Order type selection is required before checkout

- [ ] Gift picker shows only current room users

- [ ] Promo code validates against offers table

- [ ] Tax calculation is correct

- [ ] Swipe to delete removes item

**TASK 3.5 Checkout Screen — Express**

Type: **Screen** | Effort: **L** | Dependencies: 3.4, 3.6

Files: /mobile/screens/checkout/CheckoutScreen.tsx

377. Single scrollable screen — no separate steps

378. Order summary section with edit shortcut → goes back to cart

379. Tip selector: 10% / 15% / 20% / Custom (tap Custom shows number input)

380. Payment method section: saved card (if any) + Apple Pay + Google Pay + PayPal

381. Payment method selection: radio buttons with icons

382. Final total breakdown: subtotal + tax + tip

383. Pay button: "Pay $XX.XX with Face ID" — uses LocalAuthentication API

384. "Secured by Stripe" text with ti-lock icon below button

385. On success: show ProcessingScreen, then navigate to SuccessScreen

**Verification checklist:**

- [ ] Tip calculation updates total in real-time

- [ ] Face ID authentication triggers correctly

- [ ] All 4 payment methods are selectable

- [ ] Total breakdown is mathematically correct

- [ ] Success navigates to order confirmation

**TASK 3.6 Stripe Integration — Payments**

Type: **Integration** | Effort: **XL** | Dependencies: 0.6, 3.5

Files: /api/payments/, /mobile/services/stripe.ts

386. Set up Stripe Connect — business receives payments directly

387. Create PaymentIntent on server (never on client)

388. Stripe Customer: create on first purchase, save to users.stripe_customer_id

389. Save card: create SetupIntent, save PaymentMethod to stripe_customer_id

390. Apple Pay: react-native-stripe-sdk with Apple Pay support

391. Google Pay: react-native-stripe-sdk with Google Pay support

392. PayPal: Stripe PayPal payment method

393. Payment failed: return error code, client shows bottom sheet with options

394. Payment success: create order record, trigger KDS update, send push to owner

395. Subscription payments: Stripe Billing with 3-day grace period logic

396. Payout schedule: update Stripe Connect account payout schedule via API

**Verification checklist:**

- [ ] Test mode payments work with Stripe test cards

- [ ] Real PaymentIntent created server-side (not client-side)

- [ ] Saved cards appear on next purchase

- [ ] Apple Pay works on iOS device

- [ ] Payment failure shows bottom sheet correctly

- [ ] Order created in DB only after payment confirmed

**TASK 3.7 Payment Success & Save Card**

Type: **Screen** | Effort: **S** | Dependencies: 3.5, 3.6

Files: /mobile/screens/checkout/PaymentSuccessScreen.tsx

397. Green checkmark animation (ti-check in green circle, 72px)

398. "Payment confirmed!" title + order number + business + order type

399. "Save card for faster checkout?" prompt (if card not already saved)

400. Save card / Not now buttons

401. "Back to chat" button (primary) navigates to chat room

402. Order number displayed prominently

**Verification checklist:**

- [ ] Success screen shows correct order number

- [ ] Save card prompt only shows for new cards

- [ ] Back to chat returns to correct room

- [ ] Payment confirmation email sent (via Supabase Edge Function)

**TASK 3.8 Order Tracking Screen**

Type: **Screen** | Effort: **M** | Dependencies: 3.7, 0.6

Files: /mobile/screens/orders/OrderTrackingScreen.tsx

403. 3-step stepper: Confirmed (blue) → Preparing (amber) → Ready (green)

404. Each step shows icon: ti-check / ti-chef-hat / ti-check

405. ETA countdown in minutes (updated from KDS)

406. Per-item status list (Cooking / Ready)

407. Service call button (ti-bell-ringing) opens service call bottom sheet

408. Real-time updates via Supabase Realtime on orders table

409. Rating prompt appears after status changes to "delivered"

410. "Back to chat" button always visible

411. Push notification when status changes to "ready"

**Verification checklist:**

- [ ] Stepper updates in real-time as KDS changes status

- [ ] ETA countdown is accurate

- [ ] Rating prompt appears at correct time

- [ ] Push notification sent when order is ready

- [ ] Service call button works

**TASK 3.9 Kitchen Display System (KDS)**

Type: **Screen** | Effort: **L** | Dependencies: 0.8, 3.6

Files: /web/app/dashboard/kds/page.tsx

412. Full-screen KDS view (optimized for tablet)

413. Orders in columns by status: New / In Progress / Ready

414. Order card: order number, items, customizations, table/counter/gift, time elapsed

415. Mark item ready: tap item → status updates to ready

416. Mark order ready: all items ready → triggers customer notification

417. Mark order delivered: final status update

418. Alert sound on new order (browser Audio API)

419. Auto-refresh every 30 seconds as fallback (primary: Realtime)

420. Filter by room (e.g. only show VIP room orders)

**Verification checklist:**

- [ ] New orders appear instantly via Realtime

- [ ] Status changes update customer tracking screen

- [ ] Alert sound plays for new orders

- [ ] Delivered status triggers rating prompt for customer

- [ ] Filter by room works correctly

**TASK 3.10 Inventory Management**

Type: **Screen** | Effort: **M** | Dependencies: 0.8, 3.1

Files: /web/app/dashboard/inventory/page.tsx

421. Product list with current stock count

422. Edit stock count inline

423. Low stock alert threshold per product (default: 5)

424. Auto-hide from menu when stock reaches 0

425. Stock movement history log

426. Bulk import via CSV

427. Email alert to owner when stock hits threshold

**Verification checklist:**

- [ ] Stock count updates reflect in menu (0 = hidden)

- [ ] Low stock alerts fire at correct threshold

- [ ] Movement history logs all changes

- [ ] CSV import works correctly

**TASK 3.11 Reservations System**

Type: **Screen** | Effort: **L** | Dependencies: 0.8, 0.6

Files: /web/app/dashboard/reservations/page.tsx, /mobile/screens/reservations/

428. Dashboard: calendar view + list view, confirm/reject buttons, capacity settings

429. Customer mobile: select date/time/party size, special requests, submit

430. Reservation status: Pending / Confirmed / Rejected / No-show

431. Owner gets push notification for new reservation requests

432. Waitlist: if full, offer to join waitlist

433. Reminder notifications: 24h and 2h before reservation

434. No-show tracking for loyalty program

**Verification checklist:**

- [ ] Calendar shows all reservations correctly

- [ ] Confirm/reject updates customer notification

- [ ] Waitlist adds correctly when full

- [ ] Reminders fire at correct times

**TASK 3.12 Analytics Pro Dashboard**

Type: **Screen** | Effort: **XL** | Dependencies: 0.8, 3.6, 0.3

Files: /web/app/dashboard/analytics/page.tsx

435. Tab navigation: Revenue / Customers / Products / Chat / Loyalty ROI / Forecast / API

436. Revenue tab: daily bars chart, peak day/hour, tips total — using recharts or Chart.js

437. Products tab: top products ranking with bar charts, units + revenue

438. Activity heatmap: 7-day x 24h grid — color-coded by order density

439. Customer segments: Regulars/Occasional/New/At risk with percentage bars

440. Cohort retention: monthly cohorts x weekly retention percentage grid

441. Revenue forecast: historical line + dashed projected line with confidence band

442. Apply dashboard theme colors to all charts (Task 0.3)

443. Export: CSV and PDF buttons for all reports

444. API tab: show API key (Business Pro) with copy button

445. Only accessible on Business Pro plan

**Verification checklist:**

- [ ] All 7 tabs render with correct data

- [ ] Charts use dashboard theme accent color

- [ ] Heatmap grid renders all 168 cells (7 x 24)

- [ ] CSV export downloads correctly

- [ ] PDF export is properly formatted

- [ ] Plan gate: redirects Business plan to upgrade page

**TASK 3.13 Super Admin Panel**

Type: **Screen** | Effort: **XL** | Dependencies: 0.8, 0.6

Files: /web/app/super-admin/, /web/app/super-admin/layout.tsx

446. Protected route: only Super Admin and designated roles can access

447. Overview dashboard: MRR, ARR, total users, DAU/MAU, churn rate, active businesses, alerts

448. Cmd+K command palette for fast navigation

449. User management: search by @username/email/name, view profile, assign trial, ban

450. Business management: search, view, close/suspend, silent access to all rooms

451. Verification queue: approve/reject with action buttons

452. Revenue page: MRR chart, subscription breakdown by tier, failed payments list

453. Geography: users by country + language breakdown

454. Alerts page: security alerts, payment failures, reports queue

455. Admin team: add by email or @username, assign roles + add-on permissions

456. Announcement builder: segment builder (filters) + compose + send

457. Trial assignment: search user + select tier + set days + confirm

458. Security logs: visible to Super Admin and Log Viewer permission

**Verification checklist:**

- [ ] Only authorized roles can access each section

- [ ] Silent access to businesses logs to security_logs

- [ ] Trial assignment sends notification to user

- [ ] Segment builder creates correct user filter

- [ ] Verification approval updates business status

**TASK 3.14 Disputes & Refunds System**

Type: **Logic** | Effort: **M** | Dependencies: 3.6, 3.8

Files: /web/app/dashboard/disputes/page.tsx, /web/app/super-admin/disputes/page.tsx

459. Customer opens dispute from order history or tracking screen

460. Creates dispute record with order_id, reason, description

461. Owner sees dispute in dashboard with 48h countdown

462. Owner can: approve refund (full/partial), reject with reason

463. Auto-escalation: if no Owner response in 48h → status changes to "escalated"

464. Super Admin sees escalated disputes in queue

465. Super Admin can force refund via Stripe API

466. Customer notified at each status change

467. Refund processed via Stripe — amount returned to original payment method

**Verification checklist:**

- [ ] Dispute creates DB record correctly

- [ ] 48h timer auto-escalates to Super Admin

- [ ] Owner approve triggers Stripe refund

- [ ] Super Admin force refund overrides Owner decision

- [ ] Customer notified at each stage

**TASK 3.15 Subscription Management**

Type: **Logic** | Effort: **L** | Dependencies: 0.6, 3.6

Files: /api/subscriptions/, /web/app/dashboard/billing/page.tsx

468. Stripe Billing integration for Regular, Verified ($1.99), Business ($49), Pro ($99)

469. Upgrade flow: select plan → Stripe Checkout → webhook updates subscription

470. Downgrade: takes effect at end of billing period

471. Failed payment webhook: trigger 3-day grace logic (Day 1/2/3 notifications)

472. Day 3 no payment: set business.status = "suspended", remove from map

473. Payment recovered: instantly restore business

474. Free trial: apply trial_end date, send 3d and 1d reminders, expire access

475. Dashboard billing page: current plan, usage, payment history, upgrade/downgrade buttons

**Verification checklist:**

- [ ] Upgrade webhook updates plan_id in DB immediately

- [ ] Failed payment triggers Day 1 notification

- [ ] Business removed from map on Day 3

- [ ] Trial expiry removes access at correct time

- [ ] Payment recovery restores access instantly

**TASK 3.16 Offers & Promotions Builder (Dashboard)**

Type: **Screen** | Effort: **M** | Dependencies: 0.8, 3.1

Files: /web/app/dashboard/offers/page.tsx

476. Dashboard offers builder (more advanced than the in-chat quick offer)

477. Offer types: Happy hour, Bundle, Flash sale, BOGO, Discount code

478. Scheduling: set start date/time and end date/time

479. Targeting: all users in chat / verified users only / new users first visit

480. Active offers list: name, type, status, redemption count

481. Pause/resume toggle

482. Offer analytics: views, taps on Order now, conversions

483. Auto-publish offer to chat when it goes live (creates OfferCard message)

**Verification checklist:**

- [ ] Scheduled offer appears in chat at correct time

- [ ] Redemption count increments correctly

- [ ] Pause stops offer from showing in chat

- [ ] Analytics show accurate counts

**STAGE 4 — Native Map**

The map is the last stage because it requires all business data to be live. Build on top of working Stage 1-3.

**TASK 4.1 Google Maps Integration**

Type: **Foundation** | Effort: **L** | Dependencies: 0.1

Files: /mobile/screens/map/MapScreen.tsx, /mobile/components/map/JChatMap.tsx

484. Install react-native-maps with Google Maps provider

485. Configure Google Maps API key (separate keys for iOS and Android)

486. Implement A2 Pastel map style for light mode (custom JSON style)

487. Implement dark map style for dark mode

488. Auto-switch map style based on system dark/light mode

489. Map opens by default to user location (request permission on first open)

490. Fallback to city center if permission denied

491. Map style switcher: Normal / Dark / Satellite / Terrain (4 options)

492. Filter chips row: All / Bars / Cafes / Food / Events / Open now

**Verification checklist:**

- [ ] Map renders with A2 Pastel style in light mode

- [ ] Map renders with dark style in dark mode

- [ ] User location appears on first open (with permission)

- [ ] Map style switcher changes base map

- [ ] Filter chips are tappable

**TASK 4.2 Business Pins & Heatmap**

Type: **UI Component** | Effort: **L** | Dependencies: 4.1, 2.3

Files: /mobile/components/map/BusinessPin.tsx, /mobile/components/map/HeatmapLayer.tsx

493. Teardrop pins: border-radius 50% 50% 50% 0, rotated -45deg — EXACT spec

494. Pin emoji rotated +45deg to compensate

495. Pin size based on active user count: small (\<5), medium (5-20), large (20-50), featured (50+)

496. Pin color from heatmap level: #FF3B30 / #FF9500 / #FFCC00 / #34C759

497. Active user count badge: top-right, red background, white text, 7px font

498. Tap pin: shows BusinessPreviewCard (Task 2.3) as bottom sheet

499. Heatmap circles underneath pins: radial gradient with correct opacity

500. Heatmap updates every 60 seconds from Supabase real-time

501. Pending businesses show with Pending badge on pin

**Verification checklist:**

- [ ] Pins render with teardrop shape (not circle)

- [ ] Pin color matches activity level correctly

- [ ] Tapping pin shows BusinessPreviewCard

- [ ] Heatmap visible and updates

- [ ] Pending pin has different visual treatment

**TASK 4.3 Geolocation & Geofencing**

Type: **Logic** | Effort: **L** | Dependencies: 4.1

Files: /mobile/services/geofence.ts, /mobile/hooks/useGeofence.ts

502. Continuous background location tracking (request always-on permission)

503. Geofence: check if user is within business radius on entering chat

504. Chat moderation actions check geofence (Moderator must be inside)

505. Check-in validates geofence (user must be inside)

506. Proximity notification logic: 30-second dwell time before notification fires

507. Timer resets if user moves outside radius before 30 seconds

508. Max 3 proximity notifications per day — track in AsyncStorage

509. Max 1 notification per venue per 2 hours

510. Mode check: respect user's proximity mode setting (All/Favorites/Visited/Off)

**Verification checklist:**

- [ ] Geofence correctly detects user inside/outside radius

- [ ] 30-second dwell check prevents car drive-by notifications

- [ ] Day limit of 3 notifications enforced

- [ ] Per-venue cooldown of 2 hours enforced

- [ ] Mode Off completely disables proximity notifications

- [ ] Moderator outside radius cannot moderate

**TASK 4.4 Proximity Notifications**

Type: **Logic** | Effort: **M** | Dependencies: 4.3, 1.16

Files: /mobile/services/proximityNotifications.ts

511. When dwell time passes (30s inside radius): check mode setting

512. Mode All: notify for any active business

513. Mode Favorites: only notify for businesses in user's favorites list

514. Mode Visited: only notify for businesses user has checked in to before

515. Mode Off: no notifications

516. Notification content: "{Business name} is active now — {N} people inside"

517. Tap notification: opens BusinessPreviewCard on map

518. Track notification history in AsyncStorage for daily limit

**Verification checklist:**

- [ ] Each mode filters correctly

- [ ] Notification content matches spec

- [ ] Tap opens correct business

- [ ] Daily limit of 3 is enforced

- [ ] 2-hour per-venue cooldown works

**TASK 4.5 Map Reactions — Live on Map**

Type: **UI Component** | Effort: **M** | Dependencies: 4.2, 2.18

Files: /mobile/components/map/MapReactionOverlay.tsx

519. Subscribe to map_reactions Supabase Realtime channel

520. When reaction received: render emoji at business pin coordinates

521. Animation: float up 30px + fade out + scale 1.3 over exactly 3 seconds

522. Multiple simultaneous reactions offset horizontally

523. Max 5 concurrent reactions per pin (oldest replaced)

524. Only in-room users can send (validated server-side)

525. Rate limit: 1 per user per 10 seconds

**Verification checklist:**

- [ ] Emoji appears at correct pin location

- [ ] Animation is exactly 3 seconds

- [ ] Multiple reactions display side by side

- [ ] Rate limit prevents spam

- [ ] Only in-room users can send

**TASK 4.6 Map Filters & Advanced Search**

Type: **UI Component** | Effort: **M** | Dependencies: 4.2

Files: /mobile/components/map/FilterPanel.tsx

526. Filter chips (horizontal scroll): All, Bars, Cafes, Food, Events, Open now

527. Advanced filter panel (slide up from bottom): distance slider, min rating, category multi-select, active users minimum

528. Filters update heatmap in real-time

529. Heatmap legend updates to reflect filtered results

530. Search bar: text search shows results on map + list below

531. Results count: "24 places near you"

532. Reset filters button when any filter is active

**Verification checklist:**

- [ ] Chips filter pins on map in real-time

- [ ] Advanced panel slides up correctly

- [ ] Distance filter changes visible pins

- [ ] Search shows results both on map and in list

- [ ] Reset clears all filters

**Final Testing Checklist — Before Each Stage Merge**

|  |  |  |  |  |  |
|----|----|----|----|----|----|
| **Check** | **Stage 0** | **Stage 1** | **Stage 2** | **Stage 3** | **Stage 4** |
| All design tokens match DESIGN_SYSTEM.docx exactly | Yes | Yes | Yes | Yes | Yes |
| Light and dark mode both render correctly | Yes | Yes | Yes | Yes | Yes |
| All 10 dashboard themes work | Yes | — | Yes | Yes | — |
| All 15 chat themes work | Yes | — | Yes | — | — |
| All 15 profile themes work | Yes | Yes | — | — | — |
| No hardcoded hex values in codebase | Yes | Yes | Yes | Yes | Yes |
| Real-time updates work (Supabase Realtime) | — | Yes | Yes | Yes | Yes |
| Privacy: location is never revealed | — | Yes | Yes | Yes | Yes |
| Stripe payments work in test mode | — | — | — | Yes | — |
| All navigation flows complete correctly | Yes | Yes | Yes | Yes | Yes |
| TypeScript: zero compilation errors | Yes | Yes | Yes | Yes | Yes |
| No console errors or warnings in production mode | Yes | Yes | Yes | Yes | Yes |

**How to fix a broken task:**

- Identify the failing task number (e.g. Task 2.5 — Pin Message)

- Open a new Claude Code session

- Say: "Read JCHAT_3.0_MASTER_SPEC.docx, JCHAT_3.0_DESIGN_SYSTEM.docx, and JCHAT_3.0_DEV_PLAN.docx"

- Say: "Task 2.5 is failing. The issue is \[describe issue\]. Fix it without breaking other tasks."

- Provide the specific error message or screenshot

- After fix: re-run the verification checklist for that task
