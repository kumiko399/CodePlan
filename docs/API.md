# 本地接口说明

Base URL 为启动器选取的 `http://127.0.0.1:<port>/api`。除 `/health` 外必须带 `X-App-Token`。令牌由启动器随机生成：网页开发时由 Vite 代理注入；桌面时由受限 preload 提供连接信息。

输入输出为 JSON，日期 `YYYY-MM-DD`，本地日期时间 `YYYY-MM-DDTHH:mm:ss`，时间 `HH:mm`。空的可选关联、时间字段传 `null`，不要传空字符串。服务只监听本机，不用于公网部署。

## 路由

| 方法与路径                         | 内容                                                         |
| ---------------------------------- | ------------------------------------------------------------ |
| GET /health                        | `{status, version}`                                          |
| GET /tasks                         | 任务列表；前端组合筛选和排序                                 |
| POST /tasks                        | 新建 TaskInput，返回 Task                                    |
| PUT /tasks/{id}                    | 更新 TaskInput，返回 Task                                    |
| DELETE /tasks/{id}                 | 任务进入回收站，子任务和学习历史保留                         |
| GET /problems                      | 题目资料                                                     |
| POST /problems、PUT /problems/{id} | 新建或编辑题目，检测题号／链接重复                           |
| DELETE /problems/{id}              | 仅删除没有关联数据的题目                                     |
| GET /attempts                      | 解题记录，实际时间倒序                                       |
| POST /attempts、PUT /attempts/{id} | 新建或编辑解题记录                                           |
| DELETE /attempts/{id}              | 删除解题记录                                                 |
| GET /reflections                   | 每日复盘列表                                                 |
| PUT /reflections/{day}             | `{content}`；空白内容删除                                    |
| GET /rules                         | 重复规则                                                     |
| POST /rules、PUT /rules/{id}       | 新建或修改重复规则；`active:false` 停止后续未完成安排        |
| GET、PUT /settings                 | 获取／保存设置                                               |
| GET /statistics?from=...&to=...    | 日期范围统计；最大五年                                       |
| GET /maintenance                   | 自动维护错误提示及实际备份目录                               |
| POST /reminders/claim              | 开启提醒时原子领取待提醒任务并标记已领取；仅由桌面主进程调用 |
| GET /backups                       | 文件名与大小                                                 |
| POST /backups                      | 创建手动备份，返回 `{name}`                                  |
| GET /backups/{name}                | 下载 ZIP；拒绝任意路径和非应用备份文件名                     |
| POST /restore/preview              | multipart 字段 `file`；返回预览令牌、时间和数据数量          |
| POST /restore                      | `{token}`，消费预览并整体恢复；返回保护备份名                |

## TaskInput 示例

```json
{
  "title": "学习 Java 集合",
  "category": "study",
  "planDate": "2026-10-22",
  "taskTime": "19:00",
  "priority": "medium",
  "notes": "先阅读，再写一个小例子",
  "status": "todo",
  "problemId": null,
  "reminderTime": null
}
```

分类：14 个固定 ID（见 `Categories.java`）及 `c_` 加 16 位十六进制字符的自定义 ID；自定义分类需存在且启用，新任务不能使用停用分类。状态：`todo|doing|done`。优先级：`high|medium|low`。题目难度：`easy|medium|hard|unset`。解题结果：`passed|failed`。

`Task` 额外返回 UUID `id`、`completedAt`、`ruleId`、`occurrenceDate` 和 `notified`。任务状态是业务状态；逾期由日期与状态计算，不额外存储。

其他输入对象的完整字段和校验规则在 `backend/src/main/java/dev/codeplan/model/Models.java`；数据库列和外键在 `schema.sql`。不要另写一份与代码脱节的字段定义。

## 错误与恢复

- 400：输入错误或业务规则拒绝，返回 `{code}`；字段校验还返回 `fields`。
- 401：本地应用令牌无效。
- 404：目标记录不存在。
- 409：数据库约束冲突。
- 500：操作失败；响应不包含数据库密码、SQL 堆栈或内部路径。

前端根据 `code` 显示对应语言提示。恢复预览令牌十分钟有效，一次使用，最多保留三个；过期或已经使用应重新预览。恢复时业务修改被串行保护，数据库事务在释放锁前完成提交。

## 桌面接口

`window.codeplan` 提供 `connection()`、`chooseDirectory()`、`openBackupDirectory()`、`openExternal(httpUrl)`、`testNotification()`，以及只访问固定 `userData/drafts.json` 的 `readDrafts()`、`writeDrafts(value)`。草稿最大 2 MB，原子替换；不存在通用文件路径、任意 SQL 或命令执行入口。

## 第一版扩展接口

