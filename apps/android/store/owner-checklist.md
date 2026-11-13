# 사장님 체크리스트 — 출시까지 사장님 계정으로만 할 수 있는 일 (순서대로, 한 줄에 한 동작)

- 메뉴 이름은 2026-11-12에 공식 도움말 원문에서 확인한 것이다. 확인하지 못한 이름은 **(화면에서 확인)** 이라고 적었다.
- Play Console은 지금 쓰는 개발자 계정 "Yeolmae_STUDIO"(개인 계정, 2026-11-13 콘솔에서 확인) 그대로 간다. AdMob과 Google Cloud를 어느 Google 계정으로 할지는 사장님이 정한다(다른 서비스는 사업용 계정을 써 왔다).
- **비밀값(JSON 키, 비밀번호)은 채팅에 붙이지 않는다.** 터미널에 직접 입력하거나, 깃이 무시하는 파일로만 둔다. 방법은 각 단계에 있다.
- 붙여 넣을 글은 이 폴더(`apps/android/store/`)의 파일에 있다.

## 0. 먼저 정할 것 (2026-11-13에 모두 정해짐: 패키지 그대로, 문구 15건 승인, 세트는 앱에서도 팔고 남은 몫은 문의로 환불, 18세 이상, 신고 기록 1년, 등록 문구 초안 그대로)
1. 패키지 이름 `kr.yeolmaeapps.starlog` 으로 간다 (올린 뒤에는 못 바꾼다).
2. 문구 변경 15건 승인 (`wording-proposals.md`): 약관·환불 정책·개인정보처리방침·FAQ. Play는 방침과 앱 동작이 어긋나면 반려한다.
3. 세트 상품: (가) 앱에서도 팔고 하나 연 뒤 남은 몫은 문의로 환불, (나) 앱에서는 세트를 팔지 않음. 둘 중 하나.
4. 타겟 연령: 18세 이상(권장) 또는 16-17세와 18세 이상 (`app-content.md`).
5. 풀이 신고 기록 보관 기간 (예: 1년).
6. 스토어 등록 문구 초안 (`listing-ko.md`) 확인.

## 1. Play Console: 계정과 앱 (확인 끝, 2026-11-13)
7. ~~Play Console 로그인~~ 끝.
8. ~~계정 확인~~ 끝: 개인 계정이고, 이 앱의 대시보드에 "프로덕션 액세스 권한을 신청하려면 먼저 기준을 충족하는 비공개 테스트… 12명 이상의 테스터가 비공개 테스트 참여를 선택 … 14일 이상 비공개 테스트 실행 → 프로덕션 신청"이라고 나온다. **출시 경로는 비공개 테스트 12명 × 14일 → 프로덕션 신청 하나다.**
8-1. 계정 알림 "2027년 2월까지 판매자 상태를 선언하세요 (조치 필요)": 사장님 본인이 선언한다(사업자로 판매하는지). 기한 전에만 하면 되지만 결제 프로필과 같이 해 두는 게 편하다.

