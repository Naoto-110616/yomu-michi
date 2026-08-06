#!/usr/bin/env python3
"""build.py が吐く graph.raw.json を、Web が読む圧縮形式に変換する。

2026-08 の方針転換:
  地図に焼き込むのは「本棚の本（サンプル=ブクログの93冊）」だけ。
  1000冊のカタログと具体概念(c_*)は payload から外し、
  裏方（ISBN逆引きの対象・AI提案の語彙・NDL検索の補完）に退いた。
  読んだ本 + 自分が紐づけた本だけが地図に立つ、が製品の姿。
"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), 'data', 'graph.json')
CATS = ['hist','phil','mys','hor','sf','lit','mind','design','comedy','work','sci']
TYPES = ['alt','next','pre','counter','member']
KINDS = ['book','concept']

d = json.load(open(os.path.join(HERE, 'graph.raw.json')))
ISBN_MAP_PATH = os.path.join(HERE, 'isbn_map.json')
ISBN_MAP = json.load(open(ISBN_MAP_PATH)) if os.path.exists(ISBN_MAP_PATH) else {}

# ── 絞り込み: 本棚の本だけを焼き込む ──────────────────
# 概念ノード(c_*)も外す（公式の大枠 cat:* は DB 側から動的に来る）
N = [n for n in d['nodes'] if n.get('kind', 'book') == 'book' and n['shelf']]
kept = {n['k'] for n in N}
E = [e for e in d['edges'] if e['s'] in kept and e['t'] in kept]

idx = {n['k']: i for i, n in enumerate(N)}

tables: dict[str, tuple[list, dict]] = {}
def intern(table: str, s: str) -> int:
    arr, seen = tables.setdefault(table, ([], {}))
    if s not in seen:
        seen[s] = len(arr); arr.append(s)
    return seen[s]

nodes = [[n['t'], intern('A', n['a']), n['y'],
          CATS.index(n['cat']) if n['cat'] in CATS else 0,
          -1 if n['s'] is None else n['s'], n['shelf'],
          round(n['px']), round(n['py']),
          [intern('S', x) for x in n['src'][:2]],
          KINDS.index(n.get('kind', 'book')),
          intern('D', n.get('desc', '')) if n.get('desc') else -1,
          n['k'],
          ISBN_MAP.get(n['k'], '')] for n in N]
edges = [[idx[e['s']], idx[e['t']], TYPES.index(e['type']), intern('W', e['why'])] for e in E]

meta = dict(d['meta'])
meta['nodes'] = len(nodes)
meta['edges'] = len(edges)

payload = {'C': CATS, 'T': TYPES, 'K': KINDS,
           'A': tables.get('A', ([], {}))[0], 'S': tables.get('S', ([], {}))[0],
           'W': tables.get('W', ([], {}))[0],
           'D': tables.get('D', ([], {}))[0],
           'n': nodes, 'e': edges, 'meta': meta}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w') as f:
    json.dump(payload, f, ensure_ascii=False, separators=(',', ':'))
print(f'wrote {OUT} ({os.path.getsize(OUT)//1024} KB, {len(nodes)} nodes, {len(edges)} edges)')
