#!/usr/bin/env python3
import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import quote

import requests

API_BASE = "https://jules.googleapis.com/v1alpha"
STATE_PATH = Path(__file__).resolve().parent.parent / "state" / "jules_state.json"

def _api_key(args):
    key = args.api_key or os.getenv("JULES_API_KEY")
    if not key:
        raise SystemExit("Missing API key: set --api-key or JULES_API_KEY")
    return key

def _headers(key):
    return {"x-goog-api-key": key, "Content-Type": "application/json"}

def _get(key, path, params=None, verbose=False):
    url = f"{API_BASE}{path}"
    if verbose:
        print(f"DEBUG: [GET] {url} params={params}", file=sys.stderr)
    r = requests.get(url, headers=_headers(key), params=params, timeout=60)
    if verbose:
        print(f"DEBUG: [RESPONSE] {r.status_code} body={r.text}", file=sys.stderr)
    r.raise_for_status()
    return r.json() if r.text.strip() else {}

def _post(key, path, payload=None, verbose=False):
    url = f"{API_BASE}{path}"
    if verbose:
        print(f"DEBUG: [POST] {url} payload={json.dumps(payload, ensure_ascii=False)}", file=sys.stderr)
    r = requests.post(url, headers=_headers(key), json=(payload or {}), timeout=60)
    if verbose:
        print(f"DEBUG: [RESPONSE] {r.status_code} body={r.text}", file=sys.stderr)
    r.raise_for_status()
    return r.json() if r.text.strip() else {}

def _save_state(data):
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    if STATE_PATH.exists():
        try:
            old = json.loads(STATE_PATH.read_text(encoding="utf-8"))
        except Exception:
            old = {}
    else:
        old = {}
    old.update(data)
    STATE_PATH.write_text(json.dumps(old, ensure_ascii=False, indent=2), encoding="utf-8")

def _load_state():
    if not STATE_PATH.exists():
        return {}
    try:
        return json.loads(STATE_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}

def cmd_list_sources(args):
    key = _api_key(args)
    data = _get(key, "/sources", verbose=args.verbose)
    sources = data.get("sources", [])
    if args.filter:
        sources = [s for s in sources if args.filter.lower() in s.get("name", "").lower()]
    print(json.dumps({"sources": sources}, ensure_ascii=False, indent=2))

def _create_session(key, source, prompt, title, branch, automation_mode="AUTO_CREATE_PR", verbose=False):
    payload = {
        "prompt": prompt,
        "sourceContext": {
            "source": source,
            "githubRepoContext": {"startingBranch": branch},
        },
        "automationMode": automation_mode,
        "title": title,
    }
    return _post(key, "/sessions", payload, verbose=verbose)

def _resolve_prompt(args):
    if args.prompt:
        return args.prompt
    if args.prompt_file:
        return Path(args.prompt_file).read_text(encoding="utf-8")
    return None

def cmd_trigger(args):
    key = _api_key(args)
    prompt = _resolve_prompt(args)
    if not prompt:
        raise SystemExit("Missing prompt: Provide --prompt or --prompt-file")
    sess = _create_session(key, args.source, prompt, args.title, args.branch, args.automation_mode, verbose=args.verbose)
    _save_state({"lastSession": sess.get("name"), "source": args.source})
    print(json.dumps(sess, ensure_ascii=False, indent=2))

def _list_sessions(key, page_size=50, verbose=False):
    data = _get(key, "/sessions", {"pageSize": page_size}, verbose=verbose)
    return data.get("sessions", [])

def _session_source_name(s):
    return ((s.get("sourceContext") or {}).get("source") or "")

def _extract_pr_urls(session):
    urls = []
    for out in session.get("outputs", []) or []:
        pr = out.get("pullRequest") or {}
        url = pr.get("url")
        if url:
            urls.append(url)
    return urls

def _latest_for_source(key, source):
    sessions = _list_sessions(key)
    filtered = [s for s in sessions if _session_source_name(s) == source]
    if not filtered:
        return None
    # API usually returns desc; keep first as latest
    return filtered[0]

