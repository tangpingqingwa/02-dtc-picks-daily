#!/usr/bin/env python3
"""Compute the occupied later-rail cascade. Grepping source numbers is not enough."""
from __future__ import annotations

import re
import sys
from pathlib import Path


def stylesheet_css(src: str) -> str:
    start = src.find("`")
    end = src.rfind("`")
    if start < 0 or end <= start:
        raise SystemExit("BOARD_CSS template missing")
    return src[start + 1 : end]


def strip_css_comments(text: str) -> str:
    return re.sub(r"/\*.*?\*/", "", text, flags=re.S)


def specificity(selector: str) -> tuple[int, int, int]:
    ids = len(re.findall(r"#[A-Za-z_-][\w-]*", selector))
    classes = len(re.findall(r"\.[A-Za-z_-][\w-]*", selector))
    attrs = len(re.findall(r"\[[^\]]+\]", selector))
    pseudos = 0
    for m in re.finditer(r":(?!:)([A-Za-z_-]+)", selector):
        if m.group(1) in ("has", "is", "not", "where", "before", "after"):
            continue
        pseudos += 1
    tmp = selector
    tmp = re.sub(r"::[A-Za-z_-]+", " ", tmp)
    tmp = re.sub(r":[A-Za-z_-]+(\([^)]*\))?", " ", tmp)
    tmp = re.sub(r"#[A-Za-z_-][\w-]*", " ", tmp)
    tmp = re.sub(r"\.[A-Za-z_-][\w-]*", " ", tmp)
    tmp = re.sub(r"\[[^\]]+\]", " ", tmp)
    tmp = re.sub(r"[>+~*]", " ", tmp)
    types = len([t for t in tmp.split() if re.match(r"^[A-Za-z_-][\w-]*$", t)])
    return (ids, classes + attrs + pseudos, types)


def split_selector_list(selector: str) -> list[str]:
    parts: list[str] = []
    buf: list[str] = []
    depth = 0
    for ch in selector:
        if ch in "[(":
            depth += 1
        elif ch in "])":
            depth = max(0, depth - 1)
        if ch == "," and depth == 0:
            part = "".join(buf).strip()
            if part:
                parts.append(part)
            buf = []
        else:
            buf.append(ch)
    part = "".join(buf).strip()
    if part:
        parts.append(part)
    return parts


def tokenize_selector(selector: str) -> list[str]:
    tokens: list[str] = []
    s = selector.strip()
    i, n = 0, len(s)
    while i < n:
        if s[i].isspace():
            while i < n and s[i].isspace():
                i += 1
            if i < n and s[i] in ">+~":
                tokens.append(s[i])
                i += 1
            else:
                tokens.append(" ")
            continue
        if s[i] in ">+~":
            tokens.append(s[i])
            i += 1
            continue
        start, depth = i, 0
        while i < n:
            ch = s[i]
            if ch in "[(":
                depth += 1
            elif ch in "])":
                depth = max(0, depth - 1)
            elif depth == 0 and (ch.isspace() or ch in ">+~"):
                break
            i += 1
        tokens.append(s[start:i])
    return tokens


def parse_attr(raw: str) -> tuple[str, str | None]:
    inner = raw[1:-1]
    if "=" not in inner:
        return inner.strip(), None
    name, val = inner.split("=", 1)
    val = val.strip()
    if len(val) >= 2 and val[0] == val[-1] and val[0] in "\"'":
        val = val[1:-1]
    return name.strip(), val


def compound_matches(compound: str, node: dict) -> bool:
    s = compound.strip()
    if not s or s == "*":
        return True
    i, n = 0, len(s)
    while i < n:
        ch = s[i]
        if ch == "*":
            i += 1
            continue
        if ch == "#":
            j = i + 1
            while j < n and (s[j].isalnum() or s[j] in "_-"):
                j += 1
            if node.get("id") != s[i + 1 : j]:
                return False
            i = j
            continue
        if ch == ".":
            j = i + 1
            while j < n and (s[j].isalnum() or s[j] in "_-"):
                j += 1
            if s[i + 1 : j] not in node.get("classes", set()):
                return False
            i = j
            continue
        if ch == "[":
            j = s.find("]", i)
            if j < 0:
                return False
            name, val = parse_attr(s[i : j + 1])
            attrs = node.get("attrs", {})
            if name not in attrs:
                return False
            if val is not None and attrs[name] != val:
                return False
            i = j + 1
            continue
        if ch == ":" and i + 1 < n and s[i + 1] == ":":
            j = i + 2
            while j < n and (s[j].isalnum() or s[j] in "_-"):
                j += 1
            i = j
            continue
        if ch == ":":
            j = i + 1
            while j < n and (s[j].isalnum() or s[j] in "_-"):
                j += 1
            name = s[i + 1 : j]
            arg = None
            if j < n and s[j] == "(":
                depth, k = 1, j + 1
                while k < n and depth:
                    if s[k] == "(":
                        depth += 1
                    elif s[k] == ")":
                        depth -= 1
                    k += 1
                arg = s[j + 1 : k - 1]
                j = k
            if name == "has":
                inner = (arg or "").strip()
                needle = inner[1:] if inner.startswith(".") else inner
                if needle not in node.get("desc_classes", set()):
                    return False
            else:
                return False
            i = j
            continue
        if ch.isalpha() or ch == "_":
            j = i + 1
            while j < n and (s[j].isalnum() or s[j] in "_-"):
                j += 1
            if node.get("tag") != s[i:j].lower():
                return False
            i = j
            continue
        return False
    return True


