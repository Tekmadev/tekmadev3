/**
 * Source of truth for legal documents: Privacy Policy, Terms of Service, Cookie Policy,
 * and the Account Deletion page. Edit values here and they propagate to /privacy, /terms,
 * /cookies, /account-deletion pages and SEO metadata.
 *
 * IMPORTANT: This content is a professional starting draft. It must be reviewed by an
 * Ontario / Quebec licensed lawyer before publication. Tekmadev is responsible for
 * accuracy of facts referenced (registered office, Privacy Officer name, sub-processors).
 */
import { business, portal } from "@/config/site";

export type LegalBlock =
  | { type: "p"; text: string }
  | { type: "h3"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "note"; text: string }
  /** A paragraph that ends in one internal link: `${before} <label>${after}`. */
  | { type: "link"; before: string; label: string; href: string; after?: string };

export type LegalSection = {
  id: string;
  title: string;
  blocks: LegalBlock[];
};

export type LegalDoc = {
  slug: string;
  title: string;
  subtitle: string;
  intro: string;
  effectiveDate: string;
  lastUpdated: string;
  sections: LegalSection[];
};

const company = `${business.name} (${business.legalName})`;
const legalEmail = business.legalEmail;
const phone = business.phone.pretty;
/** The private mobile app our team uses (Android and iPhone). */
const staffApp = `${business.name} Admin`;

