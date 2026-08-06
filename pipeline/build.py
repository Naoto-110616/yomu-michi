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
        if n['a'] in ('—','') and a: n['a'] = a
        if y and not n['y']: n['y'] = y
        return n
    books[k] = {'k':k,'t':t,'a':a or '—','y':y or 0,'src':[src] if src else [],
                'cat':cat,'s':star,'shelf':shelf,'kind':'book','desc':''}
    return books[k]

for t, a, s, cat in SHELF:
    add(t, a, 0, '', cat, star=s, shelf=True)

EXTRA = [
 ("イニシエーション・ラブ","乾くるみ",2004,"叙述トリックの代表作","mys"),
 ("ハサミ男","殊能将之",1999,"叙述トリックの代表作","mys"),
 ("白夜行","東野圭吾",1999,"日本ミステリの定番","mys"),
 ("悪意","東野圭吾",1996,"日本ミステリの定番","mys"),
 ("虚無への供物","中井英夫",1964,"日本ミステリの古典","mys"),
 ("ドグラ・マグラ","夢野久作",1935,"日本ミステリの古典","mys"),
 ("孤島パズル","有栖川有栖",1989,"新本格の代表作","mys"),
 ("出版禁止","長江俊和",2014,"モキュメンタリーホラーの主要作","hor"),
 ("火のないところに煙は","芦沢央",2018,"モキュメンタリーホラーの主要作","hor"),
 ("侍女の物語","マーガレット・アトウッド",1985,"世界文学の古典的必読書","sf"),
 ("ツナグ","辻村深月",2010,"本屋大賞ノミネート","lit"),
 ("西の魔女が死んだ","梨木香歩",1994,"日本文芸の定番","lit"),
 ("正欲","朝井リョウ",2021,"日本文芸の定番","lit"),
 ("若い読者のための第三のチンパンジー","ジャレド・ダイアモンド",1992,"世界的科学ノンフィクションの定番","sci"),
 ("砂糖の世界史","川北稔",1996,"世界史の定番","hist"),
 ("エピクロスの処方箋","夏川草介",2025,"本屋大賞2026ノミネート","lit"),
 ("正義論","ジョン・ロールズ",1971,"哲学・思想の古典","phil"),
 ("これからの「正義」の話をしよう","マイケル・サンデル",2010,"哲学・思想の定番","phil"),
 ("戦争は女の顔をしていない","スヴェトラーナ・アレクシエーヴィチ",1985,"世界文学の古典的必読書","lit"),
 ("ロボットとわたしの不思議な旅","ベッキー・チェンバーズ",2021,"SFが読みたい!2026海外篇","sf"),
 ("ありか","瀬尾まいこ",2025,"本屋大賞2026ノミネート","lit"),
 ("失われた貌","櫻田智也",2025,"このミス2026国内1位","mys"),
 ("ブレイクショットの軌跡","逢坂冬馬",2025,"このミス2026国内6位","lit"),
 ("マーブル館殺人事件","アンソニー・ホロヴィッツ",2024,"このミス2026海外2位","mys"),
 ("夜明けまでに誰かが","ホリー・ジャクソン",2025,"このミス2026海外5位","mys"),
 ("世界の終わりの最後の殺人","スチュアート・タートン",2024,"このミス2026海外9位","sf"),
 ("かわいそ笑","梨",2022,"モキュメンタリーホラーの主要作","hor"),
 ("よその子","トリイ・ヘイデン",1981,"世界文学の古典的必読書","mind"),
 ("「ついやってしまう」体験のつくりかた","玉樹真一郎",2019,"デザイン・UXの定番","design"),
 ("21世紀の資本","トマ・ピケティ",2013,"経済の定番","work"),
 ("プロテスタンティズムの倫理と資本主義の精神","マックス・ウェーバー",1905,"100分de名著","work"),
 ("戦争と平和","トルストイ",1869,"世界文学の古典的必読書","lit"),
]
for t,a,y,src,cat in EXTRA:
    add(t,a,y,src,cat)

raw = len(SHELF) + len(EXTRA)
for f in sorted(glob.glob(os.path.join(SRC_DIR, '*.json'))):
    if os.path.basename(f) not in SRC_FILES: continue
    for r in json.load(open(f)):
        if not r.get('t'): continue
        raw += 1
        add(r['t'], r.get('a',''), r.get('y',0), r.get('src',''), r.get('cat','lit'))

