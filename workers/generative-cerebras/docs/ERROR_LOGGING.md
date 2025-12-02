# Error Logging & Debugging

This document describes how to investigate errors in the generative-cerebras worker.

## Quick Reference

```bash
# Check recent errors
curl https://vitamix-generative-cerebras.paolo-moz.workers.dev/api/dashboard/errors

# Real-time logs
npx wrangler tail vitamix-generative-cerebras

# Run stress tests
npx tsx test/stress-test.ts
npx tsx test/extreme-stress.ts
```

## Error Logging

Errors are automatically logged to KV storage with a 7-day TTL. Each error captures:

| Field | Description |
|-------|-------------|
| `id` | Unique error ID |
| `type` | Error category (e.g., `generation_failed`) |
| `message` | Error message shown to user |
| `stack` | First 5 lines of stack trace |
| `timestamp` | ISO timestamp |
| `query` | User's search query |
| `slug` | Generated page slug |
| `path` | Target page path |
| `cfRay` | Cloudflare Ray ID (for CF support tickets) |
| `userAgent` | Browser/client info |
| `country` | User's country (from Cloudflare) |
| `ip` | User's IP address |
| `extra` | Additional context (e.g., imageProvider) |

## Viewing Errors

### Via Dashboard API

```bash
# Get recent errors (default: 50)
curl https://vitamix-generative-cerebras.paolo-moz.workers.dev/api/dashboard/errors

# Limit results
curl https://vitamix-generative-cerebras.paolo-moz.workers.dev/api/dashboard/errors?limit=10
```

Response:
```json
{
  "count": 3,
  "total": 3,
  "errors": [
    {
      "id": "error:1701234567890-abc123",
      "type": "generation_failed",
      "message": "Request was blocked. Please try again in a moment.",
      "timestamp": "2024-11-29T10:30:00.000Z",
      "query": "green smoothie recipes",
      "slug": "green-smoothie-abc123",
      "cfRay": "8a1b2c3d4e5f6g7h-SJC",
      "userAgent": "Mozilla/5.0...",
      "country": "US",
      "ip": "192.168.1.1"
    }
  ]
}
```

### Via Wrangler CLI

```bash
# List error keys
npx wrangler kv:key list --binding CACHE --prefix "error:"

# Get specific error
npx wrangler kv:key get --binding CACHE "error:1701234567890-abc123"
```

## Real-time Debugging

For live debugging, use wrangler tail:

```bash
npx wrangler tail vitamix-generative-cerebras
```

This shows:
- Retry attempts: `[Cerebras] Attempt 1 failed with 403, retrying in 1000ms...`
- Error storage: `[ErrorLog] Stored error error:1701234567890-abc123: Request was blocked`
- Full request/response logs

## Retry Logic

The Cerebras API client includes automatic retry with exponential backoff:

| Attempt | Delay | Retried Status Codes |
|---------|-------|---------------------|
| 1 | - | - |
| 2 | 1s | 403, 429, 5xx |
| 3 | 2s | 403, 429, 5xx |
| (fail) | 4s | 403, 429, 5xx |

If all 3 attempts fail, a user-friendly error is shown instead of raw HTML.

## Common Errors

### 403 Forbidden (Cloudflare)

**Cause:** Cloudflare's bot protection on Cerebras API blocked the request.

**Possible reasons:**
- User's IP has poor reputation (VPN, datacenter, shared hosting)
- Corporate network/proxy (common with enterprise offices)
- Temporary rate limiting
- Browser fingerprint triggered bot detection

**Resolution:**
- Retry logic usually handles transient blocks
- If persistent for a user, check their network setup (VPN, proxy)
- Contact Cloudflare/Cerebras support with the `cfRay` ID

### 429 Too Many Requests

**Cause:** Cerebras API rate limit exceeded.

**Resolution:**
- Retry logic handles this with backoff
- If frequent, check Cerebras dashboard for rate limits
- Consider upgrading Cerebras plan

### 5xx Server Errors

**Cause:** Cerebras API temporary outage.

**Resolution:**
- Retry logic handles transient issues
- Check https://status.cerebras.ai for outages

## Investigating User Issues

When a user reports an error:

1. **Get timing:** When did it happen? (for filtering errors)

2. **Check errors dashboard:**
   ```bash
   curl .../api/dashboard/errors?limit=20 | jq '.errors[] | select(.query | contains("their query"))'
   ```

3. **Look for patterns:**
   - Same IP/country for multiple errors? (network issue)
   - Same userAgent? (browser issue)
   - Same time window? (API outage)

4. **Real-time debug:**
   ```bash
   npx wrangler tail vitamix-generative-cerebras
   ```
   Ask user to try again while watching logs.

5. **Escalate if needed:**
   - Use `cfRay` for Cloudflare support
   - Check Cerebras dashboard for API-level issues

## Stress Testing

Two test scripts are available to simulate load and attempt to reproduce errors.

### Basic Stress Test

```bash
npx tsx test/stress-test.ts
```

Tests:
- Baseline (2 concurrent requests)
- Medium concurrency (5 concurrent)
- High concurrency (10 concurrent)
- Rapid sequential (5 requests, no delay)
- Burst pattern (3 bursts of 3 requests)

### Extreme Stress Test

```bash
npx tsx test/extreme-stress.ts
```

Tests:
- 20 concurrent requests
- 30 concurrent requests
- Sustained load (50 requests over 10 seconds)

### Stress Test Results (2024-12-02)

All tests passed with 100% success rate even under extreme load:

| Test | Requests | Success Rate |
|------|----------|--------------|
| 2 concurrent | 2 | 100% |
| 5 concurrent | 5 | 100% |
| 10 concurrent | 10 | 100% |
| 20 concurrent | 20 | 100% |
| 30 concurrent | 30 | 100% |
| 50 sustained | 50 | 100% |

**Conclusion:** 403 errors cannot be reproduced through load testing. This indicates user-specific 403 errors are caused by:

1. **Corporate network/proxy** - Enterprise proxies may modify headers or use flagged IPs
2. **IP reputation** - Shared corporate IPs may have poor reputation with Cloudflare
3. **SSL inspection** - Corporate MITM may break request signatures
4. **Browser fingerprint** - Corporate-managed browsers may trigger bot detection

### Troubleshooting User-Specific 403s

When a specific user consistently gets 403 errors:

1. **Ask them to try from mobile hotspot** - Bypasses corporate network
2. **Ask them to disable VPN** - VPN IPs often have poor reputation
3. **Try incognito mode** - Rules out extensions/cookies
4. **Try different browser** - Rules out browser fingerprint
5. **Check error logs** - Look for patterns in IP/userAgent

```bash
# After user tries again, check for their error
curl https://vitamix-generative-cerebras.paolo-moz.workers.dev/api/dashboard/errors
```

The logged `ip` and `userAgent` fields will help identify if it's a network-specific issue.
