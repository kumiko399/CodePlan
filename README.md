# 码上计划 · CodePlan

> **0.1.1 · 非商业源码公开版本。** 允许个人学习与非商业教学研究，禁止未经授权的收费、广告变现和企业内部业务使用。正式条款见 [LICENSE](LICENSE)。这不是 MIT／OSI 开源许可。本次仅发布源码，不提供含第三方运行库的安装包。

面向计算机专业学生的本地日常计划应用。前端 Vue 3 + JavaScript，后端 Java 21 + Spring Boot + MyBatis，数据库 MySQL，桌面容器 Electron。无需注册登录。

本轮扩展保持产品 **V1.0（第一版）**，公开源码程序编号为 **0.1.1**。当前本地天气安装包输出到 `release/0.1.1/`，保留旧安装包；安装包与运行库不包含在源码仓库中。

## 已实现的功能

- 首页黄历小窗口（0.1.1 新增）：公历、完整农历与传统宜忌，支持前后翻日、日期选择和回到今天；1901—2099 年离线计算，支持展开收起、跨午夜校准、深色与英文界面。宜忌仅作民俗参考。详情见 [0.1.1 更新说明](docs/RELEASE_NOTES_0.1.1.md)与[数据来源](docs/DATA_SOURCES.md)。

- Mac 桌面式天气页面：首页默认城市摘要、多城市管理、24 小时及 7 天预报、逐日及气象指标详情、单位设置和任务天气参考。预报来自 Open-Meteo，城市检索来自 Open-Meteo / GeoNames；IP 定位须主动启用。穿衣和舒适度是应用建议。

- 14 种带 emoji 的大学生活分类：学习、生活、运动、算法、课程、作业、考试、阅读、项目、社团、社交、饮食、休息、实习求职。支持新增、编辑、删除、完成、改期和筛选。
- 今日清单、独立截止日期与临近到期区、单层子任务、回收站；紧凑月历／周历、emoji 任务条、自选任务图标、分类／状态／优先级筛选、当天详情侧栏或抽屉、快速新增、拖动改期与撤销、每日和每周文字复盘。
- 专注计时、暂停继续、休眠中断保护、真实区间统计与每周学习报告。
- 单项／组合任务模板、预览与整批创建、自定义分类（名称、emoji、颜色和停用）。
- 结构化解题笔记、安全代码高亮与复制、收藏／待攻克、知识点组合筛选。
- 任务、复盘和题目笔记草稿保护；退出时保留或放弃草稿、活动专注结束确认；断线时保留输入。
- 首页「保存数据」一键生成本地备份，日常任务操作仍即时保存；日历同时展示分类 emoji、分类名称及任务名。
- 导航悬停上浮、阴影和图标缩放，支持键盘焦点和减少动画偏好。
- 题目资料、每日刷题计划、解题记录及笔记；任务完成率、去重通过题数、难度与知识点统计。
- 中文／英文，浅色／深色／跟随系统，四种主题色。
- 每天／每周重复规则、独立功能开关、桌面托盘与提醒。
- ZIP 备份、每日自动备份、备份目录选择、恢复预览、恢复前保护备份和事务回滚。
- Windows 桌面运行与 NSIS 安装配置：专用 Java 和 MySQL 随应用启动，无需操作系统数据库服务。

不包含算法复习计划、多人账号、云同步、在线评测。力扣自动同步尚无经验证的接入方案，因此没有提供同步入口。

## 先运行，再逐步读代码

### 使用桌面版本

本地构建的安装包为 `release/0.1.1/CodePlan-0.1.1-Windows-x64.exe`；安装后使用桌面的 **CodePlan** 快捷方式启动。免安装测试入口为 `release/0.1.1/win-unpacked/CodePlan.exe`。这里是本地路径，不是公开下载链接。运行前请从托盘退出旧版本，避免单实例机制把你带回旧窗口。

新版启动时会为旧数据库创建保护备份并执行增量迁移。新备份格式 v2，仍可恢复旧 v1 文件；升级后的个人数据不要交给 `release/1.1.1/` 中的旧安装包写入。个人数据目录保持 `%APPDATA%/CodePlan`，不会随安装位置改变。

首次启动会初始化自己的数据库，需要等待几秒。在 **设置 → 窗口行为 → 关闭窗口时** 选择「最小化到托盘」或「直接退出」，选择后自动保存并在重启后保留，默认最小化。点击右上角关闭或 Alt+F4 直接执行选择，不再询问关闭方式。最小化后提醒和专注继续运行，启动期间尚无托盘时最小化到任务栏。直接退出会关闭后端和数据库；有未提交编辑或活动专注时仍先进入退出保护。托盘“退出 / Exit”始终退出。默认不开启提醒、重复任务或自动备份。

### 开发模式

需要 Node.js 22.12+（本工程验证使用 24）、JDK 21、Maven 3.9.11、MySQL 8 的 Windows 程序文件。**不需要知道或使用你系统 MySQL 的 root 密码。**

首次安装前端和桌面开发依赖：

```powershell
npm --prefix frontend ci
npm --prefix desktop ci
```

指定自己的 JDK/MySQL 程序目录（以下为示例）：

```powershell
$env:JAVA_HOME = 'C:\Tools\jdk-21'
$env:MYSQL_HOME = 'C:\Program Files\MySQL\MySQL Server 8.0'
```

若本工程已经有 `.tools/jdk/` 和 `.tools/apache-maven-3.9.11/`，构建脚本会自动使用它们。若没有 Maven，将已安装 Maven 的 `bin` 加入 PATH。

