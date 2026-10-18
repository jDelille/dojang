import {
  Activity,
  Award,
  BarChart3,
  BookOpen,
  Bot,
  CalendarDays,
  CheckSquare,
  ClipboardCheck,
  GraduationCap,
  Inbox,
  KanbanSquare,
  ListChecks,
  Megaphone,
  MessageSquareReply,
  Receipt,
  Settings,
  Sparkles,
  Shield,
  Target,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';

/**
 * The rail groups every page into eight sections, following the docs' nav
 * (Home, Members, Classes, CRM, Inbox, Tasks, Reports). Calls, Reviews,
 * Retention and Analytics have no Odoo source yet, so they're off the rail
 * (still reachable by URL). A section's pages are
 * listed in the context column; the first one is where the rail item goes.
 */

export type NavPage = {
  href: string;
  labelKey: string; // key in the `nav` namespace
  icon: LucideIcon;
  exact?: boolean;
  superAdminOnly?: boolean;
};

export type NavSection = {
  id: string;
  abbr: string;
  labelKey: string;
  pages: NavPage[];
};

export const SECTIONS: NavSection[] = [
  { id: 'today', abbr: 'TO', labelKey: 'today', pages: [] },
  {
    id: 'people',
    abbr: 'PE',
    labelKey: 'people',
    pages: [
      { href: '/dashboard/contacts', labelKey: 'contacts', icon: Users },
      { href: '/dashboard/testing', labelKey: 'testing', icon: Award },
    ],
  },
  {
    id: 'ops',
    abbr: 'CL',
    labelKey: 'classesSection',
    pages: [
      { href: '/dashboard/appointments', labelKey: 'appointments', icon: CalendarDays },
      { href: '/dashboard/instructor', labelKey: 'instructor', icon: GraduationCap },
      { href: '/dashboard/attendance', labelKey: 'attendance', icon: ClipboardCheck },
      { href: '/dashboard/courses', labelKey: 'courses', icon: BookOpen },
      { href: '/dashboard/tasks', labelKey: 'tasks', icon: CheckSquare },
    ],
  },
  {
    id: 'crm',
    abbr: 'CR',
    labelKey: 'crm',
    pages: [
      { href: '/dashboard/leads', labelKey: 'leads', icon: UserPlus },
      { href: '/dashboard/pipeline', labelKey: 'pipeline', icon: KanbanSquare },
      { href: '/dashboard/sales', labelKey: 'sales', icon: Target },
    ],
  },
  {
    id: 'revenue',
    abbr: 'RE',
    labelKey: 'revenue',
    pages: [{ href: '/dashboard/invoices', labelKey: 'invoices', icon: Receipt }],
  },
  {
    id: 'engage',
    abbr: 'EN',
    labelKey: 'engage',
    pages: [
      { href: '/dashboard/inbox', labelKey: 'inbox', icon: Inbox },
      { href: '/dashboard/messaging', labelKey: 'messaging', icon: Megaphone },
      { href: '/dashboard/follow-ups', labelKey: 'followUps', icon: MessageSquareReply },
    ],
  },
  {
    id: 'intel',
    abbr: 'RP',
    labelKey: 'reports',
    pages: [
      { href: '/dashboard/pulse', labelKey: 'pulse', icon: Activity },
      { href: '/dashboard/operations', labelKey: 'operations', icon: BarChart3 },
      { href: '/dashboard/agents', labelKey: 'agents', icon: Bot },
    ],
  },
  {
    id: 'platform',
    abbr: 'PL',
    labelKey: 'platform',
    pages: [
      { href: '/dashboard/settings', labelKey: 'settings', icon: Settings },
      { href: '/dashboard/setup', labelKey: 'setup', icon: ListChecks },
      { href: '/dashboard/ai-settings', labelKey: 'aiSettings', icon: Sparkles },
      { href: '/super-admin', labelKey: 'superAdmin', icon: Shield, superAdminOnly: true },
    ],
  },
];

export const TODAY_HREF = '/dashboard';

export function sectionHref(section: NavSection) {
  return section.pages[0]?.href ?? TODAY_HREF;
}

export function pageMatches(page: NavPage, pathname: string) {
  return page.exact
    ? pathname === page.href
    : pathname === page.href || pathname.startsWith(`${page.href}/`);
}

export function sectionFor(pathname: string): NavSection {
  return (
    SECTIONS.find((section) => section.pages.some((page) => pageMatches(page, pathname))) ??
    SECTIONS[0]
  );
}

export function visiblePages(section: NavSection, showSuperAdmin: boolean) {
  return section.pages.filter((page) => !page.superAdminOnly || showSuperAdmin);
}
