# Ads

Source files for paid and organic ad images. Nothing here is served by the site.

## Webline feed ad (1080 x 1350)

Edit `webline-ad-v2.html`, then render it to a PNG:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --hide-scrollbars --allow-file-access-from-files --window-size=1080,1350 --force-device-scale-factor=1 --virtual-time-budget=9000 --screenshot="$PWD/docs/ads/webline-ad-v2.png" "file://$PWD/docs/ads/webline-ad-v2.html"
```

## Every claim has to stay true

- **Price and instalments**: read the live price in Admin, Pricing first. The four payments are the price divided by 4.
- **Delivery time**: never a number of days. Say it in words, "Ready before you are." (owner rule since 2026-09-29, see `config/webline-delivery.ts`).
- **No crossed-out price.** A strikethrough says we used to charge it. "Agencies charge $5,000+" compares with the market instead, and has to stay a fair picture of what agencies charge.
- **Proof line**: it is about Fixible and matches the About page and the Fixible case study. Never say Fixible is ours (owner rule since 2026-09-29), and never call it a client either: we built it and grew it. Do not add client numbers we cannot back.
- **Scarcity**: only print "N builds a month" if the business will really stop at N.
- **Pay in 4** is Afterpay or Klarna's decision, so the small print says "subject to their approval".
