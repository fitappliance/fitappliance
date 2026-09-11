# Fit V4 证据边界执行计划

## 审计结论

- 当前仓库没有传统关系型数据库；产品和证据已经以 JSON、CSV、哈希、回放清单和生成投影结构化保存。
- 当前公开产品投影仍保留兼容性的 `w/h/d` 字段；Fit V2/V3 领域代码和 receipt-bound 证据管线已经存在，但公开运行时并非每个产品都有 `geometry_v2`。
- 当前安全基线要求：未知值保持 `null`/`UNKNOWN`，证据不足不能变成 `VERIFIED_FIT`；基线审计显示 `3521` 个产品、`0` 个 receipt-bound `VERIFIED_FIT`、`0` 个发布违规。
- 因此第一阶段不接入 UI、不重建数据库、不批量重写目录；先固化 Fit V4 的“尺寸筛选”和“证据结论”两条独立通道。

## 已确认的产品决策

1. 证据和 Fit V4 安全边界优先，UI 分阶段接入。
2. 在当前 Git 分支继续修改，并保留已有未提交改动。
3. 证据不足显示 `INSUFFICIENT_DATA`；保留尺寸筛选；不得宣称 `VERIFIED_FIT`。

## P0 本次执行范围

- 新增纯域层 Fit V4 安全适配器，不读取数据库、不写公开数据、不改变 UI。
- 返回独立的 `sizeMatch`，让尺寸筛选继续工作。
- 只有 receipt-bound geometry 明确标记 `verifiedFitEligible: true` 时，才允许 `VERIFIED_FIT`。
- 将估算适配、条件适配和缺字段结论统一收敛为 `INSUFFICIENT_DATA`；硬冲突仍为 `NO_FIT`。
- 添加不变性、旧标签降级、尺寸通过但证据不足、尺寸失败和正向 verified gate 测试。

## 后续阶段（本次不执行）

- P1：把适配器接入搜索/筛选结果，仍不改变比较和替换模式的语义。
- P2：接入 Fit Workspace、比较托盘、URL 状态和本地历史。
- P3：在发布前增加结构化投影与 UI 合约回归门；无证据产品继续显示 `INSUFFICIENT_DATA`。

## 验收

- `node --test tests/architecture-v2/fit-v4.test.mjs`
- `npm run lint`
- `npm run test:architecture-v2`
- `npm run audit:fit-publication`

不得在本阶段声称已完成 UI 接入、数据库迁移、全目录证据补齐或产生了新的 `VERIFIED_FIT` 产品。
