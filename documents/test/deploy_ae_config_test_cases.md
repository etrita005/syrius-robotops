# 閰嶇疆涓嬩綅鏈?AE 鏂囦欢 鈥?娴嬭瘯鐢ㄤ緥璁捐鏂囨。

> 鍏宠仈闇€姹傦細`documents/requirements/deploy_ae_config_requirements.md`
> 鍏宠仈璁捐锛歚documents/design/deploy_ae_config_design.md`

---

## 1. 娴嬭瘯绛栫暐

### 1.1 娴嬭瘯鑼冨洿

- **鍗曞厓/闆嗘垚娴嬭瘯**锛坄src/backend/src/test.ts`锛屾墿灞曞嵆鍙級锛氳鐩栦笁绫绘柊澧炰换鍔＄殑鍛戒护鎷艰銆佸弬鏁扮户鎵裤€乤rtifact 涓嬭浇涓庝紶杈撹仈鍔ㄣ€佹竻鐞嗗箓绛夋€с€?
- **E2E 娴嬭瘯**锛坄src/e2e-test/tests/task-management.spec.ts`锛夛細瑕嗙洊鍓嶇 CreateTaskModal 涓?`Deploy AE Config` 浠诲姟绫诲瀷鐨勫彲瑙佹€с€佸弬鏁版覆鏌撲笌澶氭満鍣ㄤ汉閫夋嫨銆?
- **mock 妯″紡 E2E**锛氫娇鐢?`MockTransferAEConfigTask` / `MockDeployAEConfigTask` / `MockDeleteAEConfigTask`锛屾棤闇€鐪熷疄鏈哄櫒浜恒€?

### 1.2 娴嬭瘯妗嗘灦

- 鍚庣锛歚node:test` + `node:assert`锛屽凡鏈夊叆鍙?`src/backend/src/test.ts`銆?
- E2E锛歅laywright锛屽凡鏈?`playwright.config.ts` 鍚姩 mock 鍚庣 + Vite 鍓嶇銆?

### 1.3 娴嬭瘯鐢ㄤ緥 ID 鍛藉悕

- 鍚庣锛歚TC-AE-NNN`
- E2E锛歚TC-E2E-AE-NNN`

---

## 2. 鍚庣鐢ㄤ緥

### TC-AE-001锛欴eployAEConfigTask 鍛戒护鎷艰锛堝惎鐢?sudo锛?

