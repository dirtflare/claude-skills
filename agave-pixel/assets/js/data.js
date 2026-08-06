/* PIXAGAVE — 静的データ定義
 * 品種図鑑 / タイプ / 性格 / 遺伝子 / 進化系統 / 時間設定 / アイテム / 文言
 * すべてオリジナル定義。外部アセットへの依存なし。
 */

/* ---------- 時間 ---------- */

/* すべての育成日数は「ゲーム日」で数え、リアル時間との換算をここで決める。
 * 既定は「ふつう」= 1ゲーム日が 1 実時間。完成株まで実時間 16〜20 時間ほど。 */
export const PACES = {
  fast: { ja: 'はやい', en: 'FAST', realMinutesPerDay: 20, note: '1ゲーム日 = 20分 / 完成株まで実時間 5〜6時間' },
  normal: { ja: 'ふつう', en: 'NORMAL', realMinutesPerDay: 60, note: '1ゲーム日 = 1時間 / 完成株まで実時間 16〜20時間' },
  slow: { ja: 'じっくり', en: 'SLOW', realMinutesPerDay: 240, note: '1ゲーム日 = 4時間 / 完成株まで実時間 3日ほど' },
  real: { ja: 'リアル', en: 'REAL', realMinutesPerDay: 1440, note: '1ゲーム日 = 実際の1日 / 手元の株と同じ速度' },
};

/* 1ゲーム年 = 32日(1季節 8日)。季節は成長速度に効くが、進化は止めない。 */
export const DAYS_PER_SEASON = 8;

/* ---------- 進化 ---------- */

export const STAGES = [
  { key: 'seedling', ja: '実生', en: 'SEEDLING' },
  { key: 'sprout', ja: '幼苗', en: 'SPROUT' },
  { key: 'juvenile', ja: '若株', en: 'JUVENILE' },
  { key: 'adult', ja: '成株', en: 'ADULT' },
  { key: 'prime', ja: '完成株', en: 'PRIME' },
];

/* 経験値・ゲーム内経過日数・記録写真の 3 つを AND で満たすと進化する。
 * 経験値は世話をするほど早く貯まるので、放置より関わったほうが確実に速い。 */
export const STAGE_REQUIREMENTS = [
  null,
  { exp: 40, days: 1, photos: 1 },
  { exp: 150, days: 3, photos: 2 },
  { exp: 380, days: 8, photos: 4 },
  { exp: 800, days: 16, photos: 6 },
];

/* 成株(段階4)到達時に、育て方と個性値から系統が確定する分岐進化。 */
export const BRANCHES = {
  compact: {
    ja: '締型', en: 'COMPACT', color: '#57E0AE', stat: 'compact', type: '硬葉',
    ja_desc: '強光と辛めの水やりで葉間が詰まり、低く硬く固まった系統。姿の完成度で他を圧倒する。',
  },
  nishiki: {
    ja: '錦', en: 'NISHIKI', color: '#FFD25A', stat: 'variegation', type: '斑',
    ja_desc: '斑が覚醒し、葉に光の帯を宿した系統。日焼けに弱く、繊細な遮光管理を要求する。',
  },
  fang: {
    ja: '鬼爪', en: 'FANG', color: '#F58BB0', stat: 'spine', type: '棘',
    ja_desc: '鋸歯と棘が過剰に発達した系統。荒々しい輪郭そのものが武器になる。',
  },
  titan: {
    ja: '巨大', en: 'TITAN', color: '#7FB2FF', stat: 'vigor', type: '塊根',
    ja_desc: '潤沢な水と養分を吸い上げ、圧倒的な体積で他を沈黙させる系統。',
  },
};

export const BRANCH_KEYS = Object.keys(BRANCHES);

export const WORLDS = {
  agave: { ja: 'アガベ', en: 'AGAVE', color: '#57E0AE' },
  caudex: { ja: '塊根', en: 'CAUDEX', color: '#F0A33F' },
  succulent: { ja: '多肉', en: 'SUCCULENT', color: '#F58BB0' },
};

/* ---------- タイプ ---------- */
/* 品評会の審査員はその回の「審査傾向」に合うタイプを高く評価する。 */
export const TYPES = {
  硬葉: { color: '#57E0AE', strong: ['棘'], weak: ['花'] },
  棘: { color: '#F58BB0', strong: ['塊根'], weak: ['硬葉'] },
  斑: { color: '#FFD25A', strong: ['窓'], weak: ['擬態'] },
  粉: { color: '#A9C9BE', strong: ['花'], weak: ['斑'] },
  塊根: { color: '#F0A33F', strong: ['幾何'], weak: ['棘'] },
  窓: { color: '#7FD8FF', strong: ['擬態'], weak: ['斑'] },
  幾何: { color: '#C4A9FF', strong: ['粉'], weak: ['塊根'] },
  擬態: { color: '#B7AE93', strong: ['斑'], weak: ['窓'] },
  花: { color: '#FF9AB0', strong: ['硬葉'], weak: ['粉'] },
};

/* ---------- 個性値 ---------- */

export const GENES = {
  leaf: { ja: '葉幅', en: 'LEAF', icon: '◧' },
  compact: { ja: '締まり', en: 'COMPACT', icon: '◈' },
  spine: { ja: '棘', en: 'SPINE', icon: '✳' },
  variegation: { ja: '斑', en: 'VARIEG', icon: '◐' },
  bloom: { ja: '白粉', en: 'BLOOM', icon: '❋' },
  vigor: { ja: '成長力', en: 'VIGOR', icon: '▲' },
};

export const GENE_KEYS = Object.keys(GENES);

/* ---------- 性格 ---------- */
/* 1つの個性値が伸びやすく、1つが伸びにくくなる。株を迎えた時点で決まる。 */
export const NATURES = [
  { ja: 'せっかち', up: 'vigor', down: 'compact' },
  { ja: 'がんこ', up: 'compact', down: 'vigor' },
  { ja: 'やんちゃ', up: 'spine', down: 'bloom' },
  { ja: 'おっとり', up: 'bloom', down: 'spine' },
  { ja: 'きまぐれ', up: 'variegation', down: 'leaf' },
  { ja: 'おおらか', up: 'leaf', down: 'variegation' },
  { ja: 'ずぶとい', up: 'compact', down: 'leaf' },
  { ja: 'のんき', up: 'bloom', down: 'vigor' },
  { ja: 'いじっぱり', up: 'spine', down: 'variegation' },
  { ja: 'すなお', up: null, down: null },
  { ja: 'ひかえめ', up: 'variegation', down: 'spine' },
  { ja: 'むじゃき', up: 'vigor', down: 'bloom' },
  { ja: 'れいせい', up: 'compact', down: 'spine' },
  { ja: 'やんちゃ盛り', up: 'leaf', down: 'compact' },
];

/* ---------- 品種図鑑 ----------
 * form   : ドット絵の骨格。品種ごとにシルエットが変わる
 * palette: ドット絵の基本色 [影, 中間, ハイライト, 縁/棘, 模様]
 * water  : 適正潅水間隔(ゲーム日) / light: 適正日照(0-100)
 */
export const SPECIES = [
  {
    id: 'titanota', no: 1, world: 'agave', ja: 'チタノタ', en: 'Titanota', rarity: 3,
    types: ['硬葉', '棘'], category: '硬葉株',
    shape: { leaves: 5, lenK: 0.95, widthK: 1.40, openK: 1.20, curveK: 1.4, tip: 0.34 },
    form: 'rosette_wide', palette: ['#2C5B41', '#4E8F63', '#7BC086', '#16241C', '#A8D8A0'],
    water: 7, light: 88, growth: 1.0,
    bias: { leaf: 62, compact: 70, spine: 78, variegation: 20, bloom: 35, vigor: 55 },
    dex: '短く分厚い葉と、爪のように反り返った鋸歯を持つ。強い光で締めて育てるほど葉の間隔が詰まり、拳のような塊になる。',
  },
  {
    id: 'oaxaca', no: 2, world: 'agave', ja: 'オアハカ', en: 'Oaxacensis', rarity: 4,
    types: ['硬葉', '粉'], category: '白爪株',
    shape: { leaves: 9, lenK: 1.32, widthK: 0.66, openK: 0.80, curveK: 0.5, tip: 0.10 },
    form: 'rosette_long', palette: ['#3A6B52', '#5C8F72', '#8FC49B', '#E8EDDF', '#C9DCC4'],
    water: 8, light: 92, growth: 0.85,
    bias: { leaf: 70, compact: 74, spine: 84, variegation: 18, bloom: 45, vigor: 48 },
    dex: '葉先と鋸歯が白く抜ける。乾いた強光下でのみ白さが冴え、水を与えすぎると鈍く緑がかってしまう。',
  },
  {
    id: 'reginae', no: 3, world: 'agave', ja: '笹の雪', en: 'Victoriae-reginae', rarity: 3,
    types: ['幾何', '硬葉'], category: '幾何株',
    shape: { leaves: 8, lenK: 1.00, widthK: 1.00, openK: 0.95, curveK: 0.0, tip: 0.05 },
    form: 'geometric', palette: ['#1C4430', '#2F6B47', '#4E9163', '#EAF2E4', '#EAF2E4'],
    water: 9, light: 78, growth: 0.6,
    bias: { leaf: 45, compact: 86, spine: 40, variegation: 46, bloom: 70, vigor: 35 },
    dex: '葉に白い線が刻まれ、重なり合って幾何学模様を描く。成長は極端に遅いが、崩れた姿になりにくい。',
  },
  {
    id: 'potatorum', no: 4, world: 'agave', ja: '吉祥冠', en: 'Potatorum', rarity: 2,
    types: ['硬葉'], category: '入門株',
    shape: { leaves: 7, lenK: 1.00, widthK: 0.95, openK: 1.00, curveK: 0.9, tip: 0.22 },
    form: 'rosette_wide', palette: ['#3C6B4E', '#6FA184', '#9AC7A5', '#8A4B33', '#B5D8B8'],
    water: 6, light: 74, growth: 1.15,
    bias: { leaf: 58, compact: 55, spine: 62, variegation: 34, bloom: 40, vigor: 68 },
    dex: '赤褐色の鋸歯が縁を彩る。丈夫で失敗が少なく、最初の一株として選ばれることが多い。',
  },
  {
    id: 'horrida', no: 5, world: 'agave', ja: 'ホリダ', en: 'Horrida', rarity: 3,
    types: ['棘'], category: '猛棘株',
    shape: { leaves: 12, lenK: 1.25, widthK: 0.46, openK: 1.05, curveK: 0.3, tip: 0.06 },
    form: 'rosette_long', palette: ['#2B4A31', '#4A7A4E', '#6E9E68', '#14201A', '#3A5C3E'],
    water: 8, light: 84, growth: 0.7,
    bias: { leaf: 40, compact: 72, spine: 90, variegation: 15, bloom: 25, vigor: 42 },
    dex: '硬く黒い棘が全身を覆う。葉質が非常に硬いため、一度徒長すると二度と元の姿には戻らない。',
  },
  {
    id: 'parryi', no: 6, world: 'agave', ja: 'パリー', en: 'Parryi', rarity: 2,
    types: ['粉', '硬葉'], category: '青粉株',
    shape: { leaves: 6, lenK: 0.78, widthK: 1.55, openK: 0.78, curveK: 0.4, tip: 0.52 },
    form: 'rosette_wide', palette: ['#4E756E', '#7FA8A0', '#A9C9BE', '#6B4A3A', '#C6DCD2'],
    water: 9, light: 80, growth: 0.8,
    bias: { leaf: 66, compact: 64, spine: 55, variegation: 24, bloom: 82, vigor: 50 },
    dex: '青白い粉を纏った丸い株姿。粉は雨や指で簡単に落ちるため、美しい個体ほど触れられていない。',
  },
  {
    id: 'isthmensis', no: 7, world: 'agave', ja: '雷神', en: 'Isthmensis', rarity: 3,
    types: ['硬葉', '幾何'], category: '幅広株',
    shape: { leaves: 4, lenK: 0.72, widthK: 1.80, openK: 1.30, curveK: 1.2, tip: 0.44 },
    form: 'rosette_wide', palette: ['#23342A', '#3F7B57', '#6BA97A', '#1B2A22', '#8FC49B'],
    water: 7, light: 82, growth: 0.75,
    bias: { leaf: 74, compact: 78, spine: 66, variegation: 40, bloom: 38, vigor: 44 },
    dex: '幅広で短い葉が密に重なる。詰めて作ると球体に近づき、上から見た輪郭が正円に寄っていく。',
  },
  {
    id: 'gracilius', no: 8, world: 'caudex', ja: 'グラキリス', en: 'Gracilius', rarity: 5,
    types: ['塊根'], category: '球塊根株',
    form: 'globe', palette: ['#6E6E58', '#9A9A83', '#C0BFA5', '#3D3D31', '#5C8F4E'],
    water: 5, light: 90, growth: 0.9,
    bias: { leaf: 30, compact: 68, spine: 48, variegation: 10, bloom: 30, vigor: 72 },
    dex: '銀色の球体から細い枝を伸ばす。休眠と成長期の切り替えを読み違えると、一年分の姿が崩れる。',
  },
  {
    id: 'pachypus', no: 9, world: 'caudex', ja: 'パキプス', en: 'Pachypus', rarity: 5,
    types: ['塊根', '硬葉'], category: '荒膚株',
    form: 'bottle', palette: ['#5C4632', '#8A6A4A', '#B08C64', '#33261A', '#6F9A57'],
    water: 6, light: 86, growth: 0.5,
    bias: { leaf: 26, compact: 80, spine: 55, variegation: 8, bloom: 20, vigor: 60 },
    dex: 'ひび割れた樹皮と、不釣り合いなほど繊細な葉を併せ持つ。発根という関門を越えた個体だけが辿り着く。',
  },
  {
    id: 'adenium', no: 10, world: 'caudex', ja: 'アデニウム', en: 'Adenium', rarity: 2,
    types: ['塊根', '花'], category: '花塊根株',
    form: 'adenium', palette: ['#6E7A68', '#93A08C', '#BCC6B4', '#3F4A3C', '#F090A8'],
    water: 4, light: 84, growth: 1.3,
    bias: { leaf: 44, compact: 50, spine: 20, variegation: 12, bloom: 25, vigor: 88 },
    dex: '太る速度が速く、変化を実感しやすい。条件が揃うと枝先に大きな花を咲かせる。',
  },
  {
    id: 'elephantipes', no: 11, world: 'caudex', ja: '亀甲竜', en: 'Elephantipes', rarity: 4,
    types: ['塊根', '幾何'], category: '亀甲株',
    form: 'turtle', palette: ['#4E3A26', '#7A5C3E', '#A6835B', '#2A1F14', '#6FA35A'],
    water: 7, light: 66, growth: 0.55,
    bias: { leaf: 38, compact: 88, spine: 12, variegation: 18, bloom: 15, vigor: 40 },
    dex: '塊根の表面が亀の甲羅状に割れる。夏に葉を落として眠り、涼しくなると蔓を伸ばして目を覚ます。',
  },
  {
    id: 'echeveria', no: 12, world: 'succulent', ja: 'エケベリア', en: 'Echeveria', rarity: 1,
    types: ['粉', '花'], category: '薔薇株',
    form: 'echeveria', palette: ['#7C9A87', '#9FBFA8', '#CFE0CB', '#E2A0B0', '#F2C4CC'],
    water: 6, light: 70, growth: 1.2,
    bias: { leaf: 68, compact: 62, spine: 8, variegation: 52, bloom: 76, vigor: 66 },
    dex: 'バラの花のように葉を重ねる。寒暖差と日照で葉先が赤く染まり、色そのものが季節の記録になる。',
  },
  {
    id: 'haworthia', no: 13, world: 'succulent', ja: 'ハオルチア', en: 'Haworthia', rarity: 2,
    types: ['窓'], category: '窓株',
    form: 'haworthia', palette: ['#274A38', '#3D6B4E', '#5C8F6C', '#9FD6C2', '#CDEDE2'],
    water: 5, light: 44, growth: 1.0,
    bias: { leaf: 52, compact: 70, spine: 22, variegation: 64, bloom: 30, vigor: 58 },
    dex: '葉の上面が半透明の「窓」になっていて、そこから光を取り込む。強すぎる光は窓を濁らせる。',
  },
  {
    id: 'lithops', no: 14, world: 'succulent', ja: 'リトープス', en: 'Lithops', rarity: 3,
    types: ['擬態', '幾何'], category: '擬態株',
    form: 'lithops', palette: ['#8A8168', '#B7AE93', '#D8D0B6', '#6E6650', '#98704E'],
    water: 12, light: 76, growth: 0.45,
    bias: { leaf: 34, compact: 94, spine: 4, variegation: 58, bloom: 44, vigor: 30 },
    dex: '石に擬態した二枚の葉。年に一度、古い葉を割って新しい体が現れる「脱皮」を行う。',
  },
];

export const SPECIES_BY_ID = Object.fromEntries(SPECIES.map((s) => [s.id, s]));

/* 無償で迎えられる入門種 */
export const STARTERS = ['titanota', 'echeveria', 'adenium', 'potatorum'];

export const SHOP = [
  { id: 'shade', ja: '遮光ネット', price: 180, icon: '▤', ja_desc: '害虫の発生を抑え、強すぎる日照のダメージを軽減する。' },
  { id: 'fertilizer', ja: '活力剤', price: 120, icon: '✦', ja_desc: '使うと養分 +45。成長力と葉幅が伸びやすくなる。' },
  { id: 'medicine', ja: '殺虫剤', price: 150, icon: '☣', ja_desc: '害虫を完全に駆除する。放置した害虫は個性値を削る。' },
  { id: 'pot', ja: 'スリット鉢', price: 260, icon: '◱', ja_desc: '根張りが良くなり、すべての株の経験値取得が 15% 増える。' },
  { id: 'seed', ja: '交配用種子', price: 400, icon: '◍', ja_desc: 'ラボでの交配に必要。親2株の個性値を継いだ実生が生まれる。' },
];

export const QUESTS = [
  { id: 'first_photo', ja: '最初の写真を記録する', reward: 80, check: (s) => s.stats.photos >= 1 },
  { id: 'first_water', ja: '水やりをする', reward: 60, check: (s) => s.stats.waterings >= 1 },
  { id: 'evolve_1', ja: 'はじめての進化', reward: 200, check: (s) => s.stats.evolutions >= 1 },
  { id: 'photo_5', ja: '写真を5枚ためる', reward: 160, check: (s) => s.stats.photos >= 5 },
  { id: 'measure_3', ja: '実測を3回入力する', reward: 180, check: (s) => s.stats.measures >= 3 },
  { id: 'collection_3', ja: '3株を同時に育てる', reward: 220, check: (s) => s.plants.length >= 3 },
  { id: 'evolve_branch', ja: '系統を確定させる', reward: 400, check: (s) => s.plants.some((p) => p.branch) },
  { id: 'contest_win', ja: '品評会で優勝する', reward: 320, check: (s) => s.stats.contestWins >= 1 },
  { id: 'cross_1', ja: '交配で実生を得る', reward: 360, check: (s) => s.plants.some((p) => p.parents) },
  { id: 'dex_5', ja: '図鑑を5種登録する', reward: 300, check: (s) => Object.keys(s.dex).length >= 5 },
];

/* 品評会の審査員 */
export const JUDGES = [
  { ja: '古参の棚主', likes: '硬葉', comment: '姿の完成度をなにより重んじる。' },
  { ja: '温室の主', likes: '塊根', comment: '幹の太さと年季を見る。' },
  { ja: '斑マニア', likes: '斑', comment: '葉に走る一本の線に金を出す。' },
  { ja: '棘フェチ', likes: '棘', comment: '鋸歯の鋭さしか見ていない。' },
  { ja: '粉の求道者', likes: '粉', comment: '触れられていない粉の乗りを評価する。' },
  { ja: '窓の収集家', likes: '窓', comment: '透明度と模様の対称性を測る。' },
  { ja: '幾何学の徒', likes: '幾何', comment: '対称性の崩れを見逃さない。' },
];

export const RIVAL_PREFIX = ['棚主', '温室勢', 'ベランダ組', '実生沼', '遮光職人', 'LED派', '週末園芸'];


/* ---------- 品種の英語テキスト ---------- */

export const SPECIES_EN = {
  titanota: { category: 'Hard-leaf', dex: 'Short, thick leaves with claw-like recurved teeth. Grown hard under strong light, the gaps between leaves close up until the plant reads as a clenched fist.' },
  oaxaca: { category: 'White-claw', dex: 'Leaf tips and teeth bleach to bone white. The whiteness only sharpens under dry, intense light; too much water dulls it back to green.' },
  reginae: { category: 'Geometric', dex: 'White lines are etched into every leaf, overlapping into a geometric pattern. Extremely slow, but almost never loses its shape.' },
  potatorum: { category: 'Beginner', dex: 'Red-brown teeth trim the leaf margins. Tough and forgiving, which is why it is so often somebody’s first plant.' },
  horrida: { category: 'Fierce-spine', dex: 'Hard black spines cover the whole body. The leaf tissue is so rigid that once it stretches, it never returns to form.' },
  parryi: { category: 'Blue-bloom', dex: 'A rounded rosette wrapped in pale blue farina. The bloom rubs off with rain or fingers, so the finest plants are the least handled.' },
  isthmensis: { category: 'Broad-leaf', dex: 'Broad, short leaves stack densely. Grown tight, the outline seen from above approaches a perfect circle.' },
  gracilius: { category: 'Globe caudex', dex: 'A silver sphere sending out thin branches. Misread the switch between dormancy and growth and a year of form is lost.' },
  pachypus: { category: 'Rough-bark', dex: 'Cracked bark paired with improbably delicate leaves. Only plants that survive the rooting ordeal ever get here.' },
  adenium: { category: 'Flowering caudex', dex: 'Fattens quickly, so change is easy to see. Given the right conditions, large flowers open at the branch tips.' },
  elephantipes: { category: 'Tortoise-shell', dex: 'The caudex splits into plates like a tortoise shell. It drops its leaves and sleeps through summer, waking with vines as it cools.' },
  echeveria: { category: 'Rosette', dex: 'Leaves layered like a rose. Cold nights and strong light flush the tips red, so its colour becomes a record of the season.' },
  haworthia: { category: 'Window', dex: 'The upper leaf surface is a translucent window that gathers light. Too much sun clouds it over.' },
  lithops: { category: 'Mimic', dex: 'Two fused leaves mimicking a stone. Once a year the old body splits open and a new one emerges.' },
};

/* ---------- UI 文言 ----------
 * ja / en は全画面ぶん。他の言語はナビと主要操作のみ定義し、
 * 残りは英語にフォールバックする(切り替えたことが確実に画面に出るようにするため)。
 */

const JA = {
  'nav.home': 'ホーム', 'nav.collection': '棚', 'nav.dex': '図鑑',
  'nav.timeline': '記録', 'nav.contest': '品評会', 'nav.lab': 'ラボ',
  'nav.shop': 'ショップ', 'nav.settings': '設定',

  'action.water': '水やり', 'action.fert': '施肥', 'action.pest': '駆除',
  'action.photo': '写真を記録', 'action.measure': '実測を入力',
  'action.evolve': '進化させる', 'action.close': '閉じる', 'action.save': '保存',
  'action.cancel': 'キャンセル', 'action.adopt': '株を迎える', 'action.open': '開く',
  'action.rename': '名前', 'action.help': '遊び方',

  'stat.hydration': '水分', 'stat.nutrition': '養分', 'stat.health': '健康',
  'stat.pest': '害虫', 'stat.exp': '経験値', 'stat.score': '総合', 'stat.care': '管理',

  'page.home.kicker': '棚のようす', 'page.home.title': 'おかえりなさい',
  'page.collection.kicker': 'コレクション', 'page.collection.title': '棚',
  'page.dex.kicker': '図鑑', 'page.dex.title': '図鑑',
  'page.dex.lead': '全 {total} 品種 × 4 系統 = {forms} フォーム。同じ品種でも育て方を変えると別の系統になります。',
  'page.log.kicker': '育成記録', 'page.log.title': '記録',
  'page.contest.kicker': '品評会', 'page.contest.title': '品評会',
  'page.contest.lead': '審査員には好みのタイプがあります。相性が合えば評価が 1.35 倍、苦手なタイプだと 0.78 倍になります。',
  'page.lab.kicker': '交配ラボ', 'page.lab.title': 'ラボ',
  'page.lab.lead': '成株以上の2株から実生を作ります。約20%で突然変異が出ます。',
  'page.shop.kicker': '道具', 'page.shop.title': 'ショップ',
  'page.settings.kicker': '設定', 'page.settings.title': '設定',
  'page.plant.back': '← 棚に戻る',

  'home.todo': 'やることリスト', 'home.next': '次にやること',
  'home.party': '手持ちの株', 'home.evolveLeft': '進化までの残り',
  'home.missions': 'ミッション', 'home.recent': '最近の出来事',
  'home.noplants': 'まだ株がありません', 'home.allDone': '対応が必要な株はありません',
  'home.attention': '手が必要な株',

  'sec.evolution': '進化', 'sec.tree': '進化系統図', 'sec.genes': '個性値',
  'sec.advice': '棚メイトの所見', 'sec.dexEntry': '図鑑説明', 'sec.care': 'ケア記録とコミュニティ比較',
  'sec.album': 'アルバム', 'sec.lineage': '交種構造', 'sec.cross': '交配',
  'sec.familyTree': '系統樹', 'sec.sell': '譲渡', 'sec.entry': '出品する株',
  'sec.branchComplete': '系統コンプリート', 'sec.stages': '成長段階',

  'label.stage': '段階', 'label.form': '系統', 'label.days': '日目',
  'label.records': '記録', 'label.nature': '性格', 'label.type': 'タイプ',
  'label.remaining': '残り', 'label.realtime': '実時間', 'label.coins': 'コイン',
  'label.owned': '所持', 'label.seeds': '種子', 'label.season': '季節',
  'label.light': '日照', 'label.ideal': '適正', 'label.rarity': 'レア度',
  'label.done': '達成', 'label.locked': '未解放', 'label.free': '無償で迎える',
  'label.dexNo': '図鑑番号', 'label.registered': '登録済み', 'label.unregistered': '未登録',
  'label.judge': '審査員', 'label.likes': '好みのタイプ', 'label.bonus': '補正',
  'label.pace': 'いまのペース', 'label.gameday': 'ゲーム日',

  'todo.title': 'まずはこの順番で進めてください',
  'todo.adopt': '棚に株を1つ迎える',
  'todo.photo': '実物の写真を1枚入れる(なければ後回しでOK)',
  'todo.water': '水をやる',
  'todo.evolve': '条件が揃ったら進化させる',
  'todo.contest': '品評会に出してみる',

  'evolve.can': '進化条件を満たしています。',
  'evolve.done': '完成株です。これ以上の段階はありません。',
  'evolve.until': '{stage} まで',
  'evolve.hint': '水やり(適正タイミングで +20)や実測(+18〜)で経験値が入り、その分だけ進化が早まります。',
  'evolve.branchHint': '成株になった時点で、下の4系統のうち比重の一番高いものに分岐します。育て方で誘導できます。',
  'evolve.fixed': '系統は {branch} で確定しています。',
  'evolve.happened': '{before} は {after} に進化した！',
  'evolve.changing': '株のかたちが変わりはじめた…！',

  'settings.pace': '時間の進み方', 'settings.pixel': 'ピクセル変換',
  'settings.lang': '言語', 'settings.data': 'データ', 'settings.warp': '時間を進める(体験用)',
  'settings.paceNote': '育成日数はすべて「ゲーム日」で数えます。ここでリアル時間との換算を決めます。変更しても進み具合は失われません。',
  'settings.dataNote': '写真も記録も端末内にだけ保存され、外部へ送信されません。',
  'settings.export': '書き出す', 'settings.import': '読み込む', 'settings.reset': '初期化',
  'settings.grid': 'グリッド解像度', 'settings.colors': '色数', 'settings.dither': 'ディザリングを使う',
  'settings.preview': 'プレビュー',

  'help.title': '遊び方',
  'help.body': '実物の写真をドット絵に変えて、育てるほどキャラクターが進化していく育成ゲームです。',

  'photo.title': '{name} の写真を記録',
  'photo.drop': '写真を選ぶ / ここにドロップ',
  'photo.note': '端末内で処理され、外部には送信されません。株が中央に大きく写り、背景が単純な写真ほど綺麗に変換できます。',
  'photo.result': 'この写真から読み取った個性値',
  'photo.save': 'この姿で記録する',
  'photo.original': '元写真', 'photo.pixel': 'ドット絵',

  'msg.adopted': '{name} を迎えました。性格は「{nature}」',
  'msg.photoSaved': '写真を記録しました',
  'msg.noPlants': '株がありません',
  'msg.generating': '画像を生成しています…',
  'msg.exported': '書き出しました',
  'msg.paceSet': 'ペースを「{pace}」にしました',
};

const EN = {
  'nav.home': 'HOME', 'nav.collection': 'SHELF', 'nav.dex': 'DEX',
  'nav.timeline': 'LOG', 'nav.contest': 'SHOW', 'nav.lab': 'LAB',
  'nav.shop': 'SHOP', 'nav.settings': 'SETTINGS',

  'action.water': 'Water', 'action.fert': 'Feed', 'action.pest': 'Treat',
  'action.photo': 'Add photo', 'action.measure': 'Measure',
  'action.evolve': 'Evolve', 'action.close': 'Close', 'action.save': 'Save',
  'action.cancel': 'Cancel', 'action.adopt': 'Adopt a plant', 'action.open': 'Open',
  'action.rename': 'Rename', 'action.help': 'How to play',

  'stat.hydration': 'Water', 'stat.nutrition': 'Nutrients', 'stat.health': 'Health',
  'stat.pest': 'Pests', 'stat.exp': 'EXP', 'stat.score': 'Score', 'stat.care': 'Care',

  'page.home.kicker': 'Your shelf', 'page.home.title': 'Welcome back',
  'page.collection.kicker': 'Collection', 'page.collection.title': 'Shelf',
  'page.dex.kicker': 'Living index', 'page.dex.title': 'Dex',
  'page.dex.lead': '{total} species × 4 forms = {forms} entries. The same species becomes a different form depending on how you grow it.',
  'page.log.kicker': 'Growth log', 'page.log.title': 'Log',
  'page.contest.kicker': 'Exhibition', 'page.contest.title': 'Show',
  'page.contest.lead': 'Each judge has a favourite type. A match scores ×1.35; a type they dislike scores ×0.78.',
  'page.lab.kicker': 'Hybrid lab', 'page.lab.title': 'Lab',
  'page.lab.lead': 'Cross two adult plants to raise a seedling. Roughly 20% carry a mutation.',
  'page.shop.kicker': 'Supply', 'page.shop.title': 'Shop',
  'page.settings.kicker': 'Settings', 'page.settings.title': 'Settings',
  'page.plant.back': '← Back to shelf',

  'home.todo': 'To do', 'home.next': 'Do this next',
  'home.party': 'Your plants', 'home.evolveLeft': 'Time to next evolution',
  'home.missions': 'Missions', 'home.recent': 'Recent events',
  'home.noplants': 'No plants yet', 'home.allDone': 'Nothing needs attention',
  'home.attention': 'Needs attention',

  'sec.evolution': 'Evolution', 'sec.tree': 'Evolution line', 'sec.genes': 'Traits',
  'sec.advice': 'Shelf-mate notes', 'sec.dexEntry': 'Dex entry', 'sec.care': 'Care log vs community',
  'sec.album': 'Album', 'sec.lineage': 'Parentage', 'sec.cross': 'Cross',
  'sec.familyTree': 'Family tree', 'sec.sell': 'Rehome', 'sec.entry': 'Plant to enter',
  'sec.branchComplete': 'Form completion', 'sec.stages': 'Growth stages',

  'label.stage': 'Stage', 'label.form': 'Form', 'label.days': 'days old',
  'label.records': 'logs', 'label.nature': 'Nature', 'label.type': 'Type',
  'label.remaining': 'Left', 'label.realtime': 'real time', 'label.coins': 'Coins',
  'label.owned': 'Owned', 'label.seeds': 'Seeds', 'label.season': 'Season',
  'label.light': 'Light', 'label.ideal': 'ideal', 'label.rarity': 'Rarity',
  'label.done': 'Done', 'label.locked': 'Locked', 'label.free': 'Adopt for free',
  'label.dexNo': 'Dex No.', 'label.registered': 'Registered', 'label.unregistered': 'Not registered',
  'label.judge': 'Judge', 'label.likes': 'Favourite type', 'label.bonus': 'Modifier',
  'label.pace': 'Current pace', 'label.gameday': 'game day',

  'todo.title': 'Follow these in order',
  'todo.adopt': 'Adopt one plant',
  'todo.photo': 'Add one photo of the real plant (optional for now)',
  'todo.water': 'Water it',
  'todo.evolve': 'Evolve it once the conditions are met',
  'todo.contest': 'Enter a show',

  'evolve.can': 'All conditions are met.',
  'evolve.done': 'Fully grown. There is no further stage.',
  'evolve.until': 'Until {stage}',
  'evolve.hint': 'Watering on schedule (+20) and measuring (+18) both add EXP, which brings the evolution forward.',
  'evolve.branchHint': 'On reaching adult, it branches into whichever of the four forms weighs heaviest. How you grow it decides which.',
  'evolve.fixed': 'The form is locked in as {branch}.',
  'evolve.happened': '{before} evolved into {after}!',
  'evolve.changing': 'Something about its shape is changing…!',

  'settings.pace': 'Pace of time', 'settings.pixel': 'Pixel conversion',
  'settings.lang': 'Language', 'settings.data': 'Data', 'settings.warp': 'Skip ahead (for trying it out)',
  'settings.paceNote': 'All growth is counted in game days. This sets how they map onto real time. Changing it keeps your progress.',
  'settings.dataNote': 'Photos and records are stored only on this device and never sent anywhere.',
  'settings.export': 'Export', 'settings.import': 'Import', 'settings.reset': 'Reset',
  'settings.grid': 'Grid resolution', 'settings.colors': 'Colours', 'settings.dither': 'Use dithering',
  'settings.preview': 'Preview',

  'help.title': 'How to play',
  'help.body': 'Turn a photo of your real plant into pixel art, then watch the character evolve as you grow it.',

  'photo.title': 'Add a photo of {name}',
  'photo.drop': 'Choose a photo, or drop one here',
  'photo.note': 'Processing happens on your device; nothing is uploaded. Photos with the plant large and centred against a plain background convert best.',
  'photo.result': 'Traits read from this photo',
  'photo.save': 'Record this form',
  'photo.original': 'Photo', 'photo.pixel': 'Pixel art',

  'msg.adopted': 'You adopted {name}. Its nature is “{nature}”.',
  'msg.photoSaved': 'Photo recorded',
  'msg.noPlants': 'No plants available',
  'msg.generating': 'Generating image…',
  'msg.exported': 'Exported',
  'msg.paceSet': 'Pace set to “{pace}”',
};

/* 他言語はナビ・主要操作のみ差し替え、残りは英語 */
const partial = (over) => ({ ...EN, ...over });

export const I18N = {
  ja: JA,
  en: EN,
  'zh-Hant': partial({
    'nav.home': '首頁', 'nav.collection': '收藏', 'nav.dex': '圖鑑', 'nav.timeline': '紀錄',
    'nav.contest': '品評會', 'nav.lab': '實驗室', 'nav.shop': '商店', 'nav.settings': '設定',
    'action.water': '澆水', 'action.fert': '施肥', 'action.pest': '除蟲', 'action.photo': '新增紀錄',
    'action.measure': '輸入實測', 'action.evolve': '進化', 'action.close': '關閉', 'action.save': '儲存',
    'action.cancel': '取消', 'action.adopt': '迎接植株', 'action.help': '玩法',
    'page.home.title': '歡迎回來', 'home.todo': '待辦', 'home.party': '你的植株',
    'stat.hydration': '水分', 'stat.nutrition': '養分', 'stat.health': '健康', 'stat.pest': '害蟲',
  }),
  'zh-Hans': partial({
    'nav.home': '首页', 'nav.collection': '收藏', 'nav.dex': '图鉴', 'nav.timeline': '记录',
    'nav.contest': '品评会', 'nav.lab': '实验室', 'nav.shop': '商店', 'nav.settings': '设置',
    'action.water': '浇水', 'action.fert': '施肥', 'action.pest': '除虫', 'action.photo': '添加记录',
    'action.measure': '输入实测', 'action.evolve': '进化', 'action.close': '关闭', 'action.save': '保存',
    'action.cancel': '取消', 'action.adopt': '迎接植株', 'action.help': '玩法',
    'page.home.title': '欢迎回来', 'home.todo': '待办', 'home.party': '你的植株',
    'stat.hydration': '水分', 'stat.nutrition': '养分', 'stat.health': '健康', 'stat.pest': '害虫',
  }),
  ko: partial({
    'nav.home': '홈', 'nav.collection': '컬렉션', 'nav.dex': '도감', 'nav.timeline': '기록',
    'nav.contest': '품평회', 'nav.lab': '연구실', 'nav.shop': '상점', 'nav.settings': '설정',
    'action.water': '물주기', 'action.fert': '시비', 'action.pest': '방제', 'action.photo': '기록 추가',
    'action.measure': '실측 입력', 'action.evolve': '진화', 'action.close': '닫기', 'action.save': '저장',
    'action.cancel': '취소', 'action.adopt': '개체 들이기', 'action.help': '플레이 방법',
    'page.home.title': '다시 오셨네요', 'home.todo': '할 일', 'home.party': '보유 개체',
    'stat.hydration': '수분', 'stat.nutrition': '양분', 'stat.health': '건강', 'stat.pest': '해충',
  }),
  es: partial({
    'nav.home': 'INICIO', 'nav.collection': 'COLECCIÓN', 'nav.dex': 'ÍNDICE', 'nav.timeline': 'REGISTRO',
    'nav.contest': 'CONCURSO', 'nav.lab': 'LABORATORIO', 'nav.shop': 'TIENDA', 'nav.settings': 'AJUSTES',
    'action.water': 'Regar', 'action.fert': 'Abonar', 'action.pest': 'Tratar', 'action.photo': 'Añadir foto',
    'action.measure': 'Medir', 'action.evolve': 'Evolucionar', 'action.close': 'Cerrar', 'action.save': 'Guardar',
    'action.cancel': 'Cancelar', 'action.adopt': 'Adoptar una planta', 'action.help': 'Cómo jugar',
    'page.home.title': 'Bienvenido de nuevo', 'home.todo': 'Por hacer', 'home.party': 'Tus plantas',
    'stat.hydration': 'Agua', 'stat.nutrition': 'Nutrientes', 'stat.health': 'Salud', 'stat.pest': 'Plagas',
  }),
  fr: partial({
    'nav.home': 'ACCUEIL', 'nav.collection': 'COLLECTION', 'nav.dex': 'INDEX', 'nav.timeline': 'JOURNAL',
    'nav.contest': 'CONCOURS', 'nav.lab': 'LABO', 'nav.shop': 'BOUTIQUE', 'nav.settings': 'RÉGLAGES',
    'action.water': 'Arroser', 'action.fert': 'Nourrir', 'action.pest': 'Traiter', 'action.photo': 'Ajouter une photo',
    'action.measure': 'Mesurer', 'action.evolve': 'Évoluer', 'action.close': 'Fermer', 'action.save': 'Enregistrer',
    'action.cancel': 'Annuler', 'action.adopt': 'Adopter une plante', 'action.help': 'Comment jouer',
    'page.home.title': 'Bon retour', 'home.todo': 'À faire', 'home.party': 'Vos plantes',
    'stat.hydration': 'Eau', 'stat.nutrition': 'Nutriments', 'stat.health': 'Santé', 'stat.pest': 'Nuisibles',
  }),
};
