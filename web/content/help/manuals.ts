/**
 * The two manuals of the help center (jchat.cloud/help): which chapters each one has, in order, and the texts of the pages around them.
 * A chapter that has nothing published to document is removed from CHAPTERS (and its files deleted), never invented.
 */

import type { HelpLocale, HelpManualId } from './types';

export const MANUAL_IDS: readonly HelpManualId[] = ['users', 'business'];

export const CHAPTERS: Record<HelpManualId, readonly string[]> = {
  users: [
    'getting-started',
    'find-a-venue',
    'venue-chat',
    'messages',
    'order-and-pay',
    'reservations',
    'profile-and-privacy',
    'safety',
    'delete-account',
    'troubleshooting',
  ],
  business: [
    'register-your-business',
    'plans-and-trial',
    'get-paid',
    'menu',
    'orders',
    'reservations',
    'staff-and-roles',
    'posts-and-offers',
    'billing',
    'close-your-venue',
  ],
};

export function isManualId(value: string): value is HelpManualId {
  return (MANUAL_IDS as readonly string[]).includes(value);
}

export function isChapterId(manual: HelpManualId, value: string): boolean {
  return CHAPTERS[manual].includes(value);
}

/** Every public path of the help center (the same URL serves both languages). */
export function helpPaths(): string[] {
  const paths = ['/help'];
  for (const manual of MANUAL_IDS) {
    paths.push(`/help/${manual}`);
    for (const chapter of CHAPTERS[manual]) paths.push(`/help/${manual}/${chapter}`);
  }
  return paths;
}

export interface ManualMeta {
  title: string;
  /** Who it is for: the card of the portada and the first line of the index. */
  audience: string;
  description: string;
}

export const MANUAL_META: Record<HelpLocale, Record<HelpManualId, ManualMeta>> = {
  es: {
    users: {
      title: 'Manual de usuarios',
      audience: 'Para quien usa la app de JChat',
      description: 'Cómo crear tu cuenta, encontrar locales, entrar al chat, pedir, reservar y cuidar tu privacidad en JChat.',
    },
    business: {
      title: 'Manual de negocios',
      audience: 'Para quien tiene un local en JChat',
      description: 'Cómo registrar tu local, cobrar, publicar tu menú, atender pedidos y reservas y manejar a tu equipo en JChat.',
    },
  },
  en: {
    users: {
      title: 'User guide',
      audience: 'For people who use the JChat app',
      description: 'How to create your account, find venues, join the chat, order, book a table and look after your privacy on JChat.',
    },
    business: {
      title: 'Business guide',
      audience: 'For venue owners on JChat',
      description: 'How to register your venue, get paid, publish your menu, handle orders and reservations and manage your team on JChat.',
    },
  },
};

export interface HelpUi {
  siteName: string;
  helpCenter: string;
  portadaTitle: string;
  portadaIntro: string;
  openManual: string;
  contactTitle: string;
  contactText: string;
  contactEmail: string;
  legalTitle: string;
  breadcrumbHelp: string;
  chaptersTitle: string;
  goalLabel: string;
  previous: string;
  next: string;
  backToIndex: string;
  onThisPage: string;
  stepsLabel: string;
  noteImportant: string;
  noteTip: string;
  chapterCount: (n: number) => string;
  navLabel: string;
  notFoundTitle: string;
  notFoundText: string;
}

export const HELP_UI: Record<HelpLocale, HelpUi> = {
  es: {
    siteName: 'Ayuda de JChat',
    helpCenter: 'Centro de ayuda',
    portadaTitle: 'Centro de ayuda de JChat',
    portadaIntro: 'Elige el manual que necesitas. Cada uno explica paso a paso lo que puedes hacer hoy en JChat.',
    openManual: 'Abrir el manual',
    contactTitle: '¿No encuentras lo que buscas?',
    contactText: 'Escríbenos y te respondemos lo antes posible.',
    contactEmail: 'soporte@jchat.cloud',
    legalTitle: 'Información legal',
    breadcrumbHelp: 'Ayuda',
    chaptersTitle: 'Capítulos',
    goalLabel: 'Qué vas a lograr',
    previous: 'Anterior',
    next: 'Siguiente',
    backToIndex: 'Volver al índice',
    onThisPage: 'En esta página',
    stepsLabel: 'Pasos',
    noteImportant: 'Importante',
    noteTip: 'Consejo',
    chapterCount: (n) => (n === 1 ? '1 capítulo' : `${n} capítulos`),
    navLabel: 'Navegación del manual',
    notFoundTitle: 'Página no encontrada',
    notFoundText: 'Este capítulo no existe. Vuelve al centro de ayuda.',
  },
  en: {
    siteName: 'JChat Help',
    helpCenter: 'Help center',
    portadaTitle: 'JChat Help Center',
    portadaIntro: 'Choose the guide you need. Each one explains, step by step, what you can do on JChat today.',
    openManual: 'Open the guide',
    contactTitle: "Can't find what you need?",
    contactText: 'Write to us and we will get back to you as soon as we can.',
    contactEmail: 'soporte@jchat.cloud',
    legalTitle: 'Legal information',
    breadcrumbHelp: 'Help',
    chaptersTitle: 'Chapters',
    goalLabel: 'What you will achieve',
    previous: 'Previous',
    next: 'Next',
    backToIndex: 'Back to the index',
    onThisPage: 'On this page',
    stepsLabel: 'Steps',
    noteImportant: 'Important',
    noteTip: 'Tip',
    chapterCount: (n) => (n === 1 ? '1 chapter' : `${n} chapters`),
    navLabel: 'Guide navigation',
    notFoundTitle: 'Page not found',
    notFoundText: 'This chapter does not exist. Go back to the help center.',
  },
};
