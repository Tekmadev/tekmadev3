# Traffic attribution, how to know where people came from

We use the free **UTM standard**. Add `?utm_...` parameters to any link you share.
When someone clicks it:

1. **Vercel Web Analytics** records the visit with its source (filter the dashboard
   by UTM / referrer), cookieless, no consent banner.
2. Our site stores their source (first-touch + last-touch) in the browser and
   **stamps every booked call with it**, firing a `booking` event in Vercel
   Analytics tagged with `utm_source`, `utm_medium`, `utm_campaign`. So you see
   not just *visits* per channel but *booked calls* per channel.

No extra tool to buy. Implemented in `lib/attribution.ts` + `components/AttributionTracker.tsx`
and the Cal.com embed (`components/BookingEmbed.tsx`).

## The convention (always lowercase, no spaces, use `_`)

| Param | Meaning | Examples |
|---|---|---|
| `utm_source` | where it came from | `instagram`, `tiktok`, `google`, `business_card` |
| `utm_medium` | channel type | `social`, `qr`, `cpc`, `paid_social`, `email`, `referral` |
| `utm_campaign` | the specific push | `bio_link`, `spring_promo`, `networking` |

## Ready-to-use links (copy, paste, share)

**Instagram bio**
`https://tekmadev.com/?utm_source=instagram&utm_medium=social&utm_campaign=bio_link`

**TikTok bio**
`https://tekmadev.com/?utm_source=tiktok&utm_medium=social&utm_campaign=bio_link`

**Facebook page**
`https://tekmadev.com/?utm_source=facebook&utm_medium=social&utm_campaign=profile`

**LinkedIn (founder posts)**
`https://tekmadev.com/?utm_source=linkedin&utm_medium=social&utm_campaign=founder_post`

**YouTube video description**
`https://tekmadev.com/?utm_source=youtube&utm_medium=social&utm_campaign=video_desc`

**Business-card QR code** (point the QR at this URL)
`https://tekmadev.com/?utm_source=business_card&utm_medium=qr&utm_campaign=networking`

**Email signature**
`https://tekmadev.com/?utm_source=email&utm_medium=signature&utm_campaign=outreach`

**Paid ads**, Google Ads auto-tags clicks (we also capture `gclid`); for manual
tagging use `utm_medium=cpc`. Meta ads: `utm_medium=paid_social` and you can use
Meta's dynamic `utm_campaign={{campaign.name}}`.

## Tips
- Make a **different QR code per place** (one for cards, one for flyers) by
  changing `utm_campaign`, then you know which print piece worked.
- Keep `utm_source` values consistent (always `instagram`, never `Instagram` or
  `IG`) so the dashboard groups them cleanly.
- Untagged visits show up as `direct` (typed the URL) or `referral` (a link from
  another site).
