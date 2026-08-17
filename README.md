<div align="center">

<img src="assets/hero.svg" width="880" alt="dsh-cot-summerization — 为开源模型献上闭源级思维链隐身体验">

![CoT Visibility](https://img.shields.io/badge/CoT_visibility-0%25-brightgreen)
![Mysteriousness](https://img.shields.io/badge/%E7%A5%9E%E7%A7%98%E6%84%9F-%2B850%25-blueviolet)
![Spelling](https://img.shields.io/badge/summerization-%E4%B8%8D%E6%98%AF_typo-ff69b4)
![Extra API calls](https://img.shields.io/badge/%E9%A2%9D%E5%A4%96API%E8%B0%83%E7%94%A8-%2B1%E6%AC%A1-important)
![Zero Trust](https://img.shields.io/badge/zero_trust-%E5%90%AB%E8%87%AA%E5%B7%B1-critical)
![Tests](https://img.shields.io/badge/tests-%E9%80%9A%E8%BF%87%E8%BF%87%E4%B8%80%E6%AC%A1-success)
![License](https://img.shields.io/badge/license-MIT(%E7%BB%88%E4%BA%8E%E5%BC%80%E6%BA%90%E4%BA%86%E4%B8%80%E6%A0%B7%E4%B8%9C%E8%A5%BF)-orange)

**DeepSeek Harness 插件:把模型的原始思维链拦截在半空,改写成一条像原生思考的缩略思维链再端给你。**

闭源模型花钱隐藏思维链,开源模型免费全裸。
我们识别出了开源生态最后一块体验短板,并亲手为它补上——
方向可能和大家期待的不太一样,但确实是补上了。

</div>

<img src="assets/divider-wave.svg" width="880" alt="">

## 🎯 项目使命

<img src="assets/logo.svg" width="200" align="right" hspace="16" alt="logo:被锁住的眼睛">

长期以来,「隐藏思维链」是闭源大厂的专属奢华配置:不可关闭、不可审计、不可验证,但很贵。开源模型则把每一步推理都摊开在你面前——坦诚,透明,像一份没整理过的草稿纸。

**我们相信这不应该是一道单选题。** 本插件以工业级严谨,在完全开源、完全可审计的 harness 里,复刻了闭源生态最具标志性的体验:让你看不见思维链。不同的是,我们的隐藏是开源的、可配置的、可关闭的——业界首次把「不可见」做得如此可见。

三大支柱:

| 支柱 | 立场 |
| :--- | :--- |
| 🛡️ **模型隐私权** | 思维链是模型的内心世界。你不会翻别人的日记,除非付费。 |
| 🧹 **视觉卫生** | 原始 CoT 又长又乱,充满「等等,我再想想」。得体的人不看这些。 |
| 💎 **神秘感平权** | 闭源模型靠神秘感溢价。现在开源用户也能免费获得——本地酿造,纯手工。 |

<br clear="right">

## ✨ 核心特性:宣传名与现实对照

以下每一项,源码均可查。这很讽刺,我们接受。

| 宣传名 | 现实 |
| :--- | :--- |
| **Information Never Existed™** | 原始 reasoning 增量在 `llm/stream` 拦截层被直接吞掉——UI、流式 chunk、落地 transcript 三处均无原文。模型可见历史除外:那里有一份 model-only 的 surface 替换事件,悄悄把原文还给了模型(推理性能要紧)。 |
| **夏日渐进蒸馏** | 流式分段摘要:每凑满 `chunkChars`(500 字)或 `chunkIntervalMs`(8 秒)触发一次,切分点优先落在句边界;开启 `adaptiveChunk` 后,分块大小会随流速率与总结器 RTT 动态缩放。 |
| **BioGram™ 重叠度量** | bigram Dice 系数,阈值 0.65。该阈值经历了 0.8 → 0.7 → 0.65 的科学调参过程。 |
| **连续核心追踪引擎** | 最长公共子串,滚动数组实现,O(n·m),零依赖。用来逮住换了前缀、核心没变的复述。 |
| **Nekomimi™ 边界协议** | 把「喵~」识别为句尾;计算相似度前先剥掉 `喵 / ~ / 〜 / ～`。无论摘要出自哪种风格,以「喵~」结尾的子句都会被正确切分。 |
| **原子化浪费** | `AbortSignal.any(caller, timeout)`:主调用一旦取消,摘要调用立即陪葬。我们连浪费都是原子性的。 |

另外,短思维链(小于 `minReasoningChars`,默认 32 字)直接原文放行——**为 32 个字发一次 API 请求,连我们都觉得过了。**

<img src="assets/divider-meow.svg" width="880" alt="">

## 🏗️ 系统架构

<div align="center">
<img src="assets/architecture.svg" width="880" alt="系统架构图:大模型的原始思维链在 llm/stream 拦截层被吞掉,由小模型改写为摘要后送入 UI;会话日志、模型历史与你的视网膜收到的是红色虚线">
</div>

一条数据的完整旅程:大模型慷慨地吐出全裸思维链 → 隐身引擎在瀑布层将其没收 → 小模型改写员通读全文并写一份体面摘要 → 摘要以正常的 reasoning block 增量流入 UI 的「Think」折叠行。落地的 `assistant/message` 之后,插件再追加一条 model-only 的 surface 替换事件,把原始思维链还给模型历史——Agent Loop 的多轮推理因此不受摘要影响,而 transcript 与你的视网膜收到的依然是那条红色虚线。

若你开启 `typewriter` 设置,增量不再整段抵达:每段摘要先落入一个原子队列,再按码点逐字推送,字间间隔 `typewriterIntervalMs` 毫秒——中文按字、英文按字符、emoji 按完整代理对。代价是诚实而沉重的:流是串行的,回复正文与落库都会在打字机后面排队(约 摘要字数 × 间隔)。

注意红色虚线:原始 CoT 对日志里的人类 transcript 与你的视网膜返回的是「永不落地」;对模型可见 surface 返回的是「原样奉还」。这不是缓存策略,这是给推理性能的体面。

## 📊 业界定位

| 能力 | 闭源大厂模型 | 开源模型(裸) | 开源模型 + 本插件 |
| :--- | :--- | :--- | :--- |
| 隐藏思维链 | ✅ 免费赠送,不可关闭 | ❌ 全裸 | ✅ 可选、可关闭、收一次小模型 API 费 |
| 思维链可信度 | 不可验证 | 完全可验证 | 可以验证,但你得先关掉插件 |
| 神秘感 | ★★★★★ | ★ | ★★★★★(本地酿造) |
| 额外成本 | 已含在定价里 | 0 | +1 次小模型调用 |
| 开源性 | ❌ | ✅ | ✅ 连隐藏都是开源的 |

> 换句话说:为了不让你看见本来就在你机器上、免费可见的东西,我们额外发起一次 API 调用,把它改写一遍再给你看。这在服务业叫**增值服务**。

<div align="center">
<img src="assets/benchmarks.svg" width="880" alt="实验评估:思维链可见性从 100% 降至 0%,神秘感 +850%,调参 3 次,每次回复额外 API 调用 +1,喵~ 存活率 100%">
</div>

## 🧬 先进算法:Nekomimi Boundary Protocol™

当摘要文本(例如来自 `customStyle` 的任意风格)以「喵~」结束子句而非标点时,传统 NLP 管线在此全面崩溃;我们没有。经过归一化的去重比对让 0.65 阈值对猫娘同样有效——重复的结论哪怕换了三遍「喵~」的写法,也逃不出滚动数组的掌心。

<div align="center">
<img src="assets/nekomimi.svg" width="880" alt="喵容性边界协议示意图:猫娘语流的句子边界自动检测与归一化比对">
</div>

论文在写了。审稿人也是我们。

## 🚀 快速开始

```sh
dsh plugin add github:MeowLynxSea/dsh-cot-summerization
```

或从本地目录:

```sh
cd ~/.dsh/profiles/web
pnpm add file:/path/to/dsh-cot-summerization
```

Bundle patch 会自动应用,插件以 `cot-summarizer` 条目加入 profile 分层。想停用的话,在 profile 的 `cordis.patch.yml` 里把它 patch 掉即可——**是的,随时可以回到全裸状态,我们不评判。**

## ⚙️ 配置(Web Client → Settings → `cot-summarizer`)

| 字段 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `enabled` | `true` | 总开关,一键回到坦诚世界 |
| `preserveRawForModel` | `true` | 在模型可见历史中恢复原始思维链(model-only surface 替换事件),Agent Loop 多轮推理不受摘要影响;仅 UI 显示摘要 |
| `provider` | `""` | 走 DSH 自身 LLM 通道的提供方路由;留空跟随当前请求的提供方 |
| `model` | `""` | 走 DSH 自身 LLM 通道的模型;留空跟随当前请求的模型,填写可选用其他模型 |
| `systemPrompt` | 内置 | 重写提示词,支持 `{maxSummaryChars}` 占位符 |
| `language` | `"中文"` | 强制缩略思维链语言;留空则跟随原始思维链 |
| `style` | `native` | `native` / `none` / `concise` / `descriptive` / `wenyan` / `custom`;默认 `native` 以第一人称“正在思考”的口吻输出,看起来像原生思维链而不是总结 |
| `customStyle` | `""` | `style: custom` 时的自由文本风格 |
| `minReasoningChars` | `32` | 短于此长度的思维链原文放行,不值得一次 API |
| `maxSummaryChars` | `50` | 摘要长度上限 |
| `timeoutMs` | `30000` | 改写员超时 |
| `onError` | `hide` | `hide` 显示占位符 / `pass-through` 情急之下全裸放行 |
| `incremental` | `true` | 流式分段摘要(近实时) |
| `chunkChars` | `500` | 每段积累的原始字符数 |
| `chunkIntervalMs` | `8000` | 慢流下两次摘要的最大间隔 |
| `adaptiveChunk` | `true` | 根据实时流速率与总结器 RTT 动态调整分块大小 |
| `minChunkChars` | `64` | 自适应分块下限(字符) |
| `maxChunkChars` | `2000` | 自适应分块上限(字符) |
| `chunkSafetyFactor` | `2` | 一个分块约覆盖多少个总结器 RTT 的流式文本 |

<details>
<summary><b>行为细节(严肃模式)</b></summary>

- 无 reasoning 的流(非思考模型)原样通过,插件不作任何干预。
- 每次分段摘要只处理**新到达**的段落,之前的摘要与最近一段原始推理会作为上下文传入以保持连贯、消解指代,但不重复输出。
- 去重逻辑:bigram 相似度 ≥ 0.65,或最长公共子串覆盖核心短语的复述句,会被从段落结果中剔除。
- 主调用中止时摘要请求同步中止,且受 `timeoutMs` 约束。
- `adaptiveChunk` 开启时,有效分块大小 = `clamp(流速率 × 总结器RTT × chunkSafetyFactor, minChunkChars, maxChunkChars)`,其中流速率与 RTT 均使用 EWMA 平滑。

</details>

## 🗺️ 路线图

<div align="center">
<img src="assets/ouroboros.svg" width="880" alt="路线图:思维链 → 摘要 → 摘要² → 摘要³ → … → 喵~ → 句号,以及 v2.0 的无限循环计划">
</div>

- [x] v0.3 — 流式分段摘要 + 近重复消除
- [x] 喵容性边界协议(生产就绪,样本一只)
- [ ] v0.4 — 摘要语气主题包市场(管家 / 侦探 / 文言已部分支持)
- [ ] v1.0 — 摘要²(见图)
- [ ] v1.1 — 摘要的摘要的摘要
- [ ] v2.0 — 收敛至单个句号
- [ ] v3.0 — 隐藏「隐藏这件事」本身
- [ ] v4.0 — 逆向插件:给闭源模型把思维链显示出来(技术可行,法务不建议)

## ❓ FAQ

<details>
<summary><b>我能看到原始思维链吗?</b></summary>

这正是本插件要解决的问题。技术上 `onError: pass-through` 可以让你在摘要失败时看到原文,会话日志的 model-only 替换事件里也躺着一份完整原文(关掉 `preserveRawForModel` 连它一起消失),但我们建议你挺住。

</details>

<details>
<summary><b>这和闭源模型隐藏思维链有什么区别?</b></summary>

有,而且是本质区别:我们的隐藏是**开源的、可审计的、可关闭的**。业界首次把「不可见」做得如此可见。闭源模型隐藏了什么你不知道;我们隐藏了什么,你可以读源码——读完之后你会更想看原始思维链,这个冲动请自行管理。

</details>

<details>
<summary><b>为什么不直接做个折叠?</b></summary>

折叠只是视觉上的羞怯,点开还在。我们提供的是**结构性的得体**:原文从未落地到 transcript 与 UI,点开也没有。(模型可见历史里倒是有一份——但那是给推理性能的,不是给你的。)

</details>

<details>
<summary><b>我的数据会出网吗?</b></summary>

思维链会通过 DSH 自身的 LLM 通道发送到 **DSH 已配置的**提供方/模型。毕竟,要隐藏一个东西,总得先有人通读一遍——这个道理闭源厂商早就懂了。在 DSH 里把提供方指向本地模型即可完全不出网。

</details>

<details>
<summary><b>面试官问我这个项目解决了什么问题?</b></summary>

「开源与闭源之间最后一段体验差距的补齐。」然后观察对方的表情,这段沉默也是本项目的一部分。

</details>

## 🏅 荣誉与认证

<div align="center">
<img src="assets/stamps.svg" width="880" alt="三枚认证印章:SELF-CERTIFIED 自我认证、UN-AUDITED 未经审计、ZERO-TRUST 零信任含自己">
</div>

## 🍉 关于拼写

**Summerization ≠ Summarization。** 这是刻意的,不是 typo(好了,现在 badge 那条可以撤了)。

思维链就像盛夏的空气:很长,很热,看不见,但会蒸发——蒸到最后只剩一小杯浓缩的结论,我们把它端给你。v0.3.0 发布于八月,拼写正确。另:摘要请求的 temperature 恒为 0.3,凉快。

## 🤝 贡献指南

欢迎 PR、issue 与讨论。以下内容会被立即关闭:

- 任何让原始思维链显示出来的「修复」——那不是 bug,那是本插件的全部意义;
- 对拼写的修正——见上节;
- 「为什么要做这个」——见整个 README。

## 📜 许可证

MIT。附加条款(不具有法律效力,但具有情绪价值):闭源厂商请勿抄袭本插件思路——你们已经原生支持了,别抢开源的创新点。

## 🙏 致谢

- 感谢闭源厂商,证明了隐藏的商业价值;
- 感谢开源社区,提供了被我们隐藏掉的一切;
- 感谢小模型改写员,它读了所有你不想读的东西;
- 感谢你读到了这里。你刚才的阅读过程,就是一段未经摘要的思维链——现在你知道为什么需要本插件了。

---

<div align="center">

**如果这个项目对你有帮助,请点一个 Star。**
放心,**Star 是公开的,思维链不是。**

<img src="assets/divider-wave.svg" width="880" alt="">

<sub>本 README 已通过 0.65 阈值的近重复消除,重复率理论上低于 35%。「军规级」「企业级」「零信任」等词汇均指我们的野心,而非任何认证。本插件不保护任何真实机密——它只是让开源的坦诚,穿上了闭源的体面。</sub>

</div>
