window.__ModuleLoader__.load({
	id: "dsh-cot-summerization",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client.tsx
		/**
		* dsh-cot-summerization — browser half. Registers the plugin's settings page
		* into the Web Client's settings shell (`settings.section` slot).
		*
		* The Web Client's generic settings transport only serves a fixed namespace
		* whitelist, so — like the vision toolkit — the page reads and writes its
		* namespace through a same-origin route (`/_dsh/cot-summarizer/settings`)
		* mounted by the host half. Provider/model dropdown options are served by a
		* second same-origin route from DSH's own LLM registry.
		* @module dsh-cot-summerization/client
		*/
		const NS = "cot-summarizer";
		const SETTINGS_ROUTE = "/_dsh/cot-summarizer/settings";
		const MODEL_OPTIONS_ROUTE = "/_dsh/cot-summarizer/model-options";
		const en = {
			nav: "CoT Summary",
			settingsTitle: "Chain-of-Thought Summarization",
			settingsIntro: "Hide the model's raw chain of thought in the UI and stream a small-model summary in its place. With \"Keep raw reasoning for the model\" on, the Agent Loop still reasons over the original chain of thought.",
			enabled: "Enabled",
			preserveRawForModel: "Keep raw reasoning for the model",
			preserveRawForModelHint: "Restore the original chain of thought in the model-visible history (Agent Loop performance is unaffected); only the Web UI shows the summary.",
			provider: "Provider",
			providerHint: "DSH provider route for the summarizer call. Choose \"Current provider\" to follow the provider of the current request.",
			providerCurrent: "Current provider",
			model: "Summarizer model",
			modelHint: "Model used through DSH's LLM channel. Choose \"Current model\" to follow the model of the current request, or pick another model.",
			modelCurrent: "Current model",
			modelOptionsFailed: "Failed to load model options.",
			systemPrompt: "Rewrite prompt",
			systemPromptHint: "Override the prompt used to rewrite the raw reasoning. {maxSummaryChars} is substituted with the cap below.",
			language: "Output language",
			languageHint: "Force the language of the condensed chain of thought (e.g. 中文, English). Leave blank to follow the raw reasoning's language.",
			style: "Thinking style",
			styleNone: "Base (no extra style)",
			styleNative: "Native (first-person thinking)",
			styleConcise: "Concise & abstract",
			styleDescriptive: "Descriptive (title + details)",
			styleWenyan: "Classical Chinese (文言文)",
			styleCustom: "Custom (write your own)",
			customStyle: "Custom style prompt",
			customStyleHint: "Appended to the summarization prompt: describe the tone, style, or format you want the summary to follow.",
			minReasoningChars: "Minimum reasoning length",
			minReasoningCharsHint: "Raw reasoning shorter than this (in characters) is shown verbatim without an API call.",
			maxSummaryChars: "Summary length cap",
			maxSummaryCharsHint: "Target maximum length of the summary, in characters.",
			incremental: "Streaming summaries",
			incrementalHint: "Summarize progressively while the raw chain of thought streams (near-realtime), instead of once at the end.",
			chunkChars: "Chunk size (chars)",
			chunkCharsHint: "Raw reasoning characters accumulated before each partial summary; splits prefer sentence boundaries so the summary grows smoothly.",
			chunkIntervalMs: "Chunk interval (ms)",
			chunkIntervalMsHint: "Maximum time between partial summaries on slow streams.",
			adaptiveChunk: "Adaptive chunk size",
			adaptiveChunkHint: "Dynamically size chunks from the live stream rate and summarizer RTT.",
			minChunkChars: "Min adaptive chunk (chars)",
			minChunkCharsHint: "Lower bound for the adaptive chunk size.",
			maxChunkChars: "Max adaptive chunk (chars)",
			maxChunkCharsHint: "Upper bound for the adaptive chunk size.",
			chunkSafetyFactor: "Chunk RTT factor",
			chunkSafetyFactorHint: "How many summarizer RTTs of streamed text one chunk should cover.",
			typewriter: "Typewriter reveal",
			typewriterHint: "Push the summary one character at a time instead of whole segments. The stream is serial, so the reply text and the landed message wait behind the reveal (roughly summary length × interval).",
			typewriterIntervalMs: "Typewriter interval (ms)",
			typewriterIntervalMsHint: "Delay between two revealed characters; 0 disables the delay.",
			timeoutMs: "Request timeout (ms)",
			onError: "On summarizer failure",
			onErrorHide: "Hide reasoning",
			onErrorPassThrough: "Pass raw reasoning through",
			save: "Save",
			saving: "Saving…",
			saved: "Saved",
			loading: "Loading…",
			unavailable: "Settings are unavailable.",
			failed: "Failed to save:"
		};
		const zh = {
			nav: "思维链总结",
			settingsTitle: "思维链总结（CoT Summarization）",
			settingsIntro: "在界面中隐藏模型的原始思维链，改为流式展示小模型生成的摘要。开启\"模型历史保留原文\"时，Agent Loop 仍基于原始思维链推理。",
			enabled: "启用",
			preserveRawForModel: "模型历史保留原文",
			preserveRawForModelHint: "在模型可见历史中恢复原始思维链（Agent Loop 推理不受影响），仅 Web 界面显示摘要。",
			provider: "提供方",
			providerHint: "用于总结调用的 DSH 提供方路由。选择“当前提供方”则跟随当前请求的提供方。",
			providerCurrent: "当前提供方",
			model: "总结模型",
			modelHint: "通过 DSH 的 LLM 通道使用的模型。选择“当前模型”则跟随当前请求的模型，也可选择其他模型。",
			modelCurrent: "当前模型",
			modelOptionsFailed: "模型选项加载失败。",
			systemPrompt: "重写提示词",
			systemPromptHint: "覆盖用于重写原始推理的默认提示词。{maxSummaryChars} 会被替换为下方的长度上限。",
			language: "输出语言",
			languageHint: "强制缩略思维链使用的语言（如：中文、English）。留空则跟随原始推理的语言。",
			style: "思维链风格",
			styleNone: "基础（无额外风格）",
			styleNative: "原生（第一人称思考过程）",
			styleConcise: "简洁（高度抽象）",
			styleDescriptive: "描述型（标题+说明）",
			styleWenyan: "文言",
			styleCustom: "自定义（自己写风格）",
			customStyle: "自定义风格提示",
			customStyleHint: "追加到总结提示词末尾：描述你希望摘要遵循的语气、风格或格式。",
			minReasoningChars: "最短推理长度",
			minReasoningCharsHint: "短于该长度（字符数）的原始思维链直接展示，不调用接口。",
			maxSummaryChars: "摘要长度上限",
			maxSummaryCharsHint: "摘要的目标最大长度（字符数）。",
			incremental: "流式分批总结",
			incrementalHint: "思维链流式输出过程中分批调用总结（接近实时），而不是结束后一次性总结。",
			chunkChars: "分块大小（字符）",
			chunkCharsHint: "每累积多少字符的原始推理触发一次阶段性总结；切分优先选择句子边界，摘要会平滑增长。",
			chunkIntervalMs: "分块间隔（毫秒）",
			chunkIntervalMsHint: "流式较慢时，两次阶段性总结之间的最大时间间隔。",
			adaptiveChunk: "自适应分块",
			adaptiveChunkHint: "根据实时流速率和总结器 RTT 动态调整分块大小。",
			minChunkChars: "自适应最小分块（字符）",
			minChunkCharsHint: "自适应分块的下限。",
			maxChunkChars: "自适应最大分块（字符）",
			maxChunkCharsHint: "自适应分块的上限。",
			chunkSafetyFactor: "分块 RTT 系数",
			chunkSafetyFactorHint: "一个分块大约覆盖多少个总结器 RTT 的流式文本。",
			typewriter: "逐字推送",
			typewriterHint: "摘要按字逐个推送到前端，而不是整段推送。由于流是串行的，回复正文与落库会随之等待（约 摘要字数×间隔）。",
			typewriterIntervalMs: "逐字间隔（毫秒）",
			typewriterIntervalMsHint: "每两个字之间的推送间隔；0 表示不延迟。",
			timeoutMs: "请求超时（毫秒）",
			onError: "总结失败时",
			onErrorHide: "隐藏思维链",
			onErrorPassThrough: "展示原始思维链",
			save: "保存",
			saving: "保存中…",
			saved: "已保存",
			loading: "加载中…",
			unavailable: "设置不可用。",
			failed: "保存失败："
		};
		async function fetchView() {
			const data = await (await fetch(SETTINGS_ROUTE)).json();
			if (!isOk(data)) throw new Error(errorMessage(data) ?? "settings request failed");
			return data.value;
		}
		async function fetchModelOptions() {
			const data = await (await fetch(MODEL_OPTIONS_ROUTE)).json();
			if (!isOk(data)) throw new Error(errorMessage(data) ?? "model options request failed");
			return data.value;
		}
		async function saveView(revision, value) {
			const data = await (await fetch(SETTINGS_ROUTE, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					expectedRevision: revision,
					value
				})
			})).json();
			if (!isOk(data)) throw new Error(errorMessage(data) ?? "settings save failed");
			return data.value;
		}
		function isOk(data) {
			return typeof data === "object" && data !== null && data.ok === true;
		}
		function errorMessage(data) {
			if (typeof data !== "object" || data === null) return void 0;
			const error = data.error;
			return typeof error?.message === "string" ? error.message : void 0;
		}
		/** One labeled form row. */
		function Field({ label, hint, children }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
				className: "dshc-field",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "dshc-field-label",
						children: label
					}),
					children,
					hint !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "dshc-field-hint",
						children: hint
					})
				]
			});
		}
		/** Toggle switch styled with the host theme; the native checkbox keeps form semantics. */
		function Switch({ checked, onChange }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
				className: "dshc-switch",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
					type: "checkbox",
					role: "switch",
					checked,
					onChange: (event) => {
						onChange(event.target.checked);
					}
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "dshc-switch-track",
					"aria-hidden": "true"
				})]
			});
		}
		/** The plugin's settings page, served by the host route. */
		function SettingsSection({ t }) {
			const [view, setView] = (0, react.useState)();
			const [error, setError] = (0, react.useState)();
			const [draft, setDraft] = (0, react.useState)({});
			const [modelOptions, setModelOptions] = (0, react.useState)();
			const [modelOptionsError, setModelOptionsError] = (0, react.useState)();
			const [saving, setSaving] = (0, react.useState)(false);
			const [saved, setSaved] = (0, react.useState)(false);
			const savedTimer = (0, react.useRef)();
			(0, react.useEffect)(() => {
				let cancelled = false;
				fetchView().then((next) => {
					if (cancelled) return;
					setView(next);
					setDraft(next.settings);
				}).catch((reason) => {
					if (cancelled) return;
					setError(reason instanceof Error ? reason.message : String(reason));
				});
				return () => {
					cancelled = true;
				};
			}, []);
			(0, react.useEffect)(() => {
				let cancelled = false;
				fetchModelOptions().then((options) => {
					if (cancelled) return;
					setModelOptions(options);
				}).catch((reason) => {
					if (cancelled) return;
					setModelOptionsError(reason instanceof Error ? reason.message : String(reason));
				});
				return () => {
					cancelled = true;
				};
			}, []);
			(0, react.useEffect)(() => () => {
				if (savedTimer.current !== void 0) clearTimeout(savedTimer.current);
			}, []);
			if (view === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: error !== void 0 ? `${t("unavailable")} ${error}` : t("loading") });
			const set = (field, value) => {
				setDraft((previous) => ({
					...previous,
					[field]: value
				}));
				setSaved(false);
			};
			const save = () => {
				setSaving(true);
				setError(void 0);
				const value = { ...draft };
				saveView(view.revision, value).then((next) => {
					setView(next);
					setDraft(next.settings);
					setSaving(false);
					setSaved(true);
					if (savedTimer.current !== void 0) clearTimeout(savedTimer.current);
					savedTimer.current = setTimeout(() => {
						setSaved(false);
					}, 2e3);
				}).catch((reason) => {
					setSaving(false);
					setError(reason instanceof Error ? reason.message : String(reason));
				});
			};
			const selectedProvider = draft.provider ?? "";
			const providerModels = selectedProvider !== "" && modelOptions !== void 0 ? modelOptions.modelsByProvider[selectedProvider] ?? [] : [];
			const currentModel = draft.model ?? "";
			const hasCustomModel = currentModel !== "" && !providerModels.some((model) => model.id === currentModel);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: "dshc-section",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dshc-head",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("settingsTitle") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("settingsIntro") })]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dshc-grid",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
								label: t("enabled"),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Switch, {
									checked: draft.enabled ?? true,
									onChange: (checked) => {
										set("enabled", checked);
									}
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
								label: t("preserveRawForModel"),
								hint: t("preserveRawForModelHint"),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Switch, {
									checked: draft.preserveRawForModel ?? true,
									onChange: (checked) => {
										set("preserveRawForModel", checked);
									}
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
								label: t("incremental"),
								hint: t("incrementalHint"),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Switch, {
									checked: draft.incremental ?? true,
									onChange: (checked) => {
										set("incremental", checked);
									}
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
								label: t("typewriter"),
								hint: t("typewriterHint"),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Switch, {
									checked: draft.typewriter ?? false,
									onChange: (checked) => {
										set("typewriter", checked);
									}
								})
							}),
							draft.typewriter === true && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
								label: t("typewriterIntervalMs"),
								hint: t("typewriterIntervalMsHint"),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "number",
									min: 0,
									max: 2e3,
									value: draft.typewriterIntervalMs ?? 15,
									onChange: (event) => {
										const parsed = Number(event.target.value);
										if (Number.isFinite(parsed)) set("typewriterIntervalMs", parsed);
									}
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
								label: t("provider"),
								hint: modelOptionsError !== void 0 ? `${t("providerHint")} ${t("modelOptionsFailed")} ${modelOptionsError}` : t("providerHint"),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
									value: selectedProvider,
									onChange: (event) => {
										const nextProvider = event.target.value;
										setDraft((previous) => {
											const next = {
												...previous,
												provider: nextProvider
											};
											const current = next.model ?? "";
											if (nextProvider !== "" && modelOptions !== void 0 && current !== "") {
												if (!(modelOptions.modelsByProvider[nextProvider] ?? []).some((model) => model.id === current)) next.model = "";
											}
											return next;
										});
										setSaved(false);
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "",
										children: t("providerCurrent")
									}), modelOptions?.providers.map((provider) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: provider.id,
										children: provider.name || provider.id
									}, provider.id))]
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
								label: t("model"),
								hint: modelOptionsError !== void 0 ? `${t("modelHint")} ${t("modelOptionsFailed")} ${modelOptionsError}` : t("modelHint"),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
									value: currentModel,
									onChange: (event) => {
										set("model", event.target.value);
									},
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "",
											children: t("modelCurrent")
										}),
										providerModels.map((model) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: model.id,
											children: model.name || model.id
										}, model.id)),
										hasCustomModel && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("option", {
											value: currentModel,
											children: [currentModel, " (custom)"]
										})
									]
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
								label: t("systemPrompt"),
								hint: t("systemPromptHint"),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
									rows: 5,
									value: draft.systemPrompt ?? "",
									onChange: (event) => {
										set("systemPrompt", event.target.value);
									}
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
								label: t("language"),
								hint: t("languageHint"),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "text",
									value: draft.language ?? "中文",
									placeholder: "中文 / English",
									onChange: (event) => {
										set("language", event.target.value);
									}
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
								label: t("style"),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
									value: draft.style ?? "native",
									onChange: (event) => {
										set("style", event.target.value);
									},
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "none",
											children: t("styleNone")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "native",
											children: t("styleNative")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "concise",
											children: t("styleConcise")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "descriptive",
											children: t("styleDescriptive")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "wenyan",
											children: t("styleWenyan")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "custom",
											children: t("styleCustom")
										})
									]
								})
							}),
							draft.style === "custom" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
								label: t("customStyle"),
								hint: t("customStyleHint"),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
									rows: 3,
									value: draft.customStyle ?? "",
									onChange: (event) => {
										set("customStyle", event.target.value);
									}
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
								label: t("minReasoningChars"),
								hint: t("minReasoningCharsHint"),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "number",
									min: 0,
									value: draft.minReasoningChars ?? 32,
									onChange: (event) => {
										const parsed = Number(event.target.value);
										if (Number.isFinite(parsed)) set("minReasoningChars", parsed);
									}
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
								label: t("maxSummaryChars"),
								hint: t("maxSummaryCharsHint"),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "number",
									min: 1,
									value: draft.maxSummaryChars ?? 50,
									onChange: (event) => {
										const parsed = Number(event.target.value);
										if (Number.isFinite(parsed)) set("maxSummaryChars", parsed);
									}
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
								label: t("chunkChars"),
								hint: t("chunkCharsHint"),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "number",
									min: 1,
									value: draft.chunkChars ?? 500,
									onChange: (event) => {
										const parsed = Number(event.target.value);
										if (Number.isFinite(parsed)) set("chunkChars", parsed);
									}
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
								label: t("chunkIntervalMs"),
								hint: t("chunkIntervalMsHint"),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "number",
									min: 500,
									value: draft.chunkIntervalMs ?? 8e3,
									onChange: (event) => {
										const parsed = Number(event.target.value);
										if (Number.isFinite(parsed)) set("chunkIntervalMs", parsed);
									}
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
								label: t("adaptiveChunk"),
								hint: t("adaptiveChunkHint"),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Switch, {
									checked: draft.adaptiveChunk ?? true,
									onChange: (checked) => {
										set("adaptiveChunk", checked);
									}
								})
							}),
							draft.adaptiveChunk === true && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
									label: t("minChunkChars"),
									hint: t("minChunkCharsHint"),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "number",
										min: 1,
										value: draft.minChunkChars ?? 64,
										onChange: (event) => {
											const parsed = Number(event.target.value);
											if (Number.isFinite(parsed)) set("minChunkChars", parsed);
										}
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
									label: t("maxChunkChars"),
									hint: t("maxChunkCharsHint"),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "number",
										min: 1,
										value: draft.maxChunkChars ?? 2e3,
										onChange: (event) => {
											const parsed = Number(event.target.value);
											if (Number.isFinite(parsed)) set("maxChunkChars", parsed);
										}
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
									label: t("chunkSafetyFactor"),
									hint: t("chunkSafetyFactorHint"),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "number",
										min: .1,
										step: .1,
										value: draft.chunkSafetyFactor ?? 2,
										onChange: (event) => {
											const parsed = Number(event.target.value);
											if (Number.isFinite(parsed)) set("chunkSafetyFactor", parsed);
										}
									})
								})
							] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
								label: t("timeoutMs"),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "number",
									min: 1,
									value: draft.timeoutMs ?? 3e4,
									onChange: (event) => {
										const parsed = Number(event.target.value);
										if (Number.isFinite(parsed)) set("timeoutMs", parsed);
									}
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
								label: t("onError"),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
									value: draft.onError ?? "hide",
									onChange: (event) => {
										set("onError", event.target.value);
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "hide",
										children: t("onErrorHide")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "pass-through",
										children: t("onErrorPassThrough")
									})]
								})
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dshc-actions",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "dshc-save",
								disabled: saving,
								onClick: save,
								children: saving ? t("saving") : t("save")
							}),
							saved && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dshc-saved",
								children: t("saved")
							}),
							error !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "dshc-error",
								children: [
									t("failed"),
									" ",
									error
								]
							})
						]
					})
				]
			});
		}
		const STYLES = `
.dshc-section { padding: 0 4px 12px; color: var(--dsw-alias-label-primary); }
.dshc-head h3 { margin: 0 0 4px; font-size: 15px; }
.dshc-head p { margin: 0 0 14px; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 1.5; }
.dshc-grid { display: grid; gap: 14px; }
.dshc-field { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
.dshc-field-label { font-weight: 600; }
.dshc-field input[type="text"], .dshc-field input[type="password"], .dshc-field input[type="number"], .dshc-field select, .dshc-field textarea {
  width: 100%; box-sizing: border-box; padding: 6px 8px; border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 6px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); font: inherit;
}
.dshc-field input[type="text"]:focus, .dshc-field input[type="password"]:focus, .dshc-field input[type="number"]:focus, .dshc-field select:focus, .dshc-field textarea:focus {
  outline: none; border-color: var(--dsw-alias-border-l4);
}
.dshc-switch { position: relative; display: inline-flex; width: 38px; height: 22px; cursor: pointer; }
.dshc-switch input { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer; }
.dshc-switch-track { position: absolute; inset: 0; border-radius: 999px; background: var(--dsw-alias-border-l2); transition: background 0.15s ease; }
.dshc-switch-track::after { content: ""; position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%; background: var(--dsw-alias-label-primary-foreground); box-shadow: 0 1px 2px rgb(0 0 0 / 0.25); transition: transform 0.15s ease; }
.dshc-switch input:checked + .dshc-switch-track { background: var(--dsw-alias-button-primary-fill); }
.dshc-switch input:checked + .dshc-switch-track::after { transform: translateX(16px); }
.dshc-switch input:focus-visible + .dshc-switch-track { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.dshc-field-hint { color: var(--dsw-alias-label-secondary); font-size: 11px; line-height: 1.4; }
.dshc-actions { display: flex; align-items: center; gap: 10px; margin-top: 16px; }
.dshc-save { padding: 6px 16px; border: 0; border-radius: 6px; background: var(--dsw-alias-button-primary-fill); color: var(--dsw-alias-label-primary-foreground); font: inherit; font-size: 13px; cursor: pointer; }
.dshc-save:hover:not(:disabled) { background: var(--dsw-alias-button-primary-hover); }
.dshc-save:disabled { opacity: 0.6; cursor: default; }
.dshc-saved { color: var(--dsw-alias-state-success-primary); font-size: 12px; }
.dshc-error { color: var(--dsw-alias-state-error-primary); font-size: 12px; }
`;
		/** Required services: the slot registry and the locale seat. */
		const inject = ["slots", "locale"];
		/** Browser plugin entry: register the settings page for the cot-summarizer namespace. */
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				en,
				zh
			}), "dsh-cot-summerization: locale");
			ctx.effect(() => {
				const style = document.createElement("style");
				style.textContent = STYLES;
				document.head.append(style);
				return () => {
					style.remove();
				};
			}, "dsh-cot-summerization: styles");
			const t = ctx.locale.bind(NS);
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "cot-summarizer",
				order: 31,
				label: () => t("nav"),
				inject: () => ({ t })
			}, SettingsSection));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
