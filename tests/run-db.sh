#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
portal_test_container="valentina-access-test-$$"
docker run --detach --name "$portal_test_container" --network none \
  -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17-alpine >/dev/null
trap 'docker rm -f "$portal_test_container" >/dev/null' EXIT
for attempt in {1..50}; do
  if docker exec "$portal_test_container" pg_isready -U postgres >/dev/null 2>&1; then break; fi
  sleep 0.2
done
run_sql() { docker exec -i "$portal_test_container" psql -U postgres -v ON_ERROR_STOP=1 < "$1"; }
run_sql tests/database-bootstrap.sql
run_sql supabase/portal.sql
# A second application must preserve profiles and keep policy setup repeatable.
run_sql supabase/portal.sql
run_sql supabase/teacher.sql
run_sql tests/portal-access.sql