| 椤?| 鍊?|
|----|-----|
| 浼樺厛绾?| 楂?|
| 鍓嶇疆鏉′欢 | 瀹炰緥鍖?`DeployAEConfigTask`锛屽弬鏁颁粎鍚?`robotIp`銆乣robotPort` |
| 杈撳叆 | 璋冪敤 `getSshCommand({})` 涓?`buildParams({ robotIp, robotPort })` |
| 棰勬湡 | `sshCommand` 鍖呭惈鎸夐『搴忓嚭鐜扮殑鍏抽敭鐗囨锛歚[ -d /opt/cosmos/bin/applet-engine ] || { echo "Deploy target not found: /opt/cosmos/bin/applet-engine" >&2; exit 1; }`銆乣mkdir -p /tmp/ae_config_extract`銆乣unzip -o /tmp/ae_config_package.zip -d /tmp/ae_config_extract`銆乣cp -rf /tmp/ae_config_extract/*/. /opt/cosmos/bin/applet-engine/`銆乣chown -R cosmos:cosmos /opt/cosmos/bin/applet-engine`銆乣rm -rf /tmp/ae_config_extract /tmp/ae_config_package.zip`锛涘懡浠ゅ瓧绗︿覆涓?*涓?*鍖呭惈 `mkdir -p /opt/cosmos/bin/applet-engine`锛?*涔熶笉**鍖呭惈 `cp -rf /tmp/ae_config_extract/. /opt/cosmos/bin/applet-engine/`锛堥伩鍏嶈鎶婂灞傚寘瑁呯洰褰曠洿鎺ュ鍒惰繃鍘伙級锛?*涔熶笉**鍖呭惈 `/home/developer`锛堟殏瀛樿矾寰勫繀椤讳綅浜?`/tmp/`锛夛紱`buildParams` 杩斿洖鐨?`sudo === true`锛宍commandTimeout === 60000`銆?|

### TC-AE-002锛欴eleteAEConfigTask 鍛戒护鎷艰

| 椤?| 鍊?|
|----|-----|
| 浼樺厛绾?| 楂?|
| 鍓嶇疆鏉′欢 | 瀹炰緥鍖?`DeleteAEConfigTask` |
| 杈撳叆 | `getSshCommand({})` |
| 棰勬湡 | 杩斿洖 `rm -rf /tmp/ae_config_extract /tmp/ae_config_package.zip`锛沗buildParams` 杩斿洖鐨?`sudo === true`銆?|

### TC-AE-003锛歍ransferAEConfigTask 杩滅▼璺緞瑕嗙洊

| 椤?| 鍊?|
|----|-----|
| 浼樺厛绾?| 楂?|
| 鍓嶇疆鏉′欢 | 瀹炰緥鍖?`TransferAEConfigTask` |
| 杈撳叆 | `buildParams({ robotIp, robotPort, localFilePath: "/tmp/x.zip" })` |
| 棰勬湡 | 杩斿洖鐨?`remoteFilePath === "/tmp/ae_config_package.zip"`锛宍sudo === true`銆?|

### TC-AE-004锛歍ransferAEConfigTask 閫氳繃 artifactService.getArtifactPath 瑙ｆ瀽鏈湴璺緞骞朵紶杈?

| 椤?| 鍊?|
|----|-----|
| 浼樺厛绾?| 楂?|
| 鍓嶇疆鏉′欢 | 娉ㄥ叆 mock `artifactService`锛屽叾涓?`getArtifactPath(artifactId)` 鐩存帴杩斿洖涓€涓湰鍦拌櫄鎷熻矾寰勶紱mock 鐖剁被 `super.onExec` 浠呮柇瑷€ `params.localFilePath` 绛変簬 `getArtifactPath` 鐨勮繑鍥炲€笺€?|
| 杈撳叆 | `onExec({ artifactId: "art-1" }, { artifactService })` |
| 棰勬湡 | `artifactService.getArtifactPath` 琚皟鐢ㄤ竴娆★紙鍙傛暟涓轰紶鍏ョ殑 `artifactId`锛夛紱`super.onExec` 鏀跺埌鐨?`params.localFilePath` 绛変簬 `getArtifactPath` 鐨勮繑鍥炲€硷紱涓嶅垱寤?娓呯悊浠讳綍涓存椂鐩綍銆?|

### TC-AE-005锛歍ransferAEConfigTask 缂哄け artifactId 鏃剁洿閫氱埗绫?

| 椤?| 鍊?|
|----|-----|
| 浼樺厛绾?| 涓?|
| 鍓嶇疆鏉′欢 | 涓嶄紶 `artifactId`锛屾彁渚?`localFilePath` 鐜版湁鏂囦欢 |
| 杈撳叆 | `onExec({ localFilePath })` |
| 棰勬湡 | 涓嶈皟鐢?`artifactService.getArtifactPath`锛涜涓轰笌鐖剁被 `SshFileTransferTask` 涓€鑷淬€?|

### TC-AE-006锛歮ock 浠诲姟杩斿洖鎴愬姛

| 椤?| 鍊?|
|----|-----|
| 浼樺厛绾?| 涓?|
| 鍓嶇疆鏉′欢 | 瀹炰緥鍖?`MockTransferAEConfigTask`銆乣MockDeployAEConfigTask`銆乣MockDeleteAEConfigTask` |
| 杈撳叆 | 鍚勮嚜璋冪敤 `onExec({})` |
| 棰勬湡 | 涓夎€呭潎鍦ㄥ悎鐞嗘椂闂村唴锛堚墹6s锛塺esolve锛岃繑鍥?`{ done: true, success: true, ... }`銆?|

### TC-AE-007锛歵asks/index.ts 瀵煎嚭涓変釜鏂板浠诲姟

| 椤?| 鍊?|
|----|-----|
| 浼樺厛绾?| 涓?|
| 鍓嶇疆鏉′欢 | `import { TransferAEConfigTask, DeployAEConfigTask, DeleteAEConfigTask, MockTransferAEConfigTask, MockDeployAEConfigTask, MockDeleteAEConfigTask } from "./tasks/index.js"` |
| 杈撳叆 | 鐩存帴璇诲彇 import 鍚庣殑寮曠敤 |
| 棰勬湡 | 鍏ㄩ儴涓烘瀯閫犲嚱鏁帮紙`typeof === "function"`锛夈€?|

---

## 3. 鍓嶇 / E2E 鐢ㄤ緥

### TC-E2E-AE-001锛欴eploy AE Config 浠诲姟绫诲瀷鍙

| 椤?| 鍊?|
|----|-----|
| 浼樺厛绾?| 楂?|
| 鍓嶇疆鏉′欢 | 瑙ｅ喅鏂规涓嚦灏戞湁 1 鍙版満鍣ㄤ汉锛涜繘鍏ャ€孴asks 鈫?Create銆?|
| 姝ラ | 鎵撳紑 CreateTaskModal锛岀暀鍦?Type 姝ラ |
| 棰勬湡 | 鐪嬪埌浠诲姟鍗＄墖 `Deploy AE Config`锛屾弿杩板寘鍚?`applet-engine`锛涘崱鐗囨樉绀?`Robot selection: Multiple robots`銆?|

### TC-E2E-AE-002锛欴eploy AE Config 璧板埌 Robots 姝ラ

| 椤?| 鍊?|
|----|-----|
| 浼樺厛绾?| 楂?|
| 鍓嶇疆鏉′欢 | 鍚?TC-E2E-AE-001 |
| 姝ラ | 閫変腑 `Deploy AE Config` 鍗＄墖 鈫?Next |
| 棰勬湡 | 杩涘叆 Robots 姝ラ锛屽彲瑙?`Select all robots` 澶嶉€夋涓庢満鍣ㄤ汉鍒楄〃銆?|

### TC-E2E-AE-003锛欴eploy AE Config 鍙傛暟姝ラ娓叉煋鍒跺搧閫夋嫨鍣?

| 椤?| 鍊?|
|----|-----|
| 浼樺厛绾?| 楂?|
| 鍓嶇疆鏉′欢 | 瑙ｅ喅鏂规涓嚦灏?1 鍙版満鍣ㄤ汉 + 鑷冲皯 1 涓埗鍝?|
| 姝ラ | 閫?`Deploy AE Config` 鈫?Robots 閫?1 鍙?鈫?Next |
| 棰勬湡 | Params 姝ラ鏄剧ず `AE config package` 瀛楁锛屼笖涓哄埗鍝侀€夋嫨鍣紙涓?Upgrade Movebase 绛?artifact 瀛楁鍛堢幇涓€鑷达級銆?|

### TC-E2E-AE-004锛氱幇鏈変换鍔＄被鍨嬭鏁板悓姝ユ洿鏂?

| 椤?| 鍊?|
|----|-----|
| 浼樺厛绾?| 涓?|
| 鍓嶇疆鏉′欢 | 鍚?TC-E2E-AE-001 |
| 姝ラ | 鎵撳紑 CreateTaskModal锛岀暀鍦?Type 姝ラ |
| 棰勬湡 | `Robot selection: Multiple robots` 鏂囨湰璁℃暟浠?4 澧炲姞鍒?5锛涘厛鍓嶇殑鍥涗釜浠诲姟绫诲瀷锛圲pgrade BUP / Movebase Disk Cleanup / Upgrade Movebase / Apply Alpha2 Map锛変粛鍙銆?|

---

## 4. 楠屾敹鏄犲皠

| 楠屾敹椤癸紙闇€姹傦級 | 瑕嗙洊鐢ㄤ緥 |
|----------------|----------|
| AC-AE-001 | TC-E2E-AE-001銆乀C-E2E-AE-002銆乀C-E2E-AE-004 |
| AC-AE-002 | TC-AE-001銆乀C-AE-003銆乀C-AE-004 |
| AC-AE-003 | TC-AE-001锛坈hown 閮ㄥ垎锛? 鐪熸満楠屾敹 |
| AC-AE-004 | TC-AE-001锛坮m -rf 鏈熬娈碉級+ TC-AE-002 |
| AC-AE-005 | TC-AE-002 + 鐪熸満楠屾敹锛坋rrorDag 瑙﹀彂锛?|
| AC-AE-006 | TC-AE-006銆乀C-E2E-AE-001~004 |
| AC-AE-007 | TC-AE-001銆乀C-AE-008 |
| AC-AE-008 | TC-AE-001锛堟柇瑷€鍚?`*/.` glob 涓斾笉鍚洿鎺?`extract/.` 澶嶅埗锛? 鐪熸満楠屾敹 |
