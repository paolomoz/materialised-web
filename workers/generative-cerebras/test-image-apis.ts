/**
 * Test script for image generation APIs
 * Run with: npx wrangler dev --test-scheduled
 * Or execute directly via fetch
 */

import type { Env } from './src/types';

// Test endpoint that tries both APIs
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    if (url.pathname === '/test-imagen') {
      return testImagen(env);
    }
    
    if (url.pathname === '/test-fal') {
      return testFal(env);
    }
    
    return new Response('Use /test-imagen or /test-fal', { status: 200 });
  }
};

async function testImagen(env: Env): Promise<Response> {
  const results: any = {
    test: 'Imagen 3 via Vertex AI',
    timestamp: new Date().toISOString(),
  };
  
  try {
    // Check if credentials exist
    if (!env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      results.error = 'GOOGLE_SERVICE_ACCOUNT_JSON secret not configured';
      return new Response(JSON.stringify(results, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const serviceAccount = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
    results.serviceAccount = {
      email: serviceAccount.client_email,
      projectId: serviceAccount.project_id,
    };
    
    // Try to get access token
    results.step = 'Getting access token...';
    const accessToken = await getAccessToken(env);
    results.accessToken = 'SUCCESS (token obtained)';
    
    // Try to generate image
    results.step = 'Generating test image...';
    const projectId = serviceAccount.project_id;
    const region = env.VERTEX_AI_REGION || 'us-east4';
    
    const response = await fetch(
      `https://${region}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${region}/publishers/google/models/imagen-3.0-generate-001:predict`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          instances: [{ prompt: 'A simple red apple on white background' }],
          parameters: {
            sampleCount: 1,
            aspectRatio: '1:1',
            safetyFilterLevel: 'block_only_high',
          },
        }),
      }
    );
    
    results.apiStatus = response.status;
    results.apiStatusText = response.statusText;
    
    if (!response.ok) {
      const errorText = await response.text();
      results.error = errorText;
    } else {
      const data = await response.json() as any;
      results.success = true;
      results.predictions = data.predictions?.length || 0;
      results.hasImage = !!(data.predictions?.[0]?.bytesBase64Encoded);
      if (results.hasImage) {
        results.imageSize = data.predictions[0].bytesBase64Encoded.length;
        results.mimeType = data.predictions[0].mimeType;
      }
    }
    
  } catch (error: any) {
    results.error = error.message;
    results.stack = error.stack?.split('\n').slice(0, 3);
  }
  
  return new Response(JSON.stringify(results, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function testFal(env: Env): Promise<Response> {
  const results: any = {
    test: 'Fal.ai FLUX Schnell',
    timestamp: new Date().toISOString(),
  };
  
  try {
    if (!env.FAL_API_KEY) {
      results.error = 'FAL_API_KEY secret not configured';
      return new Response(JSON.stringify(results, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    results.apiKey = 'CONFIGURED (hidden)';
    results.step = 'Generating test image...';
    
    const response = await fetch('https://fal.run/fal-ai/flux/schnell', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${env.FAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: 'A simple red apple on white background',
        image_size: { width: 512, height: 512 },
        num_inference_steps: 4,
        num_images: 1,
        enable_safety_checker: true,
      }),
    });
    
    results.apiStatus = response.status;
    results.apiStatusText = response.statusText;
    
    if (!response.ok) {
      const errorText = await response.text();
      results.error = errorText;
    } else {
      const data = await response.json() as any;
      results.success = true;
      results.images = data.images?.length || 0;
      results.hasImage = !!(data.images?.[0]?.url);
      if (results.hasImage) {
        results.imageUrl = data.images[0].url;
        results.imageSize = `${data.images[0].width}x${data.images[0].height}`;
      }
      results.inferenceTime = data.timings?.inference;
    }
    
  } catch (error: any) {
    results.error = error.message;
    results.stack = error.stack?.split('\n').slice(0, 3);
  }
  
  return new Response(JSON.stringify(results, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// Helper: Get Google access token
async function getAccessToken(env: Env): Promise<string> {
  const serviceAccount = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON!);
  const now = Math.floor(Date.now() / 1000);
  
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
  };
  
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signatureInput = `${encodedHeader}.${encodedPayload}`;
  
  const signature = await signJWT(signatureInput, serviceAccount.private_key);
  const jwt = `${signatureInput}.${signature}`;
  
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  
  if (!tokenResponse.ok) {
    const error = await tokenResponse.text();
    throw new Error(`Token exchange failed: ${tokenResponse.status} - ${error}`);
  }
  
  const tokenData = await tokenResponse.json() as any;
  return tokenData.access_token;
}

function base64UrlEncode(str: string): string {
  const base64 = btoa(str);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function signJWT(input: string, privateKeyPem: string): Promise<string> {
  const pemContents = privateKeyPem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\n/g, '');
  
  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    encoder.encode(input)
  );
  
  const signatureArray = new Uint8Array(signature);
  const signatureBase64 = btoa(String.fromCharCode(...signatureArray));
  return signatureBase64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
