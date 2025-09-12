import {
	App,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	moment,
} from "obsidian";

// -------------------- Settings --------------------

interface LectureCanvasSettings {
	rootFolder: string;
	defaultCourse: string;
	excalidrawCheck: boolean;
	node: {
		excalidraw: { x: number; y: number; width: number; height: number };
		slides: { x: number; y: number; width: number; height: number };
		meta: { x: number; y: number; width: number; height: number };
	};
}

const DEFAULT_SETTINGS: LectureCanvasSettings = {
	rootFolder: "Lectures",
	defaultCourse: "",
	excalidrawCheck: true,
	node: {
		// tweak these in Settings → Lecture Canvas
		meta: { x: 0, y: 0, width: 1450, height: 300 },
		slides: { x: 0, y: 350, width: 600, height: 600 },
		excalidraw: { x: 650, y: 350, width: 800, height: 600 },
	},
};

// -------------------- Helpers --------------------

function slugify(s: string) {
	return s
		.toLowerCase()
		.replace(/[^a-z0-9\- ]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.slice(0, 64);
}

function uuid() {
	// @ts-ignore
	if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
	return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
		const r = (Math.random() * 16) | 0,
			v = c === "x" ? r : (r & 0x3) | 0x8;
		return v.toString(16);
	});
}

async function ensureFolder(app: App, folderPath: string) {
	const adapter = app.vault.adapter;
	if (!(await adapter.exists(folderPath))) {
		await adapter.mkdir(folderPath);
	}
}

async function createEmptyFile(app: App, path: string): Promise<TFile> {
	const existing = app.vault.getAbstractFileByPath(path);
	if (existing instanceof TFile) return existing;
	return app.vault.create(path, "");
}

