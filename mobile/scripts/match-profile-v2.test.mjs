// Match v2 in the app: the entry sheet (one switch, six points, its own ES/EN selector), Settings (games + Match profile), "Mi perfil de Match" (four
// views), the deck's three states, the photo-verdict notifications and the DM "in review" texts. Run from mobile/:
//   node --test scripts/match-profile-v2.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const json = (lang, ns) => JSON.parse(read(`i18n/locales/${lang}/${ns}.json`));
const js = ts.transpileModule(read('utils/matchProfileState.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', js)(mod, mod.exports);
const {
  summarizeMatchProfile, canConfirmMatchProfile, missingForConfirm, settingsStatus, deckGate, matchPrefsInsertPayload, matchPrefsUpdatePayload,
  isChangeLimitError, isMissingTableError, ageFromBirthYear, MAX_MATCH_INTERESTS,
} = mod.exports;

const photo = (status) => ({ status });
const base = { gender: 'woman', seeking: 'men' };

// ── Pure state ───────────────────────────────────────────────────────────────────────────────────────────────

test('progress counts four steps: gender, seeking, at least one photo, one approved photo', () => {
  assert.equal(summarizeMatchProfile({ gender: null, seeking: null, photos: [] }).done, 0);
  assert.equal(summarizeMatchProfile({ ...base, photos: [] }).done, 2);
  assert.equal(summarizeMatchProfile({ ...base, photos: [photo('pending')] }).done, 3);
  const complete = summarizeMatchProfile({ ...base, photos: [photo('approved')] });
  assert.equal(complete.done, 4);
  assert.equal(complete.total, 4);
});

test('state: incomplete → reviewing (a photo in review) → rejected (all refused) → complete (one approved)', () => {
  assert.equal(summarizeMatchProfile({ gender: null, seeking: 'men', photos: [photo('approved')] }).state, 'incomplete');
  assert.equal(summarizeMatchProfile({ ...base, photos: [] }).state, 'incomplete');
  assert.equal(summarizeMatchProfile({ ...base, photos: [photo('pending')] }).state, 'reviewing');
  assert.equal(summarizeMatchProfile({ ...base, photos: [photo('rejected'), photo('pending')] }).state, 'reviewing');
  assert.equal(summarizeMatchProfile({ ...base, photos: [photo('rejected'), photo('rejected')] }).state, 'rejected');
  assert.equal(summarizeMatchProfile({ ...base, photos: [photo('rejected'), photo('approved')] }).state, 'complete');
});

test('"Confirmar perfil" needs gender, seeking and one photo; it says what is missing, in order', () => {
  const none = summarizeMatchProfile({ gender: null, seeking: null, photos: [] });
  assert.equal(canConfirmMatchProfile(none), false);
  assert.deepEqual(missingForConfirm(none), ['gender', 'seeking', 'photo']);
  const ready = summarizeMatchProfile({ ...base, photos: [photo('pending')] });
  assert.equal(canConfirmMatchProfile(ready), true);
  assert.deepEqual(missingForConfirm(ready), []);
});

test('Settings label: Completo / En revisión / Incompleto (a refused photo is incomplete: the person has to act)', () => {
  assert.equal(settingsStatus(summarizeMatchProfile({ ...base, photos: [photo('approved')] })), 'complete');
  assert.equal(settingsStatus(summarizeMatchProfile({ ...base, photos: [photo('pending')] })), 'reviewing');
  assert.equal(settingsStatus(summarizeMatchProfile({ ...base, photos: [photo('rejected')] })), 'incomplete');
  assert.equal(settingsStatus(summarizeMatchProfile({ gender: null, seeking: null, photos: [] })), 'incomplete');
});

test('deck: no profile → "Crea tu perfil"; photo in review; photo refused; complete → the deck itself', () => {
  assert.equal(deckGate(summarizeMatchProfile({ gender: null, seeking: null, photos: [] })), 'noProfile');
  assert.equal(deckGate(summarizeMatchProfile({ ...base, photos: [photo('pending')] })), 'reviewing');
  assert.equal(deckGate(summarizeMatchProfile({ ...base, photos: [photo('rejected')] })), 'rejected');
  assert.equal(deckGate(summarizeMatchProfile({ ...base, photos: [photo('approved')] })), null);
});

test('before the migration (prefs not readable) gender / seeking are not asked: the old photo-only rule holds', () => {
  const summary = summarizeMatchProfile({ gender: null, seeking: null, photos: [photo('approved')], prefsAvailable: false });
  assert.equal(summary.state, 'complete');
  assert.equal(deckGate(summary), null);
  assert.equal(deckGate(summarizeMatchProfile({ gender: null, seeking: null, photos: [], prefsAvailable: false })), 'noProfile');
});

test('saving sends ONLY { user_id, gender, seeking } on insert and { gender, seeking } on update', () => {
  assert.deepEqual(Object.keys(matchPrefsInsertPayload('u1', 'woman', 'men')).sort(), ['gender', 'seeking', 'user_id']);
  assert.deepEqual(Object.keys(matchPrefsUpdatePayload('woman', 'men')).sort(), ['gender', 'seeking']);
});

test('the change limit and the missing table are recognised from the server errors', () => {
  assert.equal(isChangeLimitError({ code: 'P0001', message: 'match_profile_change_limit' }), true);
  assert.equal(isChangeLimitError({ code: 'P0001', message: 'something else' }), false);
  assert.equal(isChangeLimitError({ code: '23505', message: 'match_profile_change_limit' }), false);
  assert.equal(isChangeLimitError(null), false);
  assert.equal(isMissingTableError({ code: '42P01' }), true);
  assert.equal(isMissingTableError({ code: 'PGRST205' }), true);
  assert.equal(isMissingTableError({ code: '42501' }), false);
});

test('age for the owner: from the year of birth; unknown or implausible → null; at most 5 interests', () => {
  assert.equal(ageFromBirthYear(1990, new Date('2026-11-01')), 36);
  assert.equal(ageFromBirthYear(null), null);
  assert.equal(ageFromBirthYear(2015, new Date('2026-11-01')), null);
  assert.equal(MAX_MATCH_INTERESTS, 5);
});

// ── Services ─────────────────────────────────────────────────────────────────────────────────────────────────

test('saveMyMatchPrefs does not use upsert (its DO UPDATE would also set user_id, which the client cannot update) and handles the change limit upstream', () => {
  const service = read('services/matchProfile.ts');
  const body = service.slice(service.indexOf('export async function saveMyMatchPrefs'), service.indexOf('export async function fetchMyBirthYear'));
  assert.doesNotMatch(body.replace(/\/\/.*$/gm, ''), /\.upsert\(/);
  assert.match(body, /\.insert\(matchPrefsInsertPayload\(userId, gender, seeking\)\)/);
  assert.match(body, /\.update\(matchPrefsUpdatePayload\(gender, seeking\)\)/);
  assert.match(body, /code === '23505'/);
  const screen = read('screens/match/MatchMyProfileScreen.tsx');
  assert.match(screen, /isChangeLimitError\(err\) \? t\('profile\.v2\.changeLimit'\) : t\('profile\.v2\.prefsSaveError'\)/);
  assert.doesNotMatch(screen, /delete.*match_profiles|deleteMyMatchProfile/i, 'there is no button to delete the Match profile');
});

// ── The entry sheet ──────────────────────────────────────────────────────────────────────────────────────────

const notice = read('components/match/MatchEntryNotice.tsx');
const chat = read('screens/chat/ChatRoomScreen.tsx');

test('the entry sheet has ONE switch (users.settings.gamesEnabled) and no per-game switch', () => {
  assert.equal((notice.match(/<SwitchRow\b/g) ?? []).length, 1);
  assert.doesNotMatch(notice, /matchOptIn|onMatchOptInChange|games\.map|game\.key/);
  assert.match(notice, /t\('entry\.gamesGlobal'\)/);
  assert.match(notice, /t\('entry\.gamesGlobalHint'\)/);
});

test('six key points in the agreed order, each with its icon', () => {
  const order = [...notice.matchAll(/\{ key: '(\w+)', Icon: (\w+) \}/g)].map((m) => `${m[1]}:${m[2]}`);
  assert.deepEqual(order, ['here:IconEye', 'adults:IconShieldCheck', 'erased:IconTrash', 'block:IconBan', 'screenshots:IconCamera', 'help:IconLifebuoy']);
});

test('the sheet has its own ES/EN selector: it uses a fixed translator and never changes the app language', () => {
  // The selector now lives in ChatRoomScreen's venue-name row; the sheet language is state there and the notice receives it.
  assert.match(notice, /i18n\.getFixedT\(language, 'match'\)/);
  assert.match(chat, /useState<'en' \| 'es'>\(matchLanguage\)/);
  assert.doesNotMatch(notice, /changeLanguage/);
  assert.doesNotMatch(chat, /changeLanguage\(sheetLang/);
  assert.match(notice, /testID=\{`entry-lang-\$\{code\}`\}/);
});

test('the sheet shows when the venue has ANY game (Match or Truth or Dare); the per-venue local flag is gone; matchLeaveVenue stays', () => {
  assert.match(chat, /\{\(matchAvailable \|\| todAvailable\) && \(\s*<MatchEntryNotice/);
  assert.doesNotMatch(chat, /matchOptIn|MatchOptIn/);
  assert.match(chat, /const matchActive = matchAvailable && gamesEnabled;/);
  assert.match(chat, /if \(matchAvailable && !gamesEnabled\) void matchLeaveVenue\(matchBusinessId\)/);
  assert.doesNotMatch(read('services/match.ts'), /getMatchOptIn|setMatchOptIn|match\.optIn/);
  assert.doesNotMatch(read('utils/matchLeave.ts'), /setMatchOptIn/);
});

test('the six points and the switch hint say exactly what was agreed, in es and en', () => {
  const es = json('es', 'match').entry;
  const en = json('en', 'match').entry;
  assert.deepEqual(Object.keys(es.points), ['here', 'adults', 'erased', 'block', 'screenshots', 'help']);
  assert.deepEqual(Object.keys(en.points), Object.keys(es.points));
  assert.equal(es.points.adults.title, 'Solo mayores de 18');
  assert.equal(es.points.adults.body, 'JChat es solo para adultos. Usamos filtros automáticos y revisamos los reportes; puedes reportar o bloquear a cualquiera.');
  assert.equal(es.points.block.title, 'Bloquea o reporta a quien quieras');
  assert.equal(es.points.help.body, 'Pide ayuda al personal del local desde la app, sin que nadie más lo vea. En una emergencia, llama al 911.');
  assert.equal(en.points.adults.title, '18+ only');
  assert.equal(en.points.adults.body, 'JChat is for adults only. We use automatic filters and review reports; you can report or block anyone.');
  assert.equal(en.points.erased.body, 'Likes, matches and chats disappear, except with people you both follow.');
  assert.equal(en.points.help.body, 'Ask the venue staff for help from the app, without anyone else seeing it. In an emergency, call 911.');
  assert.equal(es.gamesGlobalHint, 'Match y Truth or Dare en este local. Cámbialo cuando quieras en Ajustes.');
  assert.equal(en.gamesGlobalHint, 'Match and Truth or Dare at this venue. Change it anytime in Settings.');
});

// ── Settings ─────────────────────────────────────────────────────────────────────────────────────────────────

test('Settings: a "Juegos" section with the same switch and a "Mi perfil de Match" row with its status', () => {
  const settings = read('screens/settings/SettingsScreen.tsx');
  assert.match(settings, /label=\{t\('main\.sectionGames'\)\}/);
  assert.match(settings, /onValueChange=\{\(v\) => patch\(\{ gamesEnabled: v \}\)\}/);
  assert.match(settings, /testID="settings-match-profile"/);
  assert.match(settings, /settingsStatus\(matchProfile\.summary\)/);
  const es = json('es', 'settings').main;
  const en = json('en', 'settings').main;
  assert.equal(es.sectionGames, 'Juegos');
  assert.equal(es.gamesSub, 'Match y Truth or Dare en todos los locales.');
  assert.equal(en.gamesSub, 'Match and Truth or Dare at every venue.');
  assert.deepEqual([es.matchProfileComplete, es.matchProfileReviewing, es.matchProfileIncomplete], ['Completo', 'En revisión', 'Incompleto']);
  assert.deepEqual([en.matchProfileComplete, en.matchProfileReviewing, en.matchProfileIncomplete], ['Complete', 'In review', 'Incomplete']);
});

// ── My Match profile and the deck ────────────────────────────────────────────────────────────────────────────

test('"Mi perfil de Match": progress, Soy, Me interesa, age, photos with Principal, shortcut, interests, Confirmar; no hex colours', () => {
  const screen = read('screens/match/MatchMyProfileScreen.tsx');
  for (const needle of ["profile.v2.progress'", "profile.v2.gender.title'", "profile.v2.seeking.title'", "profile.v2.ageTitle'", "profile.v2.main'", "profile.v2.tip'", "profile.v2.shortcutTitle'", "profile.v2.pickInterests'", "profile.v2.privacy'", "profile.v2.confirm'"]) {
    assert.ok(screen.includes(needle), needle);
  }
  assert.match(screen, /photos\.length === 0 && profile\.avatar_url/, 'the featured shortcut only shows while there are no photos');
  assert.match(screen, /addAvatarAsMatchPhoto\(user\.id, avatar, photos\.length\)/);
  assert.doesNotMatch(screen, /#[0-9a-fA-F]{3,8}\b/);
  assert.match(screen, /MAX_MATCH_INTERESTS/);
});

test('the four views and what each one says', () => {
  const screen = read('screens/match/MatchMyProfileScreen.tsx');
  for (const key of ["profile.v2.reviewing.title'", "profile.v2.reviewing.note'", "profile.v2.reviewing.back'", "profile.v2.rejected.title'", "profile.v2.rejected.upload'", "profile.v2.rejected.notNow'", "profile.v2.complete.preview'", "profile.v2.complete.goMatch'", "profile.v2.previewScreen.tag'", "profile.v2.list.games'"]) {
    assert.ok(screen.includes(key), key);
  }
  assert.match(screen, /params\?\.focus === 'result'/, 'a tap on the verdict notification opens on the result');
  assert.match(read('hooks/useMyMatchProfile.ts'), /shouldPollPhotos/, 'a photo in review is looked at again by itself');
  const es = json('es', 'match').profile.v2;
  assert.equal(es.reviewing.title, 'Revisando tus fotos');
  assert.equal(es.reviewing.sub, 'Suele tardar unos segundos. Te avisamos en cuanto aparezcas.');
  assert.equal(es.reviewing.note, 'Si tarda más de 10 minutos, lo revisa una persona del equipo de JChat.');
  assert.equal(es.rejected.title, 'Cambia tu foto para aparecer');
  assert.equal(es.rejected.sub, 'Tu foto no cumple las normas de la comunidad. Sube otra en la que se te vea bien la cara.');
  assert.equal(es.privacy, 'Tu sexo y lo que buscas solo se usan para mostrarte a las personas adecuadas.');
  assert.equal(es.changeLimit, 'Ya cambiaste esto varias veces hoy. Podrás cambiarlo de nuevo mañana.');
  assert.equal(json('en', 'match').profile.v2.changeLimit, "You've changed this several times today. You can change it again tomorrow.");
});

test('the deck: three states instead of "Sube una foto"', () => {
  const deck = read('components/match/MatchDeckSection.tsx');
  assert.match(deck, /gate === 'noProfile'/);
  assert.match(deck, /gate === 'reviewing'/);
  assert.match(deck, /gate === 'rejected'/);
  assert.doesNotMatch(deck, /states\.noPhotoTitle/);
  const es = json('es', 'match').profile.v2.deck;
  assert.equal(es.createTitle, 'Crea tu perfil de Match');
  assert.equal(es.createBody, 'Tarda menos de un minuto. Solo te verán personas dentro de este local.');
  assert.equal(es.create, 'Crear perfil');
  assert.equal(es.reviewingTitle, 'Tu foto está en revisión');
});

test('interests are optional with a maximum of 5', () => {
  const screen = read('screens/match/MatchInterestsScreen.tsx');
  assert.match(screen, /next\.size >= MAX_MATCH_INTERESTS/);
  assert.doesNotMatch(screen, /MIN_INTERESTS/);
});

// ── Notifications ────────────────────────────────────────────────────────────────────────────────────────────

test('verdict notifications: own texts in the list, a tap opens the result, an unknown type never breaks the list', () => {
  const service = read('services/notifications.ts');
  assert.match(service, /\| 'match_photo_approved'\s*\| 'match_photo_rejected';/);
  assert.match(service, /case 'match_photo_approved':\s*case 'match_photo_rejected':\s*\/\/[^\n]*\n\s*return \{ screen: 'MatchMyProfile', params: \{ focus: 'result' \} \};/);
  assert.match(service, /default:\s*return null; \/\/ a type this build does not know/);
  assert.match(service, /default:\s*\/\/ A type this build does not know[^\n]*\n\s*return \{ icon: IconBell/);
  const presenter = read('hooks/useNotificationPresenter.ts');
  assert.match(presenter, /if \(!isSocialNotificationType\(notification\.type\)\) return false;/, 'a type outside the known list is not shown');
  assert.match(presenter, /messages\.notif\.matchPhotoApprovedHere/);
  assert.match(read('navigation/AppNavigator.tsx'), /route\.screen === 'MatchMyProfile'\) navigationRef\.navigate\('MatchMyProfile', route\.params\)/);
  const es = json('es', 'social').messages.notif;
  const en = json('en', 'social').messages.notif;
  assert.equal(es.matchPhotoApprovedHere, 'Ya apareces en Match en {{business}}');
  assert.equal(es.matchPhotoApproved, 'Tu foto de Match fue aprobada');
  assert.equal(es.matchPhotoRejected, 'Tu foto no cumple las normas. Sube otra para aparecer.');
  assert.equal(en.matchPhotoApprovedHere, "You're now in Match at {{business}}");
  assert.equal(en.matchPhotoRejected, "Your photo doesn't meet the rules. Upload another one to appear.");
});

test('send-push knows the three new types with es/en texts, outside MATCH_TYPES, and respects notifSocial', () => {
  const push = readFileSync(new URL('../../supabase/functions/send-push/index.ts', import.meta.url), 'utf8');
  for (const type of ['match_photo_approved', 'match_photo_rejected', 'admin_alert']) assert.ok(push.includes(`"${type}",`), type);
  assert.match(push, /const MATCH_TYPES: readonly PushType\[\] = \["match_like", "match_super", "match_match", "match_new_people"\];/);
  assert.match(push, /`Ya apareces en Match en \$\{business\}`/);
  assert.match(push, /`You're now in Match at \$\{business\}`/);
  assert.match(push, /"Tu foto de Match fue aprobada"/);
  assert.match(push, /"Your Match photo was approved"/);
  assert.match(push, /"Tu foto no cumple las normas\. Sube otra para aparecer\."/);
  assert.match(push, /"Your photo doesn't meet the rules\. Upload another one to appear\."/);
  assert.match(push, /`Fotos pendientes de moderación: \$\{count\}`/);
  assert.match(push, /`Photos pending moderation: \$\{count\}`/);
  assert.match(push, /type === "match_photo_approved" \|\| type === "match_photo_rejected"/);
});

// ── DM photos ────────────────────────────────────────────────────────────────────────────────────────────────

test('DM: the sender sees "En revisión" on a pending photo; the receiver sees "Revisando foto…" (not "Foto sensible"), and it opens once approved', () => {
  const dm = read('screens/dms/DMChatScreen.tsx');
  assert.match(dm, /const photoReviewing = !isOwn && photoPending;/);
  assert.match(dm, /moderation === 'blurred' && !revealed/);
  assert.match(dm, /dmPhoto\.senderReviewing/);
  assert.match(dm, /dmPhoto\.receiverReviewingTitle/);
  assert.match(dm, /\(isOwn \|\| moderation === null \|\| moderation === 'clear' \|\| \(moderation === 'blurred' && revealed\)\)/, 'a pending photo still does not open; it does when the verdict arrives');
  const es = json('es', 'common').dmPhoto;
  const en = json('en', 'common').dmPhoto;
  assert.equal(es.senderReviewing, 'En revisión');
  assert.equal(es.receiverReviewingTitle, 'Revisando foto…');
  assert.equal(es.receiverReviewingHint, 'Se mostrará en cuanto se apruebe.');
  assert.equal(en.senderReviewing, 'In review');
  assert.equal(en.receiverReviewingHint, "It will show as soon as it's approved.");
});

// ── i18n parity ──────────────────────────────────────────────────────────────────────────────────────────────

function keys(object, prefix = '') {
  return Object.entries(object).flatMap(([key, value]) => (value && typeof value === 'object' ? keys(value, `${prefix}${key}.`) : [`${prefix}${key}`]));
}

test('en and es have exactly the same keys in the files this change touched', () => {
  for (const ns of ['match', 'settings', 'social', 'common']) {
    assert.deepEqual(keys(json('en', ns)).sort(), keys(json('es', ns)).sort(), ns);
  }
});
