# Agent Note: Project-local session roots

Status: implemented

[English](2026-08-14-project-local-session-roots.md) | 中文

## Problem

会话日志默认存放在 `$DSH_HOME/sessions`，会在系统盘上无限增长。桌面用户希望每个项目自己持有会话，而且删除工作区后历史仍然可发现。

## Decision

`@deepseek-ai/dsh-session-persistence-jsonl` 新增可选的 `projectRoots` 配置和 `setProjectRoots()` 运行时修改器。每个项目根拥有存储作用域 `<root>/.dsh/sessions`；会话路由到 cwd 前缀匹配最长的那一个根，其余情况回退到配置的 `root`。列表、身份校验、编码校验和落盘都遍历所有作用域，同一个会话 id 出现在两个作用域仍是冲突。移除一个根只是隐藏其会话而不删除；因此桌面端的同步让根集合只增不减，并把并集持久化到 `$DSH_HOME/session-roots.json`，从而在删除工作区后保留历史。

桌面主进程在引导时用持久化的根集合重写持久化行，之后每隔几秒把活跃的 workspace 注册表同步进修改器。轮询是桌面外壳的对账方式，不是持久化契约。

## Alternatives considered

**每个项目挂载一个后端实例。** 拒绝：`ctx.sessionPersistence` 是单一服务，且逐实例的协调器会各自订阅整条事件流。

**新增复用协调器的后端包。** 拒绝：JSONL 存储钩子、Zstandard 分帧、Windows 发布和身份校验都是私有的，抽取它们会复制整个持久化表面。

**新增运行时根供给 seam。** 在这个预发布表面下拒绝：修改器只是现有后端上的一个带类型方法，而桌面外壳本就持有活跃注册表。

## Consequences

现有单根部署保持字节级一致的布局和行为：`projectRoots` 默认为空。项目内的会话现在与它们改动的代码存放在一起，机器重启后通过持久化的根清单恢复。在根存在之前创建的会话存放在回退根下，不做迁移。
