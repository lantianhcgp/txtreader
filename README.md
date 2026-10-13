# TXTreader for WATCH GT5 — 手腕上的电子书（GT5 适配版）

在华为 WATCH GT5（466×466 圆形 AMOLED）上阅读 TXT 小说的轻量级穿戴阅读器。
本分支在原 GT2 Pro 版（cnoim 生态系 TXTreader）基础上完成 GT5 全面适配：
构建链、API、界面三线迁移到 GT5 当前要求。

## 适配了什么

**构建链**：DevEco 3.1 + Gradle（com.huawei.ohos.hap 3.1.5.0，早已停止维护）→
hvigor / Command Line Tools 6.1.1（faMode，modelVersion 6.1.1）。
原链路只能出 API 5 时代的包；新链路 CI 一键出包，产物可直接给 GT5 打包签名。

**API**：
- `config.json`：abilities/js 模块迁移为 `.MainAbility` 形态（srcLanguage/srcPath），
  版本 2.0.0。
- SDK 声明（build-profile.json5）：`compatibleSdkVersion 4.0.0(10)` +
  `targetSdkVersion 6.1.1(24)` —— GT5 属 API 10+ 档机型，该组合已在同档
  机型（FIT3/GT4 系）实测装表成功。
- JS 接口：`requireNative('system.file') / requireNative('system.storage')` →
  标准模块导入 `import file from '@system.file'` / `import storage from '@system.storage'`。
  接口语义（readText 分块读、storage 进度键值）不变，3000 字节分块啃大书的机制原样保留。
- 按钮实现：`input type="button"` → `div(背景) + text(纯文字) + @click`。原写法在官方
  Lite 引擎上的点击行为未经证实；div+@click 是同工程族（课程表）模拟器+真机双证模式。

**界面（466×466 圆屏重排）**：
- 画布 454×454 → 466×466；正文列 336px、字号 28px、每行 12 字、每页 8 行，
  阅读密度与原版一致（96 字/页）。
- 全部关键内容收进圆安全区（按弦宽逐段核算，466 圆上每行文字与每个按钮的
  四角都在圆内）：
  - 标题栏 y 55–95（页码/浏览路径）
  - 正文 y 97–362，两侧翻页热区 x 17–53 / 413–449
  - 底部 Prev/Next/Reset 按钮行宽 294、y 364–412，不碰圆角裁切
- 原版底部按钮行在圆屏上外角会被裁（GT2 上同样存在），GT5 版已修正。

**验证**：GitHub Actions 构建出包后，经官方 Huawei Lite Wearable Simulator
（circle466 档，与 GT5 同分辨率同引擎）渲染截图逐屏核验。

## IO 挂死兜底（v2.0.0 新增）

已知环境事实：官方 Lite 模拟器对 `@system.file` 的 `internal://app` 调用**静默不回调**
（不 success 不 fail）；真机个别固件/场景下文件 IO 也可能挂起。v2.0.0 起每个异步
旅程（列目录/打开文件/跨区块翻页）带 1 秒看门狗：

- 回调按时到达 → 立即撤销看门狗，一切行为与原版一致（真机毫秒级返回，兜底永不触发）
- 超时 → 进入演示模式：标题栏带 `(demo)`，内置演示文本走**同一套分页/翻页代码路径**
- 跨区块读取超时 → 标题提示 `timeout 点击重试`，不吞掉当前页

这也是本项目可以在官方模拟器上做端到端视觉验证的原因。

## 功能（与原版一致）

- 翻页：底部 Prev/Next + 正文两侧 </> 热区
- 进度记忆：每 5 页自动保存，精确到「区块起点:页码:字符位」，换书自动清零
- 大文件：3000 字节分块异步读取，22 万字《三体 II》实测可读
- Reset：阅读中=回到目录并保留进度；目录中=回根目录
- UTF-8 TXT，文件名用英文

## 编译

**CI（推荐）**：push 即构建（`.github/workflows/build.yml`），产物
`txtreader-<run>.artifact` 内为未签名 `.app`。签名材料放 `certs/app.p7b`
（+`tools/sign`）时自动出签名 `.hap`。

**本机 DevEco Studio**：用支持 Lite Wearable 的 DevEco（CLT 6.1.1 系）打开工程，
`hvigorw assembleApp --mode project -p product=default -p buildMode=debug`。

签名：调试签名去华为开发者联盟申请证书（p7b/p12/cer）。GT5 装机走
「应用调测助手」或运动健康侧的调测安装流程。

## 换书

1. UTF-8 编码 TXT，英文文件名
2. 放进 `entry/src/main/resources/rawfile/`
3. 重新构建、装表

## 工程结构

```
entry/src/main/
├── config.json                     # liteWearable / .MainAbility / 2.0.0
├── js/MainAbility/
│   ├── app.js
│   └── pages/index/                # 唯一页面：目录浏览 + 阅读器
│       ├── index.hml / index.css   # 466×466 圆屏布局（安全区注释齐全）
│       └── index.js                # 分块读取 + 分页 + 进度持久化
├── resources/base/{element,media}  # label/icon
└── rawfile/sample.txt              # 演示文本（换书替换此目录文件）
```

## 兼容性说明

- 目标机型：WATCH GT5（466×466 圆屏，API 10+ 档）。
- 布局按 466 物理像素设计；454（GT2 Pro/GT4）等其它圆屏未回归，不保证不裁切。
- @system.file 在部分 DevEco 预览器/模拟器不可用属已知平台特性，
  真机行为以装表实测为准。

## 致谢

原版 TXTreader 由社区作者基于 cnoim 撑起的 Lite Wearable 生态实现。
本适配版保留 MIT License。

MIT License
