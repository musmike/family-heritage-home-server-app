#!/bin/sh
# One-shot demo data loader: imports /seed/demo-family.ged through the public
# REST API (the same calls the GEDCOM import wizard makes) and sets the default
# proband for the ancestor tree. Safe to re-run: it does nothing if people exist.
set -eu

API="${API_URL:-http://backend:8080/api}"
USERNAME="${SEED_USERNAME:-musmike}"
PASSWORD="${SEED_PASSWORD:-student}"
GED_FILE="${GED_FILE:-/seed/demo-family.ged}"
PROBAND_GIVEN="${PROBAND_GIVEN:-Michał}"
PROBAND_SURNAME="${PROBAND_SURNAME:-Zieliński}"
JAR=/tmp/cookies.txt

log() { echo "[seed] $*"; }

log "Logging in as ${USERNAME}"
ok=0
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -sf -c "$JAR" -H 'Content-Type: application/json' \
       -d "{\"username\":\"${USERNAME}\",\"password\":\"${PASSWORD}\"}" \
       "${API}/auth/login" -o /dev/null; then ok=1; break; fi
  log "Backend not ready (attempt ${i}), retrying..."; sleep 3
done
[ "$ok" = 1 ] || { log "Login failed"; exit 1; }

XSRF=$(awk '$6=="XSRF-TOKEN"{print $7}' "$JAR")
[ -n "$XSRF" ] || { log "No XSRF-TOKEN cookie received"; exit 1; }

get()  { curl -sf -b "$JAR" "$@"; }
send() { curl -sf -b "$JAR" -H "X-XSRF-TOKEN: ${XSRF}" "$@"; }
json() { send -H 'Content-Type: application/json' "$@"; }

existing=$(get "${API}/gedcom/import/sessions/lookup/people?query=" | jq 'length')
if [ "$existing" -gt 0 ]; then
  log "Database already contains ${existing} people - skipping import."
  exit 0
fi

# An unfinished session (e.g. from an interrupted earlier run) would block a new one.
active=$(get "${API}/gedcom/import/sessions/active" || true)
if [ -n "$active" ]; then
  old_id=$(echo "$active" | jq -r '.sessionId')
  log "Cancelling unfinished import session ${old_id}"
  send -X DELETE "${API}/gedcom/import/sessions/${old_id}" -o /dev/null
fi

log "Uploading ${GED_FILE}"
session=$(send -F "file=@${GED_FILE};filename=demo-family.ged" "${API}/gedcom/import/sessions")
sid=$(echo "$session" | jq -r '.sessionId')

log "Confirming individuals (session ${sid})"
session=$(echo "$session" \
  | jq '[.individualMatches[] | {gedRefId: .gedcomIndividual.gedRefId, action: "CREATE_NEW", targetPersonId: null}]' \
  | json -X POST --data-binary @- "${API}/gedcom/import/sessions/${sid}/individuals")

log "Confirming families"
session=$(echo "$session" \
  | jq '[.familyMatches[] | {gedRefId: .gedcomFamily.gedRefId, action: "CREATE_NEW", targetFamilyId: null}]' \
  | json -X POST --data-binary @- "${API}/gedcom/import/sessions/${sid}/families")

log "Applying import"
echo '[]' | json -X POST --data-binary @- "${API}/gedcom/import/sessions/${sid}/apply" -o /dev/null

pid=$(get -G --data-urlencode "query=${PROBAND_SURNAME}" "${API}/gedcom/import/sessions/lookup/people" \
  | jq -r --arg g "$PROBAND_GIVEN" '[.[] | select(.givenName == $g)][0].personId // empty')
if [ -n "$pid" ]; then
  log "Setting default proband (person ${pid})"
  send -X PUT "${API}/biographies/${pid}/default-proband" -o /dev/null
else
  log "Proband ${PROBAND_GIVEN} ${PROBAND_SURNAME} not found - leaving default"
fi

log "Done."