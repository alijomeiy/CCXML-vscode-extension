#!/usr/bin/env python3

import argparse
import datetime as dt
import json
import re
from collections import defaultdict

import requests
from bs4 import BeautifulSoup


EVENT_RE = re.compile(
    r"\b(?:connection|conference|dialog|ccxml|error|fetch|send|resource)\.[A-Za-z0-9_.-]+\b"
)

TAG_HEADING_RE = re.compile(r"<\s*([A-Za-z_][A-Za-z0-9_.:-]*)\s*>")
ATTR_NAME_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_.:-]*$")
TAG_NAME_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_.:-]*$")


def fetch_html(url: str) -> str:
    response = requests.get(
        url,
        timeout=30,
        headers={"User-Agent": "ccxml-vscode-rule-extractor/0.1"}
    )
    response.raise_for_status()
    return response.text


def normalize_space(s: str) -> str:
    return re.sub(r"\s+", " ", s or "").strip()


def get_heading_tag_name(heading) -> str | None:
    text = heading.get_text(" ", strip=True)
    m = TAG_HEADING_RE.search(text)
    if m:
        return m.group(1)
    return None


def iter_section_nodes(heading):
    node = heading.find_next_sibling()
    while node is not None:
        if node.name and re.match(r"^h[1-6]$", node.name):
            break
        yield node
        node = node.find_next_sibling()


def extract_tables_from_section(heading):
    return [node for node in iter_section_nodes(heading) if getattr(node, "name", None) == "table"]


def table_to_matrix(table):
    rows = []
    for tr in table.find_all("tr"):
        cells = tr.find_all(["th", "td"])
        if not cells:
            continue
        rows.append([normalize_space(cell.get_text(" ", strip=True)) for cell in cells])
    return rows


def looks_like_attribute_table(matrix):
    if not matrix:
        return False

    header = [c.lower() for c in matrix[0]]
    joined = " | ".join(header)

    keywords = ["attribute", "attr", "name", "required", "description", "type"]
    return any(k in joined for k in keywords)


def find_column_indexes(header):
    lower = [c.lower() for c in header]

    attr_idx = None
    required_idx = None
    desc_idx = None

    for i, col in enumerate(lower):
        if attr_idx is None and ("attribute" in col or col == "name" or "attr" in col):
            attr_idx = i
        if required_idx is None and "required" in col:
            required_idx = i
        if desc_idx is None and ("description" in col or "meaning" in col):
            desc_idx = i

    return attr_idx, required_idx, desc_idx


def parse_required_cell(value: str) -> bool:
    v = value.strip().lower()
    return v in {"yes", "required", "true", "must", "y"} or "required" in v


def extract_attributes_from_table(matrix):
    attrs = {}
    required = set()

    if len(matrix) < 2:
        return attrs, required

    header = matrix[0]
    attr_idx, required_idx, desc_idx = find_column_indexes(header)

    if attr_idx is None:
        return attrs, required

    for row in matrix[1:]:
        if attr_idx >= len(row):
            continue

        attr_name = normalize_space(row[attr_idx])

        if not ATTR_NAME_RE.match(attr_name):
            continue

        attrs[attr_name] = {
            "description": row[desc_idx] if desc_idx is not None and desc_idx < len(row) else ""
        }

        if required_idx is not None and required_idx < len(row):
            if parse_required_cell(row[required_idx]):
                required.add(attr_name)

    return attrs, required


def extract_description_from_section(heading):
    texts = []
    for node in iter_section_nodes(heading):
        if getattr(node, "name", None) in {"p", "div"}:
            text = normalize_space(node.get_text(" ", strip=True))
            if text:
                texts.append(text)
        if len(" ".join(texts)) > 300:
            break
    return " ".join(texts)[:300].strip()


def extract_tags_from_document(soup):
    tags = {}

    for heading in soup.find_all(re.compile(r"^h[1-6]$")):
        tag_name = get_heading_tag_name(heading)
        if not tag_name or not TAG_NAME_RE.match(tag_name):
            continue

        section_tables = extract_tables_from_section(heading)

        all_attrs = set()
        required_attrs = set()

        for table in section_tables:
            matrix = table_to_matrix(table)
            if not looks_like_attribute_table(matrix):
                continue

            attrs, required = extract_attributes_from_table(matrix)
            all_attrs.update(attrs.keys())
            required_attrs.update(required)

        if tag_name not in tags:
            tags[tag_name] = {
                "requiredAttributes": sorted(required_attrs),
                "allowedAttributes": sorted(all_attrs),
                "description": extract_description_from_section(heading) or f"CCXML element <{tag_name}>"
            }
        else:
            tags[tag_name]["requiredAttributes"] = sorted(
                set(tags[tag_name]["requiredAttributes"]) | required_attrs
            )
            tags[tag_name]["allowedAttributes"] = sorted(
                set(tags[tag_name]["allowedAttributes"]) | all_attrs
            )

    return tags


def extract_tags_from_code_blocks(soup):
    tag_attrs = defaultdict(set)

    for node in soup.find_all(["pre", "code"]):
        text = node.get_text("\n")
        for m in re.finditer(r"<\s*/?\s*([A-Za-z_][A-Za-z0-9_.:-]*)([^<>]*)>", text):
            tag_name = m.group(1)
            raw_attrs = m.group(2) or ""

            for am in re.finditer(r'([A-Za-z_][A-Za-z0-9_.:-]*)\s*=\s*(".*?"|\'.*?\'|[^\s>]+)', raw_attrs):
                attr_name = am.group(1)
                if attr_name not in {"xmlns", "xml:lang"}:
                    tag_attrs[tag_name].add(attr_name)

            if tag_name not in tag_attrs:
                tag_attrs[tag_name] = set()

    return tag_attrs


def merge_code_block_fallback(tags, fallback_tag_attrs):
    for tag_name, attrs in fallback_tag_attrs.items():
      if tag_name not in tags:
          tags[tag_name] = {
              "requiredAttributes": [],
              "allowedAttributes": sorted(attrs),
              "description": f"CCXML element <{tag_name}>"
          }
      else:
          merged = set(tags[tag_name]["allowedAttributes"]) | set(attrs)
          tags[tag_name]["allowedAttributes"] = sorted(merged)
    return tags


def extract_events(soup):
    text = soup.get_text(" ")
    return sorted(set(EVENT_RE.findall(text)))


def build_rules(url: str):
    html = fetch_html(url)
    soup = BeautifulSoup(html, "lxml")

    tags = extract_tags_from_document(soup)
    fallback_tag_attrs = extract_tags_from_code_blocks(soup)
    tags = merge_code_block_fallback(tags, fallback_tag_attrs)
    events = extract_events(soup)

    return {
        "source": url,
        "generatedAt": dt.datetime.utcnow().isoformat() + "Z",
        "tags": dict(sorted(tags.items())),
        "events": events
    }


def main():
    parser = argparse.ArgumentParser(description="Extract CCXML rules from W3C spec")
    parser.add_argument("--url", required=True, help="Source URL")
    parser.add_argument("--out", required=True, help="Output JSON file")
    args = parser.parse_args()

    rules = build_rules(args.url)

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(rules, f, ensure_ascii=False, indent=2)

    print(f"Wrote rules to {args.out}")
    print(f"Tags: {len(rules['tags'])}")
    print(f"Events: {len(rules['events'])}")


if __name__ == "__main__":
    main()
