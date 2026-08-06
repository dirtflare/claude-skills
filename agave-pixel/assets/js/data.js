/* PIXAGAVE — 静的データ定義
 * 品種 / 遺伝子 / 進化系統 / アイテム / クエスト / 文言
 * すべてオリジナル定義。外部アセットへの依存なし。
 */

export const STAGES = [
  { key: 'seedling', ja: '実生', en: 'SEEDLING', minLeaves: 2 },
  { key: 'sprout', ja: '幼苗', en: 'SPROUT', minLeaves: 5 },
  { key: 'juvenile', ja: '若株', en: 'JUVENILE', minLeaves: 9 },
  { key: 'adult', ja: '成株', en: 'ADULT', minLeaves: 14 },
  { key: 'prime', ja: '完成株', en: 'PRIME', minLeaves: 20 },
];

/* 進化条件。「実際の育成」が進まないと上がらないよう、
 * 経験値・経過日数・記録写真枚数・実測サイズの伸びを AND 条件にしている。 */
export const STAGE_REQUIREMENTS = [
  null,
  { exp: 120, days: 3, photos: 2, growth: 0 },
  { exp: 420, days: 14, photos: 4, growth: 3 },
  { exp: 1000, days: 45, photos: 7, growth: 8 },
  { exp: 2200, days: 120, photos: 12, growth: 15 },
];

/* 分岐進化。成株(stage 3)到達時に、育て方の実績と個性値から系統が確定する。 */
export const BRANCHES = {
  compact: {
    ja: '締型', en: 'COMPACT', color: '#5fe3c0',
    ja_desc: '徹底した強光と辛めの水やりで、葉間が詰まった低く固い姿になった系統。',
    stat: 'compact',
  },
  nishiki: {
    ja: '錦', en: 'NISHIKI', color: '#ffd166',
    ja_desc: '斑が覚醒し、葉に光の帯を宿した系統。日焼けに弱く、繊細な遮光管理を要求する。',
    stat: 'variegation',
  },
  fang: {
    ja: '鬼爪', en: 'FANG', color: '#f28fb0',
    ja_desc: '鋸歯と棘が過剰に発達した系統。荒々しい輪郭が最大の武器。',
    stat: 'spine',
  },
  titan: {
    ja: '巨大', en: 'TITAN', color: '#8ab6ff',
    ja_desc: '潤沢な水と養分を吸い上げ、圧倒的な体積で他を沈黙させる系統。',
    stat: 'vigor',
  },
};

export const WORLDS = {
  agave: { ja: 'アガベ', en: 'AGAVE', color: '#5fe3c0' },
  caudex: { ja: '塊根', en: 'CAUDEX', color: '#f2b05c' },
  succulent: { ja: '多肉', en: 'SUCCULENT', color: '#f28fb0' },
};

/* 個性値(遺伝子)。写真の解析結果と種のバイアスから 0-100 で決まる。 */
export const GENES = {
  leaf: { ja: '葉幅', en: 'LEAF', icon: '◧' },
  compact: { ja: '締まり', en: 'COMPACT', icon: '◈' },
  spine: { ja: '棘', en: 'SPINE', icon: '✳' },
  variegation: { ja: '斑', en: 'VARIEG.', icon: '◐' },
  bloom: { ja: '白粉', en: 'BLOOM', icon: '❋' },
  vigor: { ja: '成長力', en: 'VIGOR', icon: '▲' },
};

export const GENE_KEYS = Object.keys(GENES);

/* 品種マスタ。
 * water: 適正な潅水間隔(日) / light: 適正日照(0-100) / growth: 成長速度係数
 * bias: 個性値の種バイアス / palette: ピクセル化の基調色相 */
