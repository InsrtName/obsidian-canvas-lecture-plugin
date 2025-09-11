import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, moment, } from 'obsidian';


// Settings

interface LectureCanvasSettings {
	rootFolder: string; 		// Where lectures are stored
	defaultCourse: string;
	excalidrawCheck: boolean;	// To warn users to enable the Excalidraw plugin
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
		excalidraw: { x: 650, y: 350, width: 800, height: 600 },
		slides: { x: 0, y: 350, width: 600, height: 600 },
		meta: { x: 0, y: 0, width: 1450, height: 300 },
	},
}


// Helpers

// For making lecture names etc. file safe
function slugify(s: string) {
	return s
		.toLowerCase()
		.replace(/[^a-z0-9\- ]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.slice(0, 64);
}

// Generates unique ids for canvas files
function uuid() {
	// Prefer crypto.randomUUID when available
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

		// Course
		new Setting(contentEl)
			.setName("Course")
			.setDesc("e.g., ECE2711")
			.addText((t) =>
				t.setPlaceholder("xx0123").setValue(this.course).onChange((v) => (this.course = v.trim()))
			);

		// Title
		new Setting(contentEl)
			.setName("Lecture title")
			.setDesc("e.g., RL frequency response")
			.addText((t) =>
				t
					.setPlaceholder("Lecture title")
					.setValue(this.title)
					.onChange((v) => (this.title = v.trim()))
			);

		// Date
		new Setting(contentEl)
			.setName("Date")
			.addText((t) =>
				t
					.setPlaceholder("YYYY-MM-DD")
					.setValue(this.dateISO)
					.onChange((v) => (this.dateISO = v))
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


// Canvas creation

async function writeLectureCanvas(opts: {
	app: App;
	settings: LectureCanvasSettings;
	title: string;
	course: string;
	dateISO: string;
}) {
	const { app, settings, title, course, dateISO } = opts;

	// Check for Excalidraw
	const excalidraw = (app as any).plugins?.plugins?.["excalidraw"];
	if (settings.excalidrawCheck && !excalidraw) {
		new Notice(
			"Excalidraw plugin not detected. Enable it or disable this check in settings.",
			6000
		);
	}

	// Folder layout: <root>/<course>/<YYYY-MM-DD> <slug>/
	const folder = `${settings.rootFolder}/${course}/${dateISO} ${slugify(title)}`;
	await ensureFolder(app, folder);

	// Files
	const excalidrawPath = `${folder}/notes.excalidraw.md`;
	await createEmptyFile(app, excalidrawPath);


	const slidesPath = `${folder}/slides.pdf`; // user replaces later

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
		"- Replace **slides.pdf** with your deck.",
		"- Open **notes.excalidraw** for handwriting.",
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
				type: "file",
				file: excalidrawPath,
				...settings.node.excalidraw,
			},
			{
				id: uuid(),
				type: "file",
				file: slidesPath,
				...settings.node.slides,
			},
			{
				id: uuid(),
				type: "text",
				text: `# ${title}\n**Course:** ${course}\n**Date:** ${dateISO}\n\n- Click the Excalidraw node to start handwriting\n- Replace slides.pdf with your deck\n- Metadata: [[${metaPath}]]`,
				...settings.node.meta,
				//color: "1",
			},
		],
		edges: [],
	};

	const canvasName = `${dateISO} ${slugify(title)}.canvas`;
	const canvasPath = `${folder}/${canvasName}`;
	await app.vault.adapter.write(canvasPath, JSON.stringify(CANVAS, null, 2));

	// Open the canvas
	const file = app.vault.getAbstractFileByPath(canvasPath);
	if (file instanceof TFile) {
		const leaf = app.workspace.getLeaf(true);
		await leaf.openFile(file);
	}

	new Notice(`Lecture canvas created: ${canvasPath}`);
}


export default class LectureCanvasPlugin extends Plugin {
	settings: LectureCanvasSettings;

	async onload() {
		await this.loadSettings();

		// Quick create ribbon
		const ribbon = this.addRibbonIcon('presentation', 'Create lecture canvas', (evt: MouseEvent) => {
			this.launchPrompt();
		});
		ribbon.addClass('lecture-canvas-ribbon');

		// Status bar
		const statusBar = this.addStatusBarItem();
		statusBar.setText('Lecture Canvas Ready');

		// Command for creating a lecture canvas
		this.addCommand({
			id: 'lecture-create-canvas',
			name: 'Lecture: Create canvas from template',
			callback: () => this.launchPrompt(),
		});


		// Settings tab
		this.addSettingTab(new LectureSettingTab(this.app, this));
	}

	onunload() {

	}

	private launchPrompt() {
		new LecturePrompt(
			this.app,
			{ course: this.settings.defaultCourse },
			async ({ course, title, dateISO }) => {
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
			}
		).open();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class LectureSettingTab extends PluginSettingTab {
	plugin: LectureCanvasPlugin;

	constructor(app: App, plugin: LectureCanvasPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
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

		const dim = (label: string, obj: { x: number; y: number; width: number; height: number }, onSave: () => Promise<void>) => {
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

		dim("Excalidraw", this.plugin.settings.node.excalidraw, () => this.plugin.saveSettings());
		dim("Slides", this.plugin.settings.node.slides, () => this.plugin.saveSettings());
		dim("Metadata block", this.plugin.settings.node.meta, () => this.plugin.saveSettings());
	}
}
