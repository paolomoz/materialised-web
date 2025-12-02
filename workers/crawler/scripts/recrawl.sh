#!/bin/bash
#
# Full site re-crawl script
# Deploys updated crawler and re-indexes the entire Vitamix site
#

set -e

CRAWLER_URL="${CRAWLER_URL:-https://vitamix-crawler.paolo-moz.workers.dev}"
SITEMAP_URL="https://www.vitamix.com/us/en_us/sitemap.xml"
MAX_PAGES="${MAX_PAGES:-3000}"
BATCH_SIZE="${BATCH_SIZE:-20}"

echo "========================================"
echo "Vitamix Full Site Re-crawl"
echo "========================================"
echo "Crawler URL: $CRAWLER_URL"
echo "Sitemap: $SITEMAP_URL"
echo "Max pages: $MAX_PAGES"
echo "Batch size: $BATCH_SIZE"
echo "========================================"
echo ""

# Deploy the updated crawler first
echo "[1/3] Deploying updated crawler..."
cd "$(dirname "$0")/.."
npx wrangler deploy
echo "Crawler deployed."
echo ""

# Start the crawl from sitemap
echo "[2/3] Starting crawl from sitemap..."
RESPONSE=$(curl -s -X POST "$CRAWLER_URL/crawl/sitemap" \
  -H "Content-Type: application/json" \
  -d "{
    \"sitemapUrl\": \"$SITEMAP_URL\",
    \"maxPages\": $MAX_PAGES,
    \"batchSize\": $BATCH_SIZE
  }")

echo "Initial response: $RESPONSE"

# Extract pending count
PENDING=$(echo "$RESPONSE" | grep -o '"pendingCount":[0-9]*' | grep -o '[0-9]*' || echo "0")
PROCESSED=$(echo "$RESPONSE" | grep -o '"processed":[0-9]*' | grep -o '[0-9]*' || echo "0")
TOTAL_PROCESSED=$PROCESSED

echo ""
echo "[3/3] Continuing crawl until complete..."
echo ""

ITERATION=1
START_TIME=$(date +%s)

while [ "$PENDING" -gt 0 ]; do
  echo "Iteration $ITERATION: Processed so far: $TOTAL_PROCESSED, Pending: $PENDING"

  # Continue the crawl
  RESPONSE=$(curl -s -X POST "$CRAWLER_URL/crawl/continue" \
    -H "Content-Type: application/json")

  # Extract counts
  PENDING=$(echo "$RESPONSE" | grep -o '"pendingCount":[0-9]*' | grep -o '[0-9]*' || echo "0")
  PROCESSED=$(echo "$RESPONSE" | grep -o '"processed":[0-9]*' | grep -o '[0-9]*' || echo "0")
  TOTAL_PROCESSED=$((TOTAL_PROCESSED + PROCESSED))

  ITERATION=$((ITERATION + 1))

  # Small delay to avoid hammering
  sleep 1
done

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
MINUTES=$((DURATION / 60))
SECONDS=$((DURATION % 60))

echo ""
echo "========================================"
echo "Crawl Complete!"
echo "========================================"
echo "Total pages processed: $TOTAL_PROCESSED"
echo "Time elapsed: ${MINUTES}m ${SECONDS}s"
echo "========================================"

# Get final stats
echo ""
echo "Final stats:"
curl -s "$CRAWLER_URL/crawl/status" | python3 -m json.tool 2>/dev/null || curl -s "$CRAWLER_URL/crawl/status"