print(f'raw entries : {raw}')
print(f'unique nodes: {len(books)}  (うち本棚 {sum(1 for n in books.values() if n["shelf"])})')

# ══════════ 2.5 概念ノード ══════════
# 概念は本より上位のノード。本と同じグラフに住まわせる。
CONCEPT_NODES = []
for c in CONCEPTS:
    n = {'k': c['id'], 't': c['label'], 'a': '', 'y': 0, 'src': [],
         'cat': c['cat'], 's': None, 'shelf': False,
         'kind': 'concept', 'desc': c['desc'], 'members': c['members']}
    books[c['id']] = n
    CONCEPT_NODES.append(n)

NODES = list(books.values())
by_key = {n['k']: n for n in NODES}
print(f'concepts    : {len(CONCEPT_NODES)}')

# ══════════ 3. エッジ生成 ══════════
E = {}
def link(a, b, typ, why):
    if a is None or b is None or a['k'] == b['k']: return False
    p = tuple(sorted([a['k'], b['k']])) if typ == 'alt' else (a['k'], b['k'])
    if (p[0],p[1],typ) in E or (p[1],p[0],typ) in E: return False
    # 同じペアに複数種類が付くのは pre/counter を優先し alt は捨てる
    for t2 in ('member','pre','next','counter','alt'):
        if t2 != typ and ((p[0],p[1],t2) in E or (p[1],p[0],t2) in E):
            if typ == 'alt': return False
    E[(p[0],p[1],typ)] = why
    return True

stat = defaultdict(int)

# --- (0) 概念 → 本（所属）------------------------------------------------
missing = []
for c in CONCEPT_NODES:
    for title in c['members']:
        b = by_key.get(norm_title(title))
        if b is None or b['kind'] != 'book':
            missing.append(title); continue
        if link(c, b, 'member', f'「{c["t"]}」に属する'): stat['member'] += 1
if missing:
    print(f'概念の未マッチ: {len(missing)} → {missing[:6]}')

# --- (a) 同一著者：シリーズは next、それ以外は年代順リングで alt ---------
def series_root(k):
    return re.sub(r'(上|下|中|[0-9]{1,2}|[ivx]{1,3})$', '', k)

BOOKS_ONLY = [n for n in NODES if n['kind'] == 'book']
by_author = defaultdict(list)
for n in BOOKS_ONLY:
    if n['a'] and n['a'] != '—': by_author[norm_author(n['a'])].append(n)

for au, group in by_author.items():
    if len(group) < 2 or len(group) > 30: continue
    roots = defaultdict(list)
    for n in group: roots[series_root(n['k'])].append(n)
    for r, g in roots.items():
        if len(g) < 2: continue
        g = sorted(g, key=lambda n: n['k'])
        for x, y in zip(g, g[1:]):
            if link(x, y, 'next', f'{x["a"]}『{x["t"]}』の続き・同シリーズ'): stat['series'] += 1
    g = sorted(group, key=lambda n: (n['y'] or 9999, n['t']))
    for x, y in zip(g, g[1:]):
        if link(x, y, 'alt', f'同じ著者（{x["a"]}）の別の作品'): stat['author'] += 1

# --- (b) 同じ賞・同じ年 = 同時代の別視点 --------------------------------
AWARD_YEAR = re.compile(r'(本屋大賞|直木賞|芥川賞|このミス|本格ミステリ大賞|日本推理作家協会賞|日本SF大賞|星雲賞|ヒューゴー賞|ネビュラ賞|SFが読みたい!|日本ホラー小説大賞|講談社科学出版賞|ビジネス書大賞|ビジネス書グランプリ|じんぶん大賞|新書大賞)[^0-9]*(\d{4})')
yc = defaultdict(list)
for n in BOOKS_ONLY:
    for s in n['src']:
        m = AWARD_YEAR.search(s)
        if m: yc[(m.group(1), m.group(2))].append(n)
for (aw, yr), g in yc.items():
    if not 2 <= len(g) <= 12: continue
    g = sorted(g, key=lambda n: n['t'])
    ring = g + [g[0]] if len(g) > 2 else g
    for x, y in zip(ring, ring[1:]):
        if link(x, y, 'alt', f'{aw} {yr}年の同時期の作品'): stat['same_year'] += 1