export const SPECIES = [
  {
    id: 'titanota', world: 'agave', ja: 'チタノタ', en: 'Titanota', rarity: 3,
    water: 7, light: 88, growth: 1.0, hue: 150,
    bias: { leaf: 62, compact: 70, spine: 78, variegation: 20, bloom: 35, vigor: 55 },
    ja_note: '短く分厚い葉と強烈な鋸歯。締めて作るほど価値が跳ね上がる王道。',
  },
  {
    id: 'oaxaca', world: 'agave', ja: 'オアハカ', en: 'Oaxacensis', rarity: 4,
    water: 8, light: 92, growth: 0.85, hue: 165,
    bias: { leaf: 70, compact: 74, spine: 84, variegation: 18, bloom: 45, vigor: 48 },
    ja_note: '白爪と幅広の葉。乾かし気味の強光管理で真価を発揮する。',
  },
  {
    id: 'reginae', world: 'agave', ja: '笹の雪', en: 'Victoriae-reginae', rarity: 3,
    water: 9, light: 78, growth: 0.6, hue: 158,
    bias: { leaf: 45, compact: 86, spine: 40, variegation: 46, bloom: 70, vigor: 35 },
    ja_note: '白い覆輪模様が幾何学的に重なる。成長は遅いが姿は崩れにくい。',
  },
  {
    id: 'potatorum', world: 'agave', ja: '吉祥冠', en: 'Potatorum', rarity: 2,
    water: 6, light: 74, growth: 1.15, hue: 140,
    bias: { leaf: 58, compact: 55, spine: 62, variegation: 34, bloom: 40, vigor: 68 },
    ja_note: '赤褐色の鋸歯が映える定番種。丈夫で最初の一株に向く。',
  },
  {
    id: 'horrida', world: 'agave', ja: 'ホリダ', en: 'Horrida', rarity: 3,
    water: 8, light: 84, growth: 0.7, hue: 148,
    bias: { leaf: 40, compact: 72, spine: 90, variegation: 15, bloom: 25, vigor: 42 },
    ja_note: '名前のとおり「恐ろしい」棘。硬い葉質は徒長を許さない。',
  },
  {
    id: 'parryi', world: 'agave', ja: 'パリー', en: 'Parryi', rarity: 2,
    water: 9, light: 80, growth: 0.8, hue: 172,
    bias: { leaf: 66, compact: 64, spine: 55, variegation: 24, bloom: 82, vigor: 50 },
    ja_note: '青白い粉を纏った丸い株姿。耐寒性が高く屋外管理向き。',
  },
  {
    id: 'isthmensis', world: 'agave', ja: '雷神', en: 'Isthmensis', rarity: 3,
    water: 7, light: 82, growth: 0.75, hue: 135,
    bias: { leaf: 74, compact: 78, spine: 66, variegation: 40, bloom: 38, vigor: 44 },
    ja_note: '幅広で短い葉が密に重なる。詰めて作れば拳のような塊になる。',
  },
  {
    id: 'gracilius', world: 'caudex', ja: 'グラキリス', en: 'Gracilius', rarity: 5,
    water: 5, light: 90, growth: 0.9, hue: 96,
    bias: { leaf: 30, compact: 68, spine: 48, variegation: 10, bloom: 30, vigor: 72 },
    ja_note: '球状の幹に細い枝。休眠と成長期の切り替えを読み違えると一気に崩れる。',
  },
  {
    id: 'pachypus', world: 'caudex', ja: 'パキプス', en: 'Pachypus', rarity: 5,
    water: 6, light: 86, growth: 0.5, hue: 60,
    bias: { leaf: 26, compact: 80, spine: 55, variegation: 8, bloom: 20, vigor: 60 },
    ja_note: '荒々しい樹皮と繊細な葉。発根管理を越えた個体だけが辿り着く領域。',
  },
  {
    id: 'adenium', world: 'caudex', ja: 'アデニウム', en: 'Adenium', rarity: 2,
    water: 4, light: 84, growth: 1.3, hue: 40,
    bias: { leaf: 44, compact: 50, spine: 20, variegation: 12, bloom: 25, vigor: 88 },
    ja_note: '太る速度が速く、変化を実感しやすい入門塊根。花も上がる。',
  },
  {
    id: 'elephantipes', world: 'caudex', ja: '亀甲竜', en: 'Elephantipes', rarity: 4,
    water: 7, light: 66, growth: 0.55, hue: 30,
    bias: { leaf: 38, compact: 88, spine: 12, variegation: 18, bloom: 15, vigor: 40 },
    ja_note: '亀の甲羅状に割れる塊根。夏に落葉する冬型のリズムを持つ。',
  },
  {
    id: 'echeveria', world: 'succulent', ja: 'エケベリア', en: 'Echeveria', rarity: 1,
    water: 6, light: 70, growth: 1.2, hue: 330,
    bias: { leaf: 68, compact: 62, spine: 8, variegation: 52, bloom: 76, vigor: 66 },
    ja_note: 'バラ状のロゼット。温度差と日照で紅葉し、色が季節の記録になる。',
  },
  {
    id: 'haworthia', world: 'succulent', ja: 'ハオルチア', en: 'Haworthia', rarity: 2,
    water: 5, light: 44, growth: 1.0, hue: 190,
    bias: { leaf: 52, compact: 70, spine: 22, variegation: 64, bloom: 30, vigor: 58 },
    ja_note: '半透明の窓が光を通す。強光は厳禁で、遮光の丁寧さがそのまま姿に出る。',
  },
  {
    id: 'lithops', world: 'succulent', ja: 'リトープス', en: 'Lithops', rarity: 3,
    water: 12, light: 76, growth: 0.45, hue: 20,
    bias: { leaf: 34, compact: 94, spine: 4, variegation: 58, bloom: 44, vigor: 30 },
    ja_note: '石に擬態する二枚葉。脱皮のサイクルを外すと一年分の記録が飛ぶ。',
  },
];

