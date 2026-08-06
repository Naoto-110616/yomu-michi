#!/usr/bin/env python3
"""build.py が吐く graph.raw.json を、Web が読む圧縮形式に変換する。

文字列（著者名・出典・関係の理由）を辞書化して参照に置き換えることで
389KB -> 86KB まで落ちる。1000ノード規模を1ファイルで配るための工夫。
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
N, E = d['nodes'], d['edges']
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

payload = {'C': CATS, 'T': TYPES, 'K': KINDS,
           'A': tables['A'][0], 'S': tables['S'][0], 'W': tables['W'][0],
           'D': tables.get('D', ([], {}))[0],
           'n': nodes, 'e': edges, 'meta': d['meta']}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w') as f:
    json.dump(payload, f, ensure_ascii=False, separators=(',', ':'))
print(f'wrote {OUT} ({os.path.getsize(OUT)//1024} KB, {len(nodes)} nodes, {len(edges)} edges)')
