# 实时消息路径缓存实施方案

日期：2026-10-28
状态：已按本文实现；短时验证见 [`benchmark-results/message-path-cache-2026-10-28/README.md`](benchmark-results/message-path-cache-2026-10-28/README.md)。五分钟 MST 和 PostgreSQL 精确语句计数尚待复测。

## 1. 目标与当前路径

客户端发送 `message.send` 后，服务端依次验证 session、房间状态和禁言状态，再过滤内容、限流、持久化消息并发出 `message.created`。现有实现每次普通发送执行 4 条 PostgreSQL `SELECT`（`auth_sessions`、`users`、`rooms`、`room_mutes`）及成功发送时的 1 条 `INSERT`。基准和口径见 [`benchmark-results/local-mst-postgres-2026-10-27/README.md`](benchmark-results/local-mst-postgres-2026-10-27/README.md)。

本方案将 session 与 user 查询的共同结果缓存到 socket，房间可发送状态缓存在 API 进程，禁言状态缓存在 Redis。三处均命中时，一条消息在校验阶段不执行 PostgreSQL `SELECT`；消息持久化仍执行原有 `INSERT`。HTTP 的 `SessionGuard`、房间列表、消息幂等与限流顺序维持现状。

这里的“零查询”指单条消息恰好命中三个缓存。定期重校验和缓存到期会继续产生数据库读取，不能把五分钟压测的平均读取数写成零。

## 2. 缓存职责与一致性约定

| 数据 | 存放位置与键 | 缓存内容 | 初始 TTL | 写入或撤销后的处理 |
| --- | --- | --- | --- | --- |
| Session principal | `socket.data.auth`，每条连接独立 | `userId`、`role`、`sessionId`、真实 `expiresAt`、`validUntil` | 最多 15 秒，且不超过 session 到期时间 | 登出/撤销时通过内部控制频道通知各实例断开对应 socket；15 秒回源兜底 |
| Room status | API 进程内 `Map<roomId, entry>` | `LIVE` 或终态 `ENDED` | `LIVE` 10 秒；`ENDED` 最多 10 分钟 | 收到现有 `room.ended` 事件即写入终态；失联或漏通知时由 TTL 回源 |
| Mute status | Redis `${REDIS_KEY_PREFIX}:chat:mute:v1:${roomId}:${userId}` | `none`，或 `{effectiveAt, expiresAt}` | 15 秒；有记录时不得越过 `expiresAt` | 数据库 mute 事务提交后，原子递增该键版本并删除缓存值；下一次读取回源 |

PostgreSQL 是事实来源。当前服务只允许 `DRAFT → LIVE → ENDED`，因此 `ENDED` 在内存里可作为终态；`DRAFT` 和不存在的房间不进入可发送缓存，加入房间时始终进行新鲜的数据库检查。禁言键按 `(roomId, userId)` 分开，避免每个 API 实例加载并持有整间房的 mute 表。

本方案的业务语义是：Redis 正常、写接口返回成功后才开始的禁言校验会看到新数据库状态；已经开始的发送仍存在校验与持久化之间的竞态。session 撤销和房间结束使用 Pub/Sub 通知，通知到达前也有很短的传播窗口。若要求“数据库提交之后绝不再持久化一条消息”，需要在持久化事务中重新校验相关状态；缓存本身无法提供这个保证。

## 3. Session：保存在 socket.data

1. WebSocket 握手继续调用一次 Better Auth `getSession()`，从同一次返回值取得 `principal = {userId, role, sessionId}` 和 `session.expiresAt`。不单独查询或缓存 user。`validUntil = min(当前时间 + 15 秒, expiresAt)`。
2. 每个入站事件先读取 socket 上的缓存。未过 `validUntil` 时不调用 `getSession()`；到期后进行一次重校验。同一 socket 上同时到达的事件共用一个待完成的 Promise，避免重复查询。
3. 重校验发现 session 不存在、已过期或角色无效时，清除旧 principal，断开连接，并**立即终止本次事件**。重校验发生数据库错误时也终止该事件；初版沿用当前认证失败即拒绝的策略，不在故障期间继续用旧身份发送。
4. 没有 session cookie 的 socket 保持访客身份。握手 headers 不会随网页后来登录而改变；登录后由客户端重新连接。每个 socket 在断开时释放其认证状态与索引。
5. Socket.IO 服务维护 `sessionId → sockets`、`userId → sockets` 的本地索引。Better Auth 的登出和撤销路径在数据库成功提交后发布 `session.revoked` 或 `user.sessions.revoked` 控制事件，各实例收到后断开匹配连接。控制事件使用 API 内部频道，不进入发给浏览器的 `room-events` 频道。需要依据项目固定的 Better Auth 1.7.11 实际端点或 hook 核对覆盖范围，不能仅匹配一个 `/sign-out` 路由。
6. Redis 控制频道断线重连后，将所有 socket 的 `validUntil` 设为 0，使下一次事件回源。漏掉撤销通知时，活跃 socket 最晚在 15 秒重校验时发现；用户角色变化也按这个周期生效。真实 `expiresAt` 始终优先于缓存 TTL。

