# JChat 3.0 — Design References

Reference visuals created during planning sessions, stored as SVG/HTML you can open in any browser. Exploratory references, not production assets.

Last updated: 2026-06-22

## 1. Chat avatar size comparison
Context: deciding the size of user avatars in the chat presence bar. Original was 30px; 40px was chosen (36 and 44 also explored).

Implementation note: in mobile/components/chat/ChatTopBar.tsx, avatarStyles.img -> width/height: 40, borderRadius: 20; avatarStyles.initial fontSize -> ~15.

## 2. Heat-zone exploration (deferred — see DECISIONS D-04)
Two techniques compared. Decided to defer.

### 2a. Colored circles (works on Apple + Google native, tappable)
Discrete colored circles per venue: red = high activity, amber = medium, blue = low. Each circle uses fill-opacity ~0.3 with a matching stroke. Works on both Apple and Google native maps via react-native-maps Circle, and each circle is tappable to enter the venue chat.

### 2b. True heatmap gradient (Google Maps only — not used)
A diffuse radial gradient ("thermal" look) blending red -> amber -> blue -> transparent. Only available with Google Maps Heatmap; not supported on Apple Maps and buggy on iOS even via Google.

Why deferred: Heatmap is Google-Maps-only and buggy on iOS; discrete circles map better to bounded venue geofences and are tappable. If revisited, prefer 2a.
