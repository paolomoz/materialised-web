#!/bin/bash
#
# Full site re-crawl script
# Deploys updated crawler and re-indexes the entire Vitamix site
#
# Usage:
#   ./recrawl.sh           # Start fresh crawl (will prompt if existing crawl)
#   ./recrawl.sh --continue # Resume existing crawl without restarting
#   ./recrawl.sh --force    # Start fresh crawl without prompting
#

set -e

CRAWLER_URL="${CRAWLER_URL:-https://vitamix-crawler.paolo-moz.workers.dev}"
SITEMAP_URL="https://www.vitamix.com/us/en_us/sitemap.xml"
MAX_PAGES="${MAX_PAGES:-3000}"
BATCH_SIZE="${BATCH_SIZE:-20}"

# Parse arguments
CONTINUE_MODE=false
FORCE_MODE=false
for arg in "$@"; do
  case $arg in
    --continue)
      CONTINUE_MODE=true
      ;;
    --force)
      FORCE_MODE=true
      ;;
  esac
done

echo "========================================"
echo "Vitamix Full Site Re-crawl"
echo "========================================"
echo "Crawler URL: $CRAWLER_URL"
echo "Sitemap: $SITEMAP_URL"
echo "Max pages: $MAX_PAGES"
echo "Batch size: $BATCH_SIZE"
echo "========================================"
echo ""

# Check for existing crawl in progress
echo "Checking for existing crawl..."
EXISTING_STATUS=$(curl -s "$CRAWLER_URL/crawl/status")
EXISTING_PENDING=$(echo "$EXISTING_STATUS" | grep -o '"pendingCount":[0-9]*' | grep -o '[0-9]*' || echo "0")
EXISTING_PROCESSED=$(echo "$EXISTING_STATUS" | grep -o '"processedPages":[0-9]*' | grep -o '[0-9]*' || echo "0")

if [ "$EXISTING_PENDING" -gt 0 ]; then
  echo ""
  echo "WARNING: Existing crawl detected!"
  echo "  - Processed: $EXISTING_PROCESSED pages"
  echo "  - Pending: $EXISTING_PENDING pages"
  echo ""

  if [ "$CONTINUE_MODE" = true ]; then
    echo "Resuming existing crawl (--continue mode)..."
    echo ""
    # Skip deployment and sitemap fetch, jump straight to continue loop
    PENDING=$EXISTING_PENDING
    TOTAL_PROCESSED=$EXISTING_PROCESSED

    echo "[Resuming] Continuing crawl until complete..."
    echo ""

    ITERATION=1
    START_TIME=$(date +%s)

    while [ "$PENDING" -gt 0 ]; do
      echo "Iteration $ITERATION: Processed so far: $TOTAL_PROCESSED, Pending: $PENDING"
      RESPONSE=$(curl -s -X POST "$CRAWLER_URL/crawl/continue" -H "Content-Type: application/json")
      PENDING=$(echo "$RESPONSE" | grep -o '"pendingCount":[0-9]*' | grep -o '[0-9]*' || echo "0")
      PROCESSED=$(echo "$RESPONSE" | grep -o '"processed":[0-9]*' | grep -o '[0-9]*' || echo "0")
      TOTAL_PROCESSED=$((TOTAL_PROCESSED + PROCESSED))
      ITERATION=$((ITERATION + 1))
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
    echo ""
    echo "Final stats:"
    curl -s "$CRAWLER_URL/crawl/status" | python3 -m json.tool 2>/dev/null || curl -s "$CRAWLER_URL/crawl/status"
    exit 0
  fi

  if [ "$FORCE_MODE" = false ]; then
    echo "Starting a new crawl will OVERWRITE the existing progress."
    echo ""
    read -p "Do you want to: [r]esume existing, [o]verwrite, or [c]ancel? " choice
    case $choice in
      r|R)
        echo "Resuming existing crawl..."
        exec "$0" --continue
        ;;
      o|O)
        echo "Overwriting existing crawl..."
        ;;
      *)
        echo "Cancelled."
        exit 0
        ;;
    esac
  else
    echo "Force mode: overwriting existing crawl..."
  fi
fi

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
