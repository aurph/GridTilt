import { type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";

/**
 * Privacy notice. Plain statements of what the site and the email actually
 * do, checked against the code that does them. The contact address and the
 * mailing address come from /api/site/contact, which reads the same settings
 * the email footer prints, so this page and the emails cannot disagree.
 *
 * When a paragraph here stops matching the code, change one or the other in
 * the same pull request and move LAST_UPDATED forward.
 */

const LAST_UPDATED = "2026-10-30";

interface SiteContact {
  contactEmail: string;
  postalAddress: string | null;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="border-card-border p-4">
      <h2 className="text-sm font-semibold text-foreground mb-2">{title}</h2>
      <div className="text-sm text-muted-foreground leading-relaxed space-y-2">{children}</div>
    </Card>
  );
}

export default function Privacy() {
  const { data: contact } = useQuery<SiteContact>({ queryKey: ["/api/site/contact"] });
  const email = contact?.contactEmail;

  return (
    <div className="flex flex-col h-full overflow-y-auto" data-testid="privacy-page">
      <PageHeader
        title="Privacy"
        testId="privacy-header"
        about="What gridtilt.com collects when you browse or subscribe to the email, why, and how to have it removed."
        right={
          <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground" data-testid="privacy-back">
            <ArrowLeft className="h-3.5 w-3.5" /> GridTilt
          </Link>
        }
      />

      <div className="flex-1 p-4 sm:p-6 space-y-4 max-w-4xl">
        <p className="font-mono text-[11px] text-muted-foreground" data-testid="privacy-updated">
          Last updated {LAST_UPDATED}
        </p>

        <Section title="Who runs this site">
          <p>
            GridTilt (gridtilt.com) is an independent research site run by Jack Schwartz. It is not affiliated with any
            utility, grid operator, data center developer or company it covers. This page says what the site keeps about
            you, why, and how to get it removed.
          </p>
        </Section>

        <Section title="If you subscribe to the email">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              We keep your email address, the date you signed up, and, if you filled them in, the short answer you gave in
              the form and which page you signed up from.
            </li>
            <li>
              We use them only to send the GridTilt email and to honor your choices. We do not sell your address or share it
              for anyone else's marketing.
            </li>
            <li>
              The list is stored in a Postgres database. Emails are sent through Resend, which receives your address to
              deliver each email and reports back whether it was delivered, bounced or marked as spam. Resend keeps no copy
              of the list; it only sends.
            </li>
            <li>
              Every email carries an unsubscribe link, and mail apps that support it show a one-click unsubscribe button. An
              unsubscribe takes effect when you use it.
            </li>
            <li>
              After you unsubscribe, your address stays on file marked as unsubscribed so it is never emailed again by
              mistake. If you ask us to delete it instead, we remove the address and keep only a one-way fingerprint (a
              hash) so it cannot be added back without you asking.
            </li>
            <li>
              Each email also states why you are getting it (the date you signed up at gridtilt.com), a contact address, a
              link to this page, and a mailing address.
            </li>
          </ul>
        </Section>

        <Section title="When you browse">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              Page views are counted with GoatCounter, without cookies and without identifying you. What is recorded is the
              page path, which can include the state you chose, and two task events: a project opened and a source link
              opened. No email addresses, names or typed text are recorded, and nothing is counted on admin pages or from
              automated browsers.
            </li>
            <li>
              Map tiles load from CARTO and stock, grid and energy data come from this site's own server. Like any website,
              those requests carry your IP address and the page that asked for them.
            </li>
            <li>The site runs no advertising and no advertising trackers.</li>
            <li>
              Your choices on the site, such as a selected state or a dismissed notice, are kept in your own browser's local
              storage. They never leave your device.
            </li>
          </ul>
        </Section>

        <Section title="Unsubscribe, delete, or ask a question">
          <p>
            Use the unsubscribe link in any email, or write to{" "}
            {email ? (
              <a href={`mailto:${email}`} className="text-foreground underline underline-offset-2" data-testid="privacy-contact">
                {email}
              </a>
            ) : (
              <span data-testid="privacy-contact-pending">the contact address in the site footer</span>
            )}
            . Deletion requests are handled by hand, usually within a few days and always within ten business days.
          </p>
          {contact?.postalAddress ? (
            <p className="font-mono text-[12px]" data-testid="privacy-postal">
              Mailing address: {contact.postalAddress}
            </p>
          ) : null}
        </Section>

        <Section title="Changes">
          <p>
            If this page changes, the date at the top changes. A change that affects how your email address is used will be
            announced in the email before it takes effect.
          </p>
        </Section>
      </div>
    </div>
  );
}