export const SPECIES_BY_ID = Object.fromEntries(SPECIES.map((s) => [s.id, s]));

/* 初期配布 = 入手しやすい種のみ */
export const STARTERS = ['titanota', 'potatorum', 'echeveria', 'adenium'];

export const SHOP = [
  {
    id: 'shade', ja: '遮光ネット', en: 'Shade Net', price: 180, icon: '▤',
    ja_desc: '日照上限を 15 下げ、葉焼けリスクを抑える。錦系統の必需品。',
  },
  {
    id: 'fertilizer', ja: '活力剤', en: 'Vitalizer', price: 120, icon: '✦',
    ja_desc: '使用すると養分 +45。成長力の伸びが良くなる。',
  },
  {
    id: 'medicine', ja: '殺虫剤', en: 'Pesticide', price: 150, icon: '☣',
    ja_desc: '害虫を完全に駆除する。放置した害虫は個性値を削る。',
  },
  {
    id: 'pot', ja: 'スリット鉢', en: 'Slit Pot', price: 260, icon: '◱',
    ja_desc: '根張りが改善し、経験値取得が 15% 増加する(全株に適用)。',
  },
  {
    id: 'seed', ja: '交配用種子', en: 'Seed Kit', price: 400, icon: '◍',
    ja_desc: 'ラボでの交配に必要。親2株の個性値を受け継ぐ実生が生まれる。',
  },
];

export const QUESTS = [
  { id: 'first_photo', ja: '最初の記録を残す', reward: 80, check: (s) => s.stats.photos >= 1 },
  { id: 'photo_5', ja: '記録写真を5枚ためる', reward: 160, check: (s) => s.stats.photos >= 5 },
  { id: 'evolve_1', ja: 'はじめての進化', reward: 200, check: (s) => s.stats.evolutions >= 1 },
  { id: 'evolve_branch', ja: '系統を確定させる', reward: 400, check: (s) => s.plants.some((p) => p.branch) },
  { id: 'collection_3', ja: '3株を同時に育てる', reward: 220, check: (s) => s.plants.length >= 3 },
  { id: 'measure_3', ja: '実測を3回入力する', reward: 180, check: (s) => s.stats.measures >= 3 },
  { id: 'contest_win', ja: '品評会で勝利する', reward: 320, check: (s) => s.stats.contestWins >= 1 },
  { id: 'cross_1', ja: '交配で実生を得る', reward: 360, check: (s) => s.plants.some((p) => p.parents) },
  { id: 'dex_5', ja: '図鑑を5種登録する', reward: 300, check: (s) => Object.keys(s.dex).length >= 5 },
  { id: 'streak_7', ja: '7日連続でログインする', reward: 250, check: (s) => s.stats.streak >= 7 },
];