## 2. 업로드 키 만들기 (사장님 PC에서, 비밀번호는 사장님만 안다)
9. 터미널에서 아래 한 줄을 실행하고, 물어보는 비밀번호와 이름을 직접 입력한다. 파일은 저장소 밖에 만들어진다.
   `keytool -genkeypair -v -keystore C:\starlog-ops\keys\starlog-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000`
   (Play 요건: 업로드 키는 "RSA key of 2048 bits or more", https://support.google.com/googleplay/android-developer/answer/9842756. 이 명령 자체는 Google 문서에 그대로 실려 있지 않아 Java 표준 `keytool` 사용법으로 썼다. 폴더가 없으면 먼저 `mkdir C:\starlog-ops\keys`.)
10. `apps/android/keystore.properties` 파일을 만든다(깃이 무시한다). 내용 4줄: `storeFile=C:\\starlog-ops\\keys\\starlog-upload.jks`, `storePassword=…`, `keyAlias=upload`, `keyPassword=…`. 비밀번호는 여기에만 적는다.
11. 키 파일과 비밀번호를 다른 곳(비밀번호 관리자, 외장 저장소)에 한 벌 더 보관한다. 잃어버려도 Google이 업로드 키를 다시 설정해 줄 수 있지만 며칠 걸린다.

## 3. Play Console: 앱 만들기와 내부 테스트 빌드
12. ~~앱 만들기~~ 끝(2026-11-13): 이름 `스타로그: 타로와 사주 풀이`, 패키지 `kr.yeolmaeapps.starlog`, 한국어, 앱, 무료.
13. 업로드 키(9~10번)를 만들고 "키 만들었어"라고 알려 준다. 내가 서명된 AAB를 만들어 경로를 알려 준다(광고 ID가 아직 없으면 테스트 광고로 만든 내부 테스트용).
14. `테스트 및 출시 > 테스트 > 내부 테스트`에서 새 버전을 만들고 AAB를 올린다. Play 앱 서명은 새 앱에서 자동으로 켜진다 ("automatically enrolled").
    (결제 라이브러리가 든 빌드를 한 번 올려야 상품 메뉴가 열린다: "publish to any track, including the internal test track", https://developer.android.com/google/play/billing/getting-ready)
15. 내부 테스트 테스터 목록에 본인과 테스트할 사람의 Google 계정을 넣고, 테스트 참여 링크로 폰에 설치한다.

## 4. Play Console: 결제 설정과 상품
16. 결제 프로필(판매자 계정)이 없으면 만든다 **(화면에서 확인: 상품을 만들려고 하면 안내가 뜬다)**. 사업자 정보로.
17. `Google Play를 통한 수익 창출 > 제품 > 일회성 제품 > 일회성 제품 만들기`로 `products.md` 표의 상품을 하나씩 만든다. **상품 ID는 표 그대로**(만든 뒤 변경·재사용 불가), 이름·설명·가격도 표 그대로. 구매 옵션은 기본(구매), 가격은 대한민국 KRW. 각 상품에서 `활성화`를 누른다. (세트는 0-3 답에 따라.)
18. `계정 관리 > Google Play 앱 설정 > 수익 창출 설정 > 라이선스 테스트`에 테스트 결제를 할 Google 계정을 넣는다(돈이 나가지 않는 테스트 카드가 뜬다).

## 5. Google Cloud: 서버가 구매를 확인하는 계정
19. Google Cloud Console(https://console.cloud.google.com)에서 프로젝트를 고른다(구글 로그인에 쓰는 기존 프로젝트). `Google Play Android Developer API` 페이지에서 `사용 설정(Enable)`.
20. `IAM 및 관리자 > 서비스 계정 > 서비스 계정 만들기`로 계정을 만든다(역할은 주지 않아도 된다). 만든 계정의 `키` 탭 **(화면에서 확인)** 에서 JSON 키를 만들어 내려받는다. 이 파일이 비밀값이다.
21. Play Console `사용자 및 권한 > 신규 사용자 초대`에 서비스 계정 이메일(…@….iam.gserviceaccount.com)을 넣고 권한 두 개를 준다: `재무 데이터, 주문, 취소 설문조사 응답 보기`, `주문 및 정기 결제 관리`. `사용자 초대`.
22. 터미널에서 `apps/web` 폴더로 가서 `npx wrangler secret put PLAY_SERVICE_ACCOUNT_JSON` 을 실행하고, 내려받은 JSON 파일의 **내용 전체**를 붙여 넣고 엔터. (채팅에 붙이지 않는다. 넣은 뒤 JSON 파일은 안전한 곳에 두거나 지운다.) 끝나면 "넣었어"라고만 알려 준다.

## 6. Google 로그인 (앱의 계정 선택창)
23-가. Play Console `Google Play로 보호됨 > Play 스토어 보호 > Play 앱 서명 관리`의 **앱 서명 키** 섹션에서 SHA-1 지문을 복사한다(지문이 3개면 3개 모두: "copy the fingerprints for three keys and register each of them"). 업로드 키의 SHA-1도 같은 화면에서 복사한다.
23-나. Google Cloud Console `API 및 서비스 > 사용자 인증 정보 > 사용자 인증 정보 만들기 > OAuth 클라이언트 ID`, 유형 `Android`, 패키지 이름 `kr.yeolmaeapps.starlog`, SHA-1 지문. 지문마다 하나씩 만든다. (근거: Google 코드랩 "You need to create both a Web client and an Android client". 어떤 지문을 넣는지는 Play 문서의 "register the Google-held app signing key fingerprint with your API providers"를 따른 것이고, 두 문서를 합친 해석이다.)
23-다. 같은 화면의 **웹 클라이언트 ID**(…apps.googleusercontent.com, 지금 웹 로그인에 쓰는 것)를 알려 준다. 공개 값이라 채팅에 적어도 된다. 앱 빌드에 넣는다.

## 7. AdMob
24-가. AdMob(https://admob.google.com)에 사업용 계정으로 로그인. `앱 > 앱 추가`, 플랫폼 Android, 아직 스토어에 없으면 `게시 취소됨`(나중에 스토어에 연결).
24-나. 그 앱에서 `광고 단위 > 시작하기(또는 광고 단위 추가) > 배너`로 배너 광고 단위를 하나 만든다.
24-다. `앱 > 모든 앱 보기`의 `앱 ID` 열에서 앱 ID(`ca-app-pub-…~…`)를, 앱의 `광고 단위` 열에서 광고 단위 ID(`ca-app-pub-…/…`)를 복사해 알려 준다. 공개 값이라 채팅에 적어도 된다.
24-라. AdMob의 app-ads.txt 안내에 나오는 한 줄(`google.com, pub-…, DIRECT, f08c47fec0942fa0`)을 알려 준다. 내가 사이트 루트에 `app-ads.txt`로 올린다(스토어에 적는 개발자 웹사이트의 루트여야 한다).

## 8. 심사용 계정
25. `reviewer-access.md`대로 터미널에서 `REVIEW_LOGIN_ID`, `REVIEW_LOGIN_PASSWORD` 두 시크릿을 넣는다.

## 9. 내가 할 일 (값을 받은 뒤) → 사장님 확인
26. 내가 광고 ID·웹 클라이언트 ID를 넣은 서명 AAB를 다시 만들고, 내부 테스트 확인 목록을 같이 돈다: 테스트 카드 구매 → 풀이 열림, 열지 않은 구매 환불, 카카오·Google 로그인, 화면별 배너, 신고, 회원 탈퇴. 사장님은 폰에서 눌러 주면 된다.
27. Play Console `앱 콘텐츠`의 선언들을 `app-content.md`, `data-safety.md`, `reviewer-access.md`대로 채운다(붙여 넣기).
28. `사용자 늘리기 > 앱 정보 > 기본 스토어 등록정보`에 `listing-ko.md`의 글과 `graphics/`의 아이콘·그래픽 이미지·스크린샷을 올린다. `스토어 설정`의 연락처에 이메일과 웹사이트를 넣는다.

## 10. 출시 (비공개 테스트 12명 × 14일 → 프로덕션)
29. 테스터 12명 이상을 모은다. Google 계정(지메일) 주소만 있으면 된다. 가족·지인·기존 테스터에게 "Google 계정 주소를 알려 달라, 링크를 누르고 앱을 설치해 14일 동안 지우지 말아 달라"고 부탁한다. 중간에 빠지는 사람에 대비해 15명쯤 모은다 ("opted in continuously for at least 14 days": 14일 동안 참여 상태가 이어져야 센다).
29-1. `테스트 및 출시 > 테스트 > 비공개 테스트`에서 트랙을 만들고, 테스터를 넣는다: 이메일 목록을 만들어 주소를 붙여 넣거나, Google 그룹 주소 하나를 넣는다(그룹에 사람을 넣고 빼기 쉽다).
29-2. 같은 화면에서 새 버전을 만들어 내부 테스트에서 확인한 AAB를 올리고 검토에 보낸다(비공개 테스트도 심사를 거친다). 이때 `앱 콘텐츠`의 선언들과 스토어 등록정보가 채워져 있어야 한다(27~28번).
29-3. 승인되면 화면의 **참여 링크(웹에서 참여 / Android에서 참여)** 를 테스터에게 보낸다. 테스터는 링크에서 `테스터 되기`를 누르고 Play 스토어에서 설치한다.
   (29-1~29-3의 버튼·링크 이름과 비공개 테스트의 심사 여부는 공식 도움말 원문에서 확인하지 못했다: **화면에서 확인**.)
29-4. 대시보드의 진행 표시가 "12명 이상 참여"와 "14일"을 채울 때까지 기다린다. 그동안 받은 의견을 적어 둔다(프로덕션 신청 질문에 쓴다).
29-5. `대시보드 > 프로덕션 액세스 신청`의 질문 세 묶음(비공개 테스트, 앱, 프로덕션 준비)에 답한다. 답 초안은 그때 내가 쓴다. 심사는 보통 7일 이내 ("Review usually takes seven days or less").
29-6. 승인되면 `테스트 및 출시 > 프로덕션`에서 새 버전을 만들고 같은 빌드를 올린다.
30. **검토에 보내는 버튼(제출)은 사장님이 누른다.** 누르기 전에 내가 마지막 확인표를 보낸다. 돈이 드는 것은 없다.

## 돌려받을 값 한눈에
| 값 | 어떻게 | 어디에 쓰나 |
|---|---|---|
| ~~계정 유형~~ | 확인 끝(개인, 12명 × 14일) | 출시 경로 |
| 테스터 12명 이상의 Google 계정 주소 | Play Console에 직접 입력 | 비공개 테스트 |
| 0번의 결정 6개 | 채팅 | 문구·상품·선언 |
| 업로드 키 | `apps/android/keystore.properties` (깃 무시) | 서명 |
| 서비스 계정 JSON | `npx wrangler secret put PLAY_SERVICE_ACCOUNT_JSON` | 구매 확인·환불 |
| 웹 클라이언트 ID | 채팅(공개 값) | 앱 Google 로그인 |
| AdMob 앱 ID, 배너 ID, app-ads.txt 줄 | 채팅(공개 값) | 광고 |
| 심사용 아이디·비밀번호 | `npx wrangler secret put …` 과 Play Console 입력 | 심사 |