export const privacyPolicy: LegalDoc = {
  slug: "privacy",
  title: "Privacy Policy",
  subtitle: "How Tekmadev collects, uses, and protects personal information.",
  intro: `This Privacy Policy explains how ${company} ("${business.name}", "we", "us", or "our") collects, uses, discloses, retains, and safeguards personal information. ${business.name} operates from ${business.jurisdictions.primary} and complies with the federal Personal Information Protection and Electronic Documents Act (PIPEDA). Where individuals reside in Quebec, we also respect the rights provided under the Quebec Act respecting the protection of personal information in the private sector (Law 25). This policy applies to information we collect through ${business.url}, through our Growth System services, through the ${staffApp} app used by our team, and through our other interactions with you.`,
  effectiveDate: business.legalDates.effective,
  lastUpdated: business.legalDates.lastUpdated,
  sections: [
    {
      id: "scope",
      title: "1. Who this policy applies to",
      blocks: [
        {
          type: "p",
          text: `This policy applies to any individual who visits our website, books an audit call, signs up as a client, communicates with us by phone, email, or chat, or whose personal information is processed by us in the course of delivering services to a client (for example, the end customers of a ${business.name} client whose calls and messages flow through our installed system).`,
        },
        {
          type: "p",
          text: `It also applies to the members of our team who use ${staffApp}, our private mobile app for staff. Section 12 explains how we handle their information.`,
        },
        {
          type: "p",
          text: `Where we process personal information on behalf of a client (for example, the client's own customer records inside the unified CRM we install), we act as a service provider (processor). The client is the controller of that personal information and is responsible for collection, lawful basis, and notice obligations toward its own customers. Our Data Processing Addendum, available on request to ${legalEmail}, governs that relationship.`,
        },
      ],
    },
    {
      id: "what-we-collect",
      title: "2. What information we collect",
      blocks: [
        {
          type: "h3",
          text: "2.1 Information you give us",
        },
        {
          type: "ul",
          items: [
            "Identity and contact information: full name, business name, role, email, phone number, business address, time zone.",
            "Commercial information: industry, current monthly revenue range, lead volume, sales process, existing tools, goals.",
            "Communications: audit call notes, voicemail recordings, email correspondence, SMS and chat messages, support tickets.",
            "Payment information: billing contact, payment method tokens (we do not store full card numbers; payment processing is handled by our payment processor), tax registration numbers.",
            "Account credentials and consents you grant us to access third-party platforms (CRM, ad accounts, calendar) for the limited purpose of installing and operating the Growth System.",
          ],
        },
        {
          type: "h3",
          text: "2.2 Information we collect automatically",
        },
        {
          type: "ul",
          items: [
            "Technical data: IP address, browser type, device identifiers, operating system, referring URL, pages viewed, session duration, approximate location derived from IP.",
            "Cookies and similar technologies: see our Cookie Policy. If you accept advertising cookies, this includes advertising identifiers set by Meta (the _fbp and _fbc cookies).",
            "Call metadata: when the Growth System answers a call on behalf of a client, we may collect call duration, caller phone number, time of call, transcripts, and recordings if recording is enabled and disclosed by the client to its callers under applicable two-party consent rules.",
          ],
        },
        {
          type: "h3",
          text: "2.3 Information we receive from third parties",
        },
        {
          type: "ul",
          items: [
            "Booking platform: when you schedule an audit call through Cal.com, we receive the information you provide to Cal.com (name, email, scheduling details).",
            "Public sources: publicly available business information (company size, industry, website) used for qualification.",
            "Service providers: our sub-processors may relay information necessary to provide the Growth System (for example, our CRM and automation platform relays CRM events to our dashboard).",
          ],
        },
      ],
    },
    {
      id: "purposes",
      title: "3. Why we collect personal information",
      blocks: [
        {
          type: "p",
          text: "We collect personal information for the following purposes. Where required, we do so with your consent. Where we rely on a basis other than consent (for example, performance of a contract or legitimate business interest balanced against your rights), we identify that basis below.",
        },
        {
          type: "ul",
          items: [
            "To respond to your inquiries, schedule and conduct audit calls, and prepare proposals.",
            "To deliver, operate, monitor, and improve the Growth System for client accounts.",
            "To bill, collect payment, and meet our tax and accounting obligations.",
            "To send service-related communications (system status, scheduled maintenance, billing notices).",
            "To send marketing communications about our services where you have given consent, subject to your right to withdraw at any time under the Canadian Anti-Spam Legislation (CASL).",
            "To measure how our advertising performs and to show our ads to people likely to be interested in our services, only where you have accepted advertising cookies on our website.",
            "To detect, prevent, and respond to fraud, abuse, security incidents, and violations of our Terms of Service.",
            "To comply with legal obligations and to establish, exercise, or defend legal claims.",
          ],
        },
      ],
    },
    {
      id: "consent",
      title: "4. Consent",
      blocks: [
        {
          type: "p",
          text: "We obtain consent before we collect, use, or disclose personal information, except where the law allows or requires otherwise. Where the information is sensitive (for example, financial information or voice recordings), we obtain express consent. Where the information is non-sensitive and the purpose is one that a reasonable person would expect in the circumstances (for example, billing your account), consent may be implied.",
        },
        {
          type: "p",
          text: "You may withdraw consent at any time, subject to legal and contractual restrictions and reasonable notice. To withdraw consent, contact our Privacy Officer at the address in Section 17. Withdrawing consent may affect our ability to provide services to you.",
        },
        {
          type: "p",
          text: "Advertising cookies are different: they are off by default and we ask before using them. When you first visit our website we ask whether you accept them, and declining takes one click, the same as accepting. Nothing is sent to an advertising platform unless you accept. You can change your choice at any time using the Cookie settings link at the bottom of every page, and refusing or withdrawing has no effect on your ability to use the website or our services.",
        },
      ],
    },
    {
      id: "use-and-disclosure",
      title: "5. Disclosure to third parties",
      blocks: [
        {
          type: "p",
          text: "We do not sell personal information. We disclose personal information only to the categories of recipients listed below and only to the extent necessary for the identified purpose.",
        },
        {
          type: "ul",
          items: [
            "Service providers and sub-processors who help us deliver the Growth System and run our business (for example, our customer relationship and automation platform provider, Vercel and Cloudflare for hosting and content delivery, Supabase for our database and sign-in, Resend for sending email, Cal.com for booking, payment processors for billing, and analytics or productivity vendors). A current list is available on request.",
            `Service providers for ${staffApp}, the mobile app our team uses: Expo, Apple (Apple Push Notification service) and Google (Firebase Cloud Messaging) to deliver push notifications to team members' phones, and Sentry to receive crash and error reports from the app. Section 12 describes what each of them receives.`,
            "Meta Platforms, Inc. (Facebook and Instagram), for advertising measurement and delivery, and only if you have accepted advertising cookies. We share the pages you view and the actions you take on our website (such as requesting a report, booking a call, or starting a checkout), the Meta cookie values in your browser, your IP address and browser type, and, when you give us your contact details, your email address, phone number and name in hashed form (SHA-256, a one-way scramble that Meta can match only against accounts it already holds). Some of this is sent from your browser and some from our server. Meta handles this information under its own terms and privacy policy and may combine it with information it already has about you. If you decline advertising cookies, we send Meta nothing about you.",
            "Professional advisors (lawyers, accountants, auditors) under duties of confidentiality.",
            "Government, regulatory, or law enforcement authorities where we are legally required, or to protect our rights, property, or safety, or those of our clients or the public.",
            "Successors or assignees in connection with a merger, acquisition, financing, reorganization, or sale of all or part of our business. We will use commercially reasonable efforts to require the recipient to honour this Privacy Policy.",
          ],
        },
        {
          type: "p",
          text: "We require our service providers to handle personal information in a manner consistent with this policy and applicable law, and we use contracts to bind them to confidentiality and security standards.",
        },
      ],
    },
    {
      id: "transfers",
      title: "6. Storage location and cross-border transfers",
      blocks: [
        {
          type: "p",
          text: "Personal information may be stored or processed in Canada, the United States, or other jurisdictions where our service providers operate. When information is processed outside of Quebec or Canada, it may become subject to the laws of the foreign jurisdiction, including lawful access by foreign courts and authorities. We use contractual safeguards and, where appropriate, conduct privacy impact assessments before transferring personal information outside Quebec, as required by Law 25.",
        },
        {
          type: "p",
          text: `Our database and sign-in service (Supabase) are hosted in Canada. Some of our service providers process information outside Canada. For example, push notifications for ${staffApp} are delivered through Expo, Apple and Google, which may process them outside Canada, including in the United States, and crash reports from the app are sent to Sentry and may be processed in the United States.`,
        },
      ],
    },
    {
      id: "retention",
      title: "7. How long we keep personal information",
      blocks: [
        {
          type: "p",
          text: "We retain personal information only as long as necessary to fulfill the purposes for which it was collected, to provide our services, to comply with our legal and tax obligations, and to enforce our agreements. Typical retention periods include:",
        },
        {
          type: "ul",
          items: [
            "Prospect and audit call information: up to 24 months from last interaction.",
            "Active client account data: for the duration of the engagement plus 7 years to meet tax and limitation period requirements.",
            "Call recordings and transcripts processed on behalf of a client: for the period the client instructs us to retain them, then deleted on termination of the engagement.",
            "Marketing consent records and unsubscribe records: as required by CASL.",
            "Advertising context records (the Meta cookie values, IP address and browser type of a visitor who accepted advertising cookies): 90 days.",
            "Security and audit logs: typically 12 months.",
            `Information about members of our team who use ${staffApp}: see Section 12.5.`,
          ],
        },
        {
          type: "p",
          text: "When personal information is no longer required, we destroy, erase, or anonymize it in accordance with our information disposal procedures.",
        },
      ],
    },
    {
      id: "safeguards",
      title: "8. How we protect personal information",
      blocks: [
        {
          type: "p",
          text: "We use a combination of administrative, technical, and physical safeguards designed to protect personal information against loss, theft, unauthorized access, disclosure, copying, use, or modification. These include access controls, encryption in transit and at rest where applicable, network and application security controls, vendor due diligence, internal policies, employee confidentiality undertakings, and ongoing security training. No method of transmission or storage is perfectly secure, and we cannot guarantee absolute security.",
        },
      ],
    },
    {
      id: "your-rights",
      title: "9. Your rights",
      blocks: [
        {
          type: "p",
          text: "Subject to limited exceptions under applicable law, you have the right to:",
        },
        {
          type: "ul",
          items: [
            "Access the personal information we hold about you and request a copy.",
            "Request correction of inaccurate or incomplete information.",
            "Withdraw consent at any time, subject to legal or contractual restrictions and reasonable notice.",
            "Request that we cease using or disclosing your information, or destroy it, where retention is no longer necessary.",
            "Object to direct marketing at any time.",
            "Lodge a complaint with us or with the appropriate regulator (see Section 18).",
          ],
        },
        {
          type: "p",
          text: `To exercise any of these rights, contact our Privacy Officer at ${legalEmail}. We will respond within the period required by applicable law (no later than 30 days under PIPEDA and Quebec Law 25 in most cases). We may need to verify your identity before processing your request.`,
        },
        {
          type: "link",
          before:
            "To ask us to delete your account and the personal information linked to it, whether you are a member of our team, a client portal user, or anyone else, see what we delete, what we must keep, and how to ask on our",
          label: "account deletion page",
          href: "/account-deletion",
          after: ".",
        },
      ],
    },
    {
      id: "quebec",
      title: "10. Additional rights for Quebec residents (Law 25)",
      blocks: [
        {
          type: "p",
          text: "If you reside in Quebec, you have the following additional rights under the Act respecting the protection of personal information in the private sector:",
        },
        {
          type: "ul",
          items: [
            "Right to receive information about the purposes of collection, categories of recipients, retention period, and the rights available to you, at the time of collection.",
            "Right to data portability: to receive your personal information in a structured, commonly used technological format, and to have it transmitted to another party where technically feasible (effective September 2024).",
            "Right to deindex: to request that we cease disseminating your personal information or that any hyperlink giving access to information by a technological means be deindexed, where dissemination causes serious injury and the right to deindex is not outweighed by the public interest.",
            "Right to information about automated decision-making: to be informed when a decision based exclusively on automated processing is made about you, the principal factors and parameters that led to the decision, and the right to have the decision reviewed by a human and to submit observations.",
            "Right to file a complaint with the Commission d'accès à l'information du Quebec (CAI).",
          ],
        },
        {
          type: "p",
          text: `${business.name} has designated ${business.privacyOfficer.name}, ${business.privacyOfficer.title}, as the person responsible for the protection of personal information. The Privacy Officer can be reached at ${legalEmail}.`,
        },
      ],
    },
    {
      id: "automated",
      title: "11. Automated processing and AI",
      blocks: [
        {
          type: "p",
          text: "The Growth System uses automated technologies, including AI voice agents and automated lead qualification, to operate on behalf of our clients. When you interact with our system as a caller, lead, or prospect, your interaction may be processed by automated systems and recorded for quality, training, and operational purposes (where lawful and disclosed by the operating client).",
        },
        {
          type: "p",
          text: "Decisions made by automated systems that have a significant effect on you (for example, qualification scores that determine whether you are routed to a human) are reviewable on request. You may ask for a human review and to submit observations by contacting the Privacy Officer.",
        },
      ],
    },
    {
      id: "team-app",
      title: `12. The ${staffApp} app and our team`,
      blocks: [
        {
          type: "p",
          text: `${staffApp} is our private mobile app for Android and iPhone. Our owners, managers and staff (including our salespeople) use it to manage leads, clients, demo requests, marketing and our team. Nobody can sign up in the app: an owner or a manager creates each account. This section explains how we handle the personal information of the team members who use it. The client, lead and prospect information that team members see in the app is covered by the rest of this policy, in particular Sections 2, 3, 5 and 7.`,
        },
        {
          type: "h3",
          text: "12.1 What we collect about team members",
        },
        {
          type: "ul",
          items: [
            "Account details: your name, email address and role (owner, manager or staff). You sign in with your email address and a password, which are managed by our sign-in provider, Supabase Auth.",
            "Sign-in and access history: records of when your account signs in to and accesses the app.",
            "Device information: for each phone you use, the token that lets us send it push notifications (an Expo push token), the device name, the platform (Android or iOS), the app version, and when the phone was last seen.",
            "Notification preferences: which notifications you have chosen to receive.",
            "Work records: the leads you add, the outreach you log (calls, emails, messages and meetings), the calls you book, the clients you create or help, the demo requests you work on, and your share of commission credit on clients.",
            "Crash reports: if the app crashes or hits an error, a report with your phone's model, its operating system version, the app version, the error and its stack trace (the technical record of where the error happened), and the internal ID of your account (a code, not your name or email address). Crash reports do not include names, email addresses, client or lead details, or screen recordings.",
          ],
        },
        {
          type: "p",
          text: "Face ID, Touch ID and fingerprint unlock are handled by your phone's operating system. The app never receives or stores your face, fingerprint or any other biometric information: it only receives a yes or no answer to whether the check passed.",
        },
        {
          type: "p",
          text: "The app keeps an encrypted cache on your phone so that screens open quickly and can be used offline. Signing out ends your session on that phone and removes the phone's registration for push notifications.",
        },
        {
          type: "h3",
          text: "12.2 Why we use it",
        },
        {
          type: "ul",
          items: [
            "To create your account, let you sign in securely, and keep a record of access that protects our systems and the information in them.",
            "To show each person what their role allows. Owners and managers see the activity and commission credit of every team member. Staff see only their own.",
            "To send push notifications to your phone, according to your notification preferences.",
            "To record who added, contacted, booked and helped each lead and client, to manage the team's work, and to work out each team member's share of commission credit.",
            "To find and fix crashes and errors in the app.",
            "To meet our legal and tax obligations, and to establish, exercise, or defend legal claims.",
          ],
        },
        {
          type: "h3",
          text: "12.3 Who receives it",
        },
        {
          type: "p",
          text: "Inside Tekmadev, owners and managers can see every team member's activity and commission credit, and staff can see only their own. Outside Tekmadev, the following service providers receive team member information, only as far as they need it to provide their service:",
        },
        {
          type: "ul",
          items: [
            "Supabase, which hosts our database and manages sign-in, in Canada.",
            "Expo, Apple (Apple Push Notification service) and Google (Firebase Cloud Messaging), which deliver push notifications. They receive your phone's push token and each notification sent to it.",
            "Sentry, which receives the crash and error reports described in Section 12.1.",
            "Vercel, which runs our website and the server the app connects to, and Resend, which sends our email.",
          ],
        },
        {
          type: "p",
          text: "We also disclose information in the other limited cases listed in Section 5, for example to professional advisors or where the law requires it. We do not sell team member information.",
        },
        {
          type: "h3",
          text: "12.4 Where it is stored",
        },
        {
          type: "p",
          text: "Our database and sign-in service are hosted in Canada. Push notifications pass through Expo, Apple and Google, which may process them outside Canada, including in the United States. Crash reports may be processed in the United States. The encrypted cache stays on your phone. Section 6 explains what it means when information is processed outside Canada.",
        },
        {
          type: "h3",
          text: "12.5 How long we keep it",
        },
        {
          type: "p",
          text: "We keep team member information only as long as we need it for the purposes above and to meet our legal and tax obligations, on the same approach as Section 7. Typical retention periods include:",
        },
        {
          type: "ul",
          items: [
            "Account details and notification preferences: while you are a member of our team. When you leave, we close your account so it can no longer be used to sign in, and delete or anonymize these details within 30 days, except your name where it must stay on the work and commission records below.",
            "Push notification registration for a phone: until you sign out of the app on that phone, or your account is closed.",
            "Other device information (device name, platform, app version, and last seen): while your account is open, then deleted within 30 days after it is closed.",
            "Sign-in and access history: typically 12 months, like our other security and audit logs.",
            "Work records: these are business records about our leads and clients, so they stay with the lead or client they relate to and are kept as Section 7 describes.",
            "Commission credit records: while any commission is owed, then 7 years after the last related payment to meet tax and limitation period requirements.",
            "Crash reports: up to 90 days.",
          ],
        },
        {
          type: "h3",
          text: "12.6 Seeing, correcting, or deleting your information",
        },
        {
          type: "p",
          text: `You can see your own activity and commission credit in the app. To get a copy of the personal information we hold about you, to correct it, or to ask us to delete it, ask one of our owners or contact our Privacy Officer at ${legalEmail}. Your rights, and the time we take to respond, are described in Section 9. You can also turn off notifications from the app at any time in your phone's settings.`,
        },
        {
          type: "link",
          before:
            "When you leave our team or ask us to delete your account, we close it and delete or anonymize your personal information, except what we must keep for the periods above, such as commission records while commission is owed and tax records for as long as the law requires. The steps are set out on our",
          label: "account deletion page",
          href: "/account-deletion",
          after: ".",
        },
      ],
    },
    {
      id: "cookies",
      title: "13. Cookies and tracking technologies",
      blocks: [
        {
          type: "p",
          text: "Our website measures traffic with cookieless, aggregate analytics that do not identify you and need no consent. Separately, and only if you accept advertising cookies in the banner shown on your first visit, we use the Meta Pixel and the Meta Conversions API to measure and deliver our advertising, as described in Section 5. Advertising cookies are off until you accept, and you can change your choice at any time using the Cookie settings link at the bottom of every page. See our Cookie Policy at /cookies for the full details, including the specific cookies, the strictly necessary cookies used in our admin area, and the embedded Cal.com booking widget.",
        },
      ],
    },
    {
      id: "children",
      title: "14. Children",
      blocks: [
        {
          type: "p",
          text: "Our website and services are directed to businesses and are not intended for individuals under the age of 18. We do not knowingly collect personal information from children. If you believe we have inadvertently collected information from a child, please contact us and we will delete it.",
        },
      ],
    },
    {
      id: "links",
      title: "15. Third-party links",
      blocks: [
        {
          type: "p",
          text: "Our website may contain links to third-party websites. We are not responsible for the privacy practices of those sites. We encourage you to read the privacy policies of each website you visit.",
        },
      ],
    },
    {
      id: "changes",
      title: "16. Changes to this policy",
      blocks: [
        {
          type: "p",
          text: "We may update this Privacy Policy from time to time to reflect changes in our practices, technology, legal requirements, or other factors. We will post the updated policy on this page and revise the 'Last updated' date. Where required by law, we will obtain your consent to material changes.",
        },
      ],
    },
    {
      id: "contact",
      title: "17. How to contact our Privacy Officer",
      blocks: [
        {
          type: "p",
          text: `Questions, requests, or complaints related to this Privacy Policy or the handling of personal information by ${business.name} should be sent to our Privacy Officer:`,
        },
        {
          type: "ul",
          items: [
            `${business.privacyOfficer.name}, ${business.privacyOfficer.title}, ${company}`,
            `Email: ${legalEmail}`,
            `Phone: ${phone}`,
            `Registered office: ${business.registeredOffice.line1}, ${business.registeredOffice.city}, ${business.registeredOffice.province} ${business.registeredOffice.postalCode}, ${business.registeredOffice.country}`,
          ],
        },
      ],
    },
    {
      id: "regulators",
      title: "18. Filing a complaint with a regulator",
      blocks: [
        {
          type: "p",
          text: "If you are not satisfied with how we have handled your personal information or a privacy concern, you may file a complaint with the appropriate regulator:",
        },
        {
          type: "ul",
          items: [
            "Office of the Privacy Commissioner of Canada (OPC) for federal matters under PIPEDA. priv.gc.ca",
            "Commission d'accès à l'information du Quebec (CAI) for Quebec residents. cai.gouv.qc.ca",
            "Office of the Information and Privacy Commissioner of Ontario (IPC) for Ontario public sector or health matters where applicable. ipc.on.ca",
          ],
        },
      ],
    },
  ],
};