# --- (c) 同じ出典ラベル = リング（大きい場合は年代で分割） ----------------
def lab_norm(s):
    s = re.sub(r'[(（][^)）]*[)）]', '', s)
    s = re.sub(r'\d+', '', s)
    s = re.sub(r'(国内編|海外編|国内篇|海外篇|位|年|第|回|上|下)', '', s)
    return s.strip()

lab = defaultdict(list)
for n in BOOKS_ONLY:
    for s in n['src']:
        if s: lab[lab_norm(s)].append(n)

CLASSIC = re.compile(r'(古典|定番|原点|必読|代表作|100分de名著)')
for s, g in lab.items():
    if len(g) < 2: continue
    g = sorted(g, key=lambda n: (n['y'] or 9999))
    chunks = [g[i:i+10] for i in range(0, len(g), 10)] if len(g) > 14 else [g]
    reps = []
    for ch in chunks:
        reps.append(ch[0])
        ring = ch + [ch[0]] if len(ch) > 2 else ch
        for x, y in zip(ring, ring[1:]):
            if link(x, y, 'alt', f'同じ位置づけ「{s}」'): stat['same_label'] += 1
    # 注: 同じリスト内の年代前後は「前提」ではない。誤った pre を作らないため alt に留める。
    for x, y in zip(reps, reps[1:]):
        if link(x, y, 'alt', f'同じ位置づけ「{s}」の別の時代'): stat['same_label'] += 1

