/**
 * Source of truth for legal documents: Privacy Policy, Terms of Service, Cookie Policy.
 * Edit values here and they propagate to /privacy, /terms, /cookies pages and SEO metadata.
 *
 * IMPORTANT: This content is a professional starting draft. It must be reviewed by an
 * Ontario / Quebec licensed lawyer before publication. Tekmadev is responsible for
 * accuracy of facts referenced (registered office, Privacy Officer name, sub-processors).
 */
import { business } from "@/config/site";

export type LegalBlock =
  | { type: "p"; text: string }
  | { type: "h3"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "note"; text: string };

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

export const privacyPolicy: LegalDoc = {
  slug: "privacy",
  title: "Privacy Policy",
  subtitle: "How Tekmadev collects, uses, and protects personal information.",
  intro: `This Privacy Policy explains how ${company} ("${business.name}", "we", "us", or "our") collects, uses, discloses, retains, and safeguards personal information. ${business.name} operates from ${business.jurisdictions.primary} and complies with the federal Personal Information Protection and Electronic Documents Act (PIPEDA). Where individuals reside in Quebec, we also respect the rights provided under the Quebec Act respecting the protection of personal information in the private sector (Law 25). This policy applies to information we collect through ${business.url}, through our Growth System services, and through our other interactions with you.`,
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
          text: `Where we process personal information on behalf of a client (for example, the client's own customer records inside the unified CRM we install), we act as a service provider (processor). The client is the controller of that personal information and is responsible for collection, lawful basis, and notice obligations toward its own customers. Our Data Processing Addendum, available on request to ${legalEmail}, governs that relationship.`,
        },
        {
          type: "p",
          text: "Tekmadev acts as a service provider (processor) strictly when operating a client's account on the client's instructions. Tekmadev is an independent controller only for any reuse of data to train or improve its own models or to build benchmarks, and undertakes that any such reuse uses only data that has been irreversibly de-identified so that it no longer constitutes personal information, applying a de-identification method consistent with the standard required under Quebec Law 25. Tekmadev does not train its models on identifiable client or caller data.",
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
            "Cookies and similar technologies: see our Cookie Policy.",
            "Call metadata: when the Growth System answers a call on behalf of a client, we may collect call duration, caller phone number, time of call, and transcripts. Where recording is enabled, the AI agent provides a notice at the start of the call that the call may be recorded and is being handled by an automated assistant. Recording is disabled by default and is enabled only on the client's documented written instruction and only where lawful.",
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
          text: "You may withdraw consent at any time, subject to legal and contractual restrictions and reasonable notice. To withdraw consent, contact our Privacy Officer at the address in Section 16. Withdrawing consent may affect our ability to provide services to you.",
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
            "Service providers and sub-processors who help us deliver the Growth System (for example, our customer relationship and automation platform provider, Vercel and Cloudflare for hosting and content delivery, Cal.com for booking, payment processors for billing, and analytics or productivity vendors). A current list of sub-processors, including their role and country, is available on request, and we will give clients advance notice before adding or replacing a sub-processor and a right to object.",
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
            "Financial and billing records: for the duration of the engagement plus 7 years to meet tax and limitation period requirements. This 7-year hold applies to financial and billing records, not to operational call recordings.",
            "Operational call recordings and transcripts processed on behalf of a client: retained only for the period the client instructs and deleted within 30 days after termination of the engagement.",
            "Marketing consent records and unsubscribe records: as required by CASL.",
            "Security and audit logs: typically 12 months.",
          ],
        },
        {
          type: "p",
          text: "When personal information is no longer required, we destroy, erase, or de-identify it in accordance with our information disposal procedures. Any information we retain for analytics or benchmarking is first irreversibly de-identified to the standard described in Section 1, after which it is no longer personal information.",
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
        {
          type: "p",
          text: "Tekmadev maintains an incident register and an incident-response procedure. Where a confidentiality incident or breach of security safeguards poses a real risk of significant harm, Tekmadev will notify affected individuals and the relevant regulator (such as the Office of the Privacy Commissioner of Canada or the Commission d'accès à l'information du Quebec) as required by applicable law.",
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
            "Lodge a complaint with us or with the appropriate regulator (see Section 17).",
          ],
        },
        {
          type: "p",
          text: `To exercise any of these rights, contact our Privacy Officer at ${legalEmail}. We will respond within the period required by applicable law (no later than 30 days under PIPEDA and Quebec Law 25 in most cases). We may need to verify your identity before processing your request.`,
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
          text: "For automated decisions Tekmadev itself makes about you (for example, qualification of prospects on our own website), we will inform you at or before the time of the decision that an automated decision may be made, the principal factors used, and your right to a human review and to submit observations by contacting the Privacy Officer. Where the Growth System performs automated processing on behalf of a client, the client is the controller responsible for automated-decision rights, including human review and explanation; such requests should be directed to the operating client, and Tekmadev will assist the client in responding as its service provider.",
        },
      ],
    },
    {
      id: "cookies",
      title: "12. Cookies and tracking technologies",
      blocks: [
        {
          type: "p",
          text: "Our public website does not set non-essential or tracking cookies, and we use only cookieless, aggregate analytics. See our Cookie Policy at /cookies for the full details, including the strictly necessary cookies used in our admin area and the embedded Cal.com booking widget.",
        },
      ],
    },
    {
      id: "children",
      title: "13. Children",
      blocks: [
        {
          type: "p",
          text: "Our website and services are directed to businesses and are not intended for individuals under the age of 18. We do not knowingly collect personal information from children. If you believe we have inadvertently collected information from a child, please contact us and we will delete it.",
        },
      ],
    },
    {
      id: "links",
      title: "14. Third-party links",
      blocks: [
        {
          type: "p",
          text: "Our website may contain links to third-party websites. We are not responsible for the privacy practices of those sites. We encourage you to read the privacy policies of each website you visit.",
        },
      ],
    },
    {
      id: "changes",
      title: "15. Changes to this policy",
      blocks: [
        {
          type: "p",
          text: "We may update this Privacy Policy from time to time to reflect changes in our practices, technology, legal requirements, or other factors. We will post the updated policy on this page and revise the 'Last updated' date. Where required by law, we will obtain your consent to material changes.",
        },
      ],
    },
    {
      id: "contact",
      title: "16. How to contact our Privacy Officer",
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
      title: "17. Filing a complaint with a regulator",
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
    {
      id: "gdpr",
      title: "18. Additional rights for EU, EEA, and UK residents (GDPR)",
      blocks: [
        {
          type: "p",
          text: "For individuals located in the European Economic Area, the United Kingdom, or Switzerland, Tekmadev is the controller of the website and prospect personal data it collects directly from you (for example, when you book an audit call or contact us). For personal information Tekmadev processes on behalf of a client, the client is the controller and Tekmadev is the processor, as described in Section 1.",
        },
        {
          type: "p",
          text: "Our lawful bases for processing under Article 6 of the GDPR are: your consent for marketing communications; our legitimate interests in qualifying inquiries, securing our systems, and operating our business; and the performance of a contract where we are delivering services to you. Where we rely on legitimate interests, we balance them against your rights and freedoms.",
        },
        {
          type: "p",
          text: "Subject to the conditions in the GDPR, you have the rights of access, rectification, erasure, restriction of processing, data portability, and objection, the right not to be subject to a decision based solely on automated processing that produces legal or similarly significant effects (including the right to obtain human intervention and to contest the decision), the right to withdraw consent at any time, and the right to lodge a complaint with your lead supervisory authority or the supervisory authority in your country of residence.",
        },
        {
          type: "p",
          text: "When we transfer personal data from the EEA, UK, or Switzerland to our service providers in Canada or the United States (including Vercel and Cal.com), we rely on appropriate safeguards, principally the European Commission's Standard Contractual Clauses (and the UK Addendum and Swiss adaptations where applicable), supported by a documented transfer impact assessment. Canada also benefits from a partial adequacy decision for commercial organizations subject to PIPEDA. A copy of the relevant safeguards is available on request.",
        },
        {
          type: "p",
          text: `We will designate and name a representative in the European Union under Article 27 of the GDPR if and when our processing brings us within the scope of Article 3(2) of the GDPR (offering goods or services to, or monitoring the behaviour of, individuals in the EU) and no exemption applies. Until a representative is named here, EU, EEA, and UK individuals may exercise their rights by contacting our Privacy Officer at ${legalEmail}.`,
        },
      ],
    },
  ],
};

