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
		excalidraw: { x: 0, y: 0, width: 800, height: 600 },
		slides: { x: 0, y: 0, width: 600, height: 600 },
		meta: { x: 0, y: 0, width: 1450, height: 200 },
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
	const excalidrawPath = `${folder}/notes.excalidraw`;
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
				color: "1",
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

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon('dice', 'Sample Plugin', (evt: MouseEvent) => {
			// Called when the user clicks the icon.
			new Notice('This is a notice!');
		});
		// Perform additional things with the ribbon
		ribbonIconEl.addClass('my-plugin-ribbon-class');

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('Status Bar Text');

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'open-sample-modal-simple',
			name: 'Open sample modal (simple)',
			callback: () => {
				new SampleModal(this.app).open();
			}
		});
		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: 'sample-editor-command',
			name: 'Sample editor command',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				console.log(editor.getSelection());
				editor.replaceSelection('Sample Editor Command');
			}
		});
		// This adds a complex command that can check whether the current state of the app allows execution of the command
		this.addCommand({
			id: 'open-sample-modal-complex',
			name: 'Open sample modal (complex)',
			checkCallback: (checking: boolean) => {
				// Conditions to check
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					// If checking is true, we're simply "checking" if the command can be run.
					// If checking is false, then we want to actually perform the operation.
					if (!checking) {
						new SampleModal(this.app).open();
					}

					// This command will only show up in Command Palette when the check function returns true
					return true;
				}
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
			console.log('click', evt);
		});

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Setting #1')
			.setDesc('It\'s a secret')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.mySetting)
				.onChange(async (value) => {
					this.plugin.settings.mySetting = value;
					await this.plugin.saveSettings();
				}));
	}
}
