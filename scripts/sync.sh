#!/usr/bin/env bash
# Spiegelt https://keyset.cloud/kurtaxe/v1/ nach v1/. Bricht ab, statt Daten zu löschen, wenn etwas nicht stimmt.
set -euo pipefail

base="https://keyset.cloud/kurtaxe/v1"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

get() {
  curl --fail --silent --show-error --location --retry 3 --retry-delay 5 --max-time 60 \
    --user-agent "keysethq/kurtaxe-daten sync (+https://github.com/keysethq/kurtaxe-daten)" \
    --output "$tmp/$1" "$base/$1"
}

get orte.json
jq -e '.version == 1 and (.places | type == "array")' "$tmp/orte.json" >/dev/null

count="$(jq '.places | length' "$tmp/orte.json")"
before=0
[ -f v1/orte.json ] && before="$(jq '.places | length' v1/orte.json)"
if [ "$count" -lt 100 ] || [ "$count" -lt $((before * 9 / 10)) ]; then
  echo "::error::orte.json nennt $count Orte, vorher $before. Das sieht nach einem Fehler aus, nichts wird übernommen."
  exit 1
fi

for file in orte.csv aenderungen.json kurtaxe.js; do get "$file"; done
jq empty "$tmp/aenderungen.json"

jq -r '.places[].slug' "$tmp/orte.json" > "$tmp/.slugs"
while read -r slug; do
  if [[ ! "$slug" =~ ^[a-z0-9-]+$ ]]; then
    echo "::error::Unerwarteter Kurzname: $slug"
    exit 1
  fi
  get "$slug.json"
  jq -e --arg slug "$slug" '.slug == $slug' "$tmp/$slug.json" >/dev/null
done < "$tmp/.slugs"
rm "$tmp/.slugs"

rm -rf v1
mkdir v1
cp "$tmp"/* v1/
echo "$count Orte geholt."
