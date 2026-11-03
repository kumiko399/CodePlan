# 码上计划 · 项目记忆

## 目标与边界

- 用户于 2026-11-03 明确授权公开发布 0.1.0 源码，包括本轮提交、创建 GitHub 仓库和 v0.1.0 源码 Release。采用独立源码快照保留本地开发历史隐私，不公开安装包。用户于 2026-11-03 确认采用非商业源码许可：禁止未经另行授权的收费、广告变现及企业内部业务使用，允许个人学习与非商业教学研究；不采用 MIT、不宣称 OSI 开源。正式许可位于 LICENSE；按用户要求使用已连接 GitHub 账号的登录名 kumiko399 作为公开版权署名，已只读核实。版权联系可通过项目 Issue 请求私密渠道；第三方组合分发兼容方案仍待完成。
- 源码公开与安装包再分发分别审核。非商业许可不能假定适用 Connector/J 的 Universal FOSS Exception；当前含 MySQL／Java／微软运行库的安装包暂不公开，待 docs/RELEASE_CHECKLIST.md 的授权、对应源码与声明事项解决。免责声明不能替代授权；不为公开准备自动替换数据库、改写 Git 历史或修改业务功能。
- 公开目标仓库 https://github.com/kumiko399/CodePlan；首次使用 `.local/publication-0.1.0/` 独立 Git 仓库发布源码快照，公开署名使用 GitHub noreply 邮箱。根工作区保留原开发历史，不应直接推送它替换公开 main；后续同步应基于公开历史应用源码变更，不强推。

- 产品需求统一归入 V1.0（第一版）；用户已授权实施 `docs/PRD.md` 中 F01–F11、O01–O05，按实施顺序逐项验证，未验收功能不能记为已交付。
- 产品版本标签与程序构建编号、数据库迁移版本和备份格式版本分开维护。当前源码版本统一为 0.1.0，发布标签 v0.1.0；旧本机 1.1.1 安装与升级基线保留，不做降级安装。
- 面向计算机专业学生的个人 Windows 桌面计划工具，无应用账号，数据本地保存。
- Vue 3 / JavaScript / Vite / Element Plus；Java 21 / Spring Boot / MyBatis / MySQL；Electron 桌面容器。
- 学习、生活、运动、算法任务；日历、文字复盘、刷题记录及统计；备份恢复、重复任务、可选通知、中文/英文和主题。
- 不做算法复习计划、云同步、多人协作和代码评测。力扣同步只有验证可用才上线，目前不提供入口。

## 工程边界

- `frontend/` 页面与统一 fetch 客户端；`backend/` Controller → Service → Mapper；`desktop/` 仅桌面能力和专属进程管理。
- `scripts/` 开发/打包脚本；`docs/` PRD、接口、学习与验收文档。
- `.tools/`、`.cache/`、`.local/`、`runtime/`、`release/`、构建输出和依赖不提交。用户数据库、备份、凭证不得提交或删除。
- 不接管或修改系统已有 MySQL 服务。开发和桌面程序使用自己的实例、目录、凭证和端口，只停止自己启动的进程。

## 数据规则

