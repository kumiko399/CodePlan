# 按功能学习这份工程

## 第一步：只看一个新增任务请求

1. 打开 `frontend/src/components/TaskEditor.vue`，找到 `save()`：表单数据组成 JSON。
2. 打开 `frontend/src/api.js`：`api.post('/tasks', input)` 通过 fetch 发送请求，统一处理错误。
3. 打开 `backend/.../controller/ApiController.java`：`@PostMapping("/tasks")` 接收请求，`@Valid` 检查输入。
4. 打开 `backend/.../service/PlannerService.java`：`saveTask()` 判断是否为重复计划、处理完成时间。
5. 打开 `backend/.../mapper/PlannerMapper.java` 与 `resources/mapper/PlannerMapper.xml`：查看实际 INSERT SQL。
6. 返回页面，`store.load()` 查询新的任务列表，Vue 根据响应式数据重新显示。

先理解这条链路，再学习日历、图表或 Electron。

## 第二步：做三个小练习

- 给任务备注增加剩余字数提示，观察前端校验与后端校验的分工。
- 调整任务列表排序，先写一个能说明预期顺序的小测试，再修改 `orderTasks()`。
- 给统计页面增加“本月”日期快捷选项，复用现有统计接口，不新增一套数据库逻辑。

每完成一个可以运行的修改，就查看 `git diff`，运行相应检查，再提交。不要把 `.local`、数据库或凭证加入提交。

## 第三步：理解三个容易混淆的概念

- **题目**：两数之和的名称、题号、链接。
- **计划**：准备在星期一做两数之和。
- **解题记录**：星期一实际尝试了一次，结果通过，用时 20 分钟。

同一道题可以有多天的计划和多条解题记录。“任务已完成”不必然代表“题目通过”，因此它们分开存储。

## 第四步：事务与备份

阅读 `PlannerIntegrationTest.restoreRollsBackAllDeletesWhenADatabaseWriteFails()`：它故意让数据库写入失败，验证旧任务仍存在。

这比只测试“恢复成功后有数据”更重要。多个表一起修改时，事务让它们要么一起成功，要么一起撤销。

## 第五步：桌面容器

最后阅读 `desktop/runtime.cjs` 和 `desktop/main.cjs`。前者管理专用数据库、Java 进程和退出等待；后者管理窗口、托盘、通知与目录对话框。

页面不直接运行任意命令；只能调用 preload 明确提供的几个能力。开发数据库与桌面用户数据库分开，避免调试时覆盖日常计划。

## 当前实现有意保持的边界

- 后端是单体应用，没有 Redis、微服务或复杂登录系统。
- 业务写操作在单进程内串行，并在数据库事务中完成，适合当前单用户桌面产品。
- 备份是带版本、校验和的完整业务快照；第一版不合并不同备份。
- 当前 schema.sql 只负责新建缺失的表。将来增加数据库字段时，应新增有版本的迁移脚本，并先在备份副本上测试，不能直接删除重建用户表。
