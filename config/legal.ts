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
            "Service providers and sub-processors who help us deliver the Growth System (for example, our customer relationship and automation platform provider, Vercel and Cloudflare for hosting and content delivery, Cal.com for booking, payment processors for billing, and analytics or productivity vendors). A current list is available on request.",
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
            "Active client account data: for the duration of the engagement plus 7 years to meet tax and limitation period requirements.",
            "Call recordings and transcripts processed on behalf of a client: for the period the client instructs us to retain them, then deleted on termination of the engagement.",
            "Marketing consent records and unsubscribe records: as required by CASL.",
            "Security and audit logs: typically 12 months.",
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
          text: "Decisions made by automated systems that have a significant effect on you (for example, qualification scores that determine whether you are routed to a human) are reviewable on request. You may ask for a human review and to submit observations by contacting the Privacy Officer.",
        },
      ],
    },
    {
      id: "cookies",
      title: "12. Cookies and tracking technologies",
      blocks: [
        {
          type: "p",
          text: "Our website uses a limited number of cookies and similar technologies. See our Cookie Policy at /cookies for details, categories of cookies, retention periods, and instructions on how to control them.",
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
  ],
};

export const termsOfService: LegalDoc = {
  slug: "terms",
  title: "Terms of Service",
  subtitle: "The agreement between Tekmadev and our clients.",
  intro: `These Terms of Service ("Terms") form a legally binding agreement between ${company} ("${business.name}", "we", "us", or "our") and the business entity that accesses our website, books an audit call, or engages us to deliver the Growth System or any related service ("Client", "you", or "your"). By using our website, booking a call, signing an order form, or otherwise engaging us, you agree to these Terms. If you do not agree, do not use our website or services.`,
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
            "'Qualified Booked Call' means an appointment scheduled on the Client's calendar that meets the qualification criteria mutually defined in the Order Form (industry fit, decision-maker, minimum budget, and verified intent). Disputed calls are resolved under Section 5.",
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
          text: "Tekmadev offers a performance guarantee: if we do not deliver the number of Qualified Booked Calls set out in the Order Form (target floor: 30) within 60 days of go-live, the Client will not be invoiced for additional Qualified Booked Call fees until we reach that number, and we will continue to operate the system at no additional charge until we do.",
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
            "Meeting the qualification criteria defined in the Order Form (industry, geography, average deal value, monthly revenue floor).",
            "Maintaining lead generation activities and lead supply at the levels agreed in the Order Form.",
          ],
        },
        {
          type: "p",
          text: "Disputes about whether a call is a 'Qualified Booked Call' will be resolved in good faith. If a dispute cannot be resolved within 10 business days, the parties will follow the dispute resolution procedure in Section 19.",
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
            "$0 setup fee.",
            "Performance-based fees billed per Qualified Booked Call, or on a monthly retainer with a Qualified Booked Call floor, as specified in the Order Form.",
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
          text: "Required for the website to function. They do not require consent.",
        },
        {
          type: "h3",
          text: "Functional",
        },
        {
          type: "p",
          text: "Remember choices you make (for example, that you have dismissed a notice). These are used only with your consent.",
        },
        {
          type: "h3",
          text: "Analytics",
        },
        {
          type: "p",
          text: "Help us understand how the site is used. Vercel Web Analytics runs without cookies and measures aggregate traffic only. With your consent, we also use PostHog to understand on-page behaviour such as page views, clicks, and navigation paths; PostHog sets first-party cookies once you accept. We request your consent through a banner when you first visit, and you can change your choice at any time using the 'Cookie settings' link in our footer. If you decline, no analytics cookies are set and PostHog does not run.",
        },
        {
          type: "h3",
          text: "Booking embed",
        },
        {
          type: "p",
          text: "The Cal.com booking widget embedded on our site may set its own cookies to manage your scheduling session. Refer to Cal.com's privacy policy for details.",
        },
      ],
    },
    {
      id: "control",
      title: "3. Your choices and how to control cookies",
      blocks: [
        {
          type: "p",
          text: "When you first visit, we show a consent banner. Non-essential (analytics) cookies are not set unless you select 'Accept'. If you select 'Decline', they are not set. You can change your decision at any time using the 'Cookie settings' link in the footer of any page; choosing to decline there will stop further analytics cookies. Strictly necessary cookies and cookieless aggregate analytics do not require consent.",
        },
        {
          type: "p",
          text: "You can also control or delete cookies through your browser settings. Most browsers let you refuse third-party cookies, clear cookies on close, or be alerted before a cookie is stored. Disabling cookies may affect the functioning of some parts of our site.",
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