- 首页「保存数据」复用手动备份接口；日常操作仍即时持久化。按钮不能用前端旧列表覆盖数据库，失败不能提示保存成功。
- 题目、计划、解题记录分开；完成任务不等于题目通过，统计按题目去重。
- 日期按本机时区；重复任务同规则同日期唯一；关闭重复功能保留已有实例。
- 分类稳定 ID 统一维护在前端 `lib/categories.js` 和后端 `model/Categories.java`，跨端契约测试必须通过。现有四类不可重命名；新增十类大学生活分类，无需删表迁移。分类 emoji、配色需同步到编辑、筛选、列表、日历和统计，支持深色及英文。
- 恢复必须先验证并创建恢复前备份，再在事务中整体恢复；失败保持原数据。备份不含本机路径和凭证。
- 桌面接口只监听回环地址，使用随机应用令牌；Electron 禁用页面 Node 权限，不执行用户笔记内容。
- ZIP 新快照格式为 v2，继续读取 v1（新增字段取默认值），拒绝未知版本，限制 20 MB；恢复校验引用关系和 SHA-256，恢复前备份失败必须中止。每日自动备份保留 30 份，不能清理手动或恢复前备份。
- 单用户写操作由 Service 串行执行，并在持锁期间提交事务。不要把事务移到锁外导致备份和写入交错。
- schema.sql 只创建缺失的表；`DatabaseMigration` 在结构升级前生成 `upgrades/before-v2-*.zip`，`schema_history` 保存校验和与状态；迁移文件发布后不可改写。MySQL DDL 不能按业务事务回滚，失败时基于有效保护副本安全重试，禁止删表重建。
- 扩展业务数据由 `WorkspaceModels` / `FocusRecord` 定义，经 MyBatis `planner_extra(kind,record_id,payload)` 存储；只能接受已知类型、校验引用和字段，并纳入整体备份事务。`planner_meta` 的数据库 ID 与恢复代次不进入业务备份。
- 软删除排除列表、任务统计、提醒和专注启动；彻底删除保留学习历史及重复实例 tombstone。模板批量创建须事务执行并保留 requestId 幂等凭据。
- 桌面草稿仅存固定 userData/drafts.json，受限 IPC，2 MB 上限、原子替换；浏览器使用 localStorage。草稿不进入备份、不计为正式保存，恢复必须由用户明确选择。
- 专注时钟在后端每 5 秒验证区间，超过 15 秒间隙或进程代次变化转为中断，离线／暂停／休息不计时；统计按实际区间跨日拆分。
- 日历展示由 `CalendarBoard.vue` / `CalendarDay.vue` 管理：完整周的紧凑月历最多三条摘要，周历最多五条，筛选与当天详情共用同一分组；1440px 以上使用侧栏，否则抽屉。图标来自 TaskDetails 可选 emoji，null/空值跟随分类，旧快照默认兼容；预设值须通过后端校验，软删除恢复不得丢失。重复规则及模板仍使用分类图标。拖动成功后可在 15 秒内撤销，撤销先读最新任务，只恢复日期，不覆盖新编辑；已删除／再次改期时拒绝。

## 工作方式

- 日历状态区分计划延期（橙色 ↗）和截止超期（红色 !），截止超期优先；图标悬停与详情给出具体原因。每日进度按当天全部任务计算，不随显示筛选改变。快捷改期与拖动共用最新数据读取及 15 秒撤销，保留截止时间；超过截止时间须明确确认。完成任务的防重复保护从确认弹窗前开始。

- 先检查 Git 状态并阅读本文件，增量维护，不覆盖已有规则。
- 版本固定，保留 npm 锁文件；验证任务持久化、统计去重、重复生成和恢复失败的安全性。
- 测试默认在后台或隐藏窗口中运行，不弹出应用／终端窗口、不抢占焦点，测试结束后也不自动打开桌面快捷方式。界面测试优先使用隐藏渲染与截图；若某项原生窗口行为无法在后台验证，先说明限制并征得用户同意再打开可见窗口，不能静默跳过后声称通过。
- 每次功能开发、优化或修复完成后，先完成验证并向用户汇报，保留未提交修改；只有收到用户对本次改动明确的提交确认后才执行 Git commit。历史提交授权不自动延续到后续改动，「继续」或「开始开发」不视为提交确认。不自动创建远端或推送。最终交付注明实际验证与尚未验证的部分。
- 源码与锁文件纳入 Git；无默认远端，不自动推送。安装包、测试截图和隔离验收库留在忽略目录。

## 可靠命令与运行约定

