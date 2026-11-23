import type { HistoryItem, Language } from '../types';

export const SAMPLE_IMAGE_URL = '/eiffel-sample.webp';
export const SAMPLE_COMMONS_URL =
  'https://commons.wikimedia.org/wiki/File:Eiffel_Tower_located_on_the_Champ_de_Mars_in_Paris,_France.jpg';
export const SAMPLE_LICENSE_URL = 'https://creativecommons.org/licenses/by-sa/4.0/';
export const SAMPLE_OFFICIAL_HISTORY_URL = 'https://www.toureiffel.paris/en/the-monument/history';
export const SAMPLE_OFFICIAL_KEPT_URL =
  'https://www.toureiffel.paris/en/news/130-years/why-was-eiffel-tower-kept';

interface SampleLocalizedCopy {
  placeLabel: string;
  title: string;
  fact: string;
  story: string;
  hiddenStory: string;
  atAGlance: string;
  sourceTitle: string;
  keptSourceTitle: string;
}

const SAMPLE_COPY: Record<Language, SampleLocalizedCopy> = {
  en: {
    placeLabel: 'Sample · Paris, France',
    title: 'Eiffel Tower, Paris',
    fact: 'Designed by Gustave Eiffel’s engineering firm and opened for the 1889 Universal Exhibition.',
    story:
      'Built on the Champ de Mars as the entrance arch for the 1889 Exposition Universelle marking the centennial of the French Revolution, the 300-meter wrought-iron lattice tower was originally permitted for only 20 years.\nSaved from dismantling in large part because its height made it valuable for early radiotelegraphy experiments, it became Paris’s most recognizable landmark.',
    hiddenStory:
      'Before construction finished, a group of prominent Parisian artists and writers signed a petition condemning the iron tower as a monstrous blemish—only for many visitors to embrace it once the 1889 fair opened.',
    atAGlance: 'Champ de Mars, 7th arrondissement, Paris',
    sourceTitle: 'Tour Eiffel — Official History',
    keptSourceTitle: 'Tour Eiffel — Why Was the Eiffel Tower Kept?',
  },
  ko: {
    placeLabel: '예시 · 프랑스 파리',
    title: '파리 에펠탑',
    fact: '귀스타브 에펠의 회사가 설계·시공해 1889년 파리 만국박람회를 맞아 개장했어요.',
    story:
      '프랑스 혁명 100주년을 기념한 1889년 파리 만국박람회의 입구 아치로 샹 드 마르스 공원에 세워진 300m 높이의 철골 탑이에요. 원래는 20년 뒤 철거될 예정이었던 임시 구조물이었습니다.\n높은 위치 덕분에 초기 무선 전신 실험에 유용하게 쓰이면서 철거를 면했고, 이후 파리를 대표하는 상징으로 자리 잡았어요.',
    hiddenStory:
      '완공 전에는 파리의 여러 예술가와 문인들이 거대한 쇠탑이 도시 미관을 해친다며 반대 성명을 냈지만, 박람회가 열리자 수많은 방문객이 탑에 오르며 평가가 달라졌습니다.',
    atAGlance: '프랑스 파리 7구 샹 드 마르스',
    sourceTitle: 'Tour Eiffel — 공식 역사 안내',
    keptSourceTitle: 'Tour Eiffel — 에펠탑이 철거되지 않은 이유',
  },
  ja: {
    placeLabel: 'サンプル・フランス・パリ',
    title: 'エッフェル塔（パリ）',
    fact: 'ギュスターヴ・エッフェルの設計会社によって建設され、1889年のパリ万国博覧会に合わせて開業しました。',
    story:
      'フランス革命100周年を記念した1889年パリ万国博覧会の入場門としてシャン・ド・マルス公園に建てられた鉄塔です。当初は20年間の期間限定で許可されていました。\nその高さが初期の無線電信実験に役立ったことから解体を免れ、パリを象徴する建造物となりました。',
    hiddenStory:
      '建設中にはパリの著名な芸術家や作家たちが景観を損ねると抗議声明を出しましたが、博覧会が開幕すると多くの来場者を魅了しました。',
    atAGlance: 'パリ7区 シャン・ド・マルス公園',
    sourceTitle: 'Tour Eiffel — 公式歴史ページ',
    keptSourceTitle: 'Tour Eiffel — エッフェル塔が残された理由',
  },
  zh: {
    placeLabel: '示例 · 法国巴黎',
    title: '巴黎埃菲尔铁塔',
    fact: '由古斯塔夫·埃菲尔的工程公司建造，并于 1889 年巴黎世界博览会期间开放。',
    story:
      '作为纪念法国大革命百年而举办的 1889 年世界博览会入口拱门，这座 300 米高的锻铁结构铁塔建于战神广场，最初仅获批保留 20 年。\n由于其高度对早期无线电报实验颇具价值，铁塔得以免于拆除，并逐渐成为巴黎的标志性建筑。',
    hiddenStory:
      '在施工期间，多位巴黎艺术家和作家曾联名抗议，认为它破坏城市风貌；但 1889 年世博会开幕后，铁塔迅速赢得了公众喜爱。',
    atAGlance: '巴黎第七区战神广场',
    sourceTitle: 'Tour Eiffel — 官方历史介绍',
    keptSourceTitle: 'Tour Eiffel — 埃菲尔铁塔为何得以保留',
  },
  es: {
    placeLabel: 'Ejemplo · París, Francia',
    title: 'Torre Eiffel, París',
    fact: 'Construida por la firma de Gustave Eiffel e inaugurada para la Exposición Universal de 1889.',
    story:
      'Erigida en el Campo de Marte como arco de entrada de la Exposición Universal de 1889, que conmemoraba el centenario de la Revolución Francesa, esta torre de hierro de 300 metros tuvo inicialmente un permiso de solo 20 años.\nSu altura resultó clave para los primeros ensayos de radiotelegrafía, lo que evitó su desmontaje y la consolidó como símbolo de París.',
    hiddenStory:
      'Antes de terminarse, varios artistas y escritores parisinos firmaron una protesta contra la torre, aunque tras la apertura de la feria de 1889 se convirtió en un éxito inmediato.',
    atAGlance: 'Campo de Marte, distrito 7, París',
    sourceTitle: 'Tour Eiffel — Historia oficial',
    keptSourceTitle: 'Tour Eiffel — Por qué se conservó la Torre Eiffel',
  },
  fr: {
    placeLabel: 'Exemple · Paris, France',
    title: 'Tour Eiffel, Paris',
    fact: 'Construite par l’entreprise de Gustave Eiffel et inaugurée pour l’Exposition universelle de 1889.',
    story:
      'Élevée sur le Champ-de-Mars pour l’Exposition universelle de 1889 célébrant le centenaire de la Révolution française, cette tour de fer puddlé de 300 mètres ne devait rester debout que 20 ans.\nSon utilité pour les premières expériences de radiotélégraphie contribua à la sauver du démontage et à en faire l’emblème de Paris.',
    hiddenStory:
      'Durant sa construction, des artistes et écrivains parisiens publièrent une protestation contre la tour, avant que le public ne l’adopte dès l’ouverture de l’Exposition de 1889.',
    atAGlance: 'Champ-de-Mars, 7e arrondissement, Paris',
    sourceTitle: 'Tour Eiffel — Histoire officielle',
    keptSourceTitle: 'Tour Eiffel — Pourquoi la tour Eiffel a-t-elle été conservée',
  },
  de: {
    placeLabel: 'Beispiel · Paris, Frankreich',
    title: 'Eiffelturm, Paris',
    fact: 'Errichtet vom Ingenieurbüro Gustave Eiffels und eröffnet zur Weltausstellung 1889.',
    story:
      'Der 300 Meter hohe schmiedeeiserne Turm entstand auf dem Champ de Mars als Eingangsportal der Weltausstellung 1889 zum 100. Jahrestag der Französischen Revolution und war ursprünglich nur für 20 Jahre genehmigt.\nWeil sich seine Höhe für frühe Funktelegrafie-Versuche bewährte, entging er dem Abriss und wurde zum Wahrzeichen von Paris.',
    hiddenStory:
      'Während des Baus protestierten bekannte Pariser Künstler und Schriftsteller gegen den Turm, doch nach der Eröffnung der Weltausstellung 1889 wurde er rasch zum Publikumsmagneten.',
    atAGlance: 'Champ de Mars, 7. Arrondissement, Paris',
    sourceTitle: 'Tour Eiffel — Offizielle Geschichte',
    keptSourceTitle: 'Tour Eiffel — Warum der Eiffelturm erhalten blieb',
  },
  it: {
    placeLabel: 'Esempio · Parigi, Francia',
    title: 'Torre Eiffel, Parigi',
    fact: 'Costruita dall’impresa di Gustave Eiffel e inaugurata per l’Esposizione Universale del 1889.',
    story:
      'Innalzata sullo Champ de Mars come arco d’ingresso dell’Esposizione Universale del 1889 per il centenario della Rivoluzione francese, questa torre in ferro di 300 metri aveva inizialmente una concessione di soli 20 anni.\nLa sua altezza si rivelò preziosa per i primi esperimenti di radiotelegrafia, salvandola dallo smantellamento e rendendola il simbolo di Parigi.',
    hiddenStory:
      'Durante i lavori diversi artisti e scrittori parigini firmarono una protesta contro la torre, ma all’apertura dell’esposizione del 1889 conquistò subito i visitatori.',
    atAGlance: 'Champ de Mars, 7° arrondissement, Parigi',
    sourceTitle: 'Tour Eiffel — Storia ufficiale',
    keptSourceTitle: 'Tour Eiffel — Perché la Torre Eiffel è stata conservata',
  },
};

export function getSamplePlaceLabel(language: Language): string {
  return (SAMPLE_COPY[language] || SAMPLE_COPY.en).placeLabel;
}

export function getSampleLandmark(language: Language): HistoryItem {
  const copy = SAMPLE_COPY[language] || SAMPLE_COPY.en;
  return {
    id: 'sample-eiffel-tower',
    status: 'success',
    imageData: SAMPLE_IMAGE_URL,
    timestamp: 0,
    locationSource: 'none',
    locationData: {
      latitude: 48.8584,
      longitude: 2.2945,
    },
    title: copy.title,
    fact: copy.fact,
    story: copy.story,
    hiddenStory: copy.hiddenStory,
    identificationStatus: 'confirmed',
    confidence: 1,
    visit: {
      atAGlance: copy.atAGlance,
    },
    sources: [
      {
        title: copy.sourceTitle,
        uri: SAMPLE_OFFICIAL_HISTORY_URL,
      },
      {
        title: copy.keptSourceTitle,
        uri: SAMPLE_OFFICIAL_KEPT_URL,
      },
    ],
  };
}