```powershell
# 构建后端并运行测试
.\scripts\build-backend.ps1

# 在项目 runtime/ 中准备专用运行环境；不会复制系统数据库内容
.\scripts\prepare-runtime.ps1

# 终端一：启动专用 MySQL 和 Java 后端，保持终端运行
node scripts/dev.mjs

# 出现 Backend ready 后，在终端二启动前端
npm run dev
```

访问 `http://127.0.0.1:5173/`。后端端口自动选择；Vite 从 `.local/connection.json` 读取连接信息。如果重启了后端，请同时重启 Vite。

前端开发不需要手动复制令牌，也不要把 `.local/connection.json` 提交到 Git。

### 运行桌面开发版与打包

```powershell
npm run build
npm run desktop

# 重新构建、测试并生成 Windows 安装包
.\scripts\package.ps1
```

桌面版数据与开发版数据分离。桌面默认使用 `%APPDATA%\CodePlan`，开发模式使用 `.local/development`；通过应用备份恢复迁移业务数据，不要直接复制运行中的 MySQL 数据目录。

## 工程结构

```text
frontend/src/
  api.js                 统一 fetch 请求
  store.js               Pinia 数据与设置
  components/            任务编辑和任务列表
  views/                 今日/任务/日历、算法、统计、设置
backend/src/main/java/dev/codeplan/
  controller/            HTTP 接口与错误响应
  service/               业务逻辑、备份恢复、自动维护
  mapper/                MyBatis 数据库访问接口
  model/                 数据对象与输入校验
  config/                本地令牌、Windows HTTP 配置
backend/src/main/resources/
  schema.sql             初始表结构（不删除已有数据）
  mapper/                SQL 语句
desktop/                 窗口、托盘、通知和专属进程管理
scripts/                 开发、构建、打包及验收脚本
docs/                    PRD、接口、学习路线、验收结果
```

## 测试命令

```powershell
npm test
.\scripts\build-backend.ps1
node scripts/mysql-smoke.mjs

# 需要先启动开发后端和 Vite，仅操作本地开发数据库
.\desktop\node_modules\.bin\electron.cmd scripts/ui-smoke.cjs

# 独立测试数据目录，无需启动开发后端
.\desktop\node_modules\.bin\electron.cmd scripts/desktop-smoke.cjs

# 在独立测试数据中验证取消、最小化及完全退出分支
.\desktop\node_modules\.bin\electron.cmd scripts/close-smoke.cjs

# 安装包构建完成后，测试真实打包程序和随附运行环境
node scripts/packaged-smoke.mjs
```

后端自动化测试使用 H2 的 MySQL 兼容模式快速检查规则；`mysql-smoke.mjs` 另外初始化真实 MySQL 测试库，验证 HTTP 接口、备份恢复以及关闭并重启后的数据持久化。测试数据库和截图保留在 `.local/`，不提交。

## 常见问题

- **无法连接本地服务**：先查看终端一是否出现 `Backend ready`，再启动或重启 Vite。不要重新初始化数据库来解决普通连接问题。
- **后端启动失败**：查看对应数据目录下 `logs/java.exe.log` 和 `logs/mysqld.exe.log`；先处理日志错误，不删除数据目录。
- **Windows Java 回环连接报错**：工程已使用 Tomcat NIO2，避免某些 Windows 环境的 AF_UNIX Selector 管道问题。
- **重复任务没有生成**：在设置中启用重复任务，并确认规则日期、星期和启用状态。关闭后保留已生成实例。
- **没有桌面提醒**：使用桌面版，在应用和 Windows 中开启通知，并保持应用运行或驻留托盘；网页开发模式不发系统通知。
- **备份目录为空**：默认保存在应用数据目录的 `backups/` 下；自动备份仅在应用运行时执行。
- **Electron 下载缓慢或缓存无权限**：可把 `$env:electron_config_cache` 设为项目 `.cache/electron` 的绝对路径；需要镜像时自行设置 `ELECTRON_MIRROR`。不要关闭证书或校验验证。
- **用户数据**：`.local/`、`runtime/`、备份和凭证全部在 `.gitignore` 中，不要提交或随意删除。

从 [学习路线](docs/LEARNING.md) 开始阅读；完整需求见 [PRD](docs/PRD.md)，接口见 [API](docs/API.md)，实际验证范围见 [验收记录](docs/VERIFICATION.md)。

## 数据署名与发布文件

天气数据：[Open-Meteo](https://open-meteo.com/)，[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)；城市检索：[Open-Meteo](https://open-meteo.com/en/docs/geocoding-api) / [GeoNames](https://www.geonames.org/)。显示时进行了单位换算、取整、时间转换和图表／emoji 映射。提供方不为本应用背书。免费 API 的非商业条件独立于数据许可；详见[数据来源](docs/DATA_SOURCES.md)。

- [正式许可](LICENSE)、[免责声明](DISCLAIMER.md)、[隐私说明](PRIVACY.md)
- [第三方软件与分发边界](docs/THIRD_PARTY.md)、[npm 依赖清单](docs/DEPENDENCY_INVENTORY.md)
- [贡献指南](CONTRIBUTING.md)、[安全政策](SECURITY.md)、[发布前核对清单](docs/RELEASE_CHECKLIST.md)

项目未获 Apple、微软或任何天气数据供应商赞助或背书。引用产品名称仅为说明界面结构参考和技术依赖；不提供第三方品牌素材授权。
