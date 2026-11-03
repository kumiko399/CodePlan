# 数据来源、加工与署名

核对日期：2026-11-03。服务条款可能变化，发布和改变用途前应重新核对。数据许可、API 访问合同和本项目源码许可是三个独立层面。

| 功能 | 实际来源 | 授权与使用边界 |
| --- | --- | --- |
| 当前时段、24 小时和 7 天预报及气象指标 | [Open-Meteo Forecast API](https://open-meteo.com/en/docs)，best_match | API 数据为 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)；当前免费服务仅限其条款允许的非商业用途 |
| 城市检索、名称、坐标和时区 | [Open-Meteo Geocoding API](https://open-meteo.com/en/docs/geocoding-api)，底层 [GeoNames](https://www.geonames.org/) | 保留 Open-Meteo 和 GeoNames 署名；[GeoNames 数据条款](https://www.geonames.org/export/)要求署名 |
| 可选城市级 IP 定位 | [ipwho.is](https://ipwhois.io/documentation) | 服务访问受其[使用条款](https://ipwhois.io/terms)约束；不将其数据库或响应整体重新许可为项目代码许可 |
| 穿衣、舒适度、降水摘要 | 本项目依据温度、体感、湿度及降水概率生成的文字 | 应用参考建议，不是气象机构发布的生活指数 |
| 任务、算法题资料和学习笔记 | 用户自行输入 | 用户保留其权利，不是可随仓库发布的数据集；不内置或抓取力扣题库 |

## 建议保留的署名文字

天气预报数据：Open-Meteo（https://open-meteo.com/），CC BY 4.0（https://creativecommons.org/licenses/by/4.0/）。城市检索：Open-Meteo / GeoNames（https://www.geonames.org/）。本应用对数据进行了时间／日期转换、单位换算、取整、筛选、图表及天气代码文字／emoji 映射；穿衣和舒适度建议由应用生成。数据提供方不为本应用背书。

署名应出现在天气页面／设置、仓库说明以及分发随附文档中，不能只放在用户难以找到的构建文件中。界面已有 Open-Meteo 及 CC BY 链接，GeoNames 目前在详细来源说明中；公开发布前核对链接可见性。

## 服务限制

- [Open-Meteo 条款](https://open-meteo.com/en/terms)与[数据许可](https://open-meteo.com/en/licence)分别适用。数据允许的再利用不意味着免费端点允许商业调用，也不意味着无调用限额；本机缓存与限流不能代替上游配额核验。
- best_match 使用的模型由供应商选择。上游包含多个国家和机构的模型，不能宣称每个城市都由某一特定气象机构直供；不复制供应商全部来源列表冒充实际逐次模型清单。
- ipwho.is 的免费端点文档与服务条款应共同阅读；文档提及商业调用不等于可转售或再分发其数据库。只在用户启用定位后调用；不公开缓存或批量采集数据。
- UI 的 emoji 为 Unicode 文本，字形由运行系统字体绘制；仓库没有因此获得字体文件或其他平台图标素材的再分发权。

## 网络与隐私

预报请求发送城市坐标，检索发送搜索词及语言。所有网络服务都能接收到请求的公网 IP 等网络元数据；定位服务据此推断城市。应用不向这些服务发送任务／笔记，不在天气偏好中保存原始 IP。供应商自行处理请求日志，具体见其隐私政策；本项目不能承诺第三方不记录请求。