# --- (d) 人手シード：前提 / 反論 / 重要な別視点 --------------------------
SEED = [
 ("種の起源","利己的な遺伝子","pre","進化論の原典 → 遺伝子視点への転回"),
 ("利己的な遺伝子","延長された表現型","pre","同著者による理論の拡張"),
 ("利己的な遺伝子","サピエンス全史 上","pre","進化的な人間観が土台になる"),
 ("銃・病原菌・鉄","サピエンス全史 上","pre","ハラリはダイアモンドの議論を下敷きにしている"),
 ("若い読者のための第三のチンパンジー","銃・病原菌・鉄","pre","同著者の原型となった議論"),
 ("銃・病原菌・鉄","砂糖の世界史","next","地理の側から、人間の側へ"),
 ("ホーキング、宇宙を語る","大栗先生の超弦理論入門","pre","現代物理の一般向けとしての順序"),
 ("予想どおりに不合理","ファスト&スロー","pre","軽い入口 → 理論の本丸"),
 ("ファスト&スロー","実践行動経済学","pre","二重過程理論を知ってからナッジへ"),
 ("影響力の武器","予想どおりに不合理","alt","説得と非合理、同じ現象の別の切り口"),
 ("誰のためのデザイン？","オブジェクト指向UIデザイン","pre","認知の原理 → 画面設計の方法論"),
 ("誰のためのデザイン？","インタフェースデザインの心理学","pre","原理 → 100項目の実践"),
 ("誰のためのデザイン？","融けるデザイン","next","道具論の現代版"),
 ("ノンデザイナーズ・デザインブック","なるほどデザイン","next","4原則の次に、視覚的な実例へ"),
 ("ノンデザイナーズ・デザインブック","誰のためのデザイン？","next","見た目の原則 → なぜ人は間違えるかの原則"),
 ("十角館の殺人","新装版 殺戮にいたる病","pre","新本格の原点を通ってからの方が効く"),
 ("十角館の殺人","屍人荘の殺人","pre","クローズドサークル再発明の系譜"),
 ("そして誰もいなくなった","十角館の殺人","pre","本歌となる古典"),
 ("カササギ殺人事件","invert 城塚翡翠倒叙集","alt","作中作と倒叙、形式そのものが仕掛けになる二系統"),
 ("罪と罰","カラマーゾフの兄弟","next","同著者の到達点へ"),
 ("1984年","すばらしい新世界","counter","監視で支配するか、快楽で支配するか"),
 ("1984年","華氏451度","alt","言論統制を扱う別の角度"),
 ("動物農場","1984年","pre","寓話から本編へ"),
 ("ニューロマンサー","カウント・ゼロ","next","スプロール三部作の続き"),
 ("デューン 砂の惑星","ハイペリオン","alt","巨大SF叙事詩の系譜"),
 ("アルジャーノンに花束を","プロジェクト・ヘイル・メアリー 上","alt","知性と孤独、感情を撃ってくるSF"),
 ("わたしを離さないで","日の名残り","alt","同著者、抑制された語りの二作"),
 ("マネジメント［エッセンシャル版］","もし高校野球の女子マネージャーがドラッカーの「マネジメント」を読んだら","pre","原典 → その物語化"),
 ("イノベーションのジレンマ","ジョブ理論","next","同著者による問いの更新"),
 ("リーン・スタートアップ","ゼロ・トゥ・ワン","counter","小さく速く試せ vs 独占を狙え"),
 ("人月の神話","達人プログラマー","pre","ソフトウェア工学の古典を先に"),
 ("リーダブルコード","リファクタリング","next","読みやすさ → 構造の改善へ"),
 ("リファクタリング","Clean Architecture","next","局所の改善 → 全体の設計へ"),
 ("Webを支える技術","データ指向アプリケーションデザイン","pre","HTTPとRESTを押さえてから分散へ"),
 ("沈黙の春","利己的な遺伝子","alt","1960-70年代、生命観を変えた二冊"),
 ("夜と霧","エピクロスの処方箋","alt","極限と日常、「良く生きる」への二つの接近"),
 ("資本論","21世紀の資本","pre","原典 → 現代のデータによる更新"),
 ("プロテスタンティズムの倫理と資本主義の精神","資本論","counter","資本主義の起源をめぐる対立する説明"),
 ("正義論","これからの「正義」の話をしよう","pre","原典 → 講義形式の入門"),
 ("FACTFULNESS","21世紀の資本","counter","世界は良くなっている vs 格差は拡大している"),
 ("ファスト&スロー","ヤバい経済学","counter","人間は不合理 vs インセンティブで説明できる"),
 ("統計学が最強の学問である","ファスト&スロー","alt","データで殴るか、認知の癖を見るか"),
 ("成瀬は天下を取りにいく","そして、バトンは渡された","alt","まっすぐな人を書く現代の本屋大賞ライン"),
 ("傲慢と善良","コンビニ人間","alt","現代の「普通」への居心地の悪さ"),
 ("コンビニ人間","推し、燃ゆ","alt","社会の規格から外れる感覚"),
 ("同志少女よ、敵を撃て","戦争は女の顔をしていない","pre","本作の下敷きになったノンフィクション"),
 ("近畿地方のある場所について","残穢","pre","ドキュメント形式ホラーの先行作"),
 ("変な家","近畿地方のある場所について","alt","モキュメンタリーホラーの二大入口"),
 ("三体","プロジェクト・ヘイル・メアリー 上","alt","現代の「理系が主役」SFの二大巨頭"),
 ("2001年宇宙の旅","三体","pre","異星知性ものの原点"),
 ("わたしを離さないで","アルジャーノンに花束を","alt","知性と人間性をめぐる二作"),
 ("ソラリス","三体","pre","理解できない知性を書く系譜の原点"),
 ("利己的な遺伝子","日本人の9割が知らない遺伝の真実","pre","遺伝子の視点を先に入れておく"),
 ("サピエンス全史 上","世界史を大きく動かした植物","alt","人類史を別の主語（植物）から語る"),
 ("生物と無生物のあいだ","動的平衡","next","同著者の議論の展開"),
 ("フェルマーの最終定理","暗号解読","next","同著者、数学の物語の続き"),
]
unmatched = []
for a, b, typ, why in SEED:
    x, y = by_key.get(norm_title(a)), by_key.get(norm_title(b))
    if not x or not y:
        unmatched.append((a if not x else b)); continue
    if link(x, y, typ, why): stat['seed'] += 1

# 注: 以前あった「孤立ノード救済」(同じ領域の近い年代に機械的に接続) は
#     偽の関係でノイズにしかならないため廃止した。孤立した本は
#     「すべて」表示のときだけ小さな点として現れる。


def degmap():
    d = defaultdict(int)
    for (s2, t2, _) in E: d[s2] += 1; d[t2] += 1
    return d

