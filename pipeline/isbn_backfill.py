#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
焼き込みの本の ISBN を国立国会図書館サーチで逆引きして isbn_map.json に貯める。

- ISBN が付くと: 全書影（NDLサムネイル）と、カーリルの図書館直リンクが効く
- 1回の実行で最大 MAX_QUERIES 件。週次スケジュールで少しずつ埋まる（自己修復）
- 2回失敗したキーは "" を記録して以後スキップ（無限リトライしない）
"""
import json, os, re, time, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, 'graph.raw.json')
MAP = os.path.join(HERE, 'isbn_map.json')
MISS = os.path.join(HERE, 'isbn_miss.json')
MAX_QUERIES = 400
UA = 'yomu-michi/0.1 (+https://github.com/Naoto-110616/yomu-michi)'

isbn_map = json.load(open(MAP)) if os.path.exists(MAP) else {}
misses = json.load(open(MISS)) if os.path.exists(MISS) else {}

nodes = json.load(open(RAW))['nodes']
targets = [n for n in nodes
           if n.get('kind') == 'book'
           and not n['k'].startswith('isbn:')
           and n['k'] not in isbn_map
           and misses.get(n['k'], 0) < 2]
print(f'targets: {len(targets)} (resolved: {len(isbn_map)}, given up: {sum(1 for v in misses.values() if v >= 2)})')

ISBN_RE = re.compile(r'dcndl:ISBN">([-0-9Xx]+)<')

def query(title: str, author: str) -> str:
    params = {'title': title, 'cnt': '5'}
    if author and author != '—':
        params['creator'] = author.split('/')[0].strip()
    url = 'https://ndlsearch.ndl.go.jp/api/opensearch?' + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=15) as r:
        xml = r.read().decode('utf-8', 'ignore')
    m = ISBN_RE.search(xml)
    return m.group(1).replace('-', '') if m else ''

done = 0
for n in targets[:MAX_QUERIES]:
    try:
        isbn = query(n['t'], n.get('a', ''))
        if not isbn:  # 著者で絞ると出ないことがあるのでタイトルだけで再挑戦
            isbn = query(n['t'], '')
        if isbn and len(isbn) in (10, 13):
            isbn_map[n['k']] = isbn
        else:
            misses[n['k']] = misses.get(n['k'], 0) + 1
    except Exception as e:
        s = str(e)
        if '429' in s:
            time.sleep(6)
        misses[n['k']] = misses.get(n['k'], 0) + 1
    done += 1
    if done % 50 == 0:
        json.dump(isbn_map, open(MAP, 'w'), ensure_ascii=False, indent=0, sort_keys=True)
        json.dump(misses, open(MISS, 'w'), ensure_ascii=False, indent=0, sort_keys=True)
        print(f'  {done}/{min(len(targets), MAX_QUERIES)} resolved={len(isbn_map)}')
    time.sleep(0.4)  # NDL に優しく

json.dump(isbn_map, open(MAP, 'w'), ensure_ascii=False, indent=0, sort_keys=True)
json.dump(misses, open(MISS, 'w'), ensure_ascii=False, indent=0, sort_keys=True)
print(f'done: resolved={len(isbn_map)} misses={len(misses)}')

# NOTE: pushing this file triggers .github/workflows/isbn.yml (first run bootstrap).
# retry: 2026-08-06T15:40Z CI outage recovery
