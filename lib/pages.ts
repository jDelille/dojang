import { prisma } from '@/lib/db';
import { escapeHtml } from '@/lib/integrations/mailer';

/**
 * Buyer-editable public pages (privacy, terms, refund policy…).
 *
 * The body is a small Markdown subset rendered through an allowlist rather
 * than raw HTML. An admin is trusted, but "trusted" is not the same as
 * "should be able to inject a script into every visitor's browser" — and a
 * compromised admin account should not become stored XSS on the public site.
 */

export interface PageSummary {
  slug: string;
  title: string;
}

export async function listPublishedPages(): Promise<PageSummary[]> {
  return prisma.sitePage.findMany({
    where: { isPublished: true, showInFooter: true },
    orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
    select: { slug: true, title: true },
  });
}

export async function getPublishedPage(slug: string) {
  return prisma.sitePage.findFirst({ where: { slug, isPublished: true } });
}

/** URL-safe slug from a title, so admins never hand-craft one. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
    .replace(/^-|-$/g, '');
}

/**
 * Renders the Markdown subset to HTML.
 *
 * Everything is escaped first and only known constructs are re-introduced, so
 * there is no path by which author input becomes live markup. Links are
 * restricted to http(s) and mailto — `javascript:` is the obvious hole.
 */
export function renderPageContent(markdown: string): string {
  const lines = escapeHtml(markdown).replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];
  let inList = false;

  const closeList = () => {
    if (inList) {
      html.push('</ul>');
      inList = false;
    }
  };

  const inline = (text: string) =>
    text
      // [label](url) — only safe schemes survive.
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label: string, url: string) => {
        const safe = /^(https?:\/\/|mailto:|\/)/i.test(url);
        return safe
          ? `<a href="${url}" class="underline underline-offset-4 hover:text-accent-dark"${
              url.startsWith('http') ? ' rel="noopener noreferrer" target="_blank"' : ''
            }>${label}</a>`
          : label;
      })
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
      .replace(/`([^`]+)`/g, '<code class="rounded bg-[color:var(--color-border)] px-1 py-0.5 font-mono text-[0.9em]">$1</code>');

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (!line.trim()) {
      closeList();
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      closeList();
      const level = heading[1].length;
      const size = level === 1 ? 'text-xl' : level === 2 ? 'text-base' : 'text-sm';
      html.push(
        `<h${level + 1} class="mt-8 font-display ${size} font-semibold first:mt-0">${inline(heading[2])}</h${level + 1}>`,
      );
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      if (!inList) {
        html.push('<ul class="mt-3 space-y-1.5 ps-5 list-disc marker:text-[color:var(--color-fg-muted)]">');
        inList = true;
      }
      html.push(`<li>${inline(bullet[1])}</li>`);
      continue;
    }

    closeList();
    html.push(`<p class="mt-4 leading-relaxed">${inline(line)}</p>`);
  }

  closeList();
  return html.join('\n');
}

/** Starter drafts, so a buyer edits rather than starts from a blank page. */
export const STARTER_PAGES: Array<{ slug: string; title: string; content: string }> = [
  {
    slug: 'privacy',
    title: 'Privacy Policy',
    content: `# Privacy Policy

_Last updated: [add a date]_

This page explains what **[Your Business]** collects and why. Replace this text
with your own policy — it is a starting point, not legal advice.

## What we collect
- Contact details you give us: name, email address and phone number.
- Records of our conversations: calls, messages and emails.
- Billing information needed to raise and settle invoices.

## Why we collect it
- To answer your enquiries and provide the service you asked for.
- To send appointment reminders and invoices.
- To meet our legal and accounting obligations.

## Who we share it with
We do not sell your data. We share it only with the providers that run this
service on our behalf, and only as far as they need it to do their job.

## Your rights
You can ask us for a copy of your data, ask us to correct it, or ask us to
delete it. Contact us at [your email address].`,
  },
  {
    slug: 'terms',
    title: 'Terms of Service',
    content: `# Terms of Service

_Last updated: [add a date]_

These terms cover your use of **[Your Business]**. Replace this text with your
own terms — it is a starting point, not legal advice.

## Using this service
You agree to give accurate information and not to use the service unlawfully or
in a way that disrupts it for others.

## Payment
Invoices are due by the date shown on them. Late payment may pause work.

## Cancellation
Either of us may end this arrangement in writing. Work already completed
remains payable.

## Liability
We provide the service with reasonable care and skill. We are not liable for
indirect or consequential loss.

## Contact
Questions about these terms: [your email address].`,
  },
  {
    slug: 'refund-policy',
    title: 'Refund Policy',
    content: `# Refund Policy

_Last updated: [add a date]_

Replace this text with your own policy — it is a starting point, not legal
advice.

## Requesting a refund
Contact us within [number] days of payment at [your email address], quoting
your invoice number.

## What is refundable
- Work not yet started is refunded in full.
- Work in progress is refunded less the time already spent.
- Completed work is not normally refundable.

## How refunds are paid
Refunds go back to the original payment method and usually take 5 to 10
working days to appear.`,
  },
];
