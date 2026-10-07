/**
 * 태어난 곳: every 시·군, each 특별시·광역시 and 세종 as one entry (161), with the longitude of its 청사 (city or
 * county hall). Data only; lib/sajuForm.ts builds the select and the engine input from it.
 *
 * Source: OpenStreetMap (© OpenStreetMap contributors, ODbL 1.0), the hall object named in `osm`; open
 * https://www.openstreetmap.org/<osm> to check an entry. Retrieved 2026-10-07 (OSM data as of 2026-10-07 14:05 UTC):
 * - Overpass API (https://overpass-api.de/api/interpreter): objects named exactly "<시·군>청" or "<특별·광역시>청"
 *   tagged amenity=townhall, office=government, a public building or landuse=civic_admin (여주).
 * - Nominatim (https://nominatim.openstreetmap.org/search?q=<name>&countrycodes=kr) for 하남시청, 대구광역시청,
 *   가평군청, 서귀포시청 (its 제1청사) and 거창군청 (a station named 거창군청 at the county office; the office
 *   building itself has no name in OSM).
 * - Overpass, 500 m around a stop named after the hall, for 남양주 (남양주시청제1청사), 여수 (여수시청 본청),
 *   광주 (전남광주통합특별시청 광주청사, the former 광주광역시청) and 김제 (an unnamed amenity=townhall by 시청사거리).
 * Cross-check: Wikidata P625 of each 시·군 (https://query.wikidata.org, same day) is within 0.03° except 파주, 철원,
 * 아산, 신안, 사천 and 거제, where the Wikidata point is the area's centre or wrong; the OSM hall is kept.
 * Rounded to 0.001° (0.24 s of clock). Nothing here was typed by hand; the labels drop 시·군 ("경북 포항").
 *
 * License: this list is a derivative of OpenStreetMap data and is offered under the Open Database License 1.0
 * (ODbL 1.0, https://opendatacommons.org/licenses/odbl/1-0/). The credit "© OpenStreetMap 기여자" links to
 * BIRTH_PLACE_CREDIT_URL under the birthplace select and in the evidence page's source list.
 */

/** OpenStreetMap's copyright and license page: where the ODbL credit for this list links. */
export const BIRTH_PLACE_CREDIT_URL = "https://www.openstreetmap.org/copyright";

export interface BirthPlaceRow {
  id: string;
  /** The select's group: 특별시·광역시, or the 도 */
  group: string;
  label: string;
  /** Degrees east */
  longitude: number;
  /** The OpenStreetMap object the longitude comes from */
  osm: string;
}

