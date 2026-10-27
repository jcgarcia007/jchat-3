#!/usr/bin/env bash
# JChat 3.0 — baseline: PRINTS the `supabase migration repair` commands for production. It never runs them and never touches the network.
#
#   1) Run this yourself, read-only:      supabase migration list --linked > /tmp/remote-migrations.txt
#   2) Then, with that file:              bash supabase/scripts/baseline_repair_commands.sh /tmp/remote-migrations.txt
#   3) Read what it prints. Run the printed commands yourself, in order, ONLY after the baseline branch is merged.
#
# What `migration repair` does: it edits ONE table, supabase_migrations.schema_migrations (the CLI's own bookkeeping): `--status reverted V`
# deletes the row of version V, `--status applied V` inserts it. It does not run any migration file, does not read or change the
# schema or any data. The point is only that the history says the same thing as the folder: a single applied version, the baseline.
set -eu

BASELINE_VERSION="${BASELINE_VERSION:-245}"
LIST="${1:?usage: baseline_repair_commands.sh <file with the output of: supabase migration list --linked>}"

# The Remote column (2nd) of `supabase migration list --linked`: "  Local | Remote | Time (UTC)". Rows without a remote version are skipped.
remote="$(awk -F'|' '{ gsub(/[[:space:]]/, "", $2); print $2 }' "$LIST" | grep -E '^[0-9]+[A-Za-z]*$' | sort -u || true)"

echo "# Remote versions found: $(printf '%s\n' "$remote" | grep -c . || true)"
echo
echo "# A) Remove every remote version except the baseline from the history (bookkeeping rows only)."
others="$(printf '%s\n' "$remote" | grep -v -x "$BASELINE_VERSION" || true)"
if [ -n "$others" ]; then
  # one command per 50 versions keeps each line readable
  printf '%s\n' "$others" | xargs -n 50 echo supabase migration repair --status reverted --linked
else
  echo "# (nothing to revert)"
fi
echo
echo "# B) Record the baseline as applied (it is already in production: this stops 'supabase db push' from running it)."
echo "supabase migration repair --status applied $BASELINE_VERSION --linked"
echo
echo "# C) Check (read-only): both columns must show only $BASELINE_VERSION."
echo "supabase migration list --linked"