- Node.js 22.12+（已验证 24），JDK 21，Maven 3.9.11，MySQL 8 Windows x64 程序。具体依赖版本以锁文件和 pom.xml 为准。
- 安装：`npm --prefix frontend ci`、`npm --prefix desktop ci`；根目录 `npm ci` 仅提供格式化工具。
- 后端构建和测试：`./scripts/build-backend.ps1`；使用 JAVA_HOME / PATH，也识别本地 `.tools/jdk/` 与 `.tools/apache-maven-3.9.11/`。Windows 上先停止开发后端再打包 JAR，避免正在使用的 JAR 无法重命名。
- 运行环境：`./scripts/prepare-runtime.ps1 -JavaHome <JDK目录> -MySqlHome <MySQL程序目录>`，只复制程序，不能复制系统数据库数据或配置。
- 开发：先 `node scripts/dev.mjs`，出现 Backend ready 后另开终端 `npm run dev`。后端重启后需重启 Vite，它在启动时读取 `.local/connection.json`。
- 构建前端：`npm run build`；桌面开发：`npm run desktop`；完整打包：`./scripts/package.ps1`。
- 规则与通知测试：`npm test`；真实数据库验收：`node scripts/mysql-smoke.mjs`。
- 界面验收（先运行开发服务）：`./desktop/node_modules/.bin/electron.cmd scripts/ui-smoke.cjs`；桌面入口：同命令运行 `scripts/desktop-smoke.cjs`；打包验收：`node scripts/packaged-smoke.mjs`。
- Windows 环境使用 Tomcat NIO2，避免默认 NIO Selector 的 AF_UNIX 管道故障。不要为绕过 Electron 权限问题关闭 renderer 沙盒。
- 应用默认数据在 `%APPDATA%/CodePlan`，开发数据在 `.local/development`，测试使用独立目录。备份迁移业务数据，不复制运行中的数据库。
- 关闭行为由设置页「窗口行为 → 关闭窗口时」选择最小化到托盘／直接退出，默认最小化，选择后自动保存，不再询问关闭方式。偏好保存在固定 userData/desktop-preferences.json，主进程原子写入并校验枚举，不纳入业务备份；启动阶段也生效，文件损坏保留原文件并默认最小化。托盘未就绪时最小化到任务栏，重新打开先 restore 再 show/focus。直接退出、托盘退出及 `--quit` 仍处理未提交草稿和活动专注，重复关闭不叠加保护；内部故障退出直接等待专属服务停止。启动期间退出也必须安全清理。
- 关闭行为测试：`npm test`；真实设置控件及窗口关闭验收：`./desktop/node_modules/.bin/electron.cmd scripts/close-smoke.cjs`，用隔离数据验证偏好保存、最小化和直接退出，并断言不出现关闭方式对话框，不触碰个人数据库。
- 安装包固定读取 resources 下的 Java/MySQL，不能依赖开发者 PATH。下载缓存使用项目目录，Electron 使用小写 `electron_config_cache`。
- 桌面源码当前版本 0.1.0，构建输出 release/0.1.0/；以下 1.1.1 为历史本机安装约定：第一版扩展安装包输出到 `release/1.1.1-calendar/`，`release/1.1.1/` 保留旧包作为升级验收基线。本次用户要求安装新版并可从桌面 CodePlan 快捷方式启动，允许更新本机安装与快捷方式，版本和 Git tag 不变。后续变更版本时同步桌面 package/lock 版本与 build.directories.output。验证脚本从打包配置读取路径，`CODEPLAN_TEST_EXE` 可指定已安装 EXE 进行隔离验收；用户数据目录不随版本或安装位置改变。
- 导航动画必须兼容 `prefers-reduced-motion`，图标导航保留名称与键盘焦点。页面验收必须实际移动鼠标检查六个入口，失败应返回非零退出码。
- 扩展桌面验收：`./desktop/node_modules/.bin/electron.cmd scripts/expansion-smoke.cjs`；真实旧数据库升级及 v1 备份：`node scripts/upgrade-smoke.mjs`（需要保留的 `release/1.1.1/` 安装资源）。测试资料仅在 `.local/`；旧安装包不得覆盖，以保留升级测试基线。
- 提交前完成相关测试与 `git diff --check`；验证记录见 `docs/VERIFICATION.md`。未经干净 Windows 虚拟机实测，不能声称完成无依赖机器的安装验收。
- 日历验收：`./desktop/node_modules/.bin/electron.cmd scripts/calendar-smoke.cjs`，隔离数据覆盖一天 12 项、长标题、任务 emoji、分类筛选、宽窄详情、快速新增、拖动失败与撤销保留新备注；截图及验收结果只留在 `.local/`。

## 天气模块与后台验收

