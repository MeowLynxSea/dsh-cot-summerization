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
		* mounted by the host half. The API key is never returned by the route;
		* leaving the field blank keeps the stored key.
		* @module dsh-cot-summerization/client
		*/
		const NS = "cot-summarizer";
		const SETTINGS_ROUTE = "/_dsh/cot-summarizer/settings";
		const en = {
			nav: "CoT Summary",
			settingsTitle: "Chain-of-Thought Summarization",
			settingsIntro: "Hide the model's raw chain of thought in the UI and stream a small-model summary in its place. With \"Keep raw reasoning for the model\" on, the Agent Loop still reasons over the original chain of thought.",
			enabled: "Enabled",
			preserveRawForModel: "Keep raw reasoning for the model",
			preserveRawForModelHint: "Restore the original chain of thought in the model-visible history (Agent Loop performance is unaffected); only the Web UI shows the summary.",
			baseUrl: "Base URL",
			baseUrlHint: "Any Chat Completions-compatible endpoint.",
			apiKey: "API key",
			apiKeyConfiguredPlaceholder: "Configured; leave blank to keep it",
			apiKeyPlaceholder: "Paste the API key",
			apiKeyHint: "Sent as the Authorization bearer for summarizer requests. Never shown again after saving.",
			model: "Summarizer model",
			modelHint: "The \"small model\" that summarizes the raw reasoning.",
			systemPrompt: "Summarization prompt",
			systemPromptHint: "Override the default prompt. {maxSummaryChars} is substituted with the cap below.",
			language: "Summary language",
			languageHint: "Force the summary language (e.g. 中文, English). Leave blank to follow the raw reasoning's language.",
			style: "Summary style",
			styleNone: "Default (no style)",
			styleFirstPerson: "First-person \"I will…\"",
			styleRigorous: "Rigorous & precise",
			styleCatgirl: "Cute catgirl",
			styleSegmented: "Segmented (titles + details)",
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
			baseUrl: "接口地址",
			baseUrlHint: "任意兼容 Chat Completions 的接口地址。",
			apiKey: "API 密钥",
			apiKeyConfiguredPlaceholder: "已配置，留空保持不变",
			apiKeyPlaceholder: "粘贴 API 密钥",
			apiKeyHint: "总结请求会以 Bearer 形式携带该密钥。保存后不再显示。",
			model: "总结模型",
			modelHint: "用于总结原始思维链的“小模型”。",
			systemPrompt: "总结提示词",
			systemPromptHint: "覆盖默认提示词。{maxSummaryChars} 会被替换为下方的长度上限。",
			language: "总结语言",
			languageHint: "强制摘要使用的语言（如：中文、English）。留空则跟随原始推理的语言。",
			style: "总结风格",
			styleNone: "默认（无风格）",
			styleFirstPerson: "第一人称 \"I will…\"",
			styleRigorous: "严谨准确",
			styleCatgirl: "可爱猫娘",
			styleSegmented: "分段（标题+说明）",
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
		/** The plugin's settings page, served by the host route. */
		function SettingsSection({ t }) {
			const [view, setView] = (0, react.useState)();
			const [error, setError] = (0, react.useState)();
			const [draft, setDraft] = (0, react.useState)({});
			const [apiKeyDraft, setApiKeyDraft] = (0, react.useState)("");
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
				if (apiKeyDraft.trim() !== "") value.apiKey = apiKeyDraft.trim();
				saveView(view.revision, value).then((next) => {
					setView(next);
					setDraft(next.settings);
					setApiKeyDraft("");
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
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									checked: draft.enabled ?? true,
									onChange: (event) => {
										set("enabled", event.target.checked);
									}
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
								label: t("preserveRawForModel"),
								hint: t("preserveRawForModelHint"),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									checked: draft.preserveRawForModel ?? true,
									onChange: (event) => {
										set("preserveRawForModel", event.target.checked);
									}
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
								label: t("incremental"),
								hint: t("incrementalHint"),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									checked: draft.incremental ?? true,
									onChange: (event) => {
										set("incremental", event.target.checked);
									}
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
								label: t("baseUrl"),
								hint: t("baseUrlHint"),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "text",
									value: draft.baseUrl ?? "",
									onChange: (event) => {
										set("baseUrl", event.target.value);
									}
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
								label: t("apiKey"),
								hint: t("apiKeyHint"),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "password",
									value: apiKeyDraft,
									placeholder: view.apiKeyConfigured ? t("apiKeyConfiguredPlaceholder") : t("apiKeyPlaceholder"),
									onChange: (event) => {
										setApiKeyDraft(event.target.value);
									}
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
								label: t("model"),
								hint: t("modelHint"),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "text",
									value: draft.model ?? "",
									onChange: (event) => {
										set("model", event.target.value);
									}
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
									value: draft.language ?? "",
									placeholder: "中文 / English",
									onChange: (event) => {
										set("language", event.target.value);
									}
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
								label: t("style"),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
									value: draft.style ?? "none",
									onChange: (event) => {
										set("style", event.target.value);
									},
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "none",
											children: t("styleNone")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "first-person",
											children: t("styleFirstPerson")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "rigorous",
											children: t("styleRigorous")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "catgirl",
											children: t("styleCatgirl")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "segmented",
											children: t("styleSegmented")
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
									value: draft.maxSummaryChars ?? 800,
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
									value: draft.chunkChars ?? 300,
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
									value: draft.chunkIntervalMs ?? 4e3,
									onChange: (event) => {
										const parsed = Number(event.target.value);
										if (Number.isFinite(parsed)) set("chunkIntervalMs", parsed);
									}
								})
							}),
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
.dshc-field input[type="checkbox"] { width: 18px; height: 18px; accent-color: var(--dsw-alias-brand-primary); }
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
