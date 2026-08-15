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
		* into the Web Client's settings shell (`settings.section` slot) and renders
		* the `cot-summarizer` namespace through the standard settings-scope
		* transport: every field write goes through `scope.set`, lands in the Host
		* settings document, and applies live.
		* @module dsh-cot-summerization/client
		*/
		const NS = "cot-summarizer";
		const en = {
			nav: "CoT Summary",
			settingsTitle: "Chain-of-Thought Summarization",
			settingsIntro: "Hide the model's raw chain of thought and show a small-model summary instead. The raw reasoning never reaches the session log or the UI.",
			enabled: "Enabled",
			baseUrl: "Base URL",
			baseUrlHint: "Any Chat Completions-compatible endpoint.",
			apiKey: "API key",
			apiKeyHint: "Sent as the Authorization bearer for summarizer requests.",
			model: "Summarizer model",
			modelHint: "The \"small model\" that summarizes the raw reasoning.",
			systemPrompt: "Summarization prompt",
			systemPromptHint: "Override the default prompt. {maxSummaryChars} is substituted with the cap below.",
			minReasoningChars: "Minimum reasoning length",
			minReasoningCharsHint: "Raw reasoning shorter than this (in characters) is shown verbatim without an API call.",
			maxSummaryChars: "Summary length cap",
			maxSummaryCharsHint: "Target maximum length of the summary, in characters.",
			timeoutMs: "Request timeout (ms)",
			onError: "On summarizer failure",
			onErrorHide: "Hide reasoning",
			onErrorPassThrough: "Pass raw reasoning through",
			save: "Saved",
			saving: "Saving…",
			loading: "Loading…",
			unavailable: "Settings are unavailable in this connection."
		};
		const zh = {
			nav: "思维链总结",
			settingsTitle: "思维链总结（CoT Summarization）",
			settingsIntro: "隐藏模型的原始思维链，改为展示小模型生成的摘要。原始推理不会进入会话日志或界面。",
			enabled: "启用",
			baseUrl: "接口地址",
			baseUrlHint: "任意兼容 Chat Completions 的接口地址。",
			apiKey: "API 密钥",
			apiKeyHint: "总结请求会以 Bearer 形式携带该密钥。",
			model: "总结模型",
			modelHint: "用于总结原始思维链的“小模型”。",
			systemPrompt: "总结提示词",
			systemPromptHint: "覆盖默认提示词。{maxSummaryChars} 会被替换为下方的长度上限。",
			minReasoningChars: "最短推理长度",
			minReasoningCharsHint: "短于该长度（字符数）的原始思维链直接展示，不调用接口。",
			maxSummaryChars: "摘要长度上限",
			maxSummaryCharsHint: "摘要的目标最大长度（字符数）。",
			timeoutMs: "请求超时（毫秒）",
			onError: "总结失败时",
			onErrorHide: "隐藏思维链",
			onErrorPassThrough: "展示原始思维链",
			save: "已保存",
			saving: "保存中…",
			loading: "加载中…",
			unavailable: "当前连接下设置不可用。"
		};
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
		/** The plugin's settings page bound to the `cot-summarizer` namespace. */
		function SettingsSection({ scope, t }) {
			if (scope === void 0 || t === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "cot-summarizer: inject missing" });
			const snapshot = (0, react.useSyncExternalStore)(scope.subscribe, scope.getSnapshot);
			const [saved, setSaved] = (0, react.useState)();
			const [saving, setSaving] = (0, react.useState)();
			const savedTimer = (0, react.useRef)();
			(0, react.useEffect)(() => () => {
				if (savedTimer.current !== void 0) clearTimeout(savedTimer.current);
			}, []);
			const save = (field, value) => {
				setSaving(field);
				scope.set(field, value).then(() => {
					setSaving(void 0);
					setSaved(field);
					if (savedTimer.current !== void 0) clearTimeout(savedTimer.current);
					savedTimer.current = setTimeout(() => {
						setSaved(void 0);
					}, 1500);
				}).catch(() => {
					setSaving(void 0);
				});
			};
			if (snapshot.status === "loading") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("loading") });
			if (snapshot.status === "unavailable") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("unavailable") });
			const value = snapshot.value ?? {};
			const mark = (field) => {
				if (saving === field) return t("saving");
				if (saved === field) return t("save");
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: "dshc-section",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dshc-head",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("settingsTitle") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("settingsIntro") })]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dshc-grid",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Field, {
							label: t("enabled"),
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "checkbox",
								checked: value.enabled ?? true,
								onChange: (event) => {
									save("enabled", event.target.checked);
								}
							}), mark("enabled") !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dshc-saved",
								children: mark("enabled")
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Field, {
							label: t("baseUrl"),
							hint: t("baseUrlHint"),
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "text",
								defaultValue: value.baseUrl ?? "",
								onBlur: (event) => {
									if (event.target.value.trim() !== "") save("baseUrl", event.target.value.trim());
								}
							}), mark("baseUrl") !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dshc-saved",
								children: mark("baseUrl")
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Field, {
							label: t("apiKey"),
							hint: t("apiKeyHint"),
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "password",
								defaultValue: value.apiKey ?? "",
								onBlur: (event) => {
									if (event.target.value !== "") save("apiKey", event.target.value);
								}
							}), mark("apiKey") !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dshc-saved",
								children: mark("apiKey")
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Field, {
							label: t("model"),
							hint: t("modelHint"),
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "text",
								defaultValue: value.model ?? "",
								onBlur: (event) => {
									if (event.target.value.trim() !== "") save("model", event.target.value.trim());
								}
							}), mark("model") !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dshc-saved",
								children: mark("model")
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Field, {
							label: t("systemPrompt"),
							hint: t("systemPromptHint"),
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
								rows: 5,
								defaultValue: value.systemPrompt ?? "",
								onBlur: (event) => {
									if (event.target.value.trim() !== "") save("systemPrompt", event.target.value);
								}
							}), mark("systemPrompt") !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dshc-saved",
								children: mark("systemPrompt")
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Field, {
							label: t("minReasoningChars"),
							hint: t("minReasoningCharsHint"),
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "number",
								min: 0,
								defaultValue: value.minReasoningChars ?? 32,
								onBlur: (event) => {
									const parsed = Number(event.target.value);
									if (Number.isFinite(parsed) && parsed >= 0) save("minReasoningChars", parsed);
								}
							}), mark("minReasoningChars") !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dshc-saved",
								children: mark("minReasoningChars")
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Field, {
							label: t("maxSummaryChars"),
							hint: t("maxSummaryCharsHint"),
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "number",
								min: 1,
								defaultValue: value.maxSummaryChars ?? 800,
								onBlur: (event) => {
									const parsed = Number(event.target.value);
									if (Number.isFinite(parsed) && parsed >= 1) save("maxSummaryChars", parsed);
								}
							}), mark("maxSummaryChars") !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dshc-saved",
								children: mark("maxSummaryChars")
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Field, {
							label: t("timeoutMs"),
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "number",
								min: 1,
								defaultValue: value.timeoutMs ?? 3e4,
								onBlur: (event) => {
									const parsed = Number(event.target.value);
									if (Number.isFinite(parsed) && parsed >= 1) save("timeoutMs", parsed);
								}
							}), mark("timeoutMs") !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dshc-saved",
								children: mark("timeoutMs")
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Field, {
							label: t("onError"),
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
								defaultValue: value.onError ?? "hide",
								onChange: (event) => {
									save("onError", event.target.value);
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "hide",
									children: t("onErrorHide")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "pass-through",
									children: t("onErrorPassThrough")
								})]
							}), mark("onError") !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dshc-saved",
								children: mark("onError")
							})]
						})
					]
				})]
			});
		}
		const STYLES = `
.dshc-section { padding: 0 4px 12px; }
.dshc-head h3 { margin: 0 0 4px; font-size: 15px; }
.dshc-head p { margin: 0 0 14px; color: var(--ds-text-secondary, #667); font-size: 12px; line-height: 1.5; }
.dshc-grid { display: grid; gap: 14px; }
.dshc-field { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
.dshc-field-label { font-weight: 600; }
.dshc-field input[type="text"], .dshc-field input[type="password"], .dshc-field input[type="number"], .dshc-field select, .dshc-field textarea {
  width: 100%; box-sizing: border-box; padding: 6px 8px; border: 1px solid var(--ds-border, #d4d4d8);
  border-radius: 6px; background: var(--ds-surface, #fff); color: inherit; font: inherit;
}
.dshc-field input[type="checkbox"] { width: 18px; height: 18px; }
.dshc-field-hint { color: var(--ds-text-secondary, #667); font-size: 11px; line-height: 1.4; }
.dshc-saved { color: var(--ds-accent, #4f7cff); font-size: 11px; }
`;
		/** Required services: the slot registry, the locale seat, and the settings transport. */
		const inject = [
			"slots",
			"locale",
			"settingsScope"
		];
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
			const scope = ctx.settingsScope.bind({ namespace: NS });
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "cot-summarizer",
				order: 31,
				label: () => t("nav"),
				inject: () => ({
					scope,
					t
				})
			}, SettingsSection));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