def cmd_latest(args):
    key = _api_key(args)
    sessions = _list_sessions(key, verbose=args.verbose)
    filtered = [s for s in sessions if _session_source_name(s) == args.source]
    if not filtered:
        print(json.dumps({"found": False, "source": args.source}, ensure_ascii=False, indent=2))
        return
    s = filtered[0]
    out = {
        "found": True,
        "name": s.get("name"),
        "id": s.get("id"),
        "title": s.get("title"),
        "prompt": s.get("prompt"),
        "prUrls": _extract_pr_urls(s),
        "raw": s,
    }
    print(json.dumps(out, ensure_ascii=False, indent=2))

def _merge_pr(pr_url, method="squash"):
    cmd = ["gh", "pr", "merge", pr_url, f"--{method}", "--delete-branch"]
    r = subprocess.run(cmd, capture_output=True, text=True)
    return {
        "ok": r.returncode == 0,
        "command": " ".join(cmd),
        "stdout": r.stdout.strip(),
        "stderr": r.stderr.strip(),
    }

def cmd_cycle(args):
    key = _api_key(args)
    sessions = _list_sessions(key, verbose=args.verbose)
    latest = None
    filtered = [s for s in sessions if _session_source_name(s) == args.source]
    if filtered:
        latest = filtered[0]

    status = {
        "source": args.source,
        "latestSession": latest.get("name") if latest else None,
        "merged": [],
        "triggered": None,
        "note": "",
    }

    pr_urls = _extract_pr_urls(latest) if latest else []

    if args.merge == "yes" and pr_urls:
        merge_result = _merge_pr(pr_urls[0], method=args.merge_method)
        status["merged"].append({"pr": pr_urls[0], **merge_result})
    elif args.merge == "yes":
        status["note"] = "No PR found from latest Jules session."

    next_prompt = _resolve_prompt(args)
    if next_prompt:
        title = args.title or "jules-next-step"
        created = _create_session(key, args.source, next_prompt, title, args.branch, args.automation_mode, verbose=args.verbose)
        status["triggered"] = {"name": created.get("name"), "id": created.get("id"), "title": created.get("title")}
        _save_state({"lastSession": created.get("name"), "source": args.source})

    print(json.dumps(status, ensure_ascii=False, indent=2))

def build_parser():
    p = argparse.ArgumentParser(description="Jules API helper for async trigger/check/merge cycle")
    p.add_argument("--verbose", action="store_true", help="Enable verbose debug logging")
    sub = p.add_subparsers(dest="cmd", required=True)

    ps = sub.add_parser("list-sources")
    ps.add_argument("--api-key")
    ps.add_argument("--filter")
    ps.set_defaults(func=cmd_list_sources)

    pt = sub.add_parser("trigger")
    pt.add_argument("--api-key")
    pt.add_argument("--source", required=True)
    mg = pt.add_mutually_exclusive_group(required=True)
    mg.add_argument("--prompt")
    mg.add_argument("--prompt-file", help="Read prompt from this file")
    pt.add_argument("--title", default="jules-task")
    pt.add_argument("--branch", default="main")
    pt.add_argument("--automation-mode", default="AUTO_CREATE_PR")
    pt.set_defaults(func=cmd_trigger)

    pl = sub.add_parser("latest")
    pl.add_argument("--api-key")
    pl.add_argument("--source", required=True)
    pl.set_defaults(func=cmd_latest)

    pc = sub.add_parser("cycle")
    pc.add_argument("--api-key")
    pc.add_argument("--repo", help="owner/repo (for bookkeeping)")
    pc.add_argument("--source", required=True)
    pc.add_argument("--branch", default="main")
    mgc = pc.add_mutually_exclusive_group()
    mgc.add_argument("--next-prompt")
    mgc.add_argument("--prompt-file", help="Read next prompt from this file")
    pc.add_argument("--title")
    pc.add_argument("--automation-mode", default="AUTO_CREATE_PR")
    pc.add_argument("--merge", choices=["yes", "no"], default="yes")
    pc.add_argument("--merge-method", choices=["squash", "merge", "rebase"], default="squash")
    pc.set_defaults(func=cmd_cycle)

    return p

def main():
    parser = build_parser()
    args = parser.parse_args()
    try:
        args.func(args)
    except requests.HTTPError as e:
        body = e.response.text if e.response is not None else str(e)
        print(json.dumps({"error": "http_error", "status": e.response.status_code if e.response is not None else None, "body": body}, ensure_ascii=False, indent=2))
        sys.exit(1)

if __name__ == "__main__":
    main()