export const termsOfService: LegalDoc = {
  slug: "terms",
  title: "Terms of Service",
  subtitle: "The agreement between Tekmadev and our clients.",
  intro: `These Terms of Service ("Terms") form a legally binding agreement between ${company} ("${business.name}", "we", "us", or "our") and the business entity that accesses our website, books an audit call, or engages us to deliver the Growth System or any related service ("Client", "you", or "your"). By using our website, booking a call, signing an order form, or otherwise engaging us, you agree to these Terms. If you do not agree, do not use our website or services.`,
  effectiveDate: business.legalDates.effective,
  lastUpdated: business.legalDates.termsLastUpdated,
  sections: [
    {
      id: "definitions",
      title: "1. Definitions",
      blocks: [
        {
          type: "p",
          text: "Capitalized terms used in these Terms have the meanings set out below:",
        },
        {
          type: "ul",
          items: [
            "'Growth System' means the productized, done-for-you AI and automation system operated by Tekmadev that answers calls, replies to leads, runs follow-up sequences, and books appointments on behalf of the Client.",
            "'Order Form' means the written or electronic acceptance of a Tekmadev proposal that describes the scope, timeline, and any specific deliverables and fees for an engagement.",
            "'Qualified Booking' means an appointment scheduled on the Client's calendar through the Growth System, whether a sales call, a quote, a consultation, a site visit or a service booking, that meets the qualification criteria mutually defined in the Order Form (industry fit, decision-maker, minimum budget, and verified intent). Disputed bookings are resolved under Section 4.",
            "'Client Data' means data, content, recordings, contact information, and other materials provided by the Client or generated through the Growth System operating on behalf of the Client.",
            "'Tekmadev IP' means Tekmadev's proprietary methodologies, software, configurations, prompts, scripts, templates, dashboards, and the Growth System itself, including all enhancements made over time.",
          ],
        },
      ],
    },
    {
      id: "eligibility",
      title: "2. Eligibility and account",
      blocks: [
        {
          type: "p",
          text: "Our services are offered to business entities, not consumers. By engaging us, you represent that you are at least 18 years old, are authorized to bind your business to these Terms, and will provide accurate information. We may refuse service to any party in our reasonable discretion.",
        },
      ],
    },
    {
      id: "services",
      title: "3. The services",
      blocks: [
        {
          type: "p",
          text: "Tekmadev installs and operates the Growth System on behalf of the Client. The standard engagement consists of:",
        },
        {
          type: "ol",
          items: [
            "Diagnose: an initial 30-minute audit call where we map the Client's pipeline, followed by a longer working session where needed.",
            "Build: configuration of the AI voice agent, follow-up sequences, CRM integrations, and lead engine, after kickoff.",
            "Install: go-live deployment. How long the build and install take depends on the Client's business, systems, and industry, so Tekmadev does not commit to a fixed go-live date unless an Order Form states one.",
            "Operate: ongoing monitoring, weekly optimization, and monthly reporting.",
          ],
        },
        {
          type: "p",
          text: "Specific deliverables, integrations, target volumes, and timelines for a given engagement are set out in the Order Form.",
        },
        {
          type: "p",
          text: "Tekmadev also sells fixed-scope website packages for a one-time build fee with a monthly hosting and care plan (for example, Webline). Those packages are governed by Section 5A and are not part of a Growth System engagement unless an Order Form says so.",
        },
      ],
    },
    {
      id: "guarantee",
      title: "4. Performance guarantee",
      blocks: [
        {
          type: "p",
          text: "Tekmadev offers a performance guarantee: if we do not deliver the number of Qualified Bookings set out in the Order Form (target floor: 30) within 60 days of go-live, the Client will not be invoiced for additional Qualified Booking fees until we reach that number, and we will continue to operate the system at no additional charge until we do.",
        },
        {
          type: "p",
          text: "The guarantee comes only with the Growth System plans that include it, as shown on our pricing page and in the Order Form, bought at our standard setup fee (\"Build & Install\") and our standard monthly fee.",
        },
        {
          type: "p",
          text: "What voids the guarantee. The guarantee does not apply to an engagement, and the Client has no claim under it, if any of the following is true:",
        },
        {
          type: "ul",
          items: [
            "Discounted fees. The setup fee, the monthly fee, or both were reduced in any way: a coupon or promotion code, a deal link, a waived or reduced setup fee, a free or discounted month, a credit, or a negotiated price below our standard fees, whether applied at checkout, on an invoice, or in an Order Form. This applies even when the discount covers only one of the two fees or only one billing period. The only exception is an Order Form that states in writing that the guarantee still applies despite the discount.",
            "Unmet conditions. The Client does not meet one or more of the conditions listed below.",
            "Unpaid fees. An invoice for the engagement is more than 15 days past due at any point during the 60-day period.",
            "Changed plan. The Client pauses or cancels the plan, or moves to a plan without the guarantee, before the 60-day period ends.",
          ],
        },
        {
          type: "p",
          text: "Bonuses included with a plan at no extra charge, such as a website included with every plan during a launch offer, are not discounts and do not affect the guarantee. When the guarantee does not apply, the Client still receives the Growth System described in the Order Form at the fees agreed: only the guarantee in this Section falls away.",
        },
        {
          type: "p",
          text: "The guarantee is also conditioned on the Client:",
        },
        {
          type: "ul",
          items: [
            "Cooperating in good faith with onboarding, including providing access to existing systems, authorizing required integrations, and reviewing scripts within agreed timelines.",
            "Promptly following up on calls and appointments delivered to the Client's calendar.",
            "Not pausing, deactivating, or materially altering the installed system without our written agreement.",
            "Meeting the qualification criteria defined in the Order Form (industry, geography, average deal value, monthly revenue floor).",
            "Maintaining lead generation activities and lead supply at the levels agreed in the Order Form.",
          ],
        },
        {
          type: "p",
          text: "Disputes about whether a booking is a 'Qualified Booking' will be resolved in good faith. If a dispute cannot be resolved within 10 business days, the parties will follow the dispute resolution procedure in Section 19.",
        },
      ],
    },
    {
      id: "fees",
      title: "5. Fees and payment",
      blocks: [
        {
          type: "p",
          text: "Fees are set out in the Order Form. Unless otherwise stated, Tekmadev's standard model is:",
        },
        {
          type: "ul",
          items: [
            "A one-time setup fee (shown on our pricing page and at checkout as \"Build & Install\") and a recurring monthly fee, as set out in the Order Form. The setup fee covers the design, build, and installation of the growth system and the assets delivered to the Client, which the Client retains, and is non-refundable.",
            "A performance guarantee, on plans that include it and are bought at standard fees: if the system does not produce 30 Qualified Bookings within 60 days of go-live, Tekmadev will not invoice further fees for that period and will continue to operate the system at no additional charge until the target is reached, as set out in Section 4 and the Order Form. Any discount on the setup fee or the monthly fee voids the guarantee (Section 4).",
            "Fees are quoted in Canadian dollars (CAD) unless otherwise stated and are exclusive of applicable taxes (HST, GST, QST), which will be added where applicable.",
            "Website packages (Section 5A) have a build fee paid in full at checkout and, where stated, a required monthly hosting and care plan billed to the Client's card. Where a buy-now-pay-later option (such as Afterpay, Klarna, or Affirm) is offered at checkout, the instalment agreement covers the build fee only, is between the Client and that provider, and is subject to the provider's terms and approval; Tekmadev receives the full build fee at checkout.",
          ],
        },
        {
          type: "p",
          text: "Invoices are due within the period stated on the invoice (default: net 15). Past-due amounts bear interest at the lesser of 1.5% per month (19.56% per annum) or the maximum rate permitted by law. The Client is responsible for collection costs, including reasonable legal fees, on overdue amounts.",
        },
      ],
    },
    {
      id: "one-time-packages",
      title: "5A. Website packages (Webline) and Webline Care",
      blocks: [
        {
          type: "p",
          text: "Webline is a fixed-scope website package sold for a one-time build fee shown on the Webline page at the time of purchase, together with Webline Care as described below. Unless the Webline page or an Order Form says otherwise, the package includes: a custom-designed website of up to five pages; copy written by Tekmadev from the Client's intake; a search foundation (metadata, structured data, sitemap, search console setup) and an AI-search layer (llms.txt, FAQ markup, entity-rich copy); lead capture (contact form, click-to-call, booking link, analytics); launch on the Client's domain with SSL; a walkthrough video; and 30 days of post-launch fixes limited to defects and minor content edits.",
        },
        {
          type: "p",
          text: "Timeline. Tekmadev begins work once it has received the Client's completed intake, brand assets, and domain access, delivers the homepage design concept first, and launches the website as promptly as the work reasonably allows. Tekmadev does not commit to a fixed delivery date unless an Order Form states one. Delays in providing those inputs, or in reviewing the concept, delay delivery by the same period.",
        },
        {
          type: "p",
          text: "Design approval and refunds. The Client approves the homepage design concept in the client portal before the remaining pages are built. The concept includes one revision round. If, after that revision, the Client does not wish to proceed, the Client may cancel in writing and Tekmadev will refund the build fee in full within 10 business days and cancel Webline Care before any monthly charge. Once the Client approves the concept, or once the build proceeds with the Client's knowledge, the build fee is non-refundable except as required by applicable consumer protection law.",
        },
        {
          type: "p",
          text: "Webline Care. Webline Care is Tekmadev's hosting and maintenance plan for Webline sites and is required for as long as Tekmadev hosts the site. It covers hosting with SSL, security and software updates, uptime monitoring, backups, small text and image edits requested by the Client, and upkeep of the site's search and AI-search foundation. It does not cover new pages, redesigns, new features, or integrations, which are quoted separately. The monthly fee and the number of days after purchase before the first charge are shown on the Webline page at the time of purchase. The Client authorises the charge by adding a payment method in the client portal; Tekmadev does not launch the site until Webline Care is set up. Fees renew monthly until cancelled.",
        },
        {
          type: "p",
          text: "Cancelling Webline Care. The Client may cancel at any time, with no minimum term, from the billing page of the client portal or by writing to Tekmadev. Cancellation takes effect at the end of the monthly period already paid for, and a period that has started is not refunded except as required by applicable consumer protection law. On cancellation, Tekmadev will, on the Client's request made within 30 days after the end of the final period, transfer the site's code and content to a hosting account in the Client's name and provide reasonable instructions. After that period Tekmadev may take the hosted copy offline. Nothing in this clause affects the Client's ownership of the site described below.",
        },
        {
          type: "p",
          text: "Ownership. On payment in full, the Client owns the delivered website, its design, and its copy. Tekmadev retains ownership of its pre-existing tools, templates, and know-how used to build it, and grants the Client a perpetual licence to use them as embedded in the delivered site. Domain registration stays in the Client's name. While Webline Care is active, Tekmadev hosts the site on its own infrastructure.",
        },
        {
          type: "p",
          text: "Exclusions. The build fee and Webline Care do not include domain registration or renewal, paid stock imagery, third-party software subscriptions, logo design, additional pages, integrations, or marketing services. Any of these may be quoted separately in writing before work starts. The performance guarantee in Section 4 does not apply to one-time website packages.",
        },
      ],
    },
    {
      id: "client-obligations",
      title: "6. Client obligations",
      blocks: [
        {
          type: "p",
          text: "The Client agrees to:",
        },
        {
          type: "ul",
          items: [
            "Use the Growth System only for lawful business purposes.",
            "Comply with all applicable laws, including the Canadian Anti-Spam Legislation (CASL), the Telephone Consumer Protection Act (TCPA, if contacting US numbers), provincial consumer protection legislation, and applicable privacy laws (PIPEDA, Quebec Law 25, GDPR for EU contacts).",
            "Maintain valid express or implied consent for the contacts in lists supplied to Tekmadev or generated through the Client's marketing.",
            "Provide accurate and current information about the Client's business, offer, and qualification criteria.",
            "Be the controller of personal information processed through the Growth System operating in the Client's account.",
            "Disclose to its own callers and contacts, where required by law, that calls may be answered or assisted by AI and that calls may be recorded.",
            "Not reverse engineer, copy, sublicense, or resell Tekmadev IP except as expressly permitted in these Terms.",
          ],
        },
      ],
    },
    {
      id: "ip",
      title: "7. Intellectual property",
      blocks: [
        {
          type: "p",
          text: "Tekmadev retains all right, title, and interest in and to Tekmadev IP, including all improvements, derivatives, and configurations developed in the course of an engagement.",
        },
        {
          type: "p",
          text: "The Client retains all right, title, and interest in and to Client Data. The Client grants Tekmadev a worldwide, non-exclusive, royalty-free license to use Client Data solely to provide the services and as otherwise permitted by these Terms and the Privacy Policy.",
        },
        {
          type: "p",
          text: "On termination, Tekmadev will, on the Client's written request and at the Client's cost where applicable, export Client Data in a commonly used format. Tekmadev may retain anonymized, aggregated information derived from operation of the system for analytics, benchmarking, and service improvement.",
        },
      ],
    },
    {
      id: "confidentiality",
      title: "8. Confidentiality",
      blocks: [
        {
          type: "p",
          text: "Each party agrees to keep the other party's confidential information confidential, use it only to perform under these Terms, and protect it with no less than reasonable care. Confidential information does not include information that is publicly available without breach, was already known, is independently developed without reference to the other party's confidential information, or is rightfully obtained from a third party. A party may disclose confidential information where required by law, provided it gives prompt notice (where lawful) so the other party may seek a protective order.",
        },
      ],
    },
    {
      id: "data-protection",
      title: "9. Data protection",
      blocks: [
        {
          type: "p",
          text: "Tekmadev processes personal information in accordance with the Privacy Policy at /privacy and applicable law. Where Tekmadev acts as a service provider (processor) for Client Data, the parties will execute a Data Processing Addendum on request.",
        },
      ],
    },
    {
      id: "third-party",
      title: "10. Third-party services",
      blocks: [
        {
          type: "p",
          text: "The Growth System integrates with third-party services (including our CRM and automation platform, Cal.com, voice carriers, payment processors, and ad platforms). The Client is responsible for accepting the applicable third-party terms and for maintaining the credentials and authorizations required for integration. Tekmadev is not responsible for the acts, omissions, or service availability of any third-party provider.",
        },
      ],
    },
    {
      id: "term",
      title: "11. Term and termination",
      blocks: [
        {
          type: "p",
          text: "The engagement begins on the effective date of the Order Form and continues on a month-to-month basis unless a longer initial term is specified. Either party may terminate for convenience on 30 days' written notice. Either party may terminate immediately on written notice if the other party (a) materially breaches these Terms and fails to cure within 15 days of written notice, or (b) becomes insolvent, files for bankruptcy, or has a receiver appointed.",
        },
        {
          type: "p",
          text: "On termination: outstanding fees become immediately due; Tekmadev's license to access Client systems ends; Client Data is returned or destroyed on the Client's written direction within 30 days. Sections that by their nature should survive termination (IP, confidentiality, limitation of liability, indemnification, governing law) will survive.",
        },
      ],
    },
    {
      id: "warranty",
      title: "12. Warranties and disclaimers",
      blocks: [
        {
          type: "p",
          text: "Tekmadev warrants that it will perform the services in a professional and workmanlike manner consistent with industry standards.",
        },
        {
          type: "p",
          text: "EXCEPT AS EXPRESSLY SET OUT IN THESE TERMS, THE GROWTH SYSTEM AND ALL SERVICES ARE PROVIDED 'AS IS' AND 'AS AVAILABLE'. TO THE FULLEST EXTENT PERMITTED BY LAW, TEKMADEV DISCLAIMS ALL OTHER WARRANTIES, EXPRESS, IMPLIED, OR STATUTORY, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, ACCURACY, AND UNINTERRUPTED OR ERROR-FREE OPERATION. TEKMADEV DOES NOT WARRANT ANY SPECIFIC REVENUE, CONVERSION, OR BUSINESS OUTCOME OTHER THAN THE LIMITED PERFORMANCE GUARANTEE IN SECTION 4.",
        },
      ],
    },
    {
      id: "liability",
      title: "13. Limitation of liability",
      blocks: [
        {
          type: "p",
          text: "TO THE FULLEST EXTENT PERMITTED BY LAW, NEITHER PARTY WILL BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, PUNITIVE, OR EXEMPLARY DAMAGES, INCLUDING LOST PROFITS, LOST REVENUE, LOST DATA, OR LOSS OF GOODWILL, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.",
        },
        {
          type: "p",
          text: "EACH PARTY'S TOTAL AGGREGATE LIABILITY UNDER OR IN CONNECTION WITH THESE TERMS WILL NOT EXCEED THE FEES PAID OR PAYABLE BY THE CLIENT TO TEKMADEV IN THE 12 MONTHS IMMEDIATELY PRECEDING THE EVENT GIVING RISE TO LIABILITY, OR CAD $25,000, WHICHEVER IS GREATER. THE LIMITATIONS IN THIS SECTION DO NOT APPLY TO (A) A PARTY'S INDEMNIFICATION OBLIGATIONS, (B) BREACH OF CONFIDENTIALITY, (C) A PARTY'S WILFUL MISCONDUCT OR GROSS NEGLIGENCE, OR (D) LIABILITY THAT CANNOT BE LIMITED BY APPLICABLE LAW.",
        },
      ],
    },
    {
      id: "indemnification",
      title: "14. Indemnification",
      blocks: [
        {
          type: "p",
          text: "The Client will defend, indemnify, and hold Tekmadev harmless from any third-party claim arising out of the Client's content, the Client's lists or marketing practices, the Client's breach of CASL, TCPA, or applicable privacy law, the Client's combination of the Growth System with other products or services not provided by Tekmadev, or the Client's breach of these Terms.",
        },
        {
          type: "p",
          text: "Tekmadev will defend, indemnify, and hold the Client harmless from any third-party claim alleging that the Growth System, as delivered by Tekmadev and used in accordance with these Terms, infringes a Canadian copyright, trademark, or trade secret of a third party. Tekmadev's obligations in this paragraph do not apply to claims arising from Client Data, modifications made by anyone other than Tekmadev, or use in combination with non-Tekmadev technology where the combination causes the infringement.",
        },
      ],
    },
    {
      id: "force-majeure",
      title: "15. Force majeure",
      blocks: [
        {
          type: "p",
          text: "Neither party is liable for failure or delay in performance to the extent caused by events beyond its reasonable control, including acts of God, war, civil unrest, pandemic, government action, internet outages, denial of service attacks, failure of third-party platforms, or shortages of labour or materials. The affected party must give prompt notice and use commercially reasonable efforts to resume performance.",
        },
      ],
    },
    {
      id: "compliance",
      title: "16. Compliance with marketing and communications laws",
      blocks: [
        {
          type: "p",
          text: "The Client warrants that it complies with all applicable laws governing electronic communications, including CASL, TCPA, the U.S. CAN-SPAM Act, and applicable provincial regulations. The Client is solely responsible for obtaining and maintaining records of consent for the contacts that flow through the Growth System and for honouring unsubscribe and do-not-call requests promptly.",
        },
      ],
    },
    {
      id: "governing-law",
      title: "17. Governing law and language",
      blocks: [
        {
          type: "p",
          text: `These Terms are governed by the laws of the Province of Ontario and the federal laws of Canada applicable in Ontario, without regard to conflict-of-laws rules. The parties attorn to the exclusive jurisdiction of the courts located in Hamilton or Toronto, Ontario for any matter not subject to arbitration under Section 18. These Terms are drafted in English.`,
        },
      ],
    },
    {
      id: "disputes",
      title: "18. Dispute resolution",
      blocks: [
        {
          type: "p",
          text: "The parties will attempt to resolve any dispute first by good-faith negotiation between authorized representatives for at least 30 days. If unresolved, the parties will submit the dispute to mediation through a recognized mediation institution in Ontario.",
        },
        {
          type: "p",
          text: "If the dispute remains unresolved 30 days after mediation begins, either party may refer it to confidential, binding arbitration administered by the ADR Institute of Canada (ADRIC) under its Arbitration Rules. The seat of arbitration is Hamilton or Toronto, Ontario. The arbitration will be conducted in English. The award is final and binding and may be entered as a judgment in any court of competent jurisdiction. Either party may seek interim or injunctive relief from a court at any time to protect its rights.",
        },
        {
          type: "p",
          text: "TO THE FULLEST EXTENT PERMITTED BY LAW, THE PARTIES WAIVE ANY RIGHT TO BRING OR PARTICIPATE IN A CLASS, CONSOLIDATED, OR REPRESENTATIVE ACTION AGAINST THE OTHER PARTY.",
        },
      ],
    },
    {
      id: "miscellaneous",
      title: "19. Miscellaneous",
      blocks: [
        {
          type: "ul",
          items: [
            "Entire agreement: these Terms, together with any Order Form, Privacy Policy, and Data Processing Addendum, constitute the entire agreement between the parties on the subject matter and supersede any prior agreements or representations.",
            "Severability: if any provision is held unenforceable, the remaining provisions remain in effect.",
            "Waiver: no waiver is effective unless in writing and signed. A failure or delay in enforcing a right is not a waiver.",
            "Assignment: the Client may not assign these Terms without Tekmadev's prior written consent, which will not be unreasonably withheld. Tekmadev may assign to an affiliate or to a successor in a merger, acquisition, or sale of all or part of its business.",
            "Notices: notices to Tekmadev must be sent to the legal email address below; notices to the Client are sent to the email on the Order Form. Notices are effective on receipt.",
            "Independent contractors: the parties are independent contractors. Nothing in these Terms creates a partnership, joint venture, agency, or employment relationship.",
            "Updates: Tekmadev may update these Terms by posting a revised version. Material changes will be communicated to active Clients. Continued use of the services after the effective date of an update constitutes acceptance.",
          ],
        },
      ],
    },
    {
      id: "contact",
      title: "20. Contact",
      blocks: [
        {
          type: "p",
          text: "Questions about these Terms should be directed to:",
        },
        {
          type: "ul",
          items: [
            `Legal, ${company}`,
            `Email: ${legalEmail}`,
            `Phone: ${phone}`,
            `Registered office: ${business.registeredOffice.line1}, ${business.registeredOffice.city}, ${business.registeredOffice.province} ${business.registeredOffice.postalCode}, ${business.registeredOffice.country}`,
          ],
        },
      ],
    },
  ],
};