export const BIRTH_PLACE_ROWS: readonly BirthPlaceRow[] = [
  // 특별시·광역시
  { id: "seoul", group: "특별시·광역시", label: "서울", longitude: 126.978, osm: "way/198561926" },
  { id: "busan", group: "특별시·광역시", label: "부산", longitude: 129.075, osm: "way/468977727" },
  { id: "daegu", group: "특별시·광역시", label: "대구", longitude: 128.602, osm: "node/1903901577" },
  { id: "incheon", group: "특별시·광역시", label: "인천", longitude: 126.705, osm: "way/238024537" },
  { id: "gwangju", group: "특별시·광역시", label: "광주", longitude: 126.851, osm: "way/1194677087" },
  { id: "daejeon", group: "특별시·광역시", label: "대전", longitude: 127.385, osm: "node/1904388026" },
  { id: "ulsan", group: "특별시·광역시", label: "울산", longitude: 129.311, osm: "node/1904481137" },
  { id: "sejong", group: "특별시·광역시", label: "세종", longitude: 127.289, osm: "way/544441301" },
  // 경기
  { id: "gyeonggi-gapyeong", group: "경기", label: "경기 가평", longitude: 127.510, osm: "way/517774671" },
  { id: "gyeonggi-goyang", group: "경기", label: "경기 고양", longitude: 126.832, osm: "way/499626876" },
  { id: "gyeonggi-gwacheon", group: "경기", label: "경기 과천", longitude: 126.988, osm: "way/383073800" },
  { id: "gyeonggi-gwangmyeong", group: "경기", label: "경기 광명", longitude: 126.865, osm: "way/444795216" },
  { id: "gyeonggi-gwangju", group: "경기", label: "경기 광주", longitude: 127.255, osm: "way/486844049" },
  { id: "gyeonggi-guri", group: "경기", label: "경기 구리", longitude: 127.130, osm: "way/1068862911" },
  { id: "gyeonggi-gunpo", group: "경기", label: "경기 군포", longitude: 126.935, osm: "relation/5637061" },
  { id: "gyeonggi-gimpo", group: "경기", label: "경기 김포", longitude: 126.716, osm: "way/1137761199" },
  { id: "gyeonggi-namyangju", group: "경기", label: "경기 남양주", longitude: 127.216, osm: "way/582741786" },
  { id: "gyeonggi-dongducheon", group: "경기", label: "경기 동두천", longitude: 127.060, osm: "node/358015540" },
  { id: "gyeonggi-bucheon", group: "경기", label: "경기 부천", longitude: 126.766, osm: "way/273930625" },
  { id: "gyeonggi-seongnam", group: "경기", label: "경기 성남", longitude: 127.127, osm: "node/1912558056" },
  { id: "gyeonggi-suwon", group: "경기", label: "경기 수원", longitude: 127.029, osm: "node/1912558058" },
  { id: "gyeonggi-siheung", group: "경기", label: "경기 시흥", longitude: 126.803, osm: "way/427074757" },
  { id: "gyeonggi-ansan", group: "경기", label: "경기 안산", longitude: 126.831, osm: "way/500563348" },
  { id: "gyeonggi-anseong", group: "경기", label: "경기 안성", longitude: 127.280, osm: "way/1189780893" },
  { id: "gyeonggi-anyang", group: "경기", label: "경기 안양", longitude: 126.957, osm: "way/82085825" },
  { id: "gyeonggi-yangju", group: "경기", label: "경기 양주", longitude: 127.046, osm: "way/482445716" },
  { id: "gyeonggi-yangpyeong", group: "경기", label: "경기 양평", longitude: 127.488, osm: "way/1086291124" },
  { id: "gyeonggi-yeoju", group: "경기", label: "경기 여주", longitude: 127.637, osm: "way/469690719" },
  { id: "gyeonggi-yeoncheon", group: "경기", label: "경기 연천", longitude: 127.075, osm: "way/765868731" },
  { id: "gyeonggi-osan", group: "경기", label: "경기 오산", longitude: 127.077, osm: "node/358015524" },
  { id: "gyeonggi-yongin", group: "경기", label: "경기 용인", longitude: 127.178, osm: "way/778037211" },
  { id: "gyeonggi-uiwang", group: "경기", label: "경기 의왕", longitude: 126.968, osm: "way/494451862" },
  { id: "gyeonggi-uijeongbu", group: "경기", label: "경기 의정부", longitude: 127.034, osm: "node/1796715157" },
  { id: "gyeonggi-icheon", group: "경기", label: "경기 이천", longitude: 127.435, osm: "way/833641298" },
  { id: "gyeonggi-paju", group: "경기", label: "경기 파주", longitude: 126.780, osm: "node/358015343" },
  { id: "gyeonggi-pyeongtaek", group: "경기", label: "경기 평택", longitude: 127.113, osm: "node/358015274" },
  { id: "gyeonggi-pocheon", group: "경기", label: "경기 포천", longitude: 127.200, osm: "way/469301639" },
  { id: "gyeonggi-hanam", group: "경기", label: "경기 하남", longitude: 127.215, osm: "way/472435620" },
  { id: "gyeonggi-hwaseong", group: "경기", label: "경기 화성", longitude: 126.831, osm: "way/468987826" },
  // 강원
  { id: "gangwon-gangneung", group: "강원", label: "강원 강릉", longitude: 128.876, osm: "node/11687596361" },
  { id: "gangwon-goseong", group: "강원", label: "강원 고성", longitude: 128.468, osm: "way/368708429" },
  { id: "gangwon-donghae", group: "강원", label: "강원 동해", longitude: 129.114, osm: "node/358015551" },
  { id: "gangwon-samcheok", group: "강원", label: "강원 삼척", longitude: 129.165, osm: "way/42400249" },
  { id: "gangwon-sokcho", group: "강원", label: "강원 속초", longitude: 128.592, osm: "way/1306387140" },
  { id: "gangwon-yanggu", group: "강원", label: "강원 양구", longitude: 127.990, osm: "way/1167420314" },
  { id: "gangwon-yangyang", group: "강원", label: "강원 양양", longitude: 128.619, osm: "node/358897017" },
  { id: "gangwon-yeongwol", group: "강원", label: "강원 영월", longitude: 128.462, osm: "node/358897026" },
  { id: "gangwon-wonju", group: "강원", label: "강원 원주", longitude: 127.920, osm: "node/358015312" },
  { id: "gangwon-inje", group: "강원", label: "강원 인제", longitude: 128.170, osm: "way/472085551" },
  { id: "gangwon-jeongseon", group: "강원", label: "강원 정선", longitude: 128.661, osm: "way/478721959" },
  { id: "gangwon-cheorwon", group: "강원", label: "강원 철원", longitude: 127.313, osm: "way/1081325178" },
  { id: "gangwon-chuncheon", group: "강원", label: "강원 춘천", longitude: 127.733, osm: "way/481182763" },
  { id: "gangwon-taebaek", group: "강원", label: "강원 태백", longitude: 128.986, osm: "way/641480313" },
  { id: "gangwon-pyeongchang", group: "강원", label: "강원 평창", longitude: 128.390, osm: "way/472089126" },
  { id: "gangwon-hongcheon", group: "강원", label: "강원 홍천", longitude: 127.889, osm: "node/358896996" },
  { id: "gangwon-hwacheon", group: "강원", label: "강원 화천", longitude: 127.708, osm: "way/470697744" },
  { id: "gangwon-hoengseong", group: "강원", label: "강원 횡성", longitude: 127.985, osm: "node/358897023" },
  // 충북
  { id: "chungbuk-goesan", group: "충북", label: "충북 괴산", longitude: 127.787, osm: "way/1167479362" },
  { id: "chungbuk-danyang", group: "충북", label: "충북 단양", longitude: 128.366, osm: "way/472863763" },
  { id: "chungbuk-boeun", group: "충북", label: "충북 보은", longitude: 127.730, osm: "way/576341843" },
  { id: "chungbuk-yeongdong", group: "충북", label: "충북 영동", longitude: 127.783, osm: "way/1167479361" },
  { id: "chungbuk-okcheon", group: "충북", label: "충북 옥천", longitude: 127.571, osm: "node/358896736" },
  { id: "chungbuk-eumseong", group: "충북", label: "충북 음성", longitude: 127.690, osm: "way/469072331" },
  { id: "chungbuk-jecheon", group: "충북", label: "충북 제천", longitude: 128.191, osm: "way/469363125" },
  { id: "chungbuk-jeungpyeong", group: "충북", label: "충북 증평", longitude: 127.582, osm: "node/1991823649" },
  { id: "chungbuk-jincheon", group: "충북", label: "충북 진천", longitude: 127.436, osm: "node/358896745" },
  { id: "chungbuk-cheongju", group: "충북", label: "충북 청주", longitude: 127.489, osm: "node/282684005" },
  { id: "chungbuk-chungju", group: "충북", label: "충북 충주", longitude: 127.926, osm: "node/358015384" },
  // 충남
  { id: "chungnam-gyeryong", group: "충남", label: "충남 계룡", longitude: 127.249, osm: "node/3243970422" },
  { id: "chungnam-gongju", group: "충남", label: "충남 공주", longitude: 127.119, osm: "way/557191077" },
  { id: "chungnam-geumsan", group: "충남", label: "충남 금산", longitude: 127.488, osm: "way/664793124" },
  { id: "chungnam-nonsan", group: "충남", label: "충남 논산", longitude: 127.099, osm: "node/7637379226" },
  { id: "chungnam-dangjin", group: "충남", label: "충남 당진", longitude: 126.646, osm: "node/3656151978" },
  { id: "chungnam-boryeong", group: "충남", label: "충남 보령", longitude: 126.613, osm: "way/1557609905" },
  { id: "chungnam-buyeo", group: "충남", label: "충남 부여", longitude: 126.910, osm: "way/367065969" },
  { id: "chungnam-seosan", group: "충남", label: "충남 서산", longitude: 126.450, osm: "way/100011536" },
  { id: "chungnam-seocheon", group: "충남", label: "충남 서천", longitude: 126.703, osm: "way/1185704811" },
  { id: "chungnam-asan", group: "충남", label: "충남 아산", longitude: 127.003, osm: "node/358015389" },
  { id: "chungnam-yesan", group: "충남", label: "충남 예산", longitude: 126.845, osm: "node/358896845" },
  { id: "chungnam-cheonan", group: "충남", label: "충남 천안", longitude: 127.114, osm: "relation/18451371" },
  { id: "chungnam-cheongyang", group: "충남", label: "충남 청양", longitude: 126.802, osm: "way/1285457845" },
  { id: "chungnam-taean", group: "충남", label: "충남 태안", longitude: 126.298, osm: "way/1079381889" },
  { id: "chungnam-hongseong", group: "충남", label: "충남 홍성", longitude: 126.661, osm: "way/1167479373" },
  // 전북
  { id: "jeonbuk-gochang", group: "전북", label: "전북 고창", longitude: 126.702, osm: "node/358896874" },
  { id: "jeonbuk-gunsan", group: "전북", label: "전북 군산", longitude: 126.737, osm: "way/94665856" },
  { id: "jeonbuk-gimje", group: "전북", label: "전북 김제", longitude: 126.880, osm: "node/12680436438" },
  { id: "jeonbuk-namwon", group: "전북", label: "전북 남원", longitude: 127.390, osm: "way/547570992" },
  { id: "jeonbuk-muju", group: "전북", label: "전북 무주", longitude: 127.661, osm: "node/358896865" },
  { id: "jeonbuk-buan", group: "전북", label: "전북 부안", longitude: 126.733, osm: "way/469953852" },
  { id: "jeonbuk-sunchang", group: "전북", label: "전북 순창", longitude: 127.137, osm: "way/428388430" },
  { id: "jeonbuk-wanju", group: "전북", label: "전북 완주", longitude: 127.162, osm: "way/706529002" },
  { id: "jeonbuk-iksan", group: "전북", label: "전북 익산", longitude: 126.958, osm: "way/591315603" },
  { id: "jeonbuk-imsil", group: "전북", label: "전북 임실", longitude: 127.289, osm: "way/546742697" },
  { id: "jeonbuk-jangsu", group: "전북", label: "전북 장수", longitude: 127.521, osm: "way/1167479371" },
  { id: "jeonbuk-jeonju", group: "전북", label: "전북 전주", longitude: 127.148, osm: "relation/13178301" },
  { id: "jeonbuk-jeongeup", group: "전북", label: "전북 정읍", longitude: 126.856, osm: "way/805823173" },
  { id: "jeonbuk-jinan", group: "전북", label: "전북 진안", longitude: 127.425, osm: "node/358896867" },
  // 전남
  { id: "jeonnam-gangjin", group: "전남", label: "전남 강진", longitude: 126.767, osm: "way/609836796" },
  { id: "jeonnam-goheung", group: "전남", label: "전남 고흥", longitude: 127.276, osm: "way/857101156" },
  { id: "jeonnam-gokseong", group: "전남", label: "전남 곡성", longitude: 127.292, osm: "way/1167420319" },
  { id: "jeonnam-gwangyang", group: "전남", label: "전남 광양", longitude: 127.696, osm: "way/497331252" },
  { id: "jeonnam-gurye", group: "전남", label: "전남 구례", longitude: 127.463, osm: "way/1066006730" },
  { id: "jeonnam-naju", group: "전남", label: "전남 나주", longitude: 126.711, osm: "node/2623128836" },
  { id: "jeonnam-damyang", group: "전남", label: "전남 담양", longitude: 126.988, osm: "way/479409316" },
  { id: "jeonnam-mokpo", group: "전남", label: "전남 목포", longitude: 126.392, osm: "way/478006180" },
  { id: "jeonnam-muan", group: "전남", label: "전남 무안", longitude: 126.482, osm: "way/716675503" },
  { id: "jeonnam-boseong", group: "전남", label: "전남 보성", longitude: 127.080, osm: "way/536846293" },
  { id: "jeonnam-suncheon", group: "전남", label: "전남 순천", longitude: 127.487, osm: "node/4696647694" },
  { id: "jeonnam-sinan", group: "전남", label: "전남 신안", longitude: 126.351, osm: "way/419263805" },
  { id: "jeonnam-yeosu", group: "전남", label: "전남 여수", longitude: 127.662, osm: "way/1347908410" },
  { id: "jeonnam-yeonggwang", group: "전남", label: "전남 영광", longitude: 126.512, osm: "way/921284481" },
  { id: "jeonnam-yeongam", group: "전남", label: "전남 영암", longitude: 126.697, osm: "way/476123053" },
  { id: "jeonnam-wando", group: "전남", label: "전남 완도", longitude: 126.755, osm: "way/1167420316" },
  { id: "jeonnam-jangseong", group: "전남", label: "전남 장성", longitude: 126.785, osm: "way/622689726" },
  { id: "jeonnam-jangheung", group: "전남", label: "전남 장흥", longitude: 126.907, osm: "way/541543598" },
  { id: "jeonnam-jindo", group: "전남", label: "전남 진도", longitude: 126.264, osm: "way/1167420317" },
  { id: "jeonnam-hampyeong", group: "전남", label: "전남 함평", longitude: 126.517, osm: "way/1167420315" },
  { id: "jeonnam-haenam", group: "전남", label: "전남 해남", longitude: 126.600, osm: "way/1167420318" },
  { id: "jeonnam-hwasun", group: "전남", label: "전남 화순", longitude: 126.986, osm: "way/1507508255" },
  // 경북
  { id: "gyeongbuk-gyeongsan", group: "경북", label: "경북 경산", longitude: 128.742, osm: "node/7095717672" },
  { id: "gyeongbuk-gyeongju", group: "경북", label: "경북 경주", longitude: 129.225, osm: "way/1138401440" },
  { id: "gyeongbuk-goryeong", group: "경북", label: "경북 고령", longitude: 128.263, osm: "way/1167479365" },
  { id: "gyeongbuk-gumi", group: "경북", label: "경북 구미", longitude: 128.344, osm: "way/476243437" },
  { id: "gyeongbuk-gimcheon", group: "경북", label: "경북 김천", longitude: 128.114, osm: "way/786381359" },
  { id: "gyeongbuk-mungyeong", group: "경북", label: "경북 문경", longitude: 128.187, osm: "way/1138400084" },
  { id: "gyeongbuk-bonghwa", group: "경북", label: "경북 봉화", longitude: 128.733, osm: "way/479940105" },
  { id: "gyeongbuk-sangju", group: "경북", label: "경북 상주", longitude: 128.159, osm: "way/491737495" },
  { id: "gyeongbuk-seongju", group: "경북", label: "경북 성주", longitude: 128.283, osm: "way/1014049183" },
  { id: "gyeongbuk-andong", group: "경북", label: "경북 안동", longitude: 128.730, osm: "way/547432915" },
  { id: "gyeongbuk-yeongdeok", group: "경북", label: "경북 영덕", longitude: 129.365, osm: "way/1187068988" },
  { id: "gyeongbuk-yeongyang", group: "경북", label: "경북 영양", longitude: 129.112, osm: "node/10856537125" },
  { id: "gyeongbuk-yeongju", group: "경북", label: "경북 영주", longitude: 128.624, osm: "way/488169047" },
  { id: "gyeongbuk-yeongcheon", group: "경북", label: "경북 영천", longitude: 128.939, osm: "way/1138403628" },
  { id: "gyeongbuk-yecheon", group: "경북", label: "경북 예천", longitude: 128.437, osm: "way/898411393" },
  { id: "gyeongbuk-ulleung", group: "경북", label: "경북 울릉", longitude: 130.906, osm: "way/1026644649" },
  { id: "gyeongbuk-uljin", group: "경북", label: "경북 울진", longitude: 129.401, osm: "way/528419904" },
  { id: "gyeongbuk-uiseong", group: "경북", label: "경북 의성", longitude: 128.697, osm: "way/1167479364" },
  { id: "gyeongbuk-cheongdo", group: "경북", label: "경북 청도", longitude: 128.734, osm: "node/358896969" },
  { id: "gyeongbuk-cheongsong", group: "경북", label: "경북 청송", longitude: 129.057, osm: "way/1167479363" },
  { id: "gyeongbuk-chilgok", group: "경북", label: "경북 칠곡", longitude: 128.402, osm: "way/469026743" },
  { id: "gyeongbuk-pohang", group: "경북", label: "경북 포항", longitude: 129.343, osm: "way/469052482" },
  // 경남
  { id: "gyeongnam-geoje", group: "경남", label: "경남 거제", longitude: 128.621, osm: "node/4837746329" },
  { id: "gyeongnam-geochang", group: "경남", label: "경남 거창", longitude: 127.910, osm: "node/1925147023" },
  { id: "gyeongnam-goseong", group: "경남", label: "경남 고성", longitude: 128.322, osm: "way/1017530114" },
  { id: "gyeongnam-gimhae", group: "경남", label: "경남 김해", longitude: 128.889, osm: "node/4633863558" },
  { id: "gyeongnam-namhae", group: "경남", label: "경남 남해", longitude: 127.893, osm: "way/699013360" },
  { id: "gyeongnam-miryang", group: "경남", label: "경남 밀양", longitude: 128.747, osm: "way/553781131" },
  { id: "gyeongnam-sacheon", group: "경남", label: "경남 사천", longitude: 128.064, osm: "way/1058437045" },
  { id: "gyeongnam-sancheong", group: "경남", label: "경남 산청", longitude: 127.873, osm: "way/473552888" },
  { id: "gyeongnam-yangsan", group: "경남", label: "경남 양산", longitude: 129.037, osm: "way/490266789" },
  { id: "gyeongnam-uiryeong", group: "경남", label: "경남 의령", longitude: 128.262, osm: "way/1167479367" },
  { id: "gyeongnam-jinju", group: "경남", label: "경남 진주", longitude: 128.108, osm: "way/452718125" },
  { id: "gyeongnam-changnyeong", group: "경남", label: "경남 창녕", longitude: 128.492, osm: "way/1167479366" },
  { id: "gyeongnam-changwon", group: "경남", label: "경남 창원", longitude: 128.682, osm: "node/1904506976" },
  { id: "gyeongnam-tongyeong", group: "경남", label: "경남 통영", longitude: 128.433, osm: "way/902158701" },
  { id: "gyeongnam-hadong", group: "경남", label: "경남 하동", longitude: 127.751, osm: "way/469729064" },
  { id: "gyeongnam-haman", group: "경남", label: "경남 함안", longitude: 128.407, osm: "node/358896990" },
  { id: "gyeongnam-hamyang", group: "경남", label: "경남 함양", longitude: 127.725, osm: "way/1167479369" },
  { id: "gyeongnam-hapcheon", group: "경남", label: "경남 합천", longitude: 128.166, osm: "way/1167479368" },
  // 제주
  { id: "jeju-seogwipo", group: "제주", label: "제주 서귀포", longitude: 126.560, osm: "way/370378848" },
  { id: "jeju-jeju", group: "제주", label: "제주 제주시", longitude: 126.531, osm: "relation/18504190" },
];

/** The 17 ids the select had before 2026-10-07 (one per 시·도): a 도 id reads as the city it stood for. */
export const LEGACY_PLACE_IDS: Readonly<Record<string, string>> = {
  gyeonggi: "gyeonggi-suwon",
  gangwon: "gangwon-chuncheon",
  chungbuk: "chungbuk-cheongju",
  chungnam: "chungnam-hongseong",
  jeonbuk: "jeonbuk-jeonju",
  jeonnam: "jeonnam-muan",
  gyeongbuk: "gyeongbuk-andong",
  gyeongnam: "gyeongnam-changwon",
  jeju: "jeju-jeju",
};
