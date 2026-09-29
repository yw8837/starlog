#!/usr/bin/env python3
"""Download the 1909 Rider-Waite-Smith scans (public domain) from Wikimedia Commons.

Source category: Category:Rider-Waite tarot deck (Roses & Lilies), files named "File:RWS1909 - ...".
Writes the jpgs and manifest.json to assets/cards/rws1909/ (jpgs are gitignored, manifest is tracked).
Stdlib only. Re-runnable: files already present with a matching size are skipped.
"""
import hashlib
import html
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://commons.wikimedia.org/w/api.php"
CATEGORY = "Category:Rider-Waite tarot deck (Roses & Lilies)"
TITLE_PREFIX = "File:RWS1909"
USER_AGENT = "starlog-dev/0.1 (contact: bsfire1237@gmail.com)"
OUT_DIR = Path(__file__).resolve().parent.parent / "assets" / "cards" / "rws1909"
MAX_TRIES = 8
DOWNLOAD_DELAY = 1.5

SUITS = {"wands", "cups", "swords", "pentacles"}


def http_get(url: str) -> bytes:
    """GET with the project User-Agent; on HTTP 429 sleep 5*(attempt+1)s, up to MAX_TRIES tries."""
    for attempt in range(MAX_TRIES):
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return resp.read()
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < MAX_TRIES - 1:
                wait = 5 * (attempt + 1)
                print(f"  429, retry in {wait}s (attempt {attempt + 1}/{MAX_TRIES})", file=sys.stderr)
                time.sleep(wait)
                continue
            raise
    raise RuntimeError(f"unreachable: {url}")


def api(params: dict) -> dict:
    query = urllib.parse.urlencode({**params, "format": "json"})
    return json.loads(http_get(f"{API}?{query}"))


def slug(title: str) -> str:
    """'File:RWS1909 - 09 Hermit.jpeg' -> 'major-09-hermit.jpg'; 'File:RWS1909 - Wands 01.jpeg' -> 'wands-01.jpg'."""
    m = re.match(r"^File:RWS1909 - (.+)\.jpe?g$", title, re.IGNORECASE)
    if not m:
        raise ValueError(f"unexpected title: {title}")
    words = m.group(1).strip().lower().split()
    if words[0] in SUITS:
        return f"{words[0]}-{words[1]}.jpg"
    if words[0].isdigit():
        return f"major-{words[0]}-{'-'.join(words[1:])}.jpg"
    raise ValueError(f"unexpected title: {title}")


def list_titles() -> list[str]:
    titles: list[str] = []
    params = {
        "action": "query", "list": "categorymembers", "cmtitle": CATEGORY,
        "cmtype": "file", "cmlimit": "500",
    }
    while True:
        data = api(params)
        titles += [m["title"] for m in data["query"]["categorymembers"] if m["title"].startswith(TITLE_PREFIX)]
        if "continue" not in data:
            return sorted(titles)
        params.update(data["continue"])


def image_infos(titles: list[str]) -> dict[str, dict]:
    infos: dict[str, dict] = {}
    for i in range(0, len(titles), 50):
        data = api({
            "action": "query", "titles": "|".join(titles[i:i + 50]),
            "prop": "imageinfo", "iiprop": "url|size|sha1|extmetadata",
        })
        for page in data["query"]["pages"].values():
            info = page["imageinfo"][0]
            meta = info.get("extmetadata", {})
            infos[page["title"]] = {
                "title": page["title"],
                "url": info["url"],
                "w": info["width"],
                "h": info["height"],
                "bytes": info["size"],
                "sha1": info["sha1"],
                "license": meta.get("LicenseShortName", {}).get("value", ""),
                "artist": html.unescape(re.sub(r"<[^>]+>", "", meta.get("Artist", {}).get("value", ""))).strip(),
            }
    return infos


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    titles = list_titles()
    print(f"{len(titles)} files in category")
    infos = image_infos(titles)
    manifest = []
    for title in titles:
        entry = infos[title]
        entry["file"] = slug(title)
        dest = OUT_DIR / entry["file"]
        if dest.exists() and dest.stat().st_size == entry["bytes"]:
            print(f"skip {entry['file']}")
        else:
            print(f"get  {entry['file']}")
            blob = http_get(entry["url"])
            digest = hashlib.sha1(blob).hexdigest()
            if digest != entry["sha1"]:
                raise RuntimeError(f"sha1 mismatch for {entry['file']}: {digest} != {entry['sha1']}")
            dest.write_bytes(blob)
            time.sleep(DOWNLOAD_DELAY)
        manifest.append(entry)
    manifest.sort(key=lambda e: e["file"])
    (OUT_DIR / "manifest.json").write_text(
        json.dumps(manifest, indent=1, ensure_ascii=False), encoding="utf-8"
    )
    print(f"wrote manifest.json ({len(manifest)} entries)")


if __name__ == "__main__":
    main()