export const cookiePolicy: LegalDoc = {
  slug: "cookies",
  title: "Cookie Policy",
  subtitle: "How Tekmadev uses cookies and similar technologies.",
  intro: `This Cookie Policy explains what cookies and similar technologies are, why ${company} uses them, and how you can control them. This policy supplements our Privacy Policy.`,
  effectiveDate: business.legalDates.effective,
  lastUpdated: business.legalDates.termsLastUpdated,
  sections: [
    {
      id: "what",
      title: "1. What are cookies",
      blocks: [
        {
          type: "p",
          text: "Cookies are small text files stored on your device when you visit a website. Similar technologies include local storage, pixel tags, and web beacons. They allow a site to recognize a returning visitor, remember preferences, and measure traffic.",
        },
      ],
    },
    {
      id: "categories",
      title: "2. Categories of cookies we use",
      blocks: [
        {
          type: "h3",
          text: "Strictly necessary",
        },
        {
          type: "p",
          text: "A small number of strictly necessary cookies are used only in our secure admin dashboard and client portal to keep an authenticated session. They are not set for visitors to the public website and do not require consent. We also remember your cookie choice in your browser's local storage, so that we do not ask you again on every visit.",
        },
        {
          type: "h3",
          text: "Analytics (cookieless)",
        },
        {
          type: "p",
          text: "We measure aggregate traffic with Vercel Web Analytics and our own first-party page counter. Both run without cookies, do not identify you, and build no profile of you. Because they place nothing on your device, they run whatever you choose in the cookie banner.",
        },
        {
          type: "h3",
          text: "Advertising (only if you accept)",
        },
        {
          type: "p",
          text: "If you accept advertising cookies, we load the Meta Pixel, a tool from Meta Platforms, Inc., the company behind Facebook and Instagram. It sets two cookies: _fbp, which identifies your browser to Meta, and _fbc, which is set if you arrived by clicking one of our Meta ads and records that click. Each lasts up to 90 days. The pixel tells Meta which pages you view and when you take an action such as requesting a report, booking a call, or starting a checkout. We use this to measure how our ads perform and to show them to people likely to be interested, including on Facebook and Instagram. Meta may combine it with information it already holds about you.",
        },
        {
          type: "p",
          text: "With the same consent, we also report those actions to Meta from our own server, using the Meta Conversions API, because browser tools miss some of them. That report can include the two Meta cookie values above, your IP address and browser type, and, where you have given us your contact details, your email address, phone number and name in hashed form (SHA-256, a one-way scramble). To make this possible we keep a record of those cookie values, your IP address and your browser type for 90 days.",
        },
        {
          type: "p",
          text: "If you decline, the Meta Pixel is never loaded, no Meta cookie is set, and we send Meta nothing about you, from your browser or from our server.",
        },
        {
          type: "h3",
          text: "Local storage",
        },
        {
          type: "p",
          text: "We store your theme preference, your cookie choice, and basic first-party marketing attribution (for example, the link or campaign that brought you here) in your browser's local storage. This is not a cookie, contains no personal information, and is never shared with third parties. If you accept advertising cookies, we also keep a random reference number in your browser for the length of your visit, so that a booking or purchase can be matched to the advertising record described above. If you send the form on our /grow page, we keep your name and email in that browser tab's session storage so the booking calendar on the next page can fill them in for you. They are cleared when you close the tab, and the only place they go is the calendar of Cal.com, our booking provider.",
        },
        {
          type: "h3",
          text: "Booking embed",
        },
        {
          type: "p",
          text: "Our booking widget is embedded from Cal.com. When you open it, Cal.com may set its own cookies to manage your scheduling session. These are controlled by Cal.com under its own privacy policy.",
        },
      ],
    },
    {
      id: "control",
      title: "3. Your choices and how to control cookies",
      blocks: [
        {
          type: "p",
          text: "When you first visit, we ask whether you accept advertising cookies. They are off until you say yes, and declining takes one click, the same as accepting. The website works exactly the same either way.",
        },
        {
          type: "p",
          text: "You can change your mind at any time using the Cookie settings link at the bottom of every page. If you withdraw consent, we stop reporting to Meta and remove the Meta cookies from your browser. If your browser sends a Global Privacy Control signal, we treat that as a refusal and do not show the banner; you can still opt in from Cookie settings.",
        },
        {
          type: "p",
          text: "You can also control how Meta uses information from other websites, and the ads you see, in the ad settings of your Facebook or Instagram account.",
        },
        {
          type: "p",
          text: "You can still control or delete cookies and local storage through your browser settings at any time. Most browsers let you refuse third-party cookies, clear them on close, or be alerted before one is stored. Cookies set by the embedded Cal.com booking widget are governed by Cal.com and can be managed the same way.",
        },
      ],
    },
    {
      id: "changes",
      title: "4. Changes to this policy",
      blocks: [
        {
          type: "p",
          text: "We may update this Cookie Policy. The current version is identified by the 'Last updated' date.",
        },
      ],
    },
    {
      id: "contact",
      title: "5. Contact",
      blocks: [
        {
          type: "p",
          text: `Questions about this Cookie Policy can be directed to ${legalEmail}.`,
        },
      ],
    },
  ],
};

