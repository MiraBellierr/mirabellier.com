import LegalPage, { type LegalSection } from "@/components/LegalPage";
import { usePageSeo } from "@/lib/seo";

const EFFECTIVE_DATE = "June 20, 2026";
const PRIVACY_DESCRIPTION =
  "How Mirabellier.com collects, uses, shares, stores, and protects information when you visit the website.";

const sections: LegalSection[] = [
  {
    id: "scope",
    title: "Who we are and what this policy covers",
    content: (
      <>
        <p>
          Mira operates Mirabellier.com from Malaysia. This policy
          explains how information is handled when you browse the site, sign in,
          create a profile, post content, or use interactive features such as
          the guestbook, question of the day, blog reactions, and Arena.
        </p>
        <p>
          This policy does not control third-party websites or services. Their
          own privacy terms apply when you leave Mirabellier.com or interact with
          their embedded content.
        </p>
      </>
    ),
  },
  {
    id: "information-collected",
    title: "Information we collect",
    content: (
      <>
        <p>Depending on how you use the site, we may collect:</p>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>Discord account information:</strong> your Discord account
            identifier, username, avatar, and banner when you sign in through
            Discord OAuth. Mirabellier.com requests Discord&apos;s identify scope
            and does not receive your Discord password.
          </li>
          <li>
            <strong>Profile information:</strong> a username, avatar, banner,
            biography, location, and website that you choose to add.
          </li>
          <li>
            <strong>Public contributions:</strong> guestbook names, messages,
            moods and websites; question-of-the-day answers; blog comments,
            likes and posts; and related timestamps.
          </li>
          <li>
            <strong>Arena information:</strong> game profile, level, experience,
            coins, cards, inventory, equipment, skill choices, fight history,
            wins, losses, and other game progress.
          </li>
          <li>
            <strong>Technical and security information:</strong> IP address,
            browser or device details, request information, authentication
            tokens, and human-verification results where needed to operate and
            protect the service.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "how-we-use",
    title: "How we use information",
    content: (
      <>
        <p>We use information to:</p>
        <ul className="list-disc space-y-2 pl-6">
          <li>authenticate accounts and maintain secure sessions;</li>
          <li>display profiles and content you choose to publish;</li>
          <li>provide comments, likes, guestbook, questions, and Arena play;</li>
          <li>moderate abuse, prevent spam, and enforce the Terms of Service;</li>
          <li>maintain, troubleshoot, secure, and improve the website; and</li>
          <li>respond to privacy, support, legal, or safety requests.</li>
        </ul>
        <p>
          Mira does not sell personal data and does not use it for
          behavioral advertising.
        </p>
      </>
    ),
  },
  {
    id: "public-information",
    title: "What becomes public",
    content: (
      <>
        <p>
          Profiles and contributions are designed to be public. Your username,
          avatar, banner, biography, location, website, posts, comments,
          guestbook notes, question answers, and some Arena statistics may be
          visible to anyone and may appear in search or social previews.
        </p>
        <p>
          Do not publish private, sensitive, or confidential information. Public
          material may be copied or indexed by others even after it is removed
          from the site.
        </p>
        <p>
          Your raw Discord account identifier is kept server-side for account
          matching and permissions and is not included in public profile API
          responses.
        </p>
      </>
    ),
  },
  {
    id: "cookies-storage",
    title: "Cookies and local storage",
    content: (
      <>
        <p>
          Mirabellier.com uses an HTTP-only session cookie to keep you signed in and
          a short-lived cookie to return you to the correct site after Discord
          login. These are functional cookies, not advertising cookies.
        </p>
        <p>
          Browser storage remembers your light or dark theme, custom-cursor
          choice, an anonymous blog-like identifier, a guest identifier for
          question-of-the-day participation, and a short-lived reload guard used
          after site updates. You can clear these through your browser, although
          some preferences or anonymous interaction history may reset.
        </p>
        <p>
          Cloudflare Turnstile may use cookies, browser storage, IP information,
          and security signals when it checks that a form or Arena request is
          being made by a person rather than an abusive automated system.
        </p>
      </>
    ),
  },
  {
    id: "sharing",
    title: "When information is shared",
    content: (
      <>
        <p>Information may be shared with:</p>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>Discord</strong> for OAuth login and Discord-hosted profile
            images;
          </li>
          <li>
            <strong>Cloudflare</strong> for Turnstile verification and related
            security services;
          </li>
          <li>
            hosting, infrastructure, or technical providers needed to deliver
            and secure the site;
          </li>
          <li>
            external services you choose to open or interact with, including
            embedded or linked Ko-fi, Patreon, GitHub, MyAnimeList, and other
            content providers; and
          </li>
          <li>
            authorities or other parties when reasonably necessary to comply
            with law, protect rights or safety, investigate abuse, or defend
            legal claims.
          </li>
        </ul>
        <p>
          Mira does not give third parties permission to use your data
          for their own advertising on this site.
        </p>
      </>
    ),
  },
  {
    id: "retention",
    title: "Data retention",
    content: (
      <>
        <p>
          Account, profile, public contribution, and Arena data is generally
          kept while it is needed to provide the service, preserve public
          conversations and game state, resolve disputes, prevent abuse, or meet
          legal obligations.
        </p>
        <p>
          Logging out deletes the active server session records available to
          the logout request and clears the session cookie. Other information
          may remain until it is deleted, anonymized, or no longer reasonably
          needed. Backup or cached copies may take additional time to disappear.
        </p>
      </>
    ),
  },
  {
    id: "international",
    title: "International processing",
    content: (
      <p>
        Mirabellier.com is operated from Malaysia, while service providers and
        visitors may be located elsewhere. Information may therefore be
        processed in countries with different data-protection rules. Reasonable
        steps are taken to use providers and safeguards appropriate to the
        service and the information involved.
      </p>
    ),
  },
  {
    id: "rights",
    title: "Your choices and rights",
    content: (
      <>
        <p>
          Subject to applicable law, you may ask whether your personal data is
          processed, request access or correction, withdraw consent where
          processing depends on consent, object to certain harmful or
          distressing processing, or ask for deletion where appropriate.
        </p>
        <p>
          You can edit many profile fields in Settings and can log out at any
          time. For other requests, email{" "}
          <a
            className="font-semibold text-blue-600 underline underline-offset-4 dark:text-purple-200"
            href="mailto:privacy@mirabellier.com"
          >
            privacy@mirabellier.com
          </a>
          . Enough information may be requested to verify your identity and find
          the relevant records.
        </p>
        <p>
          You may also contact Malaysia&apos;s Personal Data Protection
          Commissioner if you believe personal data has been processed contrary
          to applicable Malaysian law.
        </p>
      </>
    ),
  },
  {
    id: "security",
    title: "Security",
    content: (
      <p>
        Mirabellier.com uses measures such as OAuth authentication, HTTP-only
        cookies, access controls, input validation, and anti-abuse verification.
        No internet service can guarantee perfect security, so please use care
        when choosing what to publish and report suspected account or security
        problems promptly.
      </p>
    ),
  },
  {
    id: "children",
    title: "Children",
    content: (
      <p>
        The service is not directed to children under 13. You must also meet any
        higher minimum age required where you live. If a parent or guardian
        believes a child provided personal data contrary to this rule, they
        should contact Mira so the situation can be reviewed.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to this policy",
    content: (
      <p>
        This policy may be updated when the service, providers, or legal
        requirements change. The effective date at the top will be revised, and
        significant changes may also be highlighted on the site.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    content: (
      <p>
        Privacy questions and requests can be sent to Mira at{" "}
        <a
          className="font-semibold text-blue-600 underline underline-offset-4 dark:text-purple-200"
          href="mailto:privacy@mirabellier.com"
        >
          privacy@mirabellier.com
        </a>
        .
      </p>
    ),
  },
];

const Privacy = () => {
  usePageSeo({
    canonical: "https://mirabellier.com/privacy",
    structuredDataId: "privacy-structured-data",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Privacy Policy",
      description: PRIVACY_DESCRIPTION,
      url: "https://mirabellier.com/privacy",
      dateModified: "2026-06-20",
      isPartOf: {
        "@type": "WebSite",
        name: "Mirabellier.com",
        url: "https://mirabellier.com",
      },
    },
    socialMeta: {
      title: "Privacy Policy | Mirabellier.com",
      description: PRIVACY_DESCRIPTION,
      url: "https://mirabellier.com/privacy",
      image: "https://mirabellier.com/background.jpg",
      type: "website",
    },
  });

  return (
    <LegalPage
      title="Privacy Policy"
      summary="This policy explains what information Mirabellier.com handles, why it is needed, when it is public or shared, and the choices available to you."
      effectiveDate={EFFECTIVE_DATE}
      sections={sections}
      counterpart={{ label: "Terms of Service", to: "/terms" }}
    />
  );
};

export default Privacy;