| 方法与路径                             | 内容                                                                                                        |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| GET /workspace                         | 本机数据库 ID、恢复代次及扩展记录 `extras[{kind,recordId,payload}]`；payload 是经后端类型校验的 JSON 字符串 |
| GET /trash                             | 已删除任务；删除时间与子任务从 workspace 的 task 扩展合并                                                   |
| POST /trash/{id}/restore               | 恢复原任务；同题同日冲突时拒绝，过期提醒不重新领取                                                          |
| DELETE /trash/{id}                     | 彻底删除；保留解题／专注历史及重复实例删除标记                                                              |
| GET /focus                             | 专注记录及默认分钟数；未结束记录至多一条                                                                    |
| POST /focus                            | `{taskId}`，开始专注                                                                                        |
| POST /focus/{id}/{action}              | action 为 pause、resume、finish、cancel；结束操作可安全重试                                                 |
| PUT /focus/settings                    | `{minutes:25,rest:5}`；范围分别 1–180、1–60，仅影响新计时                                                   |
| POST /focus/notifications              | 原子领取阶段提醒，遵守设置开关；由桌面主进程调用                                                            |
| GET /weekly?day=...                    | 返回该日期所在周一至周日的任务、专注区间、解题、改期及复盘                                                  |
| PUT /weekly/{monday}                   | `{content}`，保存自然周复盘                                                                                 |
| POST /categories、PUT /categories/{id} | `{name,emoji,color,active}`；预设 ID 不修改，自定义 ID 稳定                                                 |
| POST /templates、PUT /templates/{id}   | `{name,items}`；条目含 title、category、priority、notes、problemId、offset、subtasks                        |
| DELETE /templates/{id}                 | 删除模板，不改变已生成任务                                                                                  |
| GET /templates/{id}/preview?day=...    | 校验分类、关联与同题同日冲突，返回将创建的 TaskInput 列表                                                   |
| POST /templates/{id}/create            | `{day,requestId}`；requestId 为 UUID，同一请求只创建一次，整批事务提交                                      |

TaskInput 增加可选 `details: {deadlineDate,deadlineTime,subtasks:[{id,title,done}],deletedAt:null}` 和 `confirmIncomplete`。省略 details 表示保留已有扩展值；清除截止日期需明确传 null。完成存在未完成子任务的父任务需 `confirmIncomplete:true`。删除标记只能通过回收站接口修改。RuleInput 可传 subtasks 结构，生成实例时清空完成状态并使用独立子任务 ID，不复制固定截止日。

TaskDetails 还支持可选 `emoji`：null 或空字符串表示跟随分类；非空必须属于前端 `lib/calendar.js` 的 taskEmojis 与后端校验约定的预设集合。该字段包含在 v2 业务快照中，缺少字段的旧记录按 null 读取，软删除与恢复保留图标。重复规则和模板不继承单个任务图标。

ProblemInput 增加可选 `details: {idea,timeComplexity,spaceComplexity,pitfalls,code,language,favorite,challenge}`；字符串默认空，language 为 text/java/javascript/python/cpp。代码按原文保存，界面只渲染文本 token，不执行 HTML 或代码。收藏、待攻克不影响通过数。

新 ZIP 的 manifest 与 snapshot version 均为 2，包含已知类型的扩展记录。v1 仍可读取，未知版本和无效引用在恢复前拒绝。数据库 ID、恢复代次、草稿和本机路径不进入业务快照。恢复会更新本机代次，并把未结束专注转为待用户处理的中断状态。

桌面 preload 新增 `desktopPreferences()` 返回 `{closeAction:"minimize"|"exit"}`，`setCloseAction(action)` 校验枚举并原子保存，成功返回新值。两项 IPC 仅允许主窗口同源调用，使用固定本机偏好文件，不依赖后端或参与业务备份。

## 天气接口

以下接口同样要求 X-App-Token；不接收任意上游 URL。

| 接口 | 说明 |
| --- | --- |
| GET /weather/preferences | 本机偏好，初始 `{mode:"unset",city:null}` |
| PUT /weather/preferences | mode 为 unset/manual/auto；manual 的 city 包含 name、latitude、longitude，坐标保留两位小数 |
| GET /weather/cities?q=北京&language=zh | Open-Meteo / GeoNames 城市检索，至少两个字符，语言 zh/en |
| GET /weather/forecast?latitude=39.9&longitude=116.4 | `{data,fetchedAt,stale}`；data 为 Open-Meteo JSON，时间是 UTC 秒数，显示使用 timezone |
| GET /weather/location | 仅 mode=auto（界面已明确授权）时调用 ipwho.is，返回城市名称和近似坐标 |
| GET /weather/display | 本机显示偏好，默认 `{temperature:"C",wind:"ms",clarity:false,collapsed:false}` |
| PUT /weather/display | 保存完整显示偏好；temperature 为 C/F，wind 为 ms/kmh；clarity、collapsed 为布尔值 |

上游仅固定 HTTPS 域名，不转发应用令牌；超时、失败冷却、缓存和进程内每分钟 30 次请求限制。偏好文件 weather-preferences.json 使用原子替换，损坏时保留原文件并提示重选。错误码 WEATHER_UNAVAILABLE、WEATHER_RATE_LIMITED、WEATHER_LOCATION_FAILED、WEATHER_LOCATION_CONSENT_REQUIRED、WEATHER_PREFERENCES_INVALID/FAILED；前端使用 isolated 请求，不改写任务保存／离线状态。

显示偏好单独保存到 weather-display.json，原子替换，不进入业务备份；损坏时拒绝读取并保留原文件。上游逐小时字段增加 apparent_temperature、relative_humidity_2m、wind_speed_10m、pressure_msl；前端按城市时区筛选日期。上游仍统一使用摄氏度和 m/s，单位转换仅用于显示。字段含义依据 [Open-Meteo 文档](https://open-meteo.com/en/docs)。

### 多城市扩展

天气 preferences 新增 cities 数组（最多 8 项），坐标去重，兼容旧 mode/city 文件；manual 的 city 为默认城市。auto 保留 cities，unset 清空。前端添加城市时保留已授权定位；关闭定位可保留手动城市。
预报增加 current 风向、阵风、海平面气压、云量；hourly 紫外线、能见度、露点；daily 紫外线峰值、日出日落、降水累计。缺失字段保持未知值。城市逐个加载，失败单独提示。