// Seed a valid Excalidraw **Markdown** drawing (.excalidraw.md)
async function createExcalidrawMarkdown(
	app: App,
	path: string,
	title: string,
	subtitle: string
): Promise<TFile> {
	const now = Date.now();
	const payload = {
		type: "excalidraw",
		version: 2,
		source: "obsidian-excalidraw-plugin",
		elements: [
			{
				id: uuid(),
				type: "rectangle",
				x: 80,
				y: 60,
				width: 520,
				height: 110,
				angle: 0,
				strokeColor: "#1e1e1e",
				backgroundColor: "#ffd6a5",
				fillStyle: "solid",
				strokeWidth: 1,
				strokeStyle: "solid",
				roughness: 1,
				opacity: 100,
				groupIds: [],
				roundness: { type: 3, value: 8 },
				seed: now & 0x7fffffff,
				version: 1,
				versionNonce: (now + 1) & 0x7fffffff,
				isDeleted: false,
				boundElements: null,
				updated: now,
			},
			{
				id: uuid(),
				type: "text",
				x: 100,
				y: 80,
				width: 480,
				height: 38,
				angle: 0,
				strokeColor: "#000000",
				backgroundColor: "transparent",
				fillStyle: "solid",
				strokeWidth: 1,
				strokeStyle: "solid",
				roughness: 0,
				opacity: 100,
				groupIds: [],
				roundness: null,
				seed: (now + 2) & 0x7fffffff,
				version: 1,
				versionNonce: (now + 3) & 0x7fffffff,
				isDeleted: false,
				boundElements: null,
				updated: now,
				text: `📓 ${title}`,
				fontSize: 32,
				fontFamily: 1,
				textAlign: "left",
				verticalAlign: "top",
				containerId: null,
				originalText: `📓 ${title}`,
				lineHeight: 1.25,
			},
			{
				id: uuid(),
				type: "text",
				x: 100,
				y: 120,
				width: 360,
				height: 28,
				angle: 0,
				strokeColor: "#444444",
				backgroundColor: "transparent",
				fillStyle: "solid",
				strokeWidth: 1,
				strokeStyle: "solid",
				roughness: 0,
				opacity: 100,
				groupIds: [],
				roundness: null,
				seed: (now + 4) & 0x7fffffff,
				version: 1,
				versionNonce: (now + 5) & 0x7fffffff,
				isDeleted: false,
				boundElements: null,
				updated: now,
				text: subtitle,
				fontSize: 22,
				fontFamily: 1,
				textAlign: "left",
				verticalAlign: "top",
				containerId: null,
				originalText: subtitle,
				lineHeight: 1.25,
			},
		],
		appState: {
			gridSize: 20,
			viewBackgroundColor: "#ffffff",
			scrollX: 0,
			scrollY: 0,
			zoom: { value: 1 },
		},
		files: {},
	};

	const md = [
		"---",
		"excalidraw-plugin: parsed",
		"---",
		"",
		"```excalidraw",
		JSON.stringify(payload, null, 2),
		"```",
		"",
	].join("\n");

	const existing = app.vault.getAbstractFileByPath(path);
	if (existing instanceof TFile) {
		await app.vault.modify(existing, md);
		return existing;
	}
	return app.vault.create(path, md);
}
async function createExcalidrawJSON(
	app: App,
	path: string,
	title: string,
	subtitle: string
): Promise<TFile> {
	const now = Date.now();
	const payload = {
		type: "excalidraw",
		version: 2,
		source: "obsidian-excalidraw-plugin",
		elements: [
			{
				id: uuid(), type: "rectangle", x: 80, y: 60,
				width: 520, height: 110, angle: 0,
				strokeColor: "#1e1e1e", backgroundColor: "#ffd6a5",
				fillStyle: "solid", strokeWidth: 1, strokeStyle: "solid",
				roughness: 1, opacity: 100, groupIds: [],
				roundness: { type: 3, value: 8 },
				seed: now & 0x7fffffff, version: 1, versionNonce: (now+1) & 0x7fffffff,
				isDeleted: false, boundElements: null, updated: now
			},
			{
				id: uuid(), type: "text", x: 100, y: 80,
				width: 480, height: 38, angle: 0,
				strokeColor: "#000", backgroundColor: "transparent",
				fillStyle: "solid", strokeWidth: 1, strokeStyle: "solid",
				roughness: 0, opacity: 100, groupIds: [], roundness: null,
				seed: (now+2) & 0x7fffffff, version: 1, versionNonce: (now+3) & 0x7fffffff,
				isDeleted: false, boundElements: null, updated: now,
				text: `📓 ${title}`, fontSize: 32, fontFamily: 1,
				textAlign: "left", verticalAlign: "top", containerId: null,
				originalText: `📓 ${title}`, lineHeight: 1.25
			},
			{
				id: uuid(), type: "text", x: 100, y: 120,
				width: 360, height: 28, angle: 0,
				strokeColor: "#444", backgroundColor: "transparent",
				fillStyle: "solid", strokeWidth: 1, strokeStyle: "solid",
				roughness: 0, opacity: 100, groupIds: [], roundness: null,
				seed: (now+4) & 0x7fffffff, version: 1, versionNonce: (now+5) & 0x7fffffff,
				isDeleted: false, boundElements: null, updated: now,
				text: subtitle, fontSize: 22, fontFamily: 1,
				textAlign: "left", verticalAlign: "top", containerId: null,
				originalText: subtitle, lineHeight: 1.25
			}
		],
		appState: { gridSize: 20, viewBackgroundColor: "#ffffff", scrollX: 0, scrollY: 0, zoom: { value: 1 } },
		files: {}
	};

	const json = JSON.stringify(payload, null, 2);
	const existing = app.vault.getAbstractFileByPath(path);
	if (existing instanceof TFile) { await app.vault.modify(existing, json); return existing; }
	return app.vault.create(path, json);
}

// -------------------- Prompt --------------------

class LecturePrompt extends Modal {
	course: string;
	title = "";
	dateISO = moment().format("YYYY-MM-DD");
	onSubmit: (vals: { course: string; title: string; dateISO: string }) => void;

	constructor(app: App, defaults: { course: string }, onSubmit: LecturePrompt["onSubmit"]) {
		super(app);
		this.course = defaults.course ?? "";
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "Create lecture canvas" });

		new Setting(contentEl)
			.setName("Course")
			.setDesc("e.g., ECE2711")
			.addText((t) => t.setPlaceholder("xx0123").setValue(this.course).onChange((v) => (this.course = v.trim())));

		new Setting(contentEl)
			.setName("Lecture title")
			.setDesc("e.g., RL frequency response")
			.addText((t) =>
				t.setPlaceholder("Lecture title").setValue(this.title).onChange((v) => (this.title = v.trim()))
			);

		new Setting(contentEl)
			.setName("Date")
			.addText((t) =>
				t.setPlaceholder("YYYY-MM-DD").setValue(this.dateISO).onChange((v) => (this.dateISO = v))
			);

		const submit = contentEl.createEl("button", { text: "Create" });
		submit.addClass("mod-cta");
		submit.onclick = () => {
			if (!this.title) return new Notice("Please enter a lecture title");
			if (!this.course) return new Notice("Please enter a course");
			this.close();
			this.onSubmit({ course: this.course, title: this.title, dateISO: this.dateISO });
		};
	}

	onClose() {
		this.contentEl.empty();
	}
}