/**
 * Public account deletion page (/account-deletion). The app stores (Apple and
 * Google Play) ask for a web page that explains how to delete an account and
 * its data; this is that page. Keep its retention periods in line with
 * Sections 7 and 12.5 of the Privacy Policy.
 */
export const accountDeletion: LegalDoc = {
  slug: "account-deletion",
  title: "Account and Data Deletion",
  subtitle: "How to ask Tekmadev to delete your account and your personal information.",
  intro: `This page explains how to ask ${company} ("${business.name}", "we", "us", or "our") to delete your account and the personal information linked to it, what we delete, what we must keep and why, and how long it takes. It applies to the members of our team who use the ${staffApp} app, to people who use our client portal, and to anyone else whose personal information we hold. It supplements our Privacy Policy.`,
  effectiveDate: business.legalDates.accountDeletionEffective,
  lastUpdated: business.legalDates.lastUpdated,
  sections: [
    {
      id: "who",
      title: "1. Who this page is for",
      blocks: [
        {
          type: "ul",
          items: [
            `Members of our team who use ${staffApp}, our private mobile app for Android and iPhone.`,
            `People who sign in to our client portal at ${portal.host}.`,
            "Anyone else whose personal information we hold, for example people who contacted us through our website, booked a call, or subscribed to our newsletter, and our leads and prospects.",
          ],
        },
        {
          type: "p",
          text: "If we hold your information only because a business that uses our Growth System received your call or message, that business controls your information, as explained in Section 1 of our Privacy Policy. Please ask that business directly. If you contact us instead, we will pass your request on to that business and help it respond.",
        },
      ],
    },
    {
      id: "how-to-ask",
      title: "2. How to ask",
      blocks: [
        {
          type: "ol",
          items: [
            `Email our Privacy Officer at ${legalEmail} with the subject line "Account deletion request".`,
            `Send it from the email address linked to your account if you can. Tell us your name, which account you mean (${staffApp}, the client portal, or neither), and whether you want everything deleted or only certain information.`,
            "We may ask you to confirm your identity before we act, so that nobody else can delete your account or see your information.",
          ],
        },
        {
          type: "p",
          text: "If you are a member of our team, or you work with us as a client, you can also ask one of our owners directly. We handle the request in the same way.",
        },
        {
          type: "note",
          text: "Deleting the app from your phone, or signing out of it, does not delete your account or the information we hold. Removing a teammate from the Team page of the client portal stops their access but does not delete their information either. To have information deleted, send a request as described above.",
        },
      ],
    },
    {
      id: "what-we-delete",
      title: "3. What we delete",
      blocks: [
        {
          type: "p",
          text: "Once we have confirmed your request, we delete or anonymize the personal information linked to your account, except what we must keep as described in Section 4. To anonymize information means to change it so that it no longer identifies you.",
        },
        {
          type: "h3",
          text: `Members of our team (${staffApp})`,
        },
        {
          type: "ul",
          items: [
            "Your sign-in account, so it can no longer be used to sign in.",
            "Your email address, role, and notification preferences, and your name, except where it must stay on the records we keep.",
            "Your device records: push notification tokens, device names, platforms, app versions, and last seen times.",
          ],
        },
        {
          type: "h3",
          text: "Client portal users",
        },
        {
          type: "ul",
          items: [
            "Your portal sign-in account, so it can no longer be used to sign in.",
            "Your profile: your name, email address, title, and other contact details.",
            "If your business's engagement with us has ended and the business asks us to close its account, the information the business gave us through the portal.",
          ],
        },
        {
          type: "h3",
          text: "Everyone else",
        },
        {
          type: "ul",
          items: [
            "Your contact details, and the messages, call notes, and other records we hold about you as a website visitor, lead, prospect, or subscriber.",
            "Your place on our mailing lists.",
          ],
        },
      ],
    },
    {
      id: "what-we-keep",
      title: "4. What we must keep, and why",
      blocks: [
        {
          type: "p",
          text: "Some records must be kept even after a deletion request, because the law requires it or because we need them to meet obligations we owe. We keep only what is needed, limit who can see it, and delete or anonymize it when the period ends. These periods match Sections 7 and 12.5 of our Privacy Policy.",
        },
        {
          type: "ul",
          items: [
            "Invoices, payment records, and tax and accounting records: 7 years after the end of the engagement, to meet tax and limitation period requirements.",
            "Commission records: while any commission is owed to a team member, then 7 years after the last related payment, for the same reasons.",
            "Agreements and consent records: the agreements a client accepted (who accepted, when, and which version) for as long as we keep that client's account records, and records of marketing consent and unsubscribes as the Canadian Anti-Spam Legislation (CASL) requires, so that we do not email you again after you have asked us to stop.",
            "Work records about our leads and clients, such as leads added, outreach logged, calls booked, and demo requests: these are our business records about those leads and clients, so they stay with them for the periods in Section 7 of our Privacy Policy. A team member's name stays on them only where we need it, for example to work out commission.",
            "Security and audit logs, including sign-in history: typically 12 months, to protect our systems and investigate misuse.",
            "Crash reports from the app already sent to Sentry: these do not include your name or email address, and are deleted within 90 days.",
            "Information we need to establish, exercise, or defend a legal claim, or that a law, court, or regulator requires us to keep: until the matter is resolved or the requirement ends.",
            "Copies in routine backups: deleted information can remain in our service providers' backups until those backups are replaced in the normal course.",
          ],
        },
      ],
    },
    {
      id: "timing",
      title: "5. How long it takes",
      blocks: [
        {
          type: "p",
          text: "We respond to every deletion request within 30 days of receiving it. Our response confirms what we deleted and, if we kept anything, what we kept, why, and for how long. If we cannot complete a request, for example because we could not confirm your identity, we tell you why within the same 30 days.",
        },
      ],
    },
    {
      id: "contact",
      title: "6. Questions and complaints",
      blocks: [
        {
          type: "p",
          text: "Questions about this page or about a deletion request can be sent to our Privacy Officer:",
        },
        {
          type: "ul",
          items: [
            `${business.privacyOfficer.name}, ${business.privacyOfficer.title}, ${company}`,
            `Email: ${legalEmail}`,
            `Phone: ${phone}`,
          ],
        },
        {
          type: "link",
          before:
            "If you are not satisfied with how we handled your request, you can complain to a privacy regulator, as explained in Section 18 of our",
          label: "Privacy Policy",
          href: "/privacy#regulators",
          after: ".",
        },
      ],
    },
  ],
};

export const legalDocs: Record<string, LegalDoc> = {
  privacy: privacyPolicy,
  terms: termsOfService,
  cookies: cookiePolicy,
  "account-deletion": accountDeletion,
};