`getSession()` 每次回源仍会执行 session 与 user 两条读取。15 秒缓存降低查询频率，同时保留 Better Auth 自己的过期和续期逻辑；不要用手写 session SQL 代替它。

## 4. Room：API 进程内状态缓存

`room.join` 对数据库执行新鲜的 `isLive` 检查。只有查到 `LIVE` 才允许加入，并可填充本实例的 `LIVE` 缓存。`message.send` 使用本实例缓存；未命中或 `LIVE` 到期时回源。回源失败时拒绝发送，不能继续信任过期的 `LIVE` 值。

房间从 `LIVE` 变为 `ENDED` 后，现有 `room.ended` 事件到达每个实例时，先设置 `ENDED` 终态，再清理消息幂等缓存和通知客户端。在途的 `LIVE` 查询完成时必须再次检查终态，不能把旧值写回，也不能把该旧结果用于放行。最后一个本地成员离开时可删除 `LIVE` 缓存；`ENDED` 条目按 TTL 或有界 LRU 清理。清理定时器必须在没有本地连接时也运行。

Redis 订阅连接重连后清空本地 room 缓存。若结束事件未能送达某实例，该实例可能继续使用 `LIVE` 最多 10 秒；过期后数据库返回 `ENDED`。这也是采用进程内缓存所接受的故障窗口。房间创建为 `DRAFT` 后再开播，加入房间的数据库检查能立即发现新的 `LIVE` 状态。

## 5. Mute：Redis 共享状态缓存

每次 `message.send` 在 room 校验后执行一次 Redis `GET muteKey`。命中 `none` 表示本次未禁言；命中时间区间时，用当前时间计算 `effectiveAt <= now < expiresAt`，以正确处理未来生效和自然到期。值不合法时回源数据库，不能解释成未禁言。Redis 读取失败时直接使用现有 PostgreSQL mute 查询；数据库也失败则拒绝发送。

Redis 未命中时，读取对应版本键、查询 PostgreSQL 的 `(roomId, userId)` 记录，然后通过一段原子 Redis 操作执行以下条件：版本没有变化且缓存值仍不存在，才写入 15 秒缓存；否则重新读取 Redis。版本键例如 `${REDIS_KEY_PREFIX}:chat:mute-version:v1:${roomId}:${userId}`，过期时间设为 60 秒，并确保数据库查询超时明显短于它。一个实例内对同一键的并发未命中合并为一次数据库查询，跨实例由 Redis 条件写入防止陈旧结果回填。

房主禁言仍先执行现有的数据库 upsert 与审计事务。提交成功后，在响应前通过原子 Redis 操作递增版本并删除对应 mute 缓存值。随后任何新开始的读取都会在未命中时查询最新数据库记录；旧的、在事务前启动的查询因版本变化无法写回缓存。并发重复禁言的最终 Redis 状态仍由数据库最新记录重新加载决定，无需按 API 实例的墙钟时间排序。未来若增加解除禁言、修改时长或其他 mute 写入入口，必须复用同一失效操作。

如果数据库已提交，而 Redis 失效操作失败，接口仍按数据库已成功写入返回，但记录高优先级错误并短间隔重试删除该键。已有的 Redis 旧值最多再保留 15 秒。这是明确接受的故障降级；它不能满足 Redis 部分故障时的严格即时禁言要求。Redis 故障期间的发送直接查 PostgreSQL；Redis 恢复后仍可能短暂读到旧键，TTL 是最终兜底。

## 6. 并发、故障和容量边界