async function clickExcalidrawButtons(app: App, filePath: string) {
	const file = app.vault.getAbstractFileByPath(filePath);
	if (!(file instanceof TFile)) return;

	// Open the file in a leaf so commands have context
	const leaf = app.workspace.getLeaf(true);
	await leaf.openFile(file);
	app.workspace.setActiveLeaf(leaf, true);

	// discover Excalidraw commands by name (IDs can change across versions)
	const all = ((app as any).commands?.listCommands?.() ?? []) as Array<{ id: string; name: string }>;
	const pick = (re: RegExp) =>
		all.find(c => c.id.startsWith("obsidian-excalidraw-plugin") && re.test(c.name.toLowerCase()));

	// 1) "Convert to new format"
	const convertCmd = pick(/convert.+new format/);
	if (convertCmd) {
		await (app as any).commands.executeCommandById(convertCmd.id);
		// give Excalidraw a tick to finish renaming to .excalidraw.md
		await new Promise(r => setTimeout(r, 100));
	}

	// 2) "Open as Excalidraw drawing" (wording may differ a bit)
	const openCmd =
		pick(/open as excalidraw drawing/) ||
		pick(/convert markdown note to excalidraw drawing/) ||
		pick(/open existing drawing.*current active pane/);

	if (openCmd) {
		await (app as any).commands.executeCommandById(openCmd.id);
	} else {
		// Fallback: open the converted file directly in Excalidraw view
		const mdPath = filePath.endsWith(".excalidraw") ? `${filePath}.md` : filePath;
		const converted = app.vault.getAbstractFileByPath(mdPath);
		if (converted instanceof TFile) {
			await leaf.setViewState({ type: "excalidraw", state: { file: mdPath } });
			app.workspace.revealLeaf(leaf);
		}
	}
}


// -------------------- Canvas creation --------------------

async function writeLectureCanvas(opts: {
	app: App;
	settings: LectureCanvasSettings;
	title: string;
	course: string;
	dateISO: string;
}) {
	const { app, settings, title, course, dateISO } = opts;

	// Check for Excalidraw (correct plugin ID; cast to any to satisfy TS)
	const isExcalidrawEnabled = (app as any).plugins?.enabledPlugins?.has("obsidian-excalidraw-plugin");
	if (settings.excalidrawCheck && !isExcalidrawEnabled) {
		new Notice("Excalidraw plugin not detected. Enable it or disable this check in settings.", 6000);
	}

	// Folder: <root>/<course>/<YYYY-MM-DD> <slug>/
	const folder = `${settings.rootFolder}/${course}/${dateISO} ${slugify(title)}`;
	await ensureFolder(app, folder);

	// Files
	const excalidrawPath = `${folder}/notes.excalidraw`;
	await createExcalidrawJSON(app, excalidrawPath, `${course} — ${title}`, `Date: ${dateISO}`);

	await clickExcalidrawButtons(app, excalidrawPath);

	// Slides placeholder (avoid "file not found" red box)
	const slidesPlaceholderPath = `${folder}/slides.md`;
	await app.vault.adapter.write(
		slidesPlaceholderPath,
		[
			"# Slides placeholder",
			"",
			"Right-click this node on the Canvas → **Swap file…** → choose your `slides.pdf`.",
			"",
			"> Tip: keep the filename **slides.pdf** in this folder for consistency.",
		].join("\n")
	);

	// Meta note
	const metaPath = `${folder}/_meta.md`;
	const metaContent = [
		"---",
		`title: ${title}`,
		`course: ${course}`,
		`date: ${dateISO}`,
		`tags: [course/${course}]`,
		"---",
		"",
		"# Lecture notes",
		"",
		"- Swap **slides.md** to **slides.pdf** when available.",
		"- Open **notes.excalidraw.md** for handwriting.",
		"",
	].join("\n");
	await app.vault.adapter.write(metaPath, metaContent);

	// Canvas JSON
	const CANVAS = {
		type: "canvas",
		version: "1.3.4",
		nodes: [
			{
				id: uuid(),
				type: "text",
				text: `# ${title}\n**Course:** ${course}\n**Date:** ${dateISO}\n\n- Click the Excalidraw node to start handwriting\n- Swap slides.md → slides.pdf when you have it\n- Metadata: [[${metaPath}]]`,
				...settings.node.meta,
			},
			{
				id: uuid(),
				type: "file",
				file: excalidrawPath, // .excalidraw.md works in Canvas (renders via plugin)
				...settings.node.excalidraw,
			},
			{
				id: uuid(),
				type: "file",
				file: slidesPlaceholderPath, // placeholder (swap later)
				...settings.node.slides,
			},
		],
		edges: [],
	};

	const canvasName = `${dateISO} ${slugify(title)}.canvas`;
	const canvasPath = `${folder}/${canvasName}`;
	await app.vault.adapter.write(canvasPath, JSON.stringify(CANVAS, null, 2));

	// Open the canvas
	const canvasFile = app.vault.getAbstractFileByPath(canvasPath);
	if (canvasFile instanceof TFile) {
		const leaf = app.workspace.getLeaf(true);
		await leaf.openFile(canvasFile);
	}

	new Notice(`Lecture canvas created: ${canvasPath}`);
}

