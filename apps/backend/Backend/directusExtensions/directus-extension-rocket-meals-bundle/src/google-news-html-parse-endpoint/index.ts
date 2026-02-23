import { defineEndpoint } from '@directus/extensions-sdk';
import * as cheerio from 'cheerio';
import { DatabaseInitializedCheck } from '../helpers/DatabaseInitializedCheck';

// To Test this Endpoint:
// 1. Login with a user in the Directus Admin UI
// 2. Go to the URL: http://127.0.0.1/<DOMAIN_PATH>/api/google-news-html-parse?url=<encoded_url>
// Where http://127.0.0.1/<DOMAIN_PATH>/api is the URL of the Directus API

const ENDPOINT_NAME = 'google-news-html-parse-endpoint';
const MAX_NEWS_ITEMS = 20;

// Browser-like User-Agent so Google News serves its full server-side-rendered HTML
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

interface NewsArticle {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  imageUrl: string;
  description: string;
}

/**
 * Parse Google News HTML (as delivered by Google's servers) with cheerio.
 *
 * Strategy (tried in order until results are found):
 * 1. <article> elements  — classic semantic markup
 * 2. <h3>/<h4> elements that contain an <a> tag
 * 3. Any <a href*="/articles/"> anchor whose text looks like an article title
 */
function parseGoogleNewsHtml(html: string): NewsArticle[] {
  const $ = cheerio.load(html);
  const results: NewsArticle[] = [];

  const resolveHref = (raw: string): string => {
    if (!raw) return '';
    if (raw.startsWith('http')) return raw;
    try {
      return new URL(raw, 'https://news.google.com').toString();
    } catch {
      return raw;
    }
  };

  // Strategy 1 – <article> elements
  $('article').each((_i, el) => {
    if (results.length >= MAX_NEWS_ITEMS) return false;
    const art = $(el);
    const headingEl = art.find('h3, h4, h2').first();
    const title =
      headingEl.text().trim() || art.find('a').first().text().trim();
    if (!title) return;

    const linkEl = art.find('a[href*="articles"]').first().length
      ? art.find('a[href*="articles"]').first()
      : art.find('a[href]').first();
    const link = resolveHref(linkEl.attr('href') ?? '');

    const timeEl = art.find('time').first();
    const pubDate =
      timeEl.attr('datetime') ?? timeEl.text().trim();

    const imgEl = art.find('figure img').first().length
      ? art.find('figure img').first()
      : art.find('img').first();
    const imageUrl =
      imgEl.attr('src') ?? imgEl.attr('data-src') ?? '';

    const sourceEl = art
      .find('a[href*="publications"], [data-n-tid]')
      .first();
    const source = sourceEl.text().trim() || 'news.google.com';

    results.push({ title, link, pubDate, source, imageUrl: resolveHref(imageUrl), description: '' });
  });

  if (results.length > 0) return results;

  // Strategy 2 – headings (<h3>/<h4>) containing a link
  $('h3, h4').each((_i, el) => {
    if (results.length >= MAX_NEWS_ITEMS) return false;
    const heading = $(el);
    const anchor = heading.find('a[href]').first();
    const title = heading.text().trim();
    const link = resolveHref(anchor.attr('href') ?? '');
    if (!title || !link) return;

    // Walk up to find a containing block for time/image/source
    const container = heading.closest('[jscontroller], [data-ved], article, div');
    const timeEl = container.find('time').first();
    const pubDate = timeEl.attr('datetime') ?? timeEl.text().trim();
    const imgEl = container.find('img').first();
    const imageUrl = resolveHref(imgEl.attr('src') ?? imgEl.attr('data-src') ?? '');
    const sourceEl = container
      .find('a[href*="publications"], [data-n-tid], a[href*="source"]')
      .first();
    const source = sourceEl.text().trim() || 'news.google.com';

    results.push({ title, link, pubDate, source, imageUrl, description: '' });
  });

  if (results.length > 0) return results;

  // Strategy 3 – any anchor pointing to an article path
  $('a[href]').each((_i, el) => {
    if (results.length >= MAX_NEWS_ITEMS) return false;
    const anchor = $(el);
    const rawHref = anchor.attr('href') ?? '';
    if (!rawHref.includes('/articles/')) return;
    const title = anchor.text().trim();
    if (!title || title.length < 10) return;
    const link = resolveHref(rawHref);
    results.push({ title, link, pubDate: '', source: 'news.google.com', imageUrl: '', description: '' });
  });

  return results;
}

export default defineEndpoint({
  id: 'google-news-html-parse',
  handler: (router, apiContext) => {
    router.get('/', async (req, res) => {
      try {
        const allTablesExist =
          await DatabaseInitializedCheck.checkAllTablesExistWithApiContext(
            ENDPOINT_NAME,
            apiContext,
          );
        if (!allTablesExist) {
          return res.status(500).json({ error: 'Database not fully initialized' });
        }

        const { url } = req.query;
        if (!url || typeof url !== 'string') {
          return res.status(400).json({
            error: 'Missing or invalid URL parameter. Usage: ?url=<encoded_url>',
          });
        }

        let decodedUrl: string;
        try {
          decodedUrl = decodeURIComponent(url);
        } catch {
          return res.status(400).json({ error: 'Invalid URL encoding' });
        }

        let parsedUrl: URL;
        try {
          parsedUrl = new URL(decodedUrl);
        } catch {
          return res.status(400).json({ error: 'Invalid URL format' });
        }

        // Restrict to news.google.com to prevent SSRF attacks
        if (parsedUrl.hostname !== 'news.google.com') {
          return res.status(400).json({
            error: 'Only news.google.com URLs are supported by this endpoint',
          });
        }

        const response = await fetch(decodedUrl, {
          headers: {
            'User-Agent': BROWSER_UA,
            'Accept-Language': 'de-DE,de;q=0.9',
            Accept:
              'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          },
        });

        if (!response.ok) {
          return res.status(response.status).json({
            error: `Remote server returned status ${response.status}`,
          });
        }

        const html = await response.text();
        const items = parseGoogleNewsHtml(html);

        res.set('Content-Type', 'application/json');
        res.set('Access-Control-Allow-Origin', '*');
        return res.json({ items, debug: { htmlLength: html.length, itemCount: items.length } });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return res.status(500).json({
          error: 'Failed to parse Google News page',
          details: errorMessage,
        });
      }
    });
  },
});