EDGES = [{'s':a,'t':b,'type':ty,'why':w} for (a,b,ty),w in E.items()]
tc = defaultdict(int)
for e in EDGES: tc[e['type']] += 1
deg = degmap()
iso = sum(1 for n in NODES if deg[n['k']] == 0)
print('edge rules  :', dict(stat))
print(f'total edges : {len(EDGES)}   by type: {dict(tc)}')
print(f'isolated    : {iso}   avg degree: {2*len(EDGES)/len(NODES):.2f}')
if unmatched: print(f'seed未マッチ : {len(unmatched)} → {unmatched[:8]}')

# ══════════ 4. レイアウト（Python側で確定） ══════════
CATS = ['hist','phil','mys','hor','sf','lit','mind','design','comedy','work','sci']
idx = {n['k']: i for i, n in enumerate(NODES)}
N = len(NODES)
hub = np.zeros((N,2)); pos = np.zeros((N,2))
for n in NODES:
    ci = CATS.index(n['cat']) if n['cat'] in CATS else len(CATS)
    ang = ci/(len(CATS)+1)*2*math.pi
    hub[idx[n['k']]] = [math.cos(ang)*1250, math.sin(ang)*980]
    pos[idx[n['k']]] = hub[idx[n['k']]] + np.random.normal(0,180,2)

ei = np.array([[idx[e['s']], idx[e['t']]] for e in EDGES])
edist = np.array([26.0 if e['type']=='next' else 44.0 if e['type']=='pre' else 40.0 if e['type']=='member' else 66.0 for e in EDGES])
estr  = np.array([0.75 if e['type']=='member' else 0.55 if e['type'] in ('next','pre') else 0.20 for e in EDGES])
vel = np.zeros((N,2))
MAXV = 45.0
for it in range(900):
    a = max(0.03, 1.0 - it/900)
    d = pos[:,None,:] - pos[None,:,:]
    d2 = np.maximum((d**2).sum(-1), 120.0)
    np.fill_diagonal(d2, 1e12)
    vel += (d * (3200*a/d2)[:,:,None]).sum(1)
    dv = pos[ei[:,1]] - pos[ei[:,0]]
    L = np.maximum(np.linalg.norm(dv, axis=1), 1e-3)
    ff = ((L-edist)/L * a * estr)[:,None] * dv
    np.add.at(vel, ei[:,0],  ff); np.add.at(vel, ei[:,1], -ff)
    vel += (hub-pos)*0.085*a + (-pos)*0.002*a
    sp = np.linalg.norm(vel, axis=1, keepdims=True)
    vel = np.where(sp > MAXV, vel/sp*MAXV, vel)
    pos += vel
    vel *= 0.55
for _ in range(120):
    d = pos[:,None,:] - pos[None,:,:]
    dist = np.sqrt(np.maximum((d**2).sum(-1), 1e-6))
    np.fill_diagonal(dist, 1e12)
    push = np.clip(19.0 - dist, 0, None)/dist
    pos += (d*push[:,:,None]).sum(1)*0.45
pos -= pos.mean(0)
sc = 900/max(np.abs(pos).max(), 1)
if sc < 1: pos *= sc
print(f'layout      : x[{pos[:,0].min():.0f},{pos[:,0].max():.0f}] y[{pos[:,1].min():.0f},{pos[:,1].max():.0f}]')

# ══════════ 5. 出力 ══════════
out = {'nodes':[{'k':n['k'],'t':disp_title(n['t']) if n['kind']=='book' else n['t'],'full':n['t'],
                 'kind':n['kind'],'desc':n.get('desc',''),'a':n['a'],'y':n['y'],'cat':n['cat'],'s':n['s'],
                 'shelf':1 if n['shelf'] else 0,'src':n['src'][:2],'deg':deg[n['k']],
                 'px':round(float(pos[idx[n['k']]][0]),1),'py':round(float(pos[idx[n['k']]][1]),1)}
                for n in NODES],
       'edges':EDGES,
       'meta':{'nodes':N,'edges':len(EDGES),'shelf':sum(1 for n in NODES if n['shelf']),
               'byType':dict(tc),'raw':raw}}
p = os.path.join(HERE,'graph.raw.json')
json.dump(out, open(p,'w'), ensure_ascii=False, separators=(',',':'))
print('wrote graph.json', os.path.getsize(p)//1024, 'KB')
