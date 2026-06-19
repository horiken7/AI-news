#!/usr/bin/env python3
import datetime as dt
import email.utils
import html
import json
import re
import ssl
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import urljoin, urlparse

FEEDS = [
    ("ITmedia NEWS", "https://rss.itmedia.co.jp/rss/2.0/itmedia_news.xml"),
    ("ITmedia AI+", "https://rss.itmedia.co.jp/rss/2.0/aiplus.xml"),
    ("ASCII.jp", "https://ascii.jp/rss.xml"),
    ("PC Watch", "https://pc.watch.impress.co.jp/data/rss/1.0/pcw/feed.rdf"),
    ("GIGAZINE", "https://gigazine.net/news/rss_2.0/"),
    ("CNET Japan", "https://japan.cnet.com/rss/index.rdf"),
    ("ZDNET Japan", "https://japan.zdnet.com/rss/index.rdf"),
    ("Publickey", "https://www.publickey1.jp/atom.xml"),
    ("AINOW", "https://ainow.ai/feed/"),
    ("Ledge.ai", "https://ledge.ai/feed/"),
    ("AI-SCHOLAR", "https://ai-scholar.tech/feed/"),
]

AI_RE = re.compile(r"AI|人工知能|生成AI|生成系AI|ChatGPT|OpenAI|GPT|Claude|Anthropic|Gemini|Copilot|LLM|大規模言語モデル|基盤モデル|マルチモーダル|画像生成|動画生成|音声生成|AIエージェント|RAG|プロンプト|推論|DeepSeek|Llama|Mistral|Perplexity|Sora|NVIDIA|GPU|半導体|NPU|データセンター|ロボット|自動運転|AI規制|著作権|安全性|AGI", re.I)
JP_RE = re.compile(r"[ぁ-んァ-ヶ一-龠々ー]")
BAD_IMG_RE = re.compile(r"logo|icon|avatar|sprite|blank|pixel|favicon|profile|author|sns|button|banner|ad_|ads|tracking|1x1", re.I)
SCORE_WORDS = ["発表","公開","リリース","提供開始","新モデル","新機能","大型","提携","買収","投資","資金調達","規制","訴訟","著作権","安全性","性能","ベンチマーク","推論","マルチモーダル","エージェント","自動化","gpu","nvidia","半導体","データセンター","openai","chatgpt","claude","anthropic","gemini","deepseek","llm","copilot","sora","動画生成"]


def now_jst():
    return dt.datetime.now(dt.timezone(dt.timedelta(hours=9)))


def strip_html(s):
    s = html.unescape(s or "")
    s = re.sub(r"<script[\s\S]*?</script>", " ", s, flags=re.I)
    s = re.sub(r"<style[\s\S]*?</style>", " ", s, flags=re.I)
    s = re.sub(r"<[^>]+>", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def first_text(el, names):
    for child in list(el):
        tag = child.tag.split("}")[-1].lower()
        if tag in names:
            return child.text or ""
    return ""


def parse_date(s):
    if not s:
        return None
    try:
        d = email.utils.parsedate_to_datetime(s)
        if d.tzinfo is None:
            d = d.replace(tzinfo=dt.timezone.utc)
        return d.astimezone(dt.timezone(dt.timedelta(hours=9)))
    except Exception:
        pass
    for fmt in ("%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d %H:%M:%S"):
        try:
            d = dt.datetime.strptime(s, fmt)
            if d.tzinfo is None:
                d = d.replace(tzinfo=dt.timezone.utc)
            return d.astimezone(dt.timezone(dt.timedelta(hours=9)))
        except Exception:
            continue
    return None


def bad_url(u):
    try:
        host = urlparse(u).hostname or ""
    except Exception:
        return True
    host = host.lower()
    return ("google" in host or "doubleclick" in host or "gstatic" in host)


def clean_img(u, base):
    if not u:
        return ""
    u = urljoin(base or "", u)
    if bad_url(u) or BAD_IMG_RE.search(u):
        return ""
    return u


def image_from_html(text, base):
    for m in re.finditer(r"<img[^>]+(?:src|data-src|data-original)=[\"']([^\"']+)[\"']", text or "", re.I):
        img = clean_img(m.group(1), base)
        if img:
            return img
    return ""


def image_from_item(item, base, raw_html):
    candidates = []
    for child in list(item):
        tag = child.tag.split("}")[-1].lower()
        if tag in ("content", "thumbnail"):
            candidates.append(child.attrib.get("url") or child.attrib.get("href") or "")
        if tag == "enclosure":
            typ = (child.attrib.get("type") or "").lower()
            if not typ or typ.startswith("image/"):
                candidates.append(child.attrib.get("url") or "")
    candidates.append(image_from_html(raw_html, base))
    for u in candidates:
        img = clean_img(u, base)
        if img:
            return img
    return ""


def category(text):
    if re.search(r"NVIDIA|GPU|H100|H200|B200|CUDA|半導体|TSMC|NPU|データセンター", text, re.I):
        return "半導体/GPU"
    if re.search(r"規制|著作権|訴訟|安全性|プライバシー|ガバナンス|倫理", text, re.I):
        return "規制/安全"
    if re.search(r"エージェント|Copilot|自動化|ワークフロー|業務AI|SaaS", text, re.I):
        return "AIエージェント/業務"
    if re.search(r"ChatGPT|OpenAI|GPT|Claude|Anthropic|Gemini|Llama|DeepSeek|Mistral|大規模言語モデル|LLM|基盤モデル", text, re.I):
        return "LLM/モデル"
    if re.search(r"画像生成|動画生成|音声生成|生成AI|マルチモーダル|Sora|Veo", text, re.I):
        return "生成AI/マルチモーダル"
    if re.search(r"ロボット|自動運転|医療AI|製造|設計|品質|実装", text, re.I):
        return "AI実装"
    return "AI全般"


def score_article(a):
    txt = (a["title"] + " " + a["desc"]).lower()
    s = sum(8 for w in SCORE_WORDS if w.lower() in txt)
    if a.get("date"):
        hours = (now_jst() - dt.datetime.fromisoformat(a["date"])).total_seconds() / 3600
        if hours < 24:
            s += 18
        elif hours < 72:
            s += 10
        elif hours < 168:
            s += 4
    if a.get("img"):
        s += 8
    return s


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 AI-News-KEN/1.0"})
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, timeout=20, context=ctx) as res:
        return res.read()