| 情况 | 处理与剩余限制 |
| --- | --- |
| Session 已撤销，控制通知丢失 | 下一次最多 15 秒的 `getSession()` 重校验发现；重校验失败的当前事件必须中止 |
| PostgreSQL 在 session 或 room 回源时故障 | 拒绝当前发送，不使用过期的身份或 `LIVE` 值 |
| Redis 在 mute 读取时故障 | 查询 PostgreSQL；数据库也故障则拒绝发送 |
| 房间结束事件漏送 | 本地 `LIVE` 最多 10 秒后过期并回源；已收到 `ENDED` 的实例立即拒绝 |
| Mute 写入与缓存未命中交错 | Redis 版本检查阻止旧数据库结果写回；已经完成校验的在途消息仍可能继续持久化 |
| Mute 的 Redis 失效失败 | 已提交的 mute 最多受旧值影响 15 秒，需记录指标并告警 |
| Redis 控制频道断线重连 | 强制 socket 认证回源、清空本地 room 状态；mute 不靠 Pub/Sub，继续按 Redis 值和 TTL 工作 |
| 进程运行很久 | session 内存随 socket 断开释放；room 缓存设 10,000 条上限、TTL 与独立清理；Redis mute 键均带 TTL |
| 客户端重复发送同一 `clientMessageId` | 保留现有幂等确认语义，不因缓存命中再次插入消息；房间结束仍清理已接受消息的本地快捷缓存 |

`message.send` 目前没有按用户串行执行。同一用户可以有多条在途消息，因此不要假设状态变更时最多只有一条消息受竞态影响。Redis Pub/Sub 也不提供“所有订阅者已处理”的确认，session 撤销和房间结束的响应不能宣称跨实例严格零延迟。

## 7. 实施顺序与涉及文件

每一步独立提交，随实现新增相应单元及集成测试；提交前按仓库要求运行校验。以下为实施顺序与验收记录。

1. **观测与接口准备**：扩展 [`apps/api/src/realtime/realtime-metrics.service.ts`](apps/api/src/realtime/realtime-metrics.service.ts) 的各层命中、回源、失效失败和重校验指标。建立可注入的 room 与 mute 缓存接口，保留当前数据库源作回退。
2. **Room 本地缓存**：在 [`apps/api/src/realtime/realtime-room-source.ts`](apps/api/src/realtime/realtime-room-source.ts) 外包装状态缓存；[`room-realtime-hub.ts`](apps/api/src/realtime/room-realtime-hub.ts) 在 `room.ended` 到达时设置终态，加入房间时执行新鲜检查。
3. **Mute Redis 缓存**：在 [`apps/api/src/rooms/room-mutes.service.ts`](apps/api/src/rooms/room-mutes.service.ts) 的数据库写入后失效共享键；实时源实现 GET、数据库回源、版本检查和 Redis 故障回退。沿用现有 Redis 连接配置及键前缀，避免新建一套独立配置。
4. **Session socket 缓存**：[`apps/api/src/auth/better-auth.service.ts`](apps/api/src/auth/better-auth.service.ts) 暴露 session 到期时间；[`room-socket-io.server.ts`](apps/api/src/realtime/room-socket-io.server.ts) 保存 principal、到期时间、单次重校验 Promise，并确保失败时终止当前事件。
5. **撤销控制事件**：认证入口在成功撤销后发布内部控制事件；Redis coordinator 增加独立控制频道、重连处理和本地 socket 断开索引。核对 Better Auth 实际撤销入口。
6. **两实例验证与压测**：完成下列场景后，按相同机器、连接数、发送速率、接收验证和 SLO 重跑基准。限流顺序不在本次优化中调整。

## 8. 验证与验收口径

必要的单元场景：session 的 15 秒边界、真实到期、并发重校验、撤销/查询失败后当前事件不继续处理；room 的 `LIVE` TTL、`ENDED` 终态压过在途查询、漏通知后回源及无连接时清理；mute 的正负值命中、到期、Redis 故障回退、写入与冷加载并发、两个写入并发，以及旧结果不得回填。

必要的数据库集成场景：两个 API 实例共享 Redis，预热旧的未禁言值后由实例 A 禁言，待 A 的成功响应后由实例 B 发新消息，应被拒绝；结束房间后两个实例均拒绝新消息；登出后远端 socket 被断开或在 15 秒内重校验失效。另测 Redis 失效操作失败时的 15 秒窗口和 PostgreSQL 失败时的拒绝行为。

测量 `pg_stat_statements` 的实际 `SELECT` 数、Redis GET/错误数、缓存命中率、ACK 与接收端延迟、投递完整性，以及达到既定 SLO 的最高速率。初始 TTL 下，对基准中的“每个用户每秒发一条消息、200 个用户、一个房间”，预计平均约 **0.20 条 SELECT/发送尝试**：session `2/15`，mute 未禁言 `1/15`，room 约 `1/(10×200)`。这是估算，不是验收结果；长期运行的目标可暂定低于 **0.30 SELECT/发送尝试**，同时不能牺牲原有投递和延迟 SLO。先确认压测的会话和 Redis 缓存预热范围与旧基准一致，再报告实测提升。