// -------------------- Plugin class --------------------

export default class LectureCanvasPlugin extends Plugin {
	settings: LectureCanvasSettings;

	async onload() {
		await this.loadSettings();

		// Ribbon
		const ribbon = this.addRibbonIcon("presentation", "Create lecture canvas", () => this.launchPrompt());
		ribbon.addClass("lecture-canvas-ribbon");

		// Status bar
		const statusBar = this.addStatusBarItem();
		statusBar.setText("Lecture Canvas Ready");

		// Command
		this.addCommand({
			id: "lecture-create-canvas",
			name: "Lecture: Create canvas from template",
			callback: () => this.launchPrompt(),
		});

		// Settings tab
		this.addSettingTab(new LectureSettingTab(this.app, this));
	}

	private launchPrompt() {
		new LecturePrompt(this.app, { course: this.settings.defaultCourse }, async ({ course, title, dateISO }) => {
			try {
				await writeLectureCanvas({
					app: this.app,
					settings: this.settings,
					title,
					course,
					dateISO,
				});
			} catch (e) {
				console.error(e);
				new Notice("Failed to create lecture canvas.");
			}
		}).open();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

// -------------------- Settings UI --------------------

class LectureSettingTab extends PluginSettingTab {
	plugin: LectureCanvasPlugin;

	constructor(app: App, plugin: LectureCanvasPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h2", { text: "Lecture Canvas Settings" });

		new Setting(containerEl)
			.setName("Root folder")
			.setDesc("Lectures will be created under this path")
			.addText((t) =>
				t
					.setPlaceholder("Lectures")
					.setValue(this.plugin.settings.rootFolder)
					.onChange(async (v) => {
						this.plugin.settings.rootFolder = v.trim() || "Lectures";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Default course")
			.setDesc("Optional course code prefilled in the prompt")
			.addText((t) =>
				t
					.setPlaceholder("ECE2711")
					.setValue(this.plugin.settings.defaultCourse)
					.onChange(async (v) => {
						this.plugin.settings.defaultCourse = v.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Require Excalidraw")
			.setDesc("Warn if Excalidraw plugin isn’t enabled")
			.addToggle((tg) =>
				tg.setValue(this.plugin.settings.excalidrawCheck).onChange(async (v) => {
					this.plugin.settings.excalidrawCheck = v;
					await this.plugin.saveSettings();
				})
			);

		containerEl.createEl("h3", { text: "Canvas Node Layout" });

		const dim = (
			label: string,
			obj: { x: number; y: number; width: number; height: number },
			onSave: () => Promise<void>
		) => {
			const wrap = containerEl.createEl("div", { cls: "lecture-dims" });
			wrap.createEl("div", { text: label, attr: { style: "font-weight:600;margin-top:8px;" } });

			const mkNum = (name: keyof typeof obj) =>
				new Setting(wrap)
					.setName(name.toString())
					.addText((t) =>
						t
							.setPlaceholder(obj[name].toString())
							.setValue(String(obj[name]))
							.onChange(async (v) => {
								const n = Number(v);
								if (!Number.isNaN(n)) (obj as any)[name] = n;
								await onSave();
							})
					);

			mkNum("x");
			mkNum("y");
			mkNum("width");
			mkNum("height");
		};

		dim("Metadata block", this.plugin.settings.node.meta, () => this.plugin.saveSettings());
		dim("Slides", this.plugin.settings.node.slides, () => this.plugin.saveSettings());
		dim("Excalidraw", this.plugin.settings.node.excalidraw, () => this.plugin.saveSettings());
	}
}