def parse_feed(src, url, xml_bytes):
    root = ET.fromstring(xml_bytes)
    items = root.findall(".//item") or root.findall(".//{http://www.w3.org/2005/Atom}entry") or root.findall(".//entry")
    out = []
    for item in items[:30]:
        title = strip_html(first_text(item, {"title"}))
        link = ""
        for child in list(item):
            tag = child.tag.split("}")[-1].lower()
            if tag == "link":
                link = child.attrib.get("href") or (child.text or "")
                break
        if not link:
            link = first_text(item, {"guid"})
        raw = first_text(item, {"description", "summary", "content", "encoded"})
        desc = strip_html(raw)
        date_s = first_text(item, {"pubdate", "published", "updated", "date"})
        d = parse_date(date_s)
        if not title or not link or bad_url(link):
            continue
        if not JP_RE.search(title):
            continue
        if not AI_RE.search(title + " " + desc):
            continue
        article = {
            "title": title,
            "link": link,
            "date": d.isoformat() if d else "",
            "dateLabel": d.strftime("%m/%d %H:%M") if d else "日時不明",
            "desc": desc[:180] if JP_RE.search(desc) else "発信元RSSに日本語の概要が含まれていないため、詳細は記事本文で確認してください。AI関連の重要トピックとして抽出しています。",
            "img": image_from_item(item, link, raw),
            "src": src,
        }
        article["cat"] = category(title + " " + desc)
        article["score"] = score_article(article)
        out.append(article)
    return out


def main():
    all_articles = []
    status = []
    ok = ng = 0
    for src, url in FEEDS:
        try:
            data = fetch(url)
            articles = parse_feed(src, url, data)
            all_articles.extend(articles)
            ok += 1
            status.append({"source": src, "ok": True, "items": len(articles)})
        except Exception as e:
            ng += 1
            status.append({"source": src, "ok": False, "error": str(e)[:160]})
        time.sleep(0.3)

    seen = set()
    unique = []
    for a in sorted(all_articles, key=lambda x: (x.get("score", 0), x.get("date", "")), reverse=True):
        key = re.sub(r"[?#].*$", "", a.get("link") or a.get("title", "")).lower()
        if key in seen:
            continue
        seen.add(key)
        unique.append(a)

    payload = {
        "generatedAt": now_jst().isoformat(),
        "generatedLabel": now_jst().strftime("%Y/%m/%d %H:%M"),
        "feedOk": ok,
        "feedNg": ng,
        "candidates": len(all_articles),
        "status": status,
        "articles": unique[:20],
    }
    Path("news.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"generated news.json: ok={ok} ng={ng} articles={len(unique)}")


if __name__ == "__main__":
    main()
