The dossiers' codebase claims check out. Notably, GoHighLevel appears in **6 places**, not 3, the onsite dossier missed the three in `config/legal.ts` (lines 99, 151, 527). That's a material correction to flag. The rest of the structure (single-page app, `lib/seo.ts` schema, `app/robots.ts`, `app/sitemap.ts`) matches. I have what I need to write the playbook.

---

# Tekmadev GEO + SEO Domination Playbook

*Synthesized from six research dossiers. Verified against the live codebase. Built to out-rank and out-cite every competing agency, because that result is itself the sales proof.*

> **Codebase correction (flag):** The onsite dossier says GoHighLevel appears in **3 files**. It actually appears in **6 places across 3 files**, the dossier missed `config/legal.ts:99, 151, 527`. Full list in §3. This is the single hard-constraint violation shipping live today; treat it as P0.

---

## 1. What Google officially says about AI content, and the lines we must not cross

Google's stance is **method-agnostic**: it does not penalize AI content as a category. The line is **intent and value**, not who/what typed it. AI is explicitly *"useful when researching a topic, and to add structure to original content."* ([using-gen-ai-content](https://developers.google.com/search/docs/fundamentals/using-gen-ai-content))

**The three named penalties we can trip by mass-publishing SEO/GEO pages**, all on the [Spam Policies page](https://developers.google.com/search/docs/essentials/spam-policies). Enforcement = lower ranking or full removal, via algorithm **and manual actions** (notified in Search Console).

| Penalty | What triggers it | Tekmadev exposure | Don't-cross rule |
|---|---|---|---|
| **Scaled Content Abuse** (our #1 risk) | *"Many pages generated for the primary purpose of manipulating rankings and not helping users"*, applies "no matter how it's created." Aggressively enforced in the **Aug 2025 spam update** (internal classifier nicknamed "Firefly"/QualityCopiaFireflySiteSignal); local-service/agency sites were directly in scope. ([SEJ](https://www.searchenginejournal.com/in-depth-look-at-google-spam-policies-updates/511005/)) | The textbook trap: one templated `[service] in [town]` page per city/niche with only names swapped. | Every location/industry page needs **unique, non-templated substance** (local case data, area specifics, real differentiation). Don't publish faster than you can keep each page genuinely high-quality. |
| **Site Reputation Abuse** ("parasite SEO") | Publishing third-party content on a host site to borrow its ranking signals, a violation *"regardless of first-party involvement or oversight."* ([Nov 2024 Google blog](https://developers.google.com/search/blog/2024/11/site-reputation-abuse)) | Two exposures: (1) hosting client/guest/"white-label" articles on tekmadev.com to rank them; (2) **promising clients** rankings by placing their content on high-authority third-party domains. | Don't host third-party SEO content on our domain to rank it. Don't sell that tactic. |
| **Expired Domain Abuse** | Buying an expired domain to inherit its link equity for low-value content. | Only if we/clients acquire aged domains for shortcuts. | Repurposing an old domain into a genuine people-first site is fine; buying one purely for equity is not. |

**The quality bar every page must clear** (from [creating-helpful-content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)):
- **Who / How / Why** baked into every page: named author bylines (Who); AI use self-evident where relevant (How); content *"primarily to help people,"* not *"primarily to attract search engine visits"* (Why, "perhaps the most important question").
- Avoid "search-engine-first" content, explicitly including *"producing lots of content on many different topics in hopes that some might perform well"*, the exact failure mode of naive mass GEO publishing.
- **E-E-A-T: "trust is most important. The others contribute to trust."** For an agency, trust = real bylines, first-hand **Experience** (named case studies, founder track record), clear sourcing, transparent legal/contact info.

**Bottom line:** We can publish high volume of AI-*assisted* content penalty-free if each page is (1) genuinely valuable, (2) original (not permutations/spun), (3) attributable to a real author with experience, (4) built to help the reader. Use AI to research/structure; use humans to add the experience and specificity that clears the trust bar.

---

## 2. How AI engines decide who to cite, the levers, ranked

Ranked by strength/consistency of evidence. **The top 3 are causal** (controlled Princeton/Georgia Tech/Allen AI study, KDD 2024, 10k queries, [arxiv](https://arxiv.org/abs/2311.09735)); the rest are strong correlation.

| # | Lever | Effect | Source |
|---|---|---|---|
| 1 | **Original statistics / data / numbers** | +30–40% visibility; single strongest predictor | [Princeton](https://arxiv.org/abs/2311.09735), [derivatex](https://derivatex.agency/blog/princeton-geo-paper-plain-english/) |
| 2 | **Quotations + citing your own authoritative sources** | Quotes +28–40%; **citing sources = +115% lift for lower-ranked pages** (slightly *hurts* already-top pages) | same |
| 3 | **Front-load the answer ("ski-ramp")** | **44.2% of LLM citations come from the first 30% of a page** (1.2M-answer analysis) | [nicklafferty](https://nicklafferty.com/blog/how-to-rank-higher-in-chatgpt-perplexity/) |
| 4 | **Freshness/recency** | Pages updated <3mo get ~2x citations; 78% of Perplexity citations are <12mo old | [leapd](https://www.leapd.ai/blog/ai-visibility/how-chatgpt-google-ai-overviews-and-perplexity-source-information-in-2026) |
| 5 | **Fluency + *substantiated* authority** | +15–30% / +10–20%; persuasion *without* backing **failed** | [derivatex](https://derivatex.agency/blog/princeton-geo-paper-plain-english/) |
| 6 | **Structured, extractable passages + schema** (FAQ/tables/definitions) | up to ~40% more AI Overview appearances; ~2.1x Perplexity rate | [leapd](https://www.leapd.ai/blog/ai-visibility/how-chatgpt-google-ai-overviews-and-perplexity-source-information-in-2026) |
| 7 | **Crawlable + in the right index** (hard gate) | Blocked bot = zero visibility. **87% of ChatGPT/SearchGPT citations match Bing top results**; Claude = Brave (~87%); Perplexity own + Reddit | [seer](https://www.seerinteractive.com/insights/87-percent-of-searchgpt-citations-match-bings-top-results), [stridec](https://stridec.com/blog/how-does-claude-decide-what-to-cite/) |
| 8 | **Brand/entity authority (off-page mentions)** | DR correlates w/ ChatGPT citations; third-party mention volume builds the trusted "entity" | [leapd](https://www.leapd.ai/blog/ai-visibility/how-chatgpt-google-ai-overviews-and-perplexity-source-information-in-2026) |

**Tested and FAILED (do not do):** keyword stuffing, content padding, simplification-for-its-own-sake, pure persuasion. **Classic SEO signals, raw backlinks, raw traffic, keyword density, correlate *negatively* with AI citation.**

**The decisive structural fact, owned vs earned:** A brand's own site is only **~5–10%** of what AI search cites (McKinsey); earned media is **85–94%** ([Muck Rack](https://everything-pr.com/94-of-ai-citations-come-from-earned-media-brand-blogs-are-invisible/), [5W](https://www.prnewswire.com/news-releases/85-5-of-ai-citations-come-from-earned-media--not-brand-websites-5w-releases-ai-and-the-israeli-brand-mapping-the-new-discovery-funnel-302771336.html)). Only ~12% of AI-cited pages even rank in Google's top 10. **Plan ~10% owned / ~90% earned.**

**Resolving the dossier tension (schema):** geo-citation says schema lifts citations; Google says *no special/AI-specific schema is required* for AI Overviews ([Google AI features](https://developers.google.com/search/docs/appearance/ai-features)). **Resolution:** schema is not required by Google but demonstrably helps third-party engines (Perplexity/Bing) and costs little, **do it, but never treat schema as the strategy; HTML content is.** Same logic kills over-investing in `llms.txt` (Google's Mueller/Illyes compare it to the dead keywords meta tag, [SEJ](https://www.searchenginejournal.com/google-says-llms-txt-comparable-to-keywords-meta-tag/544804/)).

**Per-engine cheat sheet:** ChatGPT → win Bing + domain authority. Claude → win Brave + primary sources, conservative citer. Perplexity → freshness + short verifiable passages + Reddit. Copilot → freshness + Bing top-10 + named authors. Google AIO → indexed + people-first + "query fan-out" (answer the whole topic cluster, not one keyword).

> **Caveat on evidence (flagged):** Only Princeton is a controlled experiment. Freshness/schema/source-mix percentages are vendor correlation studies, *"every AI search study tells a different story."* Trust the **direction** (stats > backlinks; earned >> owned; front-load; be in Bing/Brave); treat individual percentages as directional.

---

## 3. On-site playbook (prioritized)

### TIER 0, Blockers (this week)
1. **[P0] Strip GoHighLevel everywhere, 6 places, not 3.** `app/llms.txt/route.ts:43`; `config/site.ts:91, 106, 289`; **and `config/legal.ts:99, 151, 527`** (dossier missed these). Replace with platform-agnostic language ("our proprietary automation platform" / "enterprise CRM and AI layer"). *Hard brand constraint, currently shipping in machine-readable form (llms.txt) to every AI crawler and in legal docs.*
2. **[P0] Ensure all FAQ/Proof/System copy is in raw server-rendered HTML.** GPTBot/ClaudeBot/PerplexityBot/OAI-SearchBot **do not render JavaScript**, they read raw HTML. `FAQ.tsx` is `"use client"` with framer-motion. RSC renders text into HTML, but **verify with `curl https://tekmadev.com | grep "<answer text>"`**. If text isn't in the HTML, it cannot be cited. ([Lantern](https://www.asklantern.com/blogs/ai-crawlers-do-not-render-javascript))
3. **[P0] One `<h1>` per page + clean H1→H2→H3 hierarchy.** Extractors locate citable answer blocks via headings.

### TIER 1, Highest citation leverage
4. **Answer-first rewrite:** first 1–2 sentences after every heading = a self-contained 40–60 word answer, before any narrative/animation. (Lever #3 above.)
5. **Headings = the exact buyer query.** Replace brand-speak nav ("The System", "Proof") with "How do I get more clients for my business?", "What is a done-for-you AI growth system?", "How much does a performance-based growth agency cost?"
6. **Make our proprietary stats quotable as standalone sentences** with subject + date/sample: *"Tekmadev clients see an average 3.2x lift in booked calls across 40+ installs since 2019."* (Lever #1, the single most quotable asset we own. We already have 3.2x, 11s response, 94% retention, +480%/+288%/+1100%.)
7. **Add comparison tables + definition blocks** (AI's favorite formats): (a) Agency vs Freelancer vs Tekmadev, (b) "What's included" feature table, (c) one-line bolded definitions of "performance-based growth agency" and "AI receptionist." We already have `whatItIs.isNot/isYes` data.
8. **Break the single-page ceiling: build a pillar + 4–6 cluster pages** (see §6). A one-pager caps topical authority and the number of queries it can be cited for. This is the **biggest structural bet.**
9. **Internal links bidirectional** (pillar ↔ clusters ↔ home) with descriptive keyword anchors, not "click here."

### TIER 2, Schema, entity, E-E-A-T (the trust gate)
10. **Add named founder `Person` schema + `ProfessionalService`/`LocalBusiness` schema.** Founder (Kazi Shajeedul Islam) and Hamilton, Ontario office are already in `config/site.ts`, surface them. `Person` with `sameAs` (LinkedIn, X), `jobTitle`, linked as `founder` on Organization; `ProfessionalService` with `address`, `geo`, `priceRange`, `openingHours`.
11. **Back the existing `aggregateRating` (4.9, 40) with real `Review` nodes** in `serviceJsonLd`, standalone aggregateRating without reviews is a spam/penalty risk and AI discounts unverifiable ratings. Wire all nodes by `@id` (already done well, extend to Person + LocalBusiness).
12. **Keep FAQPage + HowTo + Service + Organization + Offer (all present, strong).** After the GoHighLevel rewrite, verify FAQ schema text **matches visible on-page text exactly.**
13. **Visible trust/recency signals:** "Last updated" date, founding year, "serving since." Freshness is a measured multiplier (esp. Perplexity).

### TIER 3, Technical
14. **robots.ts already allows all AI bots correctly, no change, just confirm it deploys.**
15. **Fix `app/sitemap.ts`: drop the `/#anchor` URLs** (`#system`, `#proof`, etc.), fragments aren't indexable pages; replace with the real pillar/cluster URLs once built.
16. **Core Web Vitals "good" at p75:** LCP <2.5s, INP <200ms, CLS <0.1. Audit framer-motion `useScroll`/`useTransform` in FAQ (common INP/CLS offender). Use `next/image` for `public/images`. `next/font` + `display:swap` already good.
17. **Consistent entity naming** ("Tekmadev" / "Tekmadev Innovation Inc.") + `sameAs` social links on Organization.

### TIER 4, llms.txt + privacy
18. **Keep `/llms.txt` but don't rely on it** (fix the GoHighLevel leak per item 1). Real GEO is HTML + schema.
19. **Add a quotable "About Tekmadev" boilerplate paragraph in on-page HTML** (mirrors the llms.txt citation note where bots actually read).
20. **Keep privacy/terms indexable** with the named Privacy Officer + registered office surfaced ("Serving Canada (PIPEDA), US and EU"), a Trust signal that gates citations.

---

## 4. Off-site + ongoing playbook (the 90% that earns citations)

**Strategic frame:** off-page is no longer "backlinks", backlinks ≈45% of off-page weight, **brand mentions/entity signals ≈55%** ([SearchAtlas](https://searchatlas.com/blog/backlinks-to-mentions-evolution-off-page-signals-2026/)). Nothing below requires naming the platform, keep every bio/comment/quote outcome-framed.

### Tier 1, Foundation (do first)
- **Google Business Profile + review engine.** GBP ≈32% of local-pack weight, reviews ≈16%, the two biggest local factors. Claim, 100%-complete, pick the primary category deliberately, build a *steady* review inflow (momentum kicks in ~10 reviews), respond to every review, get clients to name the service in their text.
- **NAP consistency + 50–100 citations** (60+ is the working target) incl. Canada set (Yellow Pages Canada, Yelp Canada, 411.ca, Canada411, Cylex) + global (Bing Places, Apple Business Connect, Facebook, Foursquare). Fixing NAP drift lifted local-pack ~17%.
- **B2B/agency directories (backlink + citation + lead channel):** **Clutch is the priority.** Claim free G2 + Capterra (now merged into "G2 Digital Markets" as of Jan 2026, lock in free profiles before pricing changes).

### Tier 2, The AI-citation engine
- **Reddit, the single biggest AI-citation lever** (top-cited source across engines; ~46.7% of Perplexity top sources; cited within 24h). Personal account, 2 weeks lurking first, niche subs (50K–300K: r/smallbusiness, r/Entrepreneur, r/PPC, r/HVAC, r/plumbing, r/dentistry, local-trade subs). Reply structure that gets cited: **direct answer first → numbered steps → 2+ dated stats → follow-up question.** Refresh every ~90 days.
- **YouTube** (top LLM source; >half of AIO social citations): how-to videos answering buyer questions, **structured chapters**, optimize whole video + description.
- **LinkedIn, prioritize the founder's personal profile** (~75% of LinkedIn AI citations come from member profiles, ~25% company pages). Cross-post research/data here.
- **Quora**, secondary, same playbook as Reddit.

### Tier 3, Authority / entity / digital PR (compounding)
- **Digital PR via original research** ("We surveyed 200 Ontario service businesses on lead-response time"), the most citable, non-replicable asset for both journalists and AI. Pitch via **Featured.com (revived HARO), Qwoted, Source of Sources.** Unlinked mentions still count (80.9% of SEOs say they affect rankings).
- **Build the brand entity:** Wikidata entry, Crunchbase + LinkedIn company page, identical facts everywhere (toward 30+ corroborating sources → knowledge panel in ~3–6 months from scratch). Wikipedia comes *after* coverage exists, not before.
- These same surfaces (Reddit, YouTube transcripts, Wikidata, Crunchbase) are what LLMs pretrain on (Common Crawl/FineWeb), so the work compounds into both live retrieval *and* future model training.

### The recurring rhythm
| Cadence | Actions |
|---|---|
| **Weekly** | 2–4 structured Reddit/Quora answers (monitor 15–20 buyer-intent keywords); 1 GBP post + review requests + respond <48h; 2–3 founder LinkedIn posts; respond to 2–3 HARO/Qwoted queries |
| **Monthly** | 1 chaptered YouTube video + 1 LinkedIn article; **re-run AI-visibility queries across ChatGPT/Perplexity/Gemini/AIO/Copilot** (track mention rate, citation rate, sentiment via Otterly/LLMrefs); NAP drift audit + 5–10 new citations; 1 digital-PR pitch; refresh 2–3 directory profiles |
| **Quarterly** | **1 original-research/survey campaign** (the flagship citable asset → PR + LinkedIn + blog); refresh older Reddit/cornerstone content with current-year stats; entity audit; review velocity vs competitors |
| **Annually** | Pursue Wikipedia once notability is supportable; full competitive off-site gap audit |

---

## 5. Attribution: recommendation in 3 sentences + v1

Don't build a full system or buy a paid one for v1, the mechanism that captures "where every visitor came from" is the **free UTM parameter standard** (read identically by every tool), so tagging discipline matters more than tool choice. Lead with **cookieless, no-PII analytics (Vercel Web Analytics)** to sidestep mandatory consent banners across PIPEDA, **Quebec Law 25** (strictest, express opt-in, applies if you have *any* Quebec visitor), and GDPR simultaneously, adding default GA4 or ad pixels is the one move that forces a consent-management layer and real legal exposure. The only thing worth actually building is a ~20-line first-party snippet that captures `utm_*` + referrer and injects them into hidden fields on the Cal.com booking form, so every *booked lead* (not just a pageview) is stamped with its true source.

**Implement for v1 (now, $0, no banner):**
1. `@vercel/analytics`, add `<Analytics/>` to `app/layout.tsx` (cookieless, already on Vercel).
2. A documented UTM convention (lowercase, no spaces) on every link, Instagram bio, ads, email signatures, QR codes (`?utm_source=business_card&utm_medium=qr&utm_campaign=networking`).
3. The ~20-line UTM-capture snippet wired into the existing `@calcom/embed-react` config in `components/BookingEmbed.tsx`.

**Add later, in order:** PostHog (free 1M events, cookieless) for funnels/per-lead dashboards, **or** Plausible ($9/mo) for a demoable dashboard → GA4 *only* when running Google Ads (with consent banner + Consent Mode v2) → dynamic short links (Bitly) when print scales. No analytics code exists in the repo today (`package.json` has no analytics dep).

---

## 6. Positioning + first pages, in ROI order

**Why this works now:** AI is the #1 influence on B2B shortlists; 73% of buyers use ChatGPT/Perplexity in research, yet 63% of B2B brands have *zero* AI presence for their primary keywords, that gap is the opening. AI prompts average 15.1 words (vs 8.8-word Google queries) and ~45% are single-prompt, if you're not in the first answer, there's no second chance.

**The category line** (use near-verbatim in homepage opening 40–60 words, meta description, About, AI extracts it verbatim):
> "Tekmadev is a performance-based growth consultancy that gives local and B2B service businesses one done-for-you system to get more clients, website, advertising, social media, and 24/7 AI-powered booking and follow-up, managed as a single monthly package."

Every word is load-bearing: **"growth consultancy"** (outcome category, not tool category, what AI recommends for "how to get more clients") · **"one done-for-you system / single monthly package"** (answers the high-citation "one company or five vendors?" prompt) · **"24/7 AI-powered booking and follow-up"** (the missed-call value *without naming the platform*) · **"performance-based"** (counters the #1 buyer red flag: locked-in contracts).

**First 10 pages, ROI order** (commercial intent × ease to rank/cite × repositioning fit):

| # | Page | Owns | GEO format |
|---|---|---|---|
| 1 | **Homepage / "growth system" landing** | "done for you growth agency," "all in one marketing local business" | 40–60 word definition first; FAQPage + Org + Service schema |
| 2 | **"How to get more clients for your business" pillar** (2,000+ words) | the #1 informational query + dozens of AI prompts | answer-first, 1 stat per ~150–200 words, 5–8 outbound citations; **the citation magnet** |
| 3 | **Pricing / "what's included"** | "marketing package cost/pricing" | tier comparison table (vague pricing is a top buyer red flag) |
| 4 | **"Marketing agency vs growth consultancy"** (one partner vs five vendors) | the comparison query | "X vs Y" = most-cited ChatGPT format; does the repositioning work |
| 5 | **"Is a marketing agency worth it for a small business?"** | high-intent commercial-investigation query | strong FAQ block |
| 6 | **Industry pages (3–4: HVAC/plumbing, dental, law, med-spa)** | "marketing for [industry]" | near-dupe of home **with unique niche proof** (avoids scaled-content abuse, see §1) |
| 7 | **"Why your business is missing calls (and what it costs)"** | "missed call text back," "ROI of AI booking" | citable stats: 60–80% calls missed; ~$126K/yr lost; 5-min response = 21x conversion; 78% buy from first responder, *without naming the platform* |
| 8 | **Results / case studies** | trust + "best [category] near me" | flagship proof = our own SEO/GEO ranking ("we out-rank the agencies, that's the demo") |
| 9 | **"How much should a small business spend on marketing?"** | budget queries | cheap top-funnel, routes to pricing |
| 10 | **Location hub (Ontario/Toronto/Canada)** | geo-transactional + PIPEDA trust line | local + AI "agency in Ontario" anchor |

**Build order:** 1–4 (capture deciding buyers) → 5–7 (mid-funnel + missed-call story) → 8–10 (proof, breadth, local).

**Site-wide GEO rules:** answer-first · question-shaped headings · 1 cited stat per 150–200 words (link originals, not aggregators) · FAQPage/Service/Org/HowTo schema · comparison + listicle formats · visible E-E-A-T (founder bio, dates, Canadian office) · refresh pillars every ~3 months · **never name the platform** in copy, schema, alt text, or FAQ.

> **Uncertain, validate before committing budget:** Search volumes were *not* pulled from a keyword tool in the positioning dossier, clusters are inferred from query phrasing. Validate volume/difficulty in Ahrefs (the Ahrefs MCP connector is available in this environment) before finalizing page priority.

---

## The 5-move opening week
1. Strip GoHighLevel from **all 6 locations** (3 files).
2. `curl`-verify FAQ/Proof answer text is in raw HTML.
3. Rewrite headings → questions + answer-first first sentences.
4. Add founder `Person` + `LocalBusiness` schema.
5. Ship Vercel Analytics + UTM capture on the Cal.com form (§5).

**The 90-day bet:** build the pillar + cluster pages (§6 #2, #6, #7) and interlink them, that's what breaks the single-page topical-authority ceiling and lets Tekmadev out-cite multi-page competitors. **The flywheel:** the quarterly original-research campaign feeds digital PR + the ~90% earned-media citation footprint, which is where 85–94% of AI citations actually come from.