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
    form: 'rosette_wide', palette: ['#2C5B41', '#4E8F63', '#7BC086', '#16241C', '#A8D8A0'],
    water: 7, light: 88, growth: 1.0,
    bias: { leaf: 62, compact: 70, spine: 78, variegation: 20, bloom: 35, vigor: 55 },
    dex: '短く分厚い葉と、爪のように反り返った鋸歯を持つ。強い光で締めて育てるほど葉の間隔が詰まり、拳のような塊になる。',
  },
  {
    id: 'oaxaca', no: 2, world: 'agave', ja: 'オアハカ', en: 'Oaxacensis', rarity: 4,
    types: ['硬葉', '粉'], category: '白爪株',
    form: 'rosette_long', palette: ['#3A6B52', '#5C8F72', '#8FC49B', '#E8EDDF', '#C9DCC4'],
    water: 8, light: 92, growth: 0.85,
    bias: { leaf: 70, compact: 74, spine: 84, variegation: 18, bloom: 45, vigor: 48 },
    dex: '葉先と鋸歯が白く抜ける。乾いた強光下でのみ白さが冴え、水を与えすぎると鈍く緑がかってしまう。',
  },
  {
    id: 'reginae', no: 3, world: 'agave', ja: '笹の雪', en: 'Victoriae-reginae', rarity: 3,
    types: ['幾何', '硬葉'], category: '幾何株',
    form: 'geometric', palette: ['#1C4430', '#2F6B47', '#4E9163', '#EAF2E4', '#EAF2E4'],
    water: 9, light: 78, growth: 0.6,
    bias: { leaf: 45, compact: 86, spine: 40, variegation: 46, bloom: 70, vigor: 35 },
    dex: '葉に白い線が刻まれ、重なり合って幾何学模様を描く。成長は極端に遅いが、崩れた姿になりにくい。',
  },
  {
    id: 'potatorum', no: 4, world: 'agave', ja: '吉祥冠', en: 'Potatorum', rarity: 2,
    types: ['硬葉'], category: '入門株',
    form: 'rosette_wide', palette: ['#3C6B4E', '#6FA184', '#9AC7A5', '#8A4B33', '#B5D8B8'],
    water: 6, light: 74, growth: 1.15,
    bias: { leaf: 58, compact: 55, spine: 62, variegation: 34, bloom: 40, vigor: 68 },
    dex: '赤褐色の鋸歯が縁を彩る。丈夫で失敗が少なく、最初の一株として選ばれることが多い。',
  },
  {
    id: 'horrida', no: 5, world: 'agave', ja: 'ホリダ', en: 'Horrida', rarity: 3,
    types: ['棘'], category: '猛棘株',
    form: 'rosette_long', palette: ['#2B4A31', '#4A7A4E', '#6E9E68', '#14201A', '#3A5C3E'],
    water: 8, light: 84, growth: 0.7,
    bias: { leaf: 40, compact: 72, spine: 90, variegation: 15, bloom: 25, vigor: 42 },
    dex: '硬く黒い棘が全身を覆う。葉質が非常に硬いため、一度徒長すると二度と元の姿には戻らない。',
  },
  {
    id: 'parryi', no: 6, world: 'agave', ja: 'パリー', en: 'Parryi', rarity: 2,
    types: ['粉', '硬葉'], category: '青粉株',
    form: 'rosette_wide', palette: ['#4E756E', '#7FA8A0', '#A9C9BE', '#6B4A3A', '#C6DCD2'],
    water: 9, light: 80, growth: 0.8,
    bias: { leaf: 66, compact: 64, spine: 55, variegation: 24, bloom: 82, vigor: 50 },
    dex: '青白い粉を纏った丸い株姿。粉は雨や指で簡単に落ちるため、美しい個体ほど触れられていない。',
  },
  {
    id: 'isthmensis', no: 7, world: 'agave', ja: '雷神', en: 'Isthmensis', rarity: 3,
    types: ['硬葉', '幾何'], category: '幅広株',
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
export const STARTERS = ['titanota', 'potatorum', 'echeveria', 'adenium'];

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

/* ---------- UI 文言(7言語) ---------- */

export const I18N = {
  ja: {
    'nav.home': 'ホーム', 'nav.collection': 'コレクション', 'nav.dex': '図鑑',
    'nav.timeline': '記録', 'nav.contest': '品評会', 'nav.lab': 'ラボ',
    'nav.shop': 'ショップ', 'nav.settings': '設定',
    'action.water': '水やり', 'action.fert': '施肥', 'action.pest': '駆除',
    'action.photo': '写真を記録', 'action.measure': '実測を入力',
    'action.evolve': '進化させる', 'action.close': '閉じる', 'action.save': '保存',
    'action.cancel': 'キャンセル',
    'stat.hydration': '水分', 'stat.nutrition': '養分', 'stat.health': '健康',
    'stat.pest': '害虫', 'stat.exp': '経験値', 'stat.score': '総合',
  },
  en: {
    'nav.home': 'HOME', 'nav.collection': 'COLLECTION', 'nav.dex': 'DEX',
    'nav.timeline': 'LOG', 'nav.contest': 'SHOW', 'nav.lab': 'LAB',
    'nav.shop': 'SHOP', 'nav.settings': 'SETTINGS',
    'action.water': 'WATER', 'action.fert': 'FEED', 'action.pest': 'TREAT',
    'action.photo': 'ADD PHOTO', 'action.measure': 'MEASURE',
    'action.evolve': 'EVOLVE', 'action.close': 'CLOSE', 'action.save': 'SAVE',
    'action.cancel': 'CANCEL',
    'stat.hydration': 'WATER', 'stat.nutrition': 'NUTRI', 'stat.health': 'HEALTH',
    'stat.pest': 'PESTS', 'stat.exp': 'EXP', 'stat.score': 'SCORE',
  },
  'zh-Hant': {
    'nav.home': '首頁', 'nav.collection': '收藏', 'nav.dex': '圖鑑',
    'nav.timeline': '紀錄', 'nav.contest': '品評會', 'nav.lab': '實驗室',
    'nav.shop': '商店', 'nav.settings': '設定',
    'action.water': '澆水', 'action.fert': '施肥', 'action.pest': '除蟲',
    'action.photo': '新增紀錄', 'action.measure': '輸入實測',
    'action.evolve': '進化', 'action.close': '關閉', 'action.save': '儲存',
    'action.cancel': '取消',
    'stat.hydration': '水分', 'stat.nutrition': '養分', 'stat.health': '健康',
    'stat.pest': '害蟲', 'stat.exp': '經驗值', 'stat.score': '總分',
  },
  'zh-Hans': {
    'nav.home': '首页', 'nav.collection': '收藏', 'nav.dex': '图鉴',
    'nav.timeline': '记录', 'nav.contest': '品评会', 'nav.lab': '实验室',
    'nav.shop': '商店', 'nav.settings': '设置',
    'action.water': '浇水', 'action.fert': '施肥', 'action.pest': '除虫',
    'action.photo': '添加记录', 'action.measure': '输入实测',
    'action.evolve': '进化', 'action.close': '关闭', 'action.save': '保存',
    'action.cancel': '取消',
    'stat.hydration': '水分', 'stat.nutrition': '养分', 'stat.health': '健康',
    'stat.pest': '害虫', 'stat.exp': '经验值', 'stat.score': '总分',
  },
  ko: {
    'nav.home': '홈', 'nav.collection': '컬렉션', 'nav.dex': '도감',
    'nav.timeline': '기록', 'nav.contest': '품평회', 'nav.lab': '연구실',
    'nav.shop': '상점', 'nav.settings': '설정',
    'action.water': '물주기', 'action.fert': '시비', 'action.pest': '방제',
    'action.photo': '기록 추가', 'action.measure': '실측 입력',
    'action.evolve': '진화', 'action.close': '닫기', 'action.save': '저장',
    'action.cancel': '취소',
    'stat.hydration': '수분', 'stat.nutrition': '양분', 'stat.health': '건강',
    'stat.pest': '해충', 'stat.exp': '경험치', 'stat.score': '종합',
  },
  es: {
    'nav.home': 'INICIO', 'nav.collection': 'COLECCIÓN', 'nav.dex': 'ÍNDICE',
    'nav.timeline': 'REGISTRO', 'nav.contest': 'CONCURSO', 'nav.lab': 'LABORATORIO',
    'nav.shop': 'TIENDA', 'nav.settings': 'AJUSTES',
    'action.water': 'REGAR', 'action.fert': 'ABONAR', 'action.pest': 'TRATAR',
    'action.photo': 'AÑADIR FOTO', 'action.measure': 'MEDIR',
    'action.evolve': 'EVOLUCIONAR', 'action.close': 'CERRAR', 'action.save': 'GUARDAR',
    'action.cancel': 'CANCELAR',
    'stat.hydration': 'AGUA', 'stat.nutrition': 'NUTRIENTES', 'stat.health': 'SALUD',
    'stat.pest': 'PLAGAS', 'stat.exp': 'EXP', 'stat.score': 'PUNTOS',
  },
  fr: {
    'nav.home': 'ACCUEIL', 'nav.collection': 'COLLECTION', 'nav.dex': 'INDEX',
    'nav.timeline': 'JOURNAL', 'nav.contest': 'CONCOURS', 'nav.lab': 'LABO',
    'nav.shop': 'BOUTIQUE', 'nav.settings': 'RÉGLAGES',
    'action.water': 'ARROSER', 'action.fert': 'NOURRIR', 'action.pest': 'TRAITER',
    'action.photo': 'AJOUTER UNE PHOTO', 'action.measure': 'MESURER',
    'action.evolve': 'ÉVOLUER', 'action.close': 'FERMER', 'action.save': 'ENREGISTRER',
    'action.cancel': 'ANNULER',
    'stat.hydration': 'EAU', 'stat.nutrition': 'NUTRIMENTS', 'stat.health': 'SANTÉ',
    'stat.pest': 'NUISIBLES', 'stat.exp': 'EXP', 'stat.score': 'SCORE',
  },
};