export const termsOfService: LegalDoc = {
  slug: "terms",
  title: "Terms of Service",
  subtitle: "The agreement between Tekmadev and our clients.",
  intro: `These Terms of Service ("Terms") form a legally binding agreement between ${company} ("${business.name}", "we", "us", or "our") and the business entity that accesses our website, books an audit call, or engages us to deliver the Growth System or any related service ("Client", "you", or "your"). You agree to these Terms by signing an Order Form, or by checking the box indicating you have read and agree to these Terms and the Privacy Policy at kickoff. Browsing the website alone does not bind you to the arbitration, class-action waiver, or limitation-of-liability provisions. If you do not agree, do not use our website or services.`,
  effectiveDate: business.legalDates.effective,
  lastUpdated: business.legalDates.lastUpdated,
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
            "'Qualified Booked Call' means an appointment scheduled on the Client's calendar that, unless the Order Form expressly provides otherwise, (a) was confirmed by the prospect, (b) falls within the agreed industry, geography, and minimum deal value, and (c) involves a named decision-maker with verified intent. An appointment the Client failed to attend or follow up on still counts as delivered. If the Order Form does not specify qualification criteria, the performance guarantee in Section 4 does not attach. Disputed calls are resolved under Section 4 (Performance guarantee).",
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
            "Diagnose: a 45-minute audit call where we map the Client's pipeline.",
            "Build: configuration of the AI voice agent, follow-up sequences, CRM integrations, and lead engine, typically completed within 7 days of kickoff.",
            "Install: go-live deployment, typically completed within 14 days of kickoff (longer for regulated or multi-location industries).",
            "Operate: ongoing monitoring, weekly optimization, and monthly reporting.",
          ],
        },
        {
          type: "p",
          text: "Specific deliverables, integrations, target volumes, and timelines for a given engagement are set out in the Order Form.",
        },
      ],
    },
    {
      id: "guarantee",
      title: "4. Performance guarantee",
      blocks: [
        {
          type: "p",
          text: "Tekmadev offers a performance guarantee: if Tekmadev does not deliver at least 30 Qualified Booked Calls (or the higher number set out in the Order Form) within 60 days of go-live, the Client's sole and exclusive remedy, and Tekmadev's entire liability for any failure to meet the guarantee or any shortfall in results, leads, calls, revenue, or business outcomes, is a refund of the recurring monthly service fees the Client paid to Tekmadev for that 60-day guarantee period (excluding any one-time setup fee and excluding applicable taxes). The Client waives all other claims, including for lost profits, lost revenue, wasted advertising spend, or cost of cover, arising from any performance shortfall. This remedy is in lieu of all other remedies at law or in equity.",
        },
        {
          type: "p",
          text: "The guarantee is conditioned on the Client:",
        },
        {
          type: "ul",
          items: [
            "Cooperating in good faith with onboarding, including providing access to existing systems, authorizing required integrations, and reviewing scripts within agreed timelines.",
            "Promptly following up on calls and appointments delivered to the Client's calendar.",
            "Not pausing, deactivating, or materially altering the installed system without our written agreement.",
            "Meeting the qualification criteria stated in the Order Form (industry, geography, average deal value, monthly revenue floor).",
            "Maintaining the specific lead-supply level stated as a figure in the Order Form.",
          ],
        },
        {
          type: "p",
          text: "Only calls generated in documented compliance with applicable telemarketing and consent law count as Qualified Booked Calls. Any suspension, pause, or list reduction that either party undertakes in good faith to address a consent, do-not-call, recording, or AI-disclosure compliance concern does not breach the conditions above and tolls the 60-day period for the duration of the suspension rather than voiding the remedy. The 60-day period is also tolled, and the guarantee does not apply, to the extent a shortfall is caused by the suspension, ban, or disapproval of a third-party advertising, communications, or messaging account, or by any force-majeure event under Section 15.",
        },
        {
          type: "p",
          text: "Disputes about whether a call is a 'Qualified Booked Call' will be resolved in good faith. If a dispute cannot be resolved within 10 business days, the parties will follow the dispute resolution procedure in Section 18 (Dispute resolution).",
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
            "A one-time setup fee and a recurring monthly fee, as set out in the Order Form.",
            "A performance guarantee as described in Section 4 (Performance guarantee), which sets out the Client's sole and exclusive remedy for any shortfall.",
            "Fees are quoted in Canadian dollars (CAD) unless otherwise stated and are exclusive of applicable taxes (HST, GST, QST), which will be added where applicable.",
          ],
        },
        {
          type: "p",
          text: "Invoices are due within the period stated on the invoice (default: net 15). Past-due amounts bear interest at the lesser of 1.5% per month (19.56% per annum) or the maximum rate permitted by law. The Client is responsible for collection costs, including reasonable legal fees, on overdue amounts.",
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
            "Warrant that it holds the consents required for the contacts and numbers it supplies, including prior express written consent under the TCPA and express automatic-dialing-announcing-device (ADAD) consent under the CRTC rules for outbound sequences, and authorize Tekmadev's standard recording and AI-disclosure configuration described below.",
            "Not reverse engineer, copy, sublicense, or resell Tekmadev IP except as expressly permitted in these Terms.",
          ],
        },
        {
          type: "p",
          text: "Recording and AI disclosure are configured by Tekmadev as standard. The AI agent identifies itself as an automated assistant acting for the Client and, where recording is enabled, states at the start of the call that the call may be recorded. Recording defaults to off until the Client elects a recording configuration in the Order Form, and applies only where lawful. The Client may not instruct removal of the AI-identification or recording disclosure except in writing and only where lawful, and warrants it has authorized the configuration it elects.",
        },
        {
          type: "p",
          text: "Outbound calling scripts are configured by Tekmadev to open by default with (i) identification of the Client on whose behalf the call is made, (ii) a callback number, (iii) for telemarketing, an automated opt-out mechanism, and (iv) a disclosure that the call is handled by an automated or AI assistant. The Client may not instruct removal of these elements. Tekmadev may suspend outbound calling on credible evidence of a consent, do-not-call, recording, or AI-disclosure compliance concern without breaching the performance guarantee in Section 4.",
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
          text: "On termination, Tekmadev will, on the Client's written request and at the Client's cost where applicable, export Client Data in a commonly used format. Tekmadev may use Client Data and configuration learnings to train, tune, and improve its models, prompts, and templates, and may retain information derived from operation of the system for analytics, benchmarking, and service improvement, provided that any such information is first irreversibly de-identified to the standard described in the Privacy Policy and that any resulting Tekmadev IP does not embed or expose the Client's confidential information or personal information in identifiable form.",
        },
        {
          type: "h3",
          text: "AI-generated output",
        },
        {
          type: "p",
          text: "As between the parties, AI-generated output produced for the Client (including transcripts, summaries, qualification scores, and follow-up or ad copy) is Client Data. Tekmadev retains ownership of the underlying models, prompts, configurations, and templates as Tekmadev IP, and to the extent any AI-generated output is not protectable by copyright the parties treat it as Tekmadev IP by contract regardless of copyrightability. AI-generated output may contain errors, inaccuracies, or fabricated statements. The Client is responsible for the deployment of, and any communication arising from, AI output to its own customers and end-users, and for any human review the Client considers necessary. Tekmadev will not knowingly deploy output it knows to infringe, and the Client represents that the offer details and inputs it supplies do not infringe the rights of any third party.",
        },
        {
          type: "h3",
          text: "Publicity",
        },
        {
          type: "p",
          text: "The Client grants Tekmadev a limited, revocable license to use the Client's name, logo, and approved or de-identified results in case studies and marketing. Approved testimonials and approved results are carved out of the confidentiality obligation in Section 8 to the extent of that approval.",
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
          text: "Tekmadev processes personal information in accordance with the Privacy Policy at /privacy and applicable law. Where Tekmadev acts as a service provider (processor) for Client Data, the parties will execute a Data Processing Addendum, which forms part of this agreement and is available on request.",
        },
        {
          type: "p",
          text: "Tekmadev will notify the Client without undue delay, and in any event within 72 hours, after becoming aware of any confidentiality incident or breach of security safeguards affecting Client Data, and will cooperate in good faith with the Client in its own notification and remediation obligations.",
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
        {
          type: "p",
          text: "Advertising accounts and platform assets are owned by the party in whose name they are created (by default, the Client). Tekmadev is not liable for suspension, ban, ad disapproval, or loss of ad history or ad spend caused by a third-party platform's policy or action. Such suspension is a force-majeure-type event for the purposes of Section 4 and Section 15.",
        },
        {
          type: "p",
          text: "Tekmadev does not warrant email or SMS deliverability, inbox placement, or sender reputation, which are controlled by third parties. The Client will use a dedicated sending subdomain so its primary domain reputation is ring-fenced, is responsible for list hygiene and for any blacklisting caused by its lists or content, and will indemnify Tekmadev for resulting harm. Tekmadev may pause sending to protect shared infrastructure reputation.",
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
          text: "On termination: outstanding fees become immediately due; Tekmadev's license to access Client systems ends; Client Data is returned or destroyed on the Client's written direction within 30 days. Sections 5 (accrued fees), 7 (Intellectual property), 8 (Confidentiality), 12 (Warranties and disclaimers), 13 (Limitation of liability), 14 (Indemnification), 17 (Governing law), and 18 (Dispute resolution, including the class-action waiver), and any other provision that by its nature should survive, survive termination or expiration.",
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
        {
          type: "p",
          text: "Operational metrics shown in our marketing (including response time, availability, and time to launch) are illustrative targets, not warranted service levels, and are subject to maintenance, third-party and carrier outages, and force majeure. The refund in Section 4 is the sole remedy for any performance shortfall.",
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
          text: "EACH PARTY'S TOTAL AGGREGATE LIABILITY UNDER OR IN CONNECTION WITH THESE TERMS WILL NOT EXCEED THE TOTAL FEES PAID BY THE CLIENT TO TEKMADEV IN THE 12 MONTHS IMMEDIATELY PRECEDING THE EVENT GIVING RISE TO LIABILITY. THE LIMITATIONS IN THIS SECTION DO NOT APPLY TO (A) A PARTY'S INDEMNIFICATION OBLIGATIONS, (B) BREACH OF CONFIDENTIALITY, (C) FRAUD OR FRAUDULENT MISREPRESENTATION, OR (D) LIABILITY THAT CANNOT BE LIMITED BY APPLICABLE LAW. FOR GREATER CERTAINTY, ERRORS, INACCURACIES, HALLUCINATIONS, OR OMISSIONS IN ANY AI-GENERATED OUTPUT, TRANSCRIPT, SUMMARY, OR AUTOMATED QUALIFICATION ARE SUBJECT TO THE CAP AND THE CONSEQUENTIAL-DAMAGES EXCLUSION IN THIS SECTION.",
        },
      ],
    },
    {
      id: "indemnification",
      title: "14. Indemnification",
      blocks: [
        {
          type: "p",
          text: "The Client will defend, indemnify, and hold Tekmadev harmless from any third-party claim arising out of the Client's content, the Client's lists or marketing practices, the Client's combination of the Growth System with other products or services not provided by Tekmadev, or the Client's breach of these Terms. This indemnity expressly includes any claim arising from (a) any law governing telemarketing, automated or AI calls, call recording, caller identification, or do-not-call, including CASL, the TCPA, the U.S. CAN-SPAM Act, the CRTC Unsolicited Telecommunications Rules and ADAD rules, state two-party-consent and mini-TCPA or AI-disclosure statutes, and STIR/SHAKEN requirements, and (b) any claim by the Client's callers, customers, or contacts arising from AI-generated output delivered through the Client's account, except to the extent finally determined to result from Tekmadev's fraud. Nothing in these Terms requires either party to indemnify a regulatory fine or penalty that applicable law prohibits indemnifying.",
        },
        {
          type: "p",
          text: "Tekmadev will defend, indemnify, and hold the Client harmless from any third-party claim alleging that the Growth System, as delivered by Tekmadev and used in accordance with these Terms, infringes a Canadian copyright, trademark, or trade secret of a third party. This indemnity is limited to Canadian intellectual property rights; the Client bears foreign-jurisdiction intellectual property risk for markets it chooses to operate in. On any covered infringement claim, Tekmadev may, at its option, procure the right to continue using the affected element, modify or replace it, or refund the fees attributable to it, as the Client's sole and exclusive remedy for infringement. Tekmadev's obligations in this paragraph do not apply to claims arising from Client Data, modifications made by anyone other than Tekmadev, or use in combination with non-Tekmadev technology where the combination causes the infringement.",
        },
      ],
    },
    {
      id: "force-majeure",
      title: "15. Force majeure",
      blocks: [
        {
          type: "p",
          text: "Neither party is liable for failure or delay in performance to the extent caused by events beyond its reasonable control, including acts of God, war, civil unrest, pandemic, government action, internet outages, denial of service attacks, failure of third-party platforms, suspension or termination of any third-party advertising, communications, or messaging account, or shortages of labour or materials. The affected party must give prompt notice and use commercially reasonable efforts to resume performance.",
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
        {
          type: "p",
          text: "Do-not-call and suppression. The Client warrants that it maintains a current subscription to the CRTC National Do Not Call List and, for US contacts, the National Do Not Call Registry, and that it has scrubbed every outbound list against them within the required window before supplying it to Tekmadev. Tekmadev's system will automatically suppress any number that requests opt-out or do-not-call across all sequences immediately on capture and maintain that internal suppression list. Tekmadev may refuse to load, or may purge, any list the Client cannot evidence as scrubbed, and any such refusal does not count against the performance guarantee in Section 4 or constitute a breach by Tekmadev.",
        },
      ],
    },
    {
      id: "governing-law",
      title: "17. Governing law and language",
      blocks: [
        {
          type: "p",
          text: `These Terms are governed by the laws of the Province of Ontario and the federal laws of Canada applicable in Ontario, without regard to conflict-of-laws rules. The parties attorn to the exclusive jurisdiction of the courts located in Hamilton or Toronto, Ontario for any matter not subject to arbitration under Section 18. These Terms are drafted in English. For a Client with an establishment in Quebec, Tekmadev will provide a French-language version of these Terms, the Privacy Policy, and the Order Form before the Client is bound, and that French version governs for that Client unless the Client expressly elects, after being provided the French version, to be bound by the English version. It is the express wish of the parties that, where the Client so elects, these Terms and all related documents be drawn up in English.`,
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
          text: "If the dispute remains unresolved 30 days after mediation begins, either party may refer it to confidential, binding arbitration administered by the ADR Institute of Canada (ADRIC) under its Arbitration Rules. The seat of arbitration is Hamilton or Toronto, Ontario. The arbitration will be conducted in English. The award is final and binding and may be entered as a judgment in any court of competent jurisdiction. Court access under this Section is limited to genuine interim or injunctive relief in aid of arbitration, and the arbitrator, not a court, decides any question about the scope, applicability, or enforceability of this arbitration agreement (arbitrability).",
        },
        {
          type: "p",
          text: "TO THE FULLEST EXTENT PERMITTED BY LAW, THE PARTIES WAIVE ANY RIGHT TO BRING OR PARTICIPATE IN A CLASS, CONSOLIDATED, OR REPRESENTATIVE ACTION AGAINST THE OTHER PARTY.",
        },
        {
          type: "p",
          text: "If the class or representative-action waiver in this Section is found unenforceable, the entire agreement to arbitrate in this Section is null and void as to that dispute, which will instead be resolved exclusively in the courts identified in Section 17. The class-action waiver is not severable from the arbitration agreement.",
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
            "Entire agreement: these Terms, together with any Order Form, Privacy Policy, and Data Processing Addendum, which are incorporated by reference and form part of this agreement, constitute the entire agreement between the parties on the subject matter and supersede any prior representations on the subject matter.",
            "Order of precedence: in the event of a conflict, the documents govern in this order: (1) the Order Form, for commercial terms (fees, scope, target volumes, qualification criteria, timelines); (2) any Data Processing Addendum, for data-protection terms; (3) these Terms. The Order Form controls only for the specific terms it expressly addresses; these Terms govern all other matters.",
            "Severability: if any provision is held unenforceable, the remaining provisions remain in effect.",
            "Waiver: no waiver is effective unless in writing and signed. A failure or delay in enforcing a right is not a waiver.",
            "Assignment: the Client may not assign these Terms without Tekmadev's prior written consent, which will not be unreasonably withheld. Tekmadev may assign to an affiliate or to a successor in a merger, acquisition, or sale of all or part of its business.",
            "Notices: notices to Tekmadev must be sent to the legal email address below; notices to the Client are sent to the email on the Order Form. Notices are effective on receipt.",
            "Independent contractors: the parties are independent contractors. Nothing in these Terms creates a partnership, joint venture, agency, or employment relationship.",
            "Updates: Tekmadev may update these Terms by posting a revised version. Tekmadev will give active Clients advance written notice of material changes, including any change to the arbitration, class-action waiver, fees, or liability provisions, and the Client may reject a material change by terminating before its effective date.",
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
  lastUpdated: business.legalDates.lastUpdated,
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
          text: "A small number of strictly necessary cookies are used only in our secure admin dashboard to keep an authenticated session. They are not set for visitors to the public website and do not require consent.",
        },
        {
          type: "h3",
          text: "Analytics (cookieless)",
        },
        {
          type: "p",
          text: "We measure aggregate traffic with Vercel Web Analytics, which runs without cookies and does not identify you. On this website (tekmadev.com) we do not use cookie-based analytics, advertising pixels, or cross-site tracking. Separate campaign or landing pages, if any, may use advertising or conversion pixels (such as the Meta Pixel or Google Ads conversion tag) to measure ad performance, and present the applicable consent notice on those pages.",
        },
        {
          type: "h3",
          text: "Local storage",
        },
        {
          type: "p",
          text: "We store your theme preference and basic first-party marketing attribution (for example, the link or campaign that brought you here) in your browser's local storage. This is not a cookie, contains no personal information, and is never shared with third parties.",
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
          text: "Because we do not set non-essential or tracking cookies on the public website, we do not show a cookie consent banner; there is nothing to opt in or out of for our own analytics.",
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

export const legalDocs: Record<string, LegalDoc> = {
  privacy: privacyPolicy,
  terms: termsOfService,
  cookies: cookiePolicy,
};