def selector_matches(selector: str, nodes: list[dict]) -> bool:
    tokens = tokenize_selector(selector)
    compounds: list[str] = []
    combinators: list[str] = []
    expect = "compound"
    for t in tokens:
        if t in (" ", ">", "+", "~"):
            if expect == "compound":
                continue
            combinators.append(t)
            expect = "compound"
        else:
            compounds.append(t)
            expect = "combinator"
    if not compounds:
        return False
    if not compound_matches(compounds[-1], nodes[-1]):
        return False
    ni = len(nodes) - 2
    for i in range(len(compounds) - 2, -1, -1):
        compound = compounds[i]
        comb = combinators[i]
        if comb == " ":
            found = False
            while ni >= 0:
                if compound_matches(compound, nodes[ni]):
                    found = True
                    ni -= 1
                    break
                ni -= 1
            if not found:
                return False
        elif comb == ">":
            if ni < 0 or not compound_matches(compound, nodes[ni]):
                return False
            ni -= 1
        else:
            return False
    return True


def parse_decls(block: str) -> dict[str, str]:
    decls: dict[str, str] = {}
    for part in block.split(";"):
        if ":" not in part:
            continue
        prop, val = part.split(":", 1)
        prop, val = prop.strip().lower(), val.strip()
        if prop:
            decls[prop] = val
    return decls


def parse_rules(src: str) -> list[dict]:
    text = strip_css_comments(stylesheet_css(src))
    rules: list[dict] = []
    order = 0

    def walk(chunk: str, media_min: int) -> None:
        nonlocal order
        i, n = 0, len(chunk)
        while i < n:
            while i < n and chunk[i].isspace():
                i += 1
            if i >= n:
                return
            if chunk.startswith("@media", i):
                brace = chunk.find("{", i)
                if brace < 0:
                    return
                cond = chunk[i + 6 : brace]
                m = re.search(r"min-width:\s*([0-9]+)px", cond)
                nested_min = max(media_min, int(m.group(1))) if m else media_min
                depth, j = 1, brace + 1
                while j < n and depth:
                    if chunk[j] == "{":
                        depth += 1
                    elif chunk[j] == "}":
                        depth -= 1
                    j += 1
                walk(chunk[brace + 1 : j - 1], nested_min)
                i = j
                continue
            if chunk[i] == "@":
                brace = chunk.find("{", i)
                semi = chunk.find(";", i)
                if brace < 0 or (semi >= 0 and semi < brace):
                    i = (semi + 1) if semi >= 0 else n
                    continue
                depth, j = 1, brace + 1
                while j < n and depth:
                    if chunk[j] == "{":
                        depth += 1
                    elif chunk[j] == "}":
                        depth -= 1
                    j += 1
                i = j
                continue
            brace = chunk.find("{", i)
            if brace < 0:
                return
            selector = chunk[i:brace].strip()
            depth, j = 1, brace + 1
            while j < n and depth:
                if chunk[j] == "{":
                    depth += 1
                elif chunk[j] == "}":
                    depth -= 1
                j += 1
            decls = parse_decls(chunk[brace + 1 : j - 1])
            if selector and decls:
                for sel in split_selector_list(selector):
                    rules.append(
                        {"selector": sel, "decls": decls, "media_min": media_min, "order": order}
                    )
                order += 1
            i = j

    walk(text, 0)
    return rules


def rem_value(val: str | None) -> float | None:
    m = re.search(r"([0-9.]+)rem", val or "")
    return float(m.group(1)) if m else None


