#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.8"
# dependencies = [
#   "langcodes>=3.4.0",
#   "pycountry>=24.6.1",
#   "rich>=13.7.0",
# ]
# ///

from __future__ import annotations

import argparse
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict

import langcodes
import pycountry
from rich.console import Console
from rich.table import Table

ASSET_RE = re.compile(
  r"^Fastest\.Emoji\.Search-"
  r"(?P<lang>.+)-"
  r"(?P<flavor>apple|joypixels)"
  r"\.alfredworkflow$"
)


def fetch_releases(repo: str) -> list[dict]:
  headers = {
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  }
  token = os.getenv("GITHUB_TOKEN")
  if token:
    headers["Authorization"] = f"Bearer {token}"

  releases: list[dict] = []
  page = 1
  while True:
    base = f"https://api.github.com/repos/{repo}/releases"
    query = urllib.parse.urlencode({
      "per_page": 100,
      "page": page,
    })
    url = f"{base}?{query}"
    req = urllib.request.Request(url, headers=headers)
    try:
      with urllib.request.urlopen(req, timeout=30) as res:
        page_data = json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
      raise RuntimeError(
        f"GitHub API error {exc.code}: {exc.reason}"
      ) from exc
    if not page_data:
      break
    releases.extend(page_data)
    page += 1
  return releases


def aggregate_downloads(releases: list[dict]) -> dict[str, dict[str, int]]:
  counts: dict[str, dict[str, int]] = defaultdict(
    lambda: {"apple": 0, "joypixels": 0}
  )
  for release in releases:
    if release.get("draft"):
      continue
    for asset in release.get("assets", []):
      name = asset.get("name", "")
      match = ASSET_RE.match(name)
      if not match:
        continue
      lang = match.group("lang")
      flavor = match.group("flavor")
      downloads = int(asset.get("download_count", 0))
      if "downloadCount" in asset:
        downloads = int(asset["downloadCount"])
      counts[lang][flavor] += downloads
  return counts


def language_name(code: str) -> str:
  try:
    parsed = langcodes.Language.get(code)
    base_name = code
    lang = parsed.language
    if lang:
      try:
        lang_info = (
          pycountry.languages.get(alpha_2=lang)
          or pycountry.languages.get(alpha_3=lang)
          or pycountry.languages.lookup(lang)
        )
        base_name = lang_info.name
      except LookupError:
        base_name = lang
    if base_name.endswith(" (macrolanguage)"):
      base_name = base_name.replace(" (macrolanguage)", "")

    extras = []
    if parsed.script:
      if parsed.script == "Hant":
        extras.append("Traditional")
      elif parsed.script == "Hans":
        extras.append("Simplified")
      else:
        script = pycountry.scripts.get(alpha_4=parsed.script)
        extras.append(script.name if script else parsed.script)

    if parsed.territory:
      country = pycountry.countries.get(alpha_2=parsed.territory)
      extras.append(country.name if country else parsed.territory)

    if extras:
      return f"{base_name} ({', '.join(extras)})"
    return base_name
  except Exception:
    return code


def print_table(counts: dict[str, dict[str, int]]) -> None:
  rows = []
  for lang, values in counts.items():
    apple = values["apple"]
    joy = values["joypixels"]
    total = apple + joy
    rows.append((lang, language_name(lang), apple, joy, total))

  rows.sort(key=lambda item: (-item[4], item[1]))

  all_apple = sum(row[2] for row in rows)
  all_joy = sum(row[3] for row in rows)
  all_total = sum(row[4] for row in rows)

  table = Table(title="Release Asset Downloads by Language")
  table.add_column("Language")
  table.add_column("Apple", justify="right")
  table.add_column("JoyPixels", justify="right")
  table.add_column("Total", justify="right")

  table.add_row(
    "All",
    str(all_apple),
    str(all_joy),
    str(all_total),
    style="bold",
  )
  for _, display_lang, apple, joy, total in rows:
    table.add_row(
      display_lang,
      str(apple),
      str(joy),
      str(total),
    )

  Console().print(table)


def release_label(release: dict) -> str:
  tag = release.get("tag_name") or "<no-tag>"
  name = release.get("name") or ""
  if name and name != tag:
    return f"{tag} ({name})"
  return str(tag)


def print_release_summary(releases: list[dict]) -> None:
  console = Console()
  downloaded = [release_label(r) for r in releases]
  considered = [
    release_label(r)
    for r in releases
    if not r.get("draft")
  ]

  console.print(
    f"Downloaded release metadata for {len(downloaded)} releases:"
  )
  for label in downloaded:
    console.print(f"- {label}")

  console.print(
    f"\nConsidered {len(considered)} non-draft releases "
    "for aggregation:"
  )
  for label in considered:
    console.print(f"- {label}")


def main() -> None:
  parser = argparse.ArgumentParser(
    description=(
      "Download all releases from a GitHub repo and print "
      "language-wise asset download totals."
    )
  )
  parser.add_argument(
    "--repo",
    default="mr-pennyworth/alfred-fastest-emoji",
    help="GitHub repo in owner/name format.",
  )
  args = parser.parse_args()

  releases = fetch_releases(args.repo)
  print_release_summary(releases)
  counts = aggregate_downloads(releases)
  print_table(counts)


if __name__ == "__main__":
  main()
