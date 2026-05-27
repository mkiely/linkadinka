/**
 * One-time script to generate sample files for the linkaDinka prototype.
 * Run with: npm run generate
 *
 * Outputs:
 *   public/samples/sample.html  — HTML document with variety of link types
 *   public/samples/sample.txt   — Plain prose with embedded raw URLs
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'public', 'samples');

mkdirSync(outDir, { recursive: true });

// ── sample.html ───────────────────────────────────────────────────────────────
const sampleHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Sample Link Document</title>
</head>
<body>

<h1>Example Store — Sample Links</h1>

<p>
  Welcome to our sample document. Below you will find a variety of links
  that exercise different URL patterns used in our link scanner prototype.
</p>

<!-- ── Plain links ── -->
<h2>Standard Links</h2>
<ul>
  <li><a href="https://www.example.com">Home Page</a></li>
  <li><a href="https://www.example.com/about">About Us</a></li>
  <li><a href="https://www.example.com/products/shoes">Shoes Category</a></li>
  <li><a href="https://www.example.com/products/accessories/bags">Bags Category</a></li>
  <li><a href="https://shop.example.com/sale">Sale — Shop Subdomain</a></li>
</ul>

<!-- ── Links with query params ── -->
<h2>Links with Query Parameters</h2>
<ul>
  <li><a href="https://www.example.com/search?q=boots">Search: boots</a></li>
  <li><a href="https://www.example.com/filter?cat=shoes&amp;size=10">Filter: shoes size 10</a></li>
  <li><a href="https://www.example.com/results?page=2&amp;sort=price_asc">Results page 2, sorted</a></li>
  <li><a href="https://www.example.com/product/42?ref=homepage&amp;utm_source=email">Product with tracking params</a></li>
</ul>

<!-- ── Links with handlebars in query params ── -->
<h2>Links with Handlebars Query Params</h2>
<ul>
  <li><a href="https://www.example.com/search?q={{searchTerm}}">Dynamic search</a></li>
  <li><a href="https://www.example.com/track?order={{orderId}}&amp;user={{userId}}">Order tracking</a></li>
  <li><a href="https://www.example.com/api/products?key={{apiKey}}&amp;env={{environment}}&amp;version=2">API with auth + env</a></li>
  <li><a href="https://www.example.com/promo?code={{promoCode}}&amp;campaign=summer">Promo code link</a></li>
</ul>

<!-- ── Links with handlebars in path ── -->
<h2>Links with Handlebars Path Segments</h2>
<ul>
  <li><a href="https://www.example.com/user/{{userId}}/profile">User profile</a></li>
  <li><a href="https://www.example.com/store/{{storeId}}/inventory">Store inventory</a></li>
  <li><a href="https://www.example.com/{{locale}}/checkout?cart={{cartId}}">Locale-aware checkout</a></li>
</ul>

<!-- ── Entire URL as handlebars ── -->
<h2>Fully Dynamic Links</h2>
<ul>
  <li><a href="{{myUrl}}">Fully dynamic — entire URL is a template variable</a></li>
  <li><a href="{{redirectTarget}}">Redirect target</a></li>
</ul>

<footer>
  <p>
    Visit our partner site at
    <a href="https://partner.example.org/landing?src=sample&amp;id={{partnerId}}">partner page</a>
    or our
    <a href="https://www.example.com/docs/api-reference">API docs</a>.
  </p>
</footer>

</body>
</html>
`;

// ── sample.txt ────────────────────────────────────────────────────────────────
const sampleTxt = `linkaDinka Sample Plain-Text Document
======================================

This document contains URLs embedded in prose text (no HTML tags).
The link scanner should extract all valid URLs and bare handlebars tokens.

--- Standard URLs ---

Our main website is https://www.example.com and our blog lives at
https://www.example.com/blog. You can reach our status page directly:
https://status.example.com

--- URLs with Query Parameters ---

Search results are available at https://www.example.com/search?q=sneakers
and filtered views at https://www.example.com/browse?category=footwear&sort=newest
or paginated: https://www.example.com/listing?page=3&limit=24

For analytics, hits are logged to https://analytics.example.com/event?type=click&source=email

--- URLs with Handlebars in Query Params ---

Each user's feed loads from https://www.example.com/feed?user={{userId}}&token={{authToken}}
The export endpoint is https://www.example.com/export?format=csv&since={{startDate}}
Notifications: https://www.example.com/notify?target={{recipientId}}&channel={{channelName}}

--- Entire URL as a Template Variable ---

Sometimes the destination is entirely dynamic:

{{destinationUrl}}

Or a campaign target: {{campaignLandingPage}}

--- Mixed path and query handlebars ---

Deep links use patterns like https://www.example.com/region/{{regionCode}}/offers?promo={{promoId}}
and profile links: https://www.example.com/profile/{{username}}?tab=activity

---
End of sample document.
`;

writeFileSync(join(outDir, 'sample.html'), sampleHtml, 'utf8');
writeFileSync(join(outDir, 'sample.txt'), sampleTxt, 'utf8');

console.log('✅ Generated:');
console.log('   public/samples/sample.html');
console.log('   public/samples/sample.txt');