def cascade_win(rules: list[dict], nodes: list[dict], prop: str, viewport: int = 0) -> dict | None:
    best = None
    for r in rules:
        if r["media_min"] > viewport:
            continue
        if prop not in r["decls"]:
            continue
        if not selector_matches(r["selector"], nodes):
            continue
        key = (specificity(r["selector"]), r["order"])
        if best is None or key > best["key"]:
            best = {"key": key, "value": r["decls"][prop], "selector": r["selector"]}
    return best


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    src = (root / "src/views/styles.ts").read_text()
    later_rail = src.split(
        "Occupied claim rail after Why land is later rail — quieter than Why, not a second first read.",
        1,
    )
    if len(later_rail) < 2:
        raise SystemExit("occupied later-rail CSS block missing")
    later_rail_css = later_rail[1].split(
        "Occupied Product URL after later claim rail is later write — not a twin on the bid-row.",
        1,
    )[0]
    rail_title = re.search(
        r"\.desk\[data-occupied=\"true\"\] #claim \.later-rail\[data-later-rail\] \.claim-title\s*\{[^}]*font-size:\s*([0-9.]+)rem",
        later_rail_css,
    )
    rail_outbid = re.search(
        r"\.desk\[data-occupied=\"true\"\] #claim \.later-rail\[data-later-rail\] \.outbid\s*\{[^}]*height:\s*([0-9.]+)rem",
        later_rail_css,
    )
    if not rail_title or not rail_outbid:
        raise SystemExit(
            "later-rail Claim #1 / Outbid rules must include #claim so they beat occupied #claim sizes"
        )
    title_nodes = [
        {"tag": "div", "classes": {"desk"}, "attrs": {"data-occupied": "true"}, "desc_classes": set()},
        {"tag": "div", "classes": {"claim-after-cover"}, "attrs": {"data-claim-after-cover": ""}},
        {"tag": "section", "id": "claim"},
        {"tag": "div", "classes": {"later-rail"}, "attrs": {"data-later-rail": ""}},
        {"tag": "h2", "classes": {"claim-title"}},
    ]
    outbid_nodes = title_nodes[:-1] + [{"tag": "button", "classes": {"outbid"}}]
    rules = parse_rules(src)
    title_win = cascade_win(rules, title_nodes, "font-size", 0)
    outbid_win = cascade_win(rules, outbid_nodes, "height", 0)
    title_768 = cascade_win(rules, title_nodes, "font-size", 768)
    occupied_title = {
        float(x)
        for x in re.findall(
            r"\.desk\[data-occupied=\"true\"\] \.claim-after-cover\[data-claim-after-cover\] #claim \.claim-title\s*\{[^}]*font-size:\s*([0-9.]+)rem",
            src,
        )
    }
    occupied_outbid = {
        float(x)
        for x in re.findall(
            r"\.desk\[data-occupied=\"true\"\] \.claim-after-cover\[data-claim-after-cover\] #claim \.outbid\s*\{[^}]*height:\s*([0-9.]+)rem",
            src,
        )
    }
    title_rem = rem_value(title_win["value"] if title_win else "")
    outbid_rem = rem_value(outbid_win["value"] if outbid_win else "")
    title_768_rem = rem_value(title_768["value"] if title_768 else "")
    if title_win is None or title_rem != float(rail_title.group(1)):
        raise SystemExit(
            f"occupied later-rail Claim #1 lost the cascade: computed {title_win}, later-rail declares {rail_title.group(1)}rem"
        )
    if ".later-rail" not in title_win["selector"] or "#claim" not in title_win["selector"]:
        raise SystemExit(f"winning Claim #1 font-size must be later-rail with #claim, got {title_win['selector']}")
    if title_rem in occupied_title:
        raise SystemExit(
            "later-rail Claim #1 must beat occupied #claim sizes, not grep a quieter number that never computes"
        )
    if outbid_win is None or outbid_rem != float(rail_outbid.group(1)):
        raise SystemExit(
            f"occupied later-rail Outbid lost the cascade: computed {outbid_win}, later-rail declares {rail_outbid.group(1)}rem"
        )
    if ".later-rail" not in outbid_win["selector"] or "#claim" not in outbid_win["selector"]:
        raise SystemExit(f"winning Outbid height must be later-rail with #claim, got {outbid_win['selector']}")
    if outbid_rem in occupied_outbid:
        raise SystemExit(
            "later-rail Outbid must beat occupied #claim 2.2rem, not grep a quieter number that never computes"
        )
    if title_768 is None or ".later-rail" not in title_768["selector"] or "#claim" not in title_768["selector"]:
        raise SystemExit(f"later-rail Claim #1 at 768px lost the cascade: {title_768}")
    if title_768_rem in occupied_title:
        raise SystemExit("later-rail Claim #1 at 768px must beat occupied #claim 0.95rem/1.25rem")
    print("occupied later-rail cascade computes quieter Claim #1 / Outbid after Why")


if __name__ == "__main__":
    try:
        main()
    except SystemExit as exc:
        if exc.code:
            print(f"FAIL: {exc}", file=sys.stderr)
            raise
        raise