/* UI 文言。ja / en の2言語。品種名などは data 側に併記済み。 */
export const I18N = {
  ja: {
    'app.tagline': '育てた実物が、そのままキャラクターになる',
    'nav.home': 'ホーム', 'nav.collection': 'コレクション', 'nav.dex': '図鑑',
    'nav.timeline': '記録', 'nav.contest': '品評会', 'nav.lab': 'ラボ',
    'nav.shop': 'ショップ', 'nav.settings': '設定',
    'home.today': '今日のケア', 'home.noplant': 'まだ株がありません',
    'home.start': '最初の株を迎える',
    'action.water': '水やり', 'action.fert': '施肥', 'action.pest': '駆除',
    'action.photo': '写真を記録', 'action.measure': '実測を入力',
    'action.evolve': '進化させる', 'action.close': '閉じる', 'action.save': '保存',
    'action.cancel': 'キャンセル',
    'stat.hydration': '水分', 'stat.light': '日照', 'stat.nutrition': '養分',
    'stat.health': '健康', 'stat.exp': '経験値', 'stat.score': '総合スコア',
    'label.stage': '段階', 'label.branch': '系統', 'label.days': '育成日数',
    'label.photos': '記録', 'label.coins': 'コイン',
  },
  en: {
    'app.tagline': 'Your real plant, rendered as a living pixel character',
    'nav.home': 'HOME', 'nav.collection': 'COLLECTION', 'nav.dex': 'DEX',
    'nav.timeline': 'LOG', 'nav.contest': 'SHOW', 'nav.lab': 'LAB',
    'nav.shop': 'SHOP', 'nav.settings': 'SETTINGS',
    'home.today': "TODAY'S CARE", 'home.noplant': 'No specimens yet',
    'home.start': 'Adopt your first plant',
    'action.water': 'WATER', 'action.fert': 'FEED', 'action.pest': 'TREAT',
    'action.photo': 'ADD PHOTO', 'action.measure': 'MEASURE',
    'action.evolve': 'EVOLVE', 'action.close': 'CLOSE', 'action.save': 'SAVE',
    'action.cancel': 'CANCEL',
    'stat.hydration': 'WATER', 'stat.light': 'LIGHT', 'stat.nutrition': 'NUTRI',
    'stat.health': 'HEALTH', 'stat.exp': 'EXP', 'stat.score': 'SCORE',
    'label.stage': 'STAGE', 'label.branch': 'FORM', 'label.days': 'DAYS',
    'label.photos': 'LOGS', 'label.coins': 'COINS',
  },
  'zh-Hant': {
    'app.tagline': '把實際栽培中的植株，變成會進化的像素角色',
    'nav.home': '首頁', 'nav.collection': '收藏', 'nav.dex': '圖鑑',
    'nav.timeline': '紀錄', 'nav.contest': '品評會', 'nav.lab': '實驗室',
    'nav.shop': '商店', 'nav.settings': '設定',
    'home.today': '今日照護', 'home.noplant': '還沒有植株',
    'home.start': '迎接第一株',
    'action.water': '澆水', 'action.fert': '施肥', 'action.pest': '除蟲',
    'action.photo': '新增紀錄', 'action.measure': '輸入實測',
    'action.evolve': '進化', 'action.close': '關閉', 'action.save': '儲存',
    'action.cancel': '取消',
    'stat.hydration': '水分', 'stat.light': '光照', 'stat.nutrition': '養分',
    'stat.health': '健康', 'stat.exp': '經驗值', 'stat.score': '總分',
    'label.stage': '階段', 'label.branch': '系統', 'label.days': '天數',
    'label.photos': '紀錄', 'label.coins': '金幣',
  },
  'zh-Hans': {
    'app.tagline': '把实际栽培中的植株，变成会进化的像素角色',
    'nav.home': '首页', 'nav.collection': '收藏', 'nav.dex': '图鉴',
    'nav.timeline': '记录', 'nav.contest': '品评会', 'nav.lab': '实验室',
    'nav.shop': '商店', 'nav.settings': '设置',
    'home.today': '今日养护', 'home.noplant': '还没有植株',
    'home.start': '迎接第一株',
    'action.water': '浇水', 'action.fert': '施肥', 'action.pest': '除虫',
    'action.photo': '添加记录', 'action.measure': '输入实测',
    'action.evolve': '进化', 'action.close': '关闭', 'action.save': '保存',
    'action.cancel': '取消',
    'stat.hydration': '水分', 'stat.light': '光照', 'stat.nutrition': '养分',
    'stat.health': '健康', 'stat.exp': '经验值', 'stat.score': '总分',
    'label.stage': '阶段', 'label.branch': '系统', 'label.days': '天数',
    'label.photos': '记录', 'label.coins': '金币',
  },
  ko: {
    'app.tagline': '실제로 키우는 개체를, 진화하는 픽셀 캐릭터로',
    'nav.home': '홈', 'nav.collection': '컬렉션', 'nav.dex': '도감',
    'nav.timeline': '기록', 'nav.contest': '품평회', 'nav.lab': '연구실',
    'nav.shop': '상점', 'nav.settings': '설정',
    'home.today': '오늘의 관리', 'home.noplant': '아직 개체가 없습니다',
    'home.start': '첫 개체 들이기',
    'action.water': '물주기', 'action.fert': '시비', 'action.pest': '방제',
    'action.photo': '기록 추가', 'action.measure': '실측 입력',
    'action.evolve': '진화', 'action.close': '닫기', 'action.save': '저장',
    'action.cancel': '취소',
    'stat.hydration': '수분', 'stat.light': '광량', 'stat.nutrition': '양분',
    'stat.health': '건강', 'stat.exp': '경험치', 'stat.score': '종합 점수',
    'label.stage': '단계', 'label.branch': '계통', 'label.days': '일수',
    'label.photos': '기록', 'label.coins': '코인',
  },
  es: {
    'app.tagline': 'Tu planta real, convertida en un personaje pixelado que evoluciona',
    'nav.home': 'INICIO', 'nav.collection': 'COLECCIÓN', 'nav.dex': 'ÍNDICE',
    'nav.timeline': 'REGISTRO', 'nav.contest': 'CONCURSO', 'nav.lab': 'LABORATORIO',
    'nav.shop': 'TIENDA', 'nav.settings': 'AJUSTES',
    'home.today': 'CUIDADOS DE HOY', 'home.noplant': 'Aún no hay ejemplares',
    'home.start': 'Adopta tu primera planta',
    'action.water': 'REGAR', 'action.fert': 'ABONAR', 'action.pest': 'TRATAR',
    'action.photo': 'AÑADIR FOTO', 'action.measure': 'MEDIR',
    'action.evolve': 'EVOLUCIONAR', 'action.close': 'CERRAR', 'action.save': 'GUARDAR',
    'action.cancel': 'CANCELAR',
    'stat.hydration': 'AGUA', 'stat.light': 'LUZ', 'stat.nutrition': 'NUTRIENTES',
    'stat.health': 'SALUD', 'stat.exp': 'EXP', 'stat.score': 'PUNTOS',
    'label.stage': 'ETAPA', 'label.branch': 'FORMA', 'label.days': 'DÍAS',
    'label.photos': 'REGISTROS', 'label.coins': 'MONEDAS',
  },
  fr: {
    'app.tagline': 'Votre plante réelle, devenue un personnage pixel qui évolue',
    'nav.home': 'ACCUEIL', 'nav.collection': 'COLLECTION', 'nav.dex': 'INDEX',
    'nav.timeline': 'JOURNAL', 'nav.contest': 'CONCOURS', 'nav.lab': 'LABO',
    'nav.shop': 'BOUTIQUE', 'nav.settings': 'RÉGLAGES',
    'home.today': "SOINS DU JOUR", 'home.noplant': 'Aucun spécimen',
    'home.start': 'Adoptez votre première plante',
    'action.water': 'ARROSER', 'action.fert': 'NOURRIR', 'action.pest': 'TRAITER',
    'action.photo': 'AJOUTER UNE PHOTO', 'action.measure': 'MESURER',
    'action.evolve': 'ÉVOLUER', 'action.close': 'FERMER', 'action.save': 'ENREGISTRER',
    'action.cancel': 'ANNULER',
    'stat.hydration': 'EAU', 'stat.light': 'LUMIÈRE', 'stat.nutrition': 'NUTRIMENTS',
    'stat.health': 'SANTÉ', 'stat.exp': 'EXP', 'stat.score': 'SCORE',
    'label.stage': 'STADE', 'label.branch': 'FORME', 'label.days': 'JOURS',
    'label.photos': 'ENTRÉES', 'label.coins': 'PIÈCES',
  },
};

/* 品評会の対戦相手生成用の名前パーツ */
export const RIVAL_NAMES = [
  '棚主', '灼熱棚', '南向きベランダ', '温室勢', '遮光職人', 'LED派',
  '実生沼', '塊根紳士', '週末園芸', '真夏の管理人',
];
