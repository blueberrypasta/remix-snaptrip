
import type { Language } from './types';

interface Translations {
  [key: string]: {
    [lang in Language]: string;
  };
}

export const translations: Translations = {
  appName: { en: 'SnapTrip', ko: '스냅트립', ja: 'スナップトリップ', zh: '快旅', es: 'SnapTrip', fr: 'SnapTrip', de: 'SnapTrip', it: 'SnapTrip' },
  languageName: { 
    en: 'English', ko: '한국어', ja: '日本語', zh: '中文', es: 'Español', fr: 'Français', de: 'Deutsch', it: 'Italiano' 
  },
  welcomeMessage: { 
    en: 'The More You Know, The More You See.', 
    ko: '알면, 더 보인다', 
    ja: '知れば知るほど、見えてくる',
    zh: '知之愈深，见之愈广',
    es: 'Cuanto más sabes, más ves.',
    fr: 'Plus on en sait, plus on en voit.',
    de: 'Je mehr man weiß, desto mehr sieht man.',
    it: 'Più sai, più vedi.'
  },
  welcomeSub: { 
    en: 'Discover hidden stories and local secrets behind landmarks.', 
    ko: '랜드마크 뒤에 숨겨진 이야기와 현지인만 아는 비밀을 들려드려요.',
    ja: 'ランドマークの裏に隠れた物語や、地元の人だけが知る秘密を見つけましょう。',
    zh: '发现地标背后隐藏的故事和当地秘密。',
    es: 'Descubre historias ocultas y secretos locales detrás de los monumentos.',
    fr: 'Découvrez les histoires cachées et les secrets locaux derrière les monuments.',
    de: 'Entdecken Sie verborgene Geschichten und lokale Geheimnisse hinter Sehenswürdigkeiten.',
    it: 'Scopri storie nascoste e segreti locali dietro i monumenti.'
  },
  uploadPhoto: { en: 'Gallery', ko: '갤러리', ja: 'ギャラリー', zh: '相册', es: 'Galería', fr: 'Galerie', de: 'Galerie', it: 'Galleria' },
  takePhoto: { en: 'Camera', ko: '사진 찍기', ja: 'カメラ', zh: '相机', es: 'Cámara', fr: 'Appareil photo', de: 'Kamera', it: 'Fotocamera' },
  analyzing: { en: 'Analyzing...', ko: '분석 중...', ja: '分析中...', zh: '分析中...', es: 'Analizando...', fr: 'Analyse...', de: 'Analysieren...', it: 'Analisi...' },
  processing: { en: 'Processing', ko: '처리 중', ja: '처리중', zh: '处理中', es: 'Procesando', fr: 'Traitement', de: 'Verarbeitung', it: 'In elaborazione' },
  failed: { en: 'Analysis Failed', ko: '분석 실패', ja: '分析失敗', zh: '分析失败', es: 'Error de análisis', fr: 'Échec de l\'analyse', de: 'Analyse fehlgeschlagen', it: 'Analisi fallita' },
  success: { en: 'Completed', ko: '완료됨', ja: '完了', zh: '已完成', es: 'Completado', fr: 'Terminé', de: 'Abgeschlossen', it: 'Completato' },
  recentActivity: { en: 'Recent Explorations', ko: '최근 탐색 기록', ja: '最近の探索', zh: '最近探索', es: 'Exploraciones recientes', fr: 'Explorations récentes', de: 'Kürzliche Erkundungen', it: 'Esplorazioni recenti' },
  generatingStory: { en: 'Consulting expert guides...', ko: '가이드 데이터를 분석하는 중...', ja: '専門ガイドに相談中...', zh: '咨询专家指南...', es: 'Consultando guías expertos...', fr: 'Consultation des guides...', de: 'Expertenrat einholen...', it: 'Consultazione guide esperte...' },
  findingFacts: { en: 'Searching for hidden secrets...', ko: '숨겨진 비밀을 찾는 중...', ja: '隠された秘密を検索中...', zh: '搜索隐藏的秘密...', es: 'Buscando secretos ocultos...', fr: 'Recherche de secrets...', de: 'Suche nach Geheimnissen...', it: 'Ricerca segreti nascosti...' },
  funFact: { en: 'Pro Tip / Secret', ko: '비하인드 & 꿀팁', ja: '裏話＆コツ', zh: '内幕与窍门', es: 'Consejo / Secreto', fr: 'Conseil / Secret', de: 'Profi-Tipp / Geheimnis', it: 'Consiglio / Segreto' },
  detailedStory: { en: 'Deep Insight', ko: '상세 가이드', ja: '詳細ガイド', zh: '深度见解', es: 'Información detallada', fr: 'Aperçu approfondi', de: 'Tiefere Einblicke', it: 'Approfondimento' },
  back: { en: 'Back', ko: '뒤로가기', ja: '戻る', zh: '返回', es: 'Volver', fr: 'Retour', de: 'Zurück', it: 'Indietro' },
  share: { en: 'Share Discovery', ko: '발견 공유하기', ja: '発見を共有', zh: '分享发现', es: 'Compartir hallazgo', fr: 'Partager', de: 'Entdeckung teilen', it: 'Condividi scoperta' },
  history: { en: 'History', ko: '히스토리', ja: '履歴', zh: '历史', es: 'Historial', fr: 'Historique', de: 'Verlauf', it: 'Cronologia' },
  noHistory: { en: 'No history yet.', ko: '아직 기록이 없어요.', ja: '履歴がありません。', zh: '暂无历史.', es: 'Sin historial.', fr: 'Aucun historique.', de: 'Noch kein Verlauf.', it: 'Nessuna cronologia.' },
  savedSuccess: { en: 'Saved to gallery!', ko: '갤러리에 저장되었습니다!', ja: '保存されました！', zh: '已保存！', es: '¡Guardado!', fr: 'Enregistré !', de: 'Gespeichert!', it: 'Salvato!' },
  cancel: { en: 'Cancel', ko: '취소', ja: 'キャンセル', zh: '取消', es: 'Cancelar', fr: 'Annuler', de: 'Abbrechen', it: 'Annulla' },
  delete: { en: 'Delete', ko: '삭제하기', ja: '削除', zh: '删除', es: 'Eliminar', fr: 'Supprimer', de: 'Löschen', it: 'Elimina' },
  confirmDelete: { en: 'Delete this story forever?', ko: '이 기록을 영구히 삭제할까요?', ja: '永久に削除しますか？', zh: '永久删除此记录？', es: '¿Eliminar para siempre?', fr: 'Supprimer définitivement ?', de: 'Dauerhaft löschen?', it: 'Eliminare per sempre?' },
  credits: { en: 'Credits', ko: '크레딧', ja: 'クレジット', zh: '积分', es: 'Créditos', fr: 'Crédits', de: 'Credits', it: 'Crediti' },
  clearHistory: { en: 'Clear History', ko: '기록 삭제', ja: '履歴をクリア', zh: '清除历史', es: 'Borrar historial', fr: 'Effacer l\'historique', de: 'Verlauf löschen', it: 'Cancella cronologia' },
  viewResult: { en: 'View Result', ko: '결과 보기', ja: '結果を見る', zh: '查看结果', es: 'Ver resultado', fr: 'Voir le résultat', de: 'Ergebnis anzeigen', it: 'Vedi risultato' },
  applyPromo: { en: 'Add Credits', ko: '크레딧 충전', ja: 'チャージ', zh: '充值', es: 'Añadir créditos', fr: 'Ajouter crédits', de: 'Guthaben aufladen', it: 'Aggiungi crediti' },
  promoCodeLabel: { en: 'Promo Code', ko: '프로모션 코드', ja: 'プロモコード', zh: '优惠券代码', es: 'Código promocional', fr: 'Code promo', de: 'Gutscheincode', it: 'Codice promo' },
  nearbyGems: { en: 'Nearby Hotspots', ko: '내 주변 핫플레이스', ja: '周辺の人気スポット', zh: '附近热门地点', es: 'Lugares cercanos', fr: 'Lieux à proximité', de: 'Beliebte Orte in der Nähe', it: 'Luoghi popolari vicini' },
  findingGems: { en: 'Finding local gems...', ko: '주변 명소를 찾는 중...', ja: 'スポットを検索中...', zh: '寻找当地名胜...', es: 'Buscando lugares...', fr: 'Recherche de lieux...', de: 'Orte finden...', it: 'Ricerca luoghi...' },
  noGemsFound: { en: 'No local gems found nearby', ko: '주변에 소개할 명소를 찾지 못했어요', ja: '周辺のスポットが見つかりません', zh: '附近未找到热门地点', es: 'No se encontraron lugares', fr: 'Aucun lieu trouvé', de: 'Keine Orte gefunden', it: 'Nessun luogo trovato' },
  contactDev: { en: 'Contact Developer', ko: '개발자 연락하기', ja: '開発者に連絡', zh: '联系开发者', es: 'Contactar desarrollador', fr: 'Contacter le dév', de: 'Entwickler kontaktieren', it: 'Contatta lo sviluppatore' },
  fetchingLocation: { en: 'Fetching location...', ko: '위치 정보를 가져오는 중...', ja: '位置情報を取得中...', zh: '正在获取位置...', es: 'Obteniendo ubicación...', fr: 'Récupération de la position...', de: 'Standort abrufen...', it: 'Recupero posizione...' },
  resumeGuide: { en: 'Resume Guide', ko: '가이드 이어보기', ja: 'ガイドを再開', zh: '继续指南', es: 'Continuar guía', fr: 'Reprendre le guide', de: 'Leitfaden fortsetzen', it: 'Riprendi guida' },
  atAGlanceDesc: { en: 'Historically significant site verified by records.', ko: '기록으로 확인된 역사적으로 중요한 장소입니다.', ja: '記録によって確認された歴史的に重要な場所です。', zh: '记录确认的历史悠久的遗址。', es: 'Sitio históricamente significativo verificado.', fr: 'Site historique vérifié.', de: 'Historisch bedeutsamer Ort, verifiziert.', it: 'Sito storicamente significativo verificato.' },
  bestLightTitle: { en: 'Golden Hour', ko: '골든 아워', ja: 'ゴールデンアワー', zh: '黄金时段', es: 'Hora dorata', fr: 'Heure dorée', de: 'Goldene Stunde', it: 'Ora d\'oro' },
  crowdsDesc: { en: 'Moderate', ko: '보통', ja: '普通', zh: '中等', es: 'Moderado', fr: 'Modéré', de: 'Mäßig', it: 'Moderato' },
  quotaExceeded: { en: 'Quota Exceeded', ko: '할당량 초과', ja: 'クォータ超過', zh: '配额已超', es: 'Cuota excedida', fr: 'Quota dépassé', de: 'Kontingent überschritten', it: 'Quota superata' },
  useOwnKey: { en: 'Use Own Key', ko: '내 API 키 사용', ja: '自分のキーを使用', zh: '使用自己的密钥', es: 'Usar mi propia clave', fr: 'Utiliser ma propre clé', de: 'Eigener Key', it: 'Usa la tua chiave' },
  guide: { en: 'Guide', ko: '가이드', ja: 'ガイド', zh: '指南', es: 'Guía', fr: 'Guide', de: 'Guide', it: 'Guida' },
  aboutSnapTrip: { en: 'About SnapTrip', ko: '스냅트립 소개', ja: 'SnapTripについて', zh: '关于 SnapTrip', es: 'Sobre SnapTrip', fr: 'À propos', de: 'Über SnapTrip', it: 'Info su SnapTrip' },
  aboutOriginTitle: { en: 'Origin / The Story', ko: '시작과 이야기', ja: 'はじまり / 物語', zh: '起源 / 故事', es: 'Origen / La historia', fr: 'Origine / L\'histoire', de: 'Ursprung / Die Geschichte', it: 'Origine / La storia' },
  aboutOriginDesc: { en: 'SnapTrip began with a simple idea: every place has a story worth noticing.', ko: '스냅트립은 모든 장소에는 발견할 만한 이야기가 있다는 단순한 생각에서 시작되었습니다.', ja: 'SnapTripは、どんな場所にも気づく価値のある物語があるというシンプルな発想から生まれました。', zh: 'SnapTrip 源于一个简单的想法：每个地方都有值得留意的故事。', es: 'SnapTrip nació de una idea sencilla: cada lugar tiene una historia que vale la pena descubrir.', fr: 'SnapTrip est né d\'une idée simple : chaque lieu a une histoire qui mérite d\'être remarquée.', de: 'SnapTrip entstand aus einer einfachen Idee: Jeder Ort hat eine Geschichte, die es wert ist, entdeckt zu werden.', it: 'SnapTrip nasce da un\'idea semplice: ogni luogo ha una storia che merita di essere notata.' },
  aboutTipTitle: { en: 'Tips', ko: '사용 팁', ja: '使い方のコツ', zh: '使用小贴士', es: 'Consejos', fr: 'Conseils', de: 'Tipps', it: 'Suggerimenti' },
  aboutTipDesc: { en: 'Take clear photos of landmarks, signs, or details to uncover richer local context.', ko: '랜드마크, 표지판, 디테일을 선명하게 찍으면 더 풍부한 현지 정보를 발견할 수 있어요.', ja: 'ランドマークや看板、細部をはっきり撮ると、より豊かな現地の背景が見つかります。', zh: '清晰拍摄地标、标识或细节，可以发现更丰富的当地背景。', es: 'Toma fotos claras de monumentos, letreros o detalles para descubrir más contexto local.', fr: 'Prenez des photos nettes des monuments, panneaux ou détails pour révéler un contexte local plus riche.', de: 'Fotografieren Sie Sehenswürdigkeiten, Schilder oder Details klar, um mehr lokalen Kontext zu entdecken.', it: 'Scatta foto nitide di monumenti, insegne o dettagli per scoprire un contesto locale più ricco.' },
  aboutCreditsTitle: { en: 'Credits / Acknowledgements', ko: '크레딧 / 감사의 말', ja: 'クレジット / 謝辞', zh: '鸣谢 / 致谢', es: 'Créditos / Agradecimientos', fr: 'Crédits / Remerciements', de: 'Credits / Danksagungen', it: 'Crediti / Ringraziamenti' },
  aboutCreditsDesc: { en: 'Built with appreciation for travelers, local guides, historians, and creators who keep stories alive.', ko: '여행자, 현지 가이드, 역사가, 그리고 이야기를 이어가는 창작자들에게 감사의 마음을 담아 만들었습니다.', ja: '旅人、現地ガイド、歴史家、そして物語を受け継ぐクリエイターへの感謝を込めて作りました。', zh: '谨向旅行者、当地向导、历史研究者以及延续故事的创作者致谢。', es: 'Creado con gratitud hacia viajeros, guías locales, historiadores y creadores que mantienen vivas las historias.', fr: 'Conçu avec gratitude pour les voyageurs, guides locaux, historiens et créateurs qui font vivre les histoires.', de: 'Mit Dank an Reisende, lokale Guides, Historiker und Kreative, die Geschichten lebendig halten.', it: 'Creato con gratitudine per viaggiatori, guide locali, storici e creator che mantengono vive le storie.' },
  aboutSupportTitle: { en: 'Support / Help', ko: '지원 / 도움말', ja: 'サポート / ヘルプ', zh: '支持 / 帮助', es: 'Soporte / Ayuda', fr: 'Assistance / Aide', de: 'Support / Hilfe', it: 'Supporto / Aiuto' },
  aboutSupportDesc: { en: 'Questions, feedback, or issues? Contact the developer to help improve SnapTrip.', ko: '질문, 의견, 문제가 있다면 개발자에게 연락해 스냅트립 개선에 도움을 주세요.', ja: '質問やフィードバック、不具合があれば、開発者に連絡してSnapTripの改善にご協力ください。', zh: '有问题、反馈或故障？请联系开发者，帮助改进 SnapTrip。', es: '¿Tienes preguntas, comentarios o problemas? Contacta al desarrollador para ayudar a mejorar SnapTrip.', fr: 'Questions, retours ou problèmes ? Contactez le développeur pour aider à améliorer SnapTrip.', de: 'Fragen, Feedback oder Probleme? Kontaktieren Sie den Entwickler, um SnapTrip zu verbessern.', it: 'Domande, feedback o problemi? Contatta lo sviluppatore per aiutare a migliorare SnapTrip.' },
  supportDev: { en: 'Support Developer', ko: '개발자 후원하기', ja: '開発者を支援', zh: '支持开发者', es: 'Apoyar desarrollador', fr: 'Soutenir le dév', de: 'Entwickler unterstützen', it: 'Sostieni lo sviluppatore' },
  findMore: { en: 'Find More', ko: '더 찾기', ja: 'もっと見る', zh: '寻找更多', es: 'Buscar más', fr: 'En savoir plus', de: 'Mehr finden', it: 'Trova altro' },
  readMore: { en: 'Read More', ko: '더보기', ja: '続きを読む', zh: '阅读更多', es: 'Leer más', fr: 'Lire la suite', de: 'Weiterlesen', it: 'Leggi tutto' },
  login: { en: 'Login', ko: '로그인', ja: 'ログイン', zh: '登录', es: 'Iniciar sesión', fr: 'Connexion', de: 'Anmelden', it: 'Accedi' },
  logout: { en: 'Logout', ko: '로그아웃', ja: 'ログアウト', zh: '退出登录', es: 'Cerrar sesión', fr: 'Déconnexion', de: 'Abmelden', it: 'Esci' },
  saveKey: { en: 'Save Key', ko: '키 저장', ja: 'キーを保存', zh: '保存密钥', es: 'Guardar clave', fr: 'Enregistrer la clé', de: 'Key speichern', it: 'Salva chiave' },
  savedLocally: { en: 'Saved Locally', ko: '로컬에 저장됨', ja: 'ローカルに保存済み', zh: '已保存到本地', es: 'Guardado localmente', fr: 'Enregistré localement', de: 'Lokal gespeichert', it: 'Salvato localmente' },
  selectLanguage: { en: 'Select Language', ko: '언어 선택', ja: '言語を選択', zh: '选择语言', es: 'Seleccionar idioma', fr: 'Choisir la langue', de: 'Sprache auswählen', it: 'Seleziona lingua' },
  loginBenefitMsg: { 
    en: 'Login to sync your history and get more daily credits!', 
    ko: '로그인하면 내 활동이 저장되고 매일 더 많은 크레딧을 받을 수 있어요!',
    ja: 'ログインして履歴を同期し、毎日のクレジットを増やしましょう！',
    zh: '登录以同步历史记录并获得更多每日积分！',
    es: '¡Inicia sesión para sincronizar tu historial y obtener más créditos diarios!',
    fr: 'Connectez-vous pour synchroniser votre historique !',
    de: 'Melden Sie sich an, um Ihren Verlauf zu synchronisieren!',
    it: 'Accedi per sincronizzare la tua cronologia!'
  },
  signInWithGoogle: { en: 'Sign in with Google', ko: 'Google로 로그인', ja: 'Googleでログイン', zh: '使用 Google 登录', es: 'Iniciar sesión con Google', fr: 'Se connecter via Google', de: 'Mit Google anmelden', it: 'Accedi con Google' },
  loginLater: { en: 'Maybe Later', ko: '나중에 하기', ja: 'また今度', zh: '以后再说', es: 'Quizás más tarde', fr: 'Plus tard', de: 'Später', it: 'Forse più tardi' },
  oauth403Help: { 
    en: 'Google login might be restricted in this browser. Try opening in a standard browser (Safari/Chrome).', 
    ko: '이 브라우저에서는 Google 로그인이 제한될 수 있습니다. 일반 브라우저(Safari/Chrome)에서 열어보세요.', 
    ja: 'このブラウザではGoogleログインが制限される場合があります。',
    zh: '此浏览器可能限制 Google 登录。',
    es: 'El inicio de sesión de Google puede estar restringido. Intenta con Safari o Chrome.',
    fr: 'La connexion Google peut être restreinte.',
    de: 'Google-Login könnte eingeschränkt sein.',
    it: 'L\'accesso a Google potrebbe essere limitato.'
  },
  inAppBrowserTip: {
    en: 'For a smoother login, we recommend using Safari (iOS) or Chrome (Android).',
    ko: '원활한 로그인을 위해 일반 브라우저(Safari/Chrome) 사용을 권장합니다.',
    ja: 'Safari（iOS）またはChrome（Android）の使用をお勧めします。',
    zh: '建议使用 Safari (iOS) 或 Chrome (Android)。',
    es: 'Recomendamos usar Safari o Chrome.',
    fr: 'Utilisez Safari ou Chrome.',
    de: 'Wir empfehlen Safari oder Chrome.',
    it: 'Consigliamo di utilizzare Safari o Chrome.'
  },
  theStory: { en: 'The Story', ko: '그곳의 이야기', ja: 'その場所の物語', zh: '故事', es: 'La historia', fr: 'L\'histoire', de: 'Die Geschichte', it: 'La storia' },
  atAGlance: { en: 'At a glance', ko: '한눈에 보기', ja: '一目で見る', zh: '一目了然', es: 'De un vistazo', fr: 'En un coup d\'œil', de: 'Auf einen Blick', it: 'A colpo d\'occhio' },
  bestLight: { en: 'Best Light', ko: '가장 예쁜 시간', ja: '最高の光', zh: '最佳光线', es: 'Mejor luz', fr: 'Meilleure lumière', de: 'Bestes Licht', it: 'Migliore luce' },
  crowds: { en: 'Crowds', ko: '혼잡도', ja: '混雑', zh: '人流', es: 'Multitud', fr: 'Foule', de: 'Menschenmassen', it: 'Folla' },
  verifiedSources: { en: 'Verified Sources', ko: '교차 검증된 출처', ja: '検証済みのソース', zh: '验证来源', es: 'Fuentes verificadas', fr: 'Sources vérifiées', de: 'Verifizierte Quellen', it: 'Fonti verificate' },
  captureNewStory: { en: 'Capture New Story', ko: '새로운 이야기 찾기', ja: '新しい物語をキャプチャ', zh: '捕捉新故事', es: 'Capturar nueva historia', fr: 'Capturer une nouvelle histoire', de: 'Neue Geschichte aufnehmen', it: 'Cattura nuova storia' },
  exploring: { en: 'Exploring...', ko: '탐색 중...', ja: '探索중...', zh: '探索中...', es: 'Explorando...', fr: 'Exploration...', de: 'Erkunden...', it: 'Esplorando...' },
  minutesRead: { en: 'min read', ko: '분 분량', ja: '分', zh: '分钟阅读', es: 'min de lectura', fr: 'min de lecture', de: 'Min. Lesezeit', it: 'min di lettura' },
  docentNote: { en: "Docent's Note", ko: '도슨트의 분석', ja: 'ドセントのメモ', zh: '讲解员笔记', es: 'Nota del docente', fr: 'Note du docent', de: 'Anmerkung des Dozenten', it: 'Nota del docente' },
  locationPermissionGuide: { 
    en: 'Enable location for better landmark detection!', 
    ko: '위치 권한을 허용하면 더 정확한 랜드마크 분석이 가능해요!',
    ja: '正確な検出のために位置情報を有効にしてください。',
    zh: '启用位置信息以获得更好的地标检测！',
    es: '¡Activa la ubicación para una mejor detección!',
    fr: 'Activez la localisation !',
    de: 'Standort aktivieren!',
    it: 'Attiva la posizione!'
  },
  syncing: { en: 'Syncing...', ko: '동기화 중...', ja: '同期中...', zh: '同步中...', es: 'Sincronizando...', fr: 'Synchro...', de: 'Synchronisierung...', it: 'Sincro...' },
  loadingHistory: { en: 'Loading history...', ko: '기록을 가져오는 중...', ja: '履歴を読み込み中...', zh: '加载历史记录...', es: 'Cargando historial...', fr: 'Chargement...', de: 'Verlauf laden...', it: 'Caricamento cronologia...' }
};

/**
 * Hook to use translations.
 * Fix: Explicitly return string to avoid 'string | number' type mismatch when passing to functions like window.confirm.
 */
export const useTranslations = (language: Language) => {
  return (key: keyof typeof translations): string => {
    const item = translations[key];
    if (!item) return String(key);
    return item[language] || item['en'];
  };
};
