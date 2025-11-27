import type { Env, CrawlJob } from './types';

/**
 * Fetch a page - uses standard fetch which works well for most content sites
 * Falls back gracefully and handles redirects
 */
export async function fetchWithBrowser(
  url: string,
  env: Env
): Promise<{ html: string; finalUrl: string }> {
  // Use standard fetch - works well for vitamix.com and most e-commerce sites
  return fetchSimple(url);
}

/**
 * Simple fetch fallback for static pages
 */
async function fetchSimple(url: string): Promise<{ html: string; finalUrl: string }> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; VitamixContentBot/1.0; +https://vitamix.com)',
      'Accept': 'text/html,application/xhtml+xml',
    },
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  return {
    html,
    finalUrl: response.url,
  };
}

/**
 * Check robots.txt to see if we can crawl a URL
 */
export async function canCrawl(url: string): Promise<boolean> {
  try {
    const urlObj = new URL(url);
    const robotsUrl = `${urlObj.protocol}//${urlObj.host}/robots.txt`;

    const response = await fetch(robotsUrl, {
      headers: {
        'User-Agent': 'VitamixContentBot',
      },
    });

    if (!response.ok) {
      // No robots.txt means we can crawl
      return true;
    }

    const robotsTxt = await response.text();
    return parseRobotsTxt(robotsTxt, url);
  } catch {
    // If we can't fetch robots.txt, assume we can crawl
    return true;
  }
}

/**
 * Parse robots.txt and check if URL is allowed
 */
function parseRobotsTxt(robotsTxt: string, url: string): boolean {
  const urlObj = new URL(url);
  const path = urlObj.pathname;

  const lines = robotsTxt.split('\n');
  let relevantSection = false;
  const disallowedPaths: string[] = [];
  const allowedPaths: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim().toLowerCase();

    if (trimmed.startsWith('user-agent:')) {
      const agent = trimmed.replace('user-agent:', '').trim();
      relevantSection = agent === '*' || agent.includes('vitamix') || agent.includes('bot');
    } else if (relevantSection && trimmed.startsWith('disallow:')) {
      const disallowPath = line.replace(/disallow:/i, '').trim();
      if (disallowPath) {
        disallowedPaths.push(disallowPath);
      }
    } else if (relevantSection && trimmed.startsWith('allow:')) {
      const allowPath = line.replace(/allow:/i, '').trim();
      if (allowPath) {
        allowedPaths.push(allowPath);
      }
    }
  }

  // Check if path matches any allowed paths first (more specific)
  for (const allowed of allowedPaths) {
    if (pathMatches(path, allowed)) {
      return true;
    }
  }

  // Check if path matches any disallowed paths
  for (const disallowed of disallowedPaths) {
    if (pathMatches(path, disallowed)) {
      return false;
    }
  }

  return true;
}

/**
 * Check if a path matches a robots.txt pattern
 */
function pathMatches(path: string, pattern: string): boolean {
  if (pattern === '/') {
    return true;
  }

  // Handle wildcard patterns
  if (pattern.includes('*')) {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return regex.test(path);
  }

  return path.startsWith(pattern);
}

/**
 * Extract all links from a page that should be crawled
 */
export function extractCrawlableLinks(
  html: string,
  baseUrl: string,
  domain: string
): string[] {
  const links: Set<string> = new Set();
  const baseUrlObj = new URL(baseUrl);

  // Match href attributes in anchor tags
  const hrefRegex = /href=["']([^"']+)["']/gi;
  let match;

  while ((match = hrefRegex.exec(html)) !== null) {
    const href = match[1];

    try {
      // Resolve relative URLs
      const absoluteUrl = new URL(href, baseUrl);

      // Only include links from the same domain
      if (absoluteUrl.hostname.includes(domain)) {
        // Normalize the URL
        const normalized = normalizeUrl(absoluteUrl.href);

        // Skip non-page URLs
        if (shouldCrawl(normalized)) {
          links.add(normalized);
        }
      }
    } catch {
      // Invalid URL, skip
    }
  }

  return Array.from(links);
}

/**
 * Normalize a URL for consistent storage
 */
function normalizeUrl(url: string): string {
  const urlObj = new URL(url);

  // Remove trailing slashes
  let pathname = urlObj.pathname.replace(/\/+$/, '') || '/';

  // Remove common tracking parameters
  const paramsToRemove = ['utm_source', 'utm_medium', 'utm_campaign', 'ref', 'source'];
  for (const param of paramsToRemove) {
    urlObj.searchParams.delete(param);
  }

  // Reconstruct URL without hash
  return `${urlObj.protocol}//${urlObj.host}${pathname}${urlObj.search}`;
}

/**
 * Check if a URL should be crawled based on its path
 */
function shouldCrawl(url: string): boolean {
  const urlObj = new URL(url);
  const path = urlObj.pathname.toLowerCase();

  // Skip non-HTML resources
  const skipExtensions = [
    '.pdf', '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp',
    '.css', '.js', '.json', '.xml', '.zip', '.mp4', '.mp3',
    '.woff', '.woff2', '.ttf', '.eot',
  ];

  for (const ext of skipExtensions) {
    if (path.endsWith(ext)) {
      return false;
    }
  }

  // Skip admin/account pages
  const skipPaths = [
    '/account', '/login', '/logout', '/cart', '/checkout',
    '/search', '/api/', '/admin', '/cdn-cgi',
  ];

  for (const skipPath of skipPaths) {
    if (path.includes(skipPath)) {
      return false;
    }
  }

  return true;
}