- 首页天气使用 Open-Meteo 非商业免费接口 best_match；首页及设置注明 Open-Meteo、CC BY 4.0 和文档／条款。不得声称中国气象局直供或气象站实测。常用城市优先中国与亚太，预报按城市时区显示。
- 城市搜索来自 Open-Meteo / GeoNames；城市级 IP 定位使用 ipwho.is，仅用户明确启用后调用，可手动切换／停用。天气偏好固定保存到 app.data-dir/weather-preferences.json，不进入业务备份，不上传任务笔记，不保存原始 IP。
- WeatherController / WeatherService / WeatherHttp 独立于业务写锁；固定 HTTPS 上游、缓存、超时及冷却。Java 使用 HttpsURLConnection，避免 Windows Selector 回环故障。前端天气请求 isolated，不改动任务保存状态。
- 后台天气验收：`./desktop/node_modules/.bin/electron.cmd scripts/weather-smoke.cjs`，脚本自动使用独立目录及隐藏窗口。可设置 CODEPLAN_WEATHER_LIVE=1 验证北京／东京真实公网预报，其余异常使用明确测试数据；不得把模拟定位称为实测定位准确率。
- 通用隐藏测试模式须同时设置 CODEPLAN_BACKGROUND_TEST=1 和独立 CODEPLAN_DATA_DIR，不显示主窗口或通知；仍保留 renderer 沙盒。packaged-smoke.mjs 已默认启用。
- 历史天气安装包输出 release/1.1.1-weather/，保留此前日历包与 release/1.1.1/ 升级基线；其内部版本为 1.1.1。新公开源码版本为 0.1.0，产品需求仍归 V1.0。

- 天气详情为独立 /weather 页面，首页 WeatherSummary 展示默认城市的简短天气并链接详情；手动默认使用天气偏好 city，自动模式使用定位城市（失败可回退收藏并提示）。浏览、添加或删除其他城市不能改变手动默认；设为固定默认会切换手动模式。城市列表最多 8 项保存在 cities，兼容旧 city。自动定位与收藏城市共存，关闭定位可保留城市。穿衣／舒适度只是应用参考建议，不是官方指数。
- 当前天气验收使用 scripts/weather-multi-smoke.cjs（weather-smoke.cjs 为兼容入口）；导航增至七项。天气扩展数据包含 UV、露点、能见度、气压、阵风和日出日落，必须保留缺失值和城市时区语义。

- 天气页面现按苹果天气的侧栏／详情结构组织，替代先前 MSN 布局：宽屏左侧城市列表，窄屏横向城市条；居中当前温度，24 小时及 7 天预报同时展示，多日温度范围条及指标网格。WeatherTrend 曲线可展开，缺失值断开；范围缺失不绘制，保留文本数据。样式集中于 frontend/src/components/weather-dashboard.css，城市选择弹窗放在气氛面板外，避免颜色继承。只借鉴页面结构，来源仍明确标注 Open-Meteo。
- 天气面板采用半透明渐变、backdrop-filter 和边缘高光形成玻璃效果；支持减少透明度偏好及不支持模糊时的实色回退。首页天气请求仍 isolated，失败不影响任务保存。
- 整页天气视觉由 WeatherView 的 weather-page 统一提供天空背景和光晕，标题栏、悬浮城市侧栏、当前天气、预报、指标及来源区共享玻璃表面；城市侧栏宽屏随滚动保持可用，窄屏恢复横向布局。城市搜索弹窗 append-to-body，避免继承天空背景的白色文字。
- 最新视觉以 Mac 桌面天气布局为准：天气区域适配窗口高度，城市侧栏和详情分别滚动，顶部为紧凑标题栏及无边框当前天气。右侧容器宽度达到 660px 时，多日预报与指标并排；窄屏保持横向城市条。收轻玻璃边框，替代此前大尺寸卡片和整页长滚动。
- 天气日预报及指标通过 WeatherInspector 查看城市当地日期的逐小时详情；日出日落使用每日数据，无数据不补造曲线。WeatherTrend 支持悬停和方向键。城市排序保存于 cities，排序及刷新保留浏览城市，不能改变首页默认；页面内导航保留浏览日期和滚动位置。
- 天气显示设置（C/F、ms/kmh、清晰模式、侧栏折叠）通过 /weather/display 保存至固定 app.data-dir/weather-display.json，原子替换、枚举校验、不进入业务备份；不能依赖随桌面端口变化的 localStorage。TaskWeatherHint 只读默认城市预报，按城市当地日期／小时查询，不能改写任务字段。
