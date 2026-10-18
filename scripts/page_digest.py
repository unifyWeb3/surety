"""Reproduce the digest a Surety check recorded for the page it read.

The contract stores ``sha256(normalize(fetched text))`` for every activation and every check. This
script computes the same value from your own fetch, using the same normalization steps, so you can
compare two numbers instead of trusting a sentence. It is the reader's half of the claim in
state/DESIGN.md section 1: sources are served through caches nobody here controls, and this is how
you tell whether the contract and you read the same copy.

Usage:
  python scripts/page_digest.py <url>
  python scripts/page_digest.py <url> --compare <digest from the covenant page>
"""

from __future__ import annotations

import argparse
import hashlib
import re
import sys
import unicodedata
import urllib.request

# Copied from contracts/surety.py so the arithmetic is identical. If the contract's normalization
# ever changes, these must change with it -- a digest helper that normalizes differently produces
# different numbers and would look like evidence of a cache miss when there is none.
MAX_TEXT = 200_000
MAX_BODY_SCAN = 400_000
_TAG_RE = re.compile(r"<[^>]*>")
_SCRIPT_RE = re.compile(r"(?is)<(script|style)\b.*?</\1\s*>")
_COMMENT_RE = re.compile(r"(?s)<!--.*?-->")
_WS_RE = re.compile(r"[\s\u00a0\u200b\u200c\u200d\u2060\ufeff]+")
_HTML_HINT_RE = re.compile(r"(?is)<\s*(html|body|div|p|span|head|a|br|meta)\b")


def strip_markup(raw: str) -> str:
	out = _COMMENT_RE.sub(" ", raw)
	out = _SCRIPT_RE.sub(" ", out)
	out = _TAG_RE.sub(" ", out)
	return (
		out.replace("&nbsp;", " ")
		.replace("&amp;", "&")
		.replace("&lt;", "<")
		.replace("&gt;", ">")
		.replace("&quot;", '"')
		.replace("&#39;", "'")
	)


def normalize_text(raw: str) -> str:
	folded = unicodedata.normalize("NFKC", raw)
	return _WS_RE.sub(" ", folded).strip()[:MAX_TEXT]


def text_of(status: int, body: bytes | None) -> str:
	if status < 200 or status >= 300 or body is None:
		return ""
	raw = bytes(body)[:MAX_BODY_SCAN].decode("utf-8", errors="replace")
	if _HTML_HINT_RE.search(raw):
		raw = strip_markup(raw)
	return normalize_text(raw)


def fetch(url: str) -> tuple[int, bytes | None]:
	request = urllib.request.Request(url, headers={"User-Agent": "surety-page-digest/1"})
	try:
		with urllib.request.urlopen(request, timeout=30) as response:  # noqa: S310 - the URL is the point
			return response.status, response.read()
	except urllib.error.HTTPError as error:
		return error.code, None
	except Exception as error:  # transport failure: reported, not hidden
		print("fetch failed: %s" % error, file=sys.stderr)
		return 0, None


def main() -> int:
	parser = argparse.ArgumentParser()
	parser.add_argument("url")
	parser.add_argument("--compare", default=None, help="the digest the covenant shows")
	args = parser.parse_args()

	status, body = fetch(args.url)
	text = text_of(status, body)
	if text == "":
		print("status %s: nothing readable was returned, so no digest exists" % status)
		return 1

	digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
	print("url:    %s" % args.url)
	print("status: %s" % status)
	print("bytes:  %d fetched, %d characters after normalization" % (len(body or b""), len(text)))
	print("sha256: %s" % digest)

	if args.compare:
		same = digest == args.compare.strip().lower()
		print("recorded on chain: %s" % args.compare.strip())
		print("identical: %s" % ("yes -- you and the contract read the same text" if same else "NO -- one of you read a different copy (a cache, or a change since the check)"))
		return 0 if same else 4
	return 0


if __name__ == "__main__":
	raise SystemExit(main())
