#!/usr/bin/env python3
"""
賞・ランキングから収集した書誌リストをマージし、
「エッジ（本と本の関係）」を自動生成して 1 つのデータセットにする。

設計方針:
  - ノードの供給源とエッジの供給源を同じリストから同時に取る
  - クラスタは完全グラフにせず「リング」で繋いでエッジ爆発を防ぐ
  - pre(前提) と counter(反論) は精度が命なので人手シードを主とする
  - 最後に孤立ノードを救済して連結性を担保する
"""
import json, re, glob, os, math, random
from collections import defaultdict
import numpy as np
from shelf import SHELF
from concepts import CONCEPTS

random.seed(42); np.random.seed(42)
HERE = os.path.dirname(os.path.abspath(__file__))
SRC_DIR = os.path.join(HERE, 'sources')
OUT_DIR = os.path.join(os.path.dirname(HERE), 'data')

# ══════════ 1. 正規化 ══════════
VOL = re.compile(r'^(上|中|下|[0-9]{1,2}|[IVX]{1,4}|第[0-9]+[巻部])$')
TRANS = str.maketrans('！？：（）［］　０１２３４５６７８９ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺ',
                      '!?:()[] 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ')

def norm_title(t):
    t = t.translate(TRANS).strip()
    t = re.sub(r'[【〈《（(].*?[】〉》）)]', '', t)
    t = re.sub(r'^(新装版|完全版|増補改訂版|増補版|改訂版|完訳|新版)\s*', '', t)
    for sep in ['――', '—', '―', ' - ', '／']:
        if sep in t: t = t.split(sep)[0]
    parts = [p for p in t.split(' ') if p]
    if len(parts) > 1:
        head, rest = parts[0], parts[1:]
        keep = [p for p in rest if VOL.match(p)]
        if keep:
            t = head + ' ' + ' '.join(keep)
        elif len(head) < 4:
            t = head + ' ' + rest[0]
        else:
            t = head
    return re.sub(r'\s+', '', t).lower()

def disp_title(t):
    t = t.strip()
    t = re.sub(r'\s*[――—―]\s*.*$', '', t)
    parts = [p for p in re.split(r'[ 　]', t) if p]
    if not parts:
        return t
    # 6文字に満たない間はトークンを足す（「すごいぞ!」「北欧に学ぶ」で切れるのを防ぐ）
    out = parts[0]
    i = 1
    while len(out) < 6 and i < len(parts):
        out += ' ' + parts[i]
        i += 1
    # 巻数マーカーは常に残す
    tail = [p for p in parts[i:] if VOL.match(p.translate(TRANS))]
    if tail:
        out += ' ' + ' '.join(tail)
    return out.strip()

def norm_author(a):
    a = (a or '').translate(TRANS)
    a = re.sub(r'[(（].*?[)）]', '', a)
    a = re.sub(r'[・=＝\s\.,、]', '', a)
    return a[:6].lower()

# ══════════ 2. 読み込み & マージ ══════════
SRC_FILES = {'out_awards.json','mys_hor.json','out_sf.json','out_world.json','meisho.json','out_biz.json'}
CATMAP = {'eng':'design'}

books = {}
def add(t, a, y, src, cat, star=None, shelf=False):
    k = norm_title(t)
    if not k: return None
    cat = CATMAP.get(cat, cat)
    if k in books:
        n = books[k]
        if src and src not in n['src']: n['src'].append(src)
        if star is not None: n['s'] = star
        if shelf: n['shelf'] = True; n['cat'] = cat
        if len(t) < len(n['t']): n['t'] = t
        if n['a'] in ('—',''] and a: n['a'] = a
        if y and not n['y']: n['y'] = y
        return n
    books[k] = {'k':k,'t':t,'a':a or '—','y':y or 0,'src':[src] if src else [],
                'cat':cat,'s':star,'shelf':shelf,'kind':'book','desc':''}
    return books[k]

for t, a, s, cat in SHELF:
    add(t, a, 0, '', cat, star=s, shelf=True)
