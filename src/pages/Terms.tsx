import LegalPage, { type LegalSection } from "@/components/LegalPage";
import { usePageSeo } from "@/lib/seo";

const EFFECTIVE_DATE = "June 20, 2026";
const TERMS_DESCRIPTION =
  "The rules and conditions for visiting mirabellier.com, creating an account, publishing content, and using interactive features.";

const sections: LegalSection[] = [
  {
    id: "acceptance",
    title: "Acceptance of these terms",
    content: (
      <>
        <p>
          These Terms of Service are an agreement between you and Mira,
          the Malaysia-based operator of mirabellier.com. By accessing or using
          the site, you agree to these terms and the Privacy Policy.
        </p>
        <p>
          If you do not agree, do not use the service. Additional notices shown
          within a feature form part of these terms for that feature.
        </p>
      </>
    ),
  },
  {
    id: "eligibility",
    title: "Age and eligibility",
    content: (
      <p>
        You must be at least 13 years old and meet any higher minimum age
        required in your country. If you are below the age of legal majority
        where you live, a parent or legal guardian must review and agree to
        these terms for you and is responsible for your use of the service.
      </p>
    ),
  },
  {
    id: "accounts",
    title: "Accounts and security",
    content: (
      <>
        <p>
          Account access uses Discord OAuth. You are responsible for protecting
          your Discord account, keeping profile information reasonably accurate,
          and all activity performed through your Mirabellier.com session.
        </p>
        <p>
          Do not impersonate another person, transfer or sell an account, evade
          restrictions, or use another person&apos;s account without
          permission. Notify Mira if you reasonably believe an account
          or session has been compromised.
        </p>
      </>
    ),
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    content: (
      <>
        <p>You may not use the service to:</p>
        <ul className="list-disc space-y-2 pl-6">
          <li>break applicable law or encourage unlawful conduct;</li>
          <li>
            harass, threaten, exploit, deceive, stalk, or expose another
            person&apos;s private information;
          </li>
          <li>
            publish hateful, sexually exploitative, malicious, infringing, or
            otherwise seriously harmful material;
          </li>
          <li>
            spam, scrape excessively, automate abusive actions, manipulate
            counters or Arena results, or bypass rate limits and verification;
          </li>
          <li>
            introduce malware, probe vulnerabilities without authorization,
            disrupt the service, or gain unauthorized access; or
          </li>
          <li>
            falsely suggest endorsement by Mira, Mirabellier.com, or another person.
          </li>
        </ul>
        <p>
          Be kind, use common sense, and remember that public pages can be read
          by people you do not know.
        </p>
      </>
    ),
  },
  {
    id: "user-content",
    title: "Your content",
    content: (
      <>
        <p>
          You keep ownership of content you submit. You confirm that you have
          the rights needed to post it and that it does not violate these terms
          or another person&apos;s rights.
        </p>
        <p>
          By submitting content, you grant Mira a non-exclusive,
          worldwide, royalty-free license to host, store, reproduce, format,
          display, and distribute that content only as reasonably needed to
          operate, secure, improve, and promote the service and its public
          pages. This license ends when the content is deleted, except where
          copies must remain temporarily in backups or where others have already
          shared or indexed public material.
        </p>
      </>
    ),
  },
  {
    id: "moderation",
    title: "Moderation and removal",
    content: (
      <p>
        Mira may review, hide, edit, restrict, or remove content and may
        suspend access when reasonably necessary to enforce these terms, protect
        users or the service, comply with law, or address technical and safety
        concerns. Moderation is discretionary and does not create a duty to
        monitor every submission.
      </p>
    ),
  },
  {
    id: "arena",
    title: "Arena and virtual items",
    content: (
      <>
        <p>
          Arena coins, cards, equipment, consumables, experience, statistics,
          and all other game items are fictional, have no cash value, are not
          property, and cannot be sold, transferred, redeemed, or exchanged for
          real money.
        </p>
        <p>
          Balancing, rewards, inventories, offers, rankings, and game progress
          may be corrected, adjusted, reset, or discontinued to address bugs,
          abuse, fairness, maintenance, or changes to the game. Exploiting bugs
          or automation may result in lost progress or account restrictions.
        </p>
      </>
    ),
  },
  {
    id: "donations",
    title: "Donations and external support",
    content: (
      <p>
        Ko-fi, Patreon, and similar support links are operated by third parties.
        Unless a separate written offer clearly says otherwise, donations are
        voluntary, do not purchase site access or virtual items, and do not
        create ownership, employment, partnership, or guaranteed service
        obligations. The third party&apos;s payment and refund terms apply.
      </p>
    ),
  },
  {
    id: "third-parties",
    title: "Third-party services and links",
    content: (
      <p>
        The site may use or link to Discord, Cloudflare, GitHub, Ko-fi, Patreon,
        MyAnimeList, media hosts, and other services. Mira does not
        control their availability, content, security, or practices and is not
        responsible for losses caused by your use of them. Review their terms
        before providing information or making a payment.
      </p>
    ),
  },
  {
    id: "intellectual-property",
    title: "Mirabellier.com and third-party intellectual property",
    content: (
      <>
        <p>
          The site&apos;s original code, writing, layout, and branding belong to
          Mira or their respective licensors and are protected by
          applicable law. These terms do not transfer ownership to you.
        </p>
        <p>
          Anime, game, character, artwork, names, images, and trademarks
          belonging to third parties remain the property of their respective
          owners. Fan pages and commentary are unofficial and are not endorsed
          by those owners unless expressly stated.
        </p>
        <p>
          Send good-faith copyright or other rights concerns to{" "}
          <a
            className="font-semibold text-blue-600 underline underline-offset-4 dark:text-purple-200"
            href="mailto:privacy@mirabellier.com"
          >
            privacy@mirabellier.com
          </a>
          , identifying the work, the disputed material, its location, your
          contact details, and the basis for your request.
        </p>
      </>
    ),
  },
  {
    id: "availability",
    title: "Service changes and availability",
    content: (
      <p>
        Mirabellier.com is a personal, evolving website. Features may be added,
        changed, interrupted, or removed, and the service may experience errors,
        maintenance, data loss, or downtime. There is no promise that any
        feature, account, URL, or user content will remain available forever.
      </p>
    ),
  },
  {
    id: "disclaimers",
    title: "Disclaimers",
    content: (
      <p>
        To the fullest extent permitted by law, the service is provided “as is”
        and “as available,” without warranties of uninterrupted operation,
        accuracy, fitness for a particular purpose, non-infringement, or
        compatibility. Nothing on the site is professional legal, financial,
        medical, or other regulated advice.
      </p>
    ),
  },
  {
    id: "liability",
    title: "Limitation of liability",
    content: (
      <p>
        To the fullest extent permitted by law, Mira will not be liable
        for indirect, incidental, special, consequential, exemplary, or punitive
        damages, or for lost data, profits, opportunities, goodwill, or use,
        arising from the service or third-party services. Nothing in these terms
        excludes liability that cannot lawfully be excluded or limited.
      </p>
    ),
  },
  {
    id: "termination",
    title: "Suspension and termination",
    content: (
      <p>
        You may stop using the service and log out at any time. Mira may
        suspend or end access, remove content, or preserve relevant records when
        reasonably necessary for violations, safety, security, legal compliance,
        service closure, or protection of the community. Provisions that by
        nature should survive termination will remain effective.
      </p>
    ),
  },
  {
    id: "law",
    title: "Governing law",
    content: (
      <p>
        These terms are governed by the laws of Malaysia, without regard to
        conflict-of-law principles. Subject to any mandatory rights or forums
        available under applicable law, disputes will be submitted to the
        competent courts of Malaysia. Before filing a claim, you are encouraged
        to contact Mira and try to resolve the issue informally.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to these terms",
    content: (
      <p>
        These terms may be updated to reflect service, safety, or legal changes.
        The effective date will be revised, and material changes may be
        highlighted on the site. Continued use after updated terms take effect
        means you accept them.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    content: (
      <p>
        Questions about these terms can be sent to Mira at{" "}
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

const Terms = () => {
  usePageSeo({
    canonical: "https://mirabellier.com/terms",
    structuredDataId: "terms-structured-data",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Terms of Service",
      description: TERMS_DESCRIPTION,
      url: "https://mirabellier.com/terms",
      dateModified: "2026-06-20",
      isPartOf: {
        "@type": "WebSite",
        name: "Mirabellier.com",
        url: "https://mirabellier.com",
      },
    },
    socialMeta: {
      title: "Terms of Service | Mirabellier.com",
      description: TERMS_DESCRIPTION,
      url: "https://mirabellier.com/terms",
      image: "https://mirabellier.com/background.jpg",
      type: "website",
    },
  });

  return (
    <LegalPage
      title="Terms of Service"
      summary="These terms set the ground rules for accounts, public contributions, Arena play, third-party services, and use of Mirabellier.com."
      effectiveDate={EFFECTIVE_DATE}
      sections={sections}
      counterpart={{ label: "Privacy Policy", to: "/privacy" }}
    />
  );
};

export default Terms;
