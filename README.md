# Hanzify — Shopify theme (Online Store 2.0)

Hanzify turns the NØRTH static HTML build ([live demo](https://onemandeveloper.com/hanzify/)) into a Shopify theme. Its main feature is a **scroll‑and‑drag try‑on stage**, where garments slide onto a model photo. It also has a **zip‑reveal brand moment**, a social marquee, an AJAX cart drawer and a minimal collection page and product page.

Every page is built from sections and blocks, so merchants can edit it in the theme editor. All storefront text comes from the locale file, so the theme can be translated.

---

## Quick start

```bash
npm i -g @shopify/cli
shopify theme dev --store your-store.myshopify.com   # live preview while editing
shopify theme push --unpublished                     # upload as a new, unpublished theme
shopify theme package                                # build the .zip for the Theme Store
```

Or zip the repository root (`assets config layout locales sections snippets templates`) and upload it in **Online Store → Themes → Add theme → Upload zip file**.

### Load the demo catalogue (optional)

1. **Products → Import** → `demo/products.csv`. It holds 19 products with Color/Size variants, and its images are pulled from the live demo URL. If the importer can't fetch them, upload the images from the original `_build.zip` to each product.
2. Create **automated collections** with the condition *Product tag equals*: `core-essentials`, `graphic-series-2026`, `outerwear`, `accessories`, `tops`, `bottoms`.
3. Navigation:
   - `main-menu`: Core Essentials, Graphic Series 2026, Tops, Bottoms, Outerwear, Accessories, Shop all.
   - Header **Secondary menu**: Lookbook, About us.
   - `footer`: Privacy policy, Cookie preferences, or other collections.
4. Pages: create **About us** with template `page.about`, **Lookbook** with `page.lookbook` and **Contact** with `page.contact`.
5. **Search & Discovery app → Filters**: add *Product type*, *Color*, *Size*, *Price* and *Availability*. The *Product type* filter powers the type tabs on the collection page.

The home page template (`templates/index.json`) already points at the demo product handles, so it fills in as soon as the products exist.

---

## What's included

| Area | Features |
| --- | --- |
| **Home** | Try-on stage (garment blocks: product, cut-out image, label), product slider (collection or hand-picked), zip reveal (two halves, video/image, statement), social gallery marquee, image banner, rich text, image with text, collection list, lookbook gallery, apps, custom Liquid |
| **Header / footer** | Section groups. Logo plus an optional inverse logo for dark sections, a transparent header over dark sections, a dropdown menu with numbered items, country/language selectors, social icons, payment icons, Follow on Shop, newsletter |
| **Cart** | AJAX drawer that refreshes through the Section Rendering API, quantity rules, line/cart discounts, selling plans, properties, cart note, free‑shipping meter (converted to the active currency), cart page with accelerated checkout |
| **Collection** | Image banner, product-type tabs with counts, Storefront filtering drawer (list, swatch, image, price range), active filter chips, sort, 2/4 column toggle, pagination. Filtering is AJAX with history support and also works without JavaScript |
| **Product (PDP)** | Gallery with images, video, external video and 3D/AR, color swatches (native Shopify swatches), sold‑out marking, variant URL, AJAX add to cart, dynamic checkout, Shop Pay Installments, pickup availability, selling plans (subscriptions), gift card recipient form, unit price, inventory status, size guide popup (from a page), perks, collapsible tabs, share, sticky add-to-cart bar, app blocks, product recommendations (related/complementary), structured data |
| **Product card** | Second image on hover, badges (sale, sold out, or tag `badge:Limited`), quick add with sizes (finds the Size option automatically), color swatches |
| **Search** | Predictive search panel (products, collections, pages, query suggestions), search page with filters and sort |
| **Other templates** | Page, contact, about, lookbook, blog, article (comments), list-collections, 404, password, gift card, all customer account templates |
| **Theme settings** | Color schemes (4 presets), Shopify font picker (body and heading), page width, button and card radius, card options, cart type (drawer/page), free‑shipping threshold, social links, search suggestions, favicon, demo content toggle |

### Demo media

The try-on model photos, garment cut-outs, reveal halves and video, gallery tiles and logo are bundled as `assets/demo-*`. They appear only when the matching image or video setting is empty **and** *Theme settings → Demo content → Use bundled demo imagery* is on. Otherwise the theme shows Shopify placeholders. To ship a clean package, delete `assets/demo-*` and turn the setting off.

### Try-on cut-outs

For garments to sit perfectly on the model, export every cut-out as a transparent PNG/WebP on the **same 4:5 canvas** as the model photo. The garment block uses its *Cut-out image* if one is set, otherwise the product's featured image, otherwise the demo image.

---

## Structure

```
assets/      base.css (design system + components), theme.js (all interactions), demo-* media
config/      settings_schema.json, settings_data.json
layout/      theme.liquid, password.liquid
locales/     en.default.json
sections/    header/footer groups, home sections, main-* template sections
snippets/    product-card, price, cart-drawer, cart-line-item, facets, icon, media-image, …
templates/   JSON templates (+ gift_card.liquid, customers/*)
demo/        products.csv (not part of the theme package)
```

## Quality checks

- `@shopify/theme-check-node` (recommended config): **0 errors, 0 warnings**.
- No jQuery or other dependencies, and a single deferred script. Images are responsive (`image_url` + `srcset`), and above-the-fold images load eagerly.
- Accessibility: skip link, focus trapping in drawers, ESC to close, an `aria-live` region for cart updates, labelled controls, and `prefers-reduced-motion` support in every animation.

## Before submitting to the Shopify Theme Store

- [ ] Run Lighthouse on the home, product and collection pages of a demo store and aim for 60+ on performance and 90+ on accessibility.
- [ ] Translate schema labels (`locales/en.default.schema.json`) if you want the editor UI localised, and add more storefront locales.
- [ ] Create at least one more **style preset** in `settings_data.json` (the Theme Store asks for distinct presets with their own demo stores).
- [ ] Replace `theme_documentation_url` / `theme_support_url` in `settings_schema.json` with your real docs and support pages.
- [ ] Remove `assets/demo-*` or make sure you own the rights to the bundled photography and video.
- [ ] Test on the Theme Store review checklist: multiple currencies and languages, RTL, gift cards, subscriptions, 3D models, large catalogues, and products without images.
