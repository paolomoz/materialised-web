import type { Env } from '../types';

/**
 * DA (Document Authoring) API Client
 *
 * Handles creating and publishing pages in AEM's Document Authoring system
 */

export class DAClient {
  private baseUrl = 'https://admin.da.live';
  private org: string;
  private repo: string;
  private token: string;

  constructor(env: Env) {
    this.org = env.DA_ORG;
    this.repo = env.DA_REPO;
    this.token = env.DA_TOKEN;
  }

  /**
   * Check if a page exists at the given path
   */
  async exists(path: string): Promise<boolean> {
    try {
      const response = await this.request('HEAD', `/source/${this.org}/${this.repo}${path}.html`);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Create a new page with HTML content
   */
  async createPage(path: string, htmlContent: string): Promise<{ success: boolean; error?: string }> {
    const formData = new FormData();
    formData.append('data', new Blob([htmlContent], { type: 'text/html' }), 'index.html');

    try {
      const response = await fetch(
        `${this.baseUrl}/source/${this.org}/${this.repo}${path}.html`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${this.token}`,
          },
          body: formData,
        }
      );

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error: `Failed to create page: ${response.status} - ${error}` };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Upload a media file (image)
   */
  async uploadMedia(
    filename: string,
    buffer: ArrayBuffer,
    contentType: string
  ): Promise<{ success: boolean; url?: string; error?: string }> {
    const formData = new FormData();
    formData.append('data', new Blob([buffer], { type: contentType }), filename);

    try {
      const response = await fetch(
        `${this.baseUrl}/source/${this.org}/${this.repo}/media/${filename}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${this.token}`,
          },
          body: formData,
        }
      );

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error: `Failed to upload media: ${response.status} - ${error}` };
      }

      return {
        success: true,
        url: `/media/${filename}`,
      };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Delete a page
   */
  async deletePage(path: string): Promise<boolean> {
    try {
      const response = await this.request('DELETE', `/source/${this.org}/${this.repo}${path}.html`);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Make an authenticated request to the DA API
   */
  private async request(method: string, endpoint: string): Promise<Response> {
    return fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers: {
        'Authorization': `Bearer ${this.token}`,
      },
    });
  }
}

/**
 * AEM Admin API Client
 *
 * Handles preview/publish operations
 */
export class AEMAdminClient {
  private baseUrl = 'https://admin.hlx.page';
  private org: string;
  private site: string;
  private ref: string;
  private token: string;

  constructor(env: Env, ref: string = 'main') {
    this.org = env.DA_ORG;
    this.site = env.DA_REPO;
    this.ref = ref;
    this.token = env.DA_TOKEN;
  }

  /**
   * Trigger preview for a path
   */
  async preview(path: string): Promise<{ success: boolean; url?: string; error?: string }> {
    try {
      const response = await this.request('POST', `/preview/${this.org}/${this.site}/${this.ref}${path}`);

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error: `Preview failed: ${response.status} - ${error}` };
      }

      return {
        success: true,
        url: `https://${this.ref}--${this.site}--${this.org}.aem.page${path}`,
      };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Publish to live
   */
  async publish(path: string): Promise<{ success: boolean; url?: string; error?: string }> {
    try {
      const response = await this.request('POST', `/live/${this.org}/${this.site}/${this.ref}${path}`);

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error: `Publish failed: ${response.status} - ${error}` };
      }

      return {
        success: true,
        url: `https://${this.ref}--${this.site}--${this.org}.aem.live${path}`,
      };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Purge CDN cache for a path
   */
  async purgeCache(path: string): Promise<boolean> {
    try {
      const response = await this.request('POST', `/cache/${this.org}/${this.site}/${this.ref}${path}`);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Wait for preview to be available
   */
  async waitForPreview(path: string, maxAttempts: number = 10, interval: number = 1000): Promise<boolean> {
    const previewUrl = `https://${this.ref}--${this.site}--${this.org}.aem.page${path}`;

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await fetch(previewUrl, { method: 'HEAD' });
        if (response.ok) {
          return true;
        }
      } catch {
        // Continue waiting
      }

      await new Promise(resolve => setTimeout(resolve, interval));
    }

    return false;
  }

  /**
   * Make an authenticated request to the Admin API
   */
  private async request(method: string, endpoint: string): Promise<Response> {
    return fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers: {
        'Authorization': `Bearer ${this.token}`,
      },
    });
  }
}

/**
 * Create a placeholder page with cerebras-generated block
 * This page is created quickly and will stream content from the worker on first load
 */
export async function createPlaceholderPage(
  path: string,
  query: string,
  slug: string,
  env: Env,
  sourceOrigin: string
): Promise<{ success: boolean; urls?: { preview: string; live: string }; error?: string }> {
  // Build minimal HTML with cerebras-generated block
  // EDS blocks use nested divs: outer div with class, inner divs for rows/cells
  // The block contains query and slug which the block JS will use to connect to the worker stream
  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Creating Your Page | Vitamix</title>
  <meta name="description" content="Personalized content is being generated for you">
  <meta name="robots" content="noindex">
  <meta name="cerebras-query" content="${escapeHtml(query)}">
  <meta name="cerebras-slug" content="${escapeHtml(slug)}">
  <meta name="cerebras-source" content="${escapeHtml(sourceOrigin)}">
</head>
<body>
  <header></header>
  <main>
    <div>
      <div class="cerebras-generated">
        <div>
          <div>${escapeHtml(query)}</div>
        </div>
        <div>
          <div>${escapeHtml(slug)}</div>
        </div>
      </div>
    </div>
  </main>
  <footer></footer>
</body>
</html>`;

  const daClient = new DAClient(env);
  const adminClient = new AEMAdminClient(env);

  try {
    // 1. Create page in DA
    const createResult = await daClient.createPage(path, html);
    if (!createResult.success) {
      return { success: false, error: createResult.error };
    }

    // 2. Trigger preview
    const previewResult = await adminClient.preview(path);
    if (!previewResult.success) {
      return { success: false, error: previewResult.error };
    }

    // 3. Publish to live (don't wait for preview, do in parallel)
    const publishResult = await adminClient.publish(path);
    if (!publishResult.success) {
      // Preview worked but publish failed - still usable via preview URL
      console.warn('Publish failed, preview should still work:', publishResult.error);
    }

    return {
      success: true,
      urls: {
        preview: previewResult.url!,
        live: publishResult.url || previewResult.url!,
      },
    };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Escape HTML special characters
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Complete persist and publish flow
 */
export async function persistAndPublish(
  path: string,
  html: string,
  images: Array<{ filename: string; buffer: ArrayBuffer; contentType: string }>,
  env: Env
): Promise<{ success: boolean; urls?: { preview: string; live: string }; error?: string }> {
  const daClient = new DAClient(env);
  const adminClient = new AEMAdminClient(env);

  try {
    // 1. Upload images to DA media
    for (const image of images) {
      const result = await daClient.uploadMedia(image.filename, image.buffer, image.contentType);
      if (!result.success) {
        console.warn(`Failed to upload image ${image.filename}:`, result.error);
        // Continue anyway - images are not critical
      }
    }

    // 2. Create page in DA
    const createResult = await daClient.createPage(path, html);
    if (!createResult.success) {
      return { success: false, error: createResult.error };
    }

    // 3. Trigger preview
    const previewResult = await adminClient.preview(path);
    if (!previewResult.success) {
      return { success: false, error: previewResult.error };
    }

    // 4. Wait for preview to be available
    const previewReady = await adminClient.waitForPreview(path);
    if (!previewReady) {
      console.warn('Preview not ready within timeout, continuing to publish');
    }

    // 5. Publish to live
    const publishResult = await adminClient.publish(path);
    if (!publishResult.success) {
      return { success: false, error: publishResult.error };
    }

    // 6. Purge cache
    await adminClient.purgeCache(path);

    return {
      success: true,
      urls: {
        preview: previewResult.url!,
        live: publishResult.url!,
      },
    };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}
