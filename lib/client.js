window.__ModuleLoader__.load({
	id: "dsh-cot-summerization",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		require("react");
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
			const Dummy = () => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "cot: dummy rendered" });
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "cot-summarizer",
				order: 31,
				label: () => t("nav"),
				inject: () => ({
					scope,
					t
				})
			}, Dummy));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
