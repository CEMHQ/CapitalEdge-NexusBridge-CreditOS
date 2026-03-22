#!/usr/bin/env bash
# scripts/rls-audit/check-policies.sh
# Usage: ./scripts/rls-audit/check-policies.sh
# Set DATABASE_URL in your environment before running.
# In CI: add this as a step before supabase db push.

set -euo pipefail

AUDIT_SQL="scripts/rls-audit/audit.sql"
BASELINE="scripts/rls-audit/baseline.json"
PRE_SNAPSHOT="/tmp/rls_pre_snapshot.json"
POST_SNAPSHOT="/tmp/rls_post_snapshot.json"
POST_FINDINGS="/tmp/rls_post_findings.txt"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is not set."
  exit 1
fi

echo "=== RLS Audit: pre-migration snapshot ==="
psql "$DATABASE_URL" \
  -c "COPY (
    SELECT jsonb_agg(row_to_json(p) ORDER BY tablename, policyname)
    FROM pg_policies p WHERE schemaname = 'public'
  ) TO STDOUT" > "$PRE_SNAPSHOT"

echo "=== Running migration ==="
supabase db push

echo "=== RLS Audit: post-migration findings ==="
psql "$DATABASE_URL" -f "$AUDIT_SQL" \
  --csv --tuples-only > "$POST_FINDINGS" 2>&1

CRITICAL_COUNT=$(grep -c "^CRITICAL," "$POST_FINDINGS" || true)
HIGH_COUNT=$(grep -c "^HIGH," "$POST_FINDINGS" || true)
MEDIUM_COUNT=$(grep -c "^MEDIUM," "$POST_FINDINGS" || true)

echo ""
echo "Results: ${CRITICAL_COUNT} critical, ${HIGH_COUNT} high, ${MEDIUM_COUNT} medium"
echo ""

if [[ "$CRITICAL_COUNT" -gt 0 ]]; then
  echo "=== CRITICAL FINDINGS — migration blocked ==="
  grep "^CRITICAL," "$POST_FINDINGS"
  echo ""
  echo "Fix these before merging. See scripts/rls-audit/audit.sql for remediation guidance."
  exit 1
fi

if [[ "$HIGH_COUNT" -gt 0 ]]; then
  echo "=== HIGH FINDINGS — review required ==="
  grep "^HIGH," "$POST_FINDINGS"
  echo ""
  echo "WARNING: High severity findings detected. Create a follow-up issue before merging."
  # Does not block — but leaves a visible warning in CI output
fi

if [[ "$MEDIUM_COUNT" -gt 0 ]]; then
  echo "=== MEDIUM FINDINGS ==="
  grep "^MEDIUM," "$POST_FINDINGS"
fi

echo ""
echo "=== Updating baseline snapshot ==="
psql "$DATABASE_URL" \
  -c "COPY (
    SELECT jsonb_agg(row_to_json(p) ORDER BY tablename, policyname)
    FROM pg_policies p WHERE schemaname = 'public'
  ) TO STDOUT" > "$BASELINE"

echo "Baseline updated. Commit scripts/rls-audit/baseline.json to git."
echo "=== RLS audit complete ==="
