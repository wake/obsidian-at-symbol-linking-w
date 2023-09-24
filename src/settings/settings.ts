import {
	App,
	ButtonComponent,
	Notice,
	PluginSettingTab,
	Setting,
} from "obsidian";
import AtSymbolLinking from "src/main";
import { FolderSuggest } from "./folder-suggest";
import { FileSuggest } from "./file-suggest";

export interface AtSymbolLinkingSettings {
	limitLinkDirectories: Array<string>;
  limitLinkDirectoryOptions: Array<{symbol: string, fullpath: boolean}>;
	includeSymbol: boolean;

	showAddNewNote: boolean;
	addNewNoteTemplateFile: string;
	addNewNoteDirectory: string;

	useCompatibilityMode: boolean;
	leavePopupOpenForXSpaces: number;
}

export const DEFAULT_SETTINGS: AtSymbolLinkingSettings = {
	limitLinkDirectories: [],
  limitLinkDirectoryOptions: [],
	includeSymbol: true,

	showAddNewNote: false,
	addNewNoteTemplateFile: "",
	addNewNoteDirectory: "",

	useCompatibilityMode: false,
	leavePopupOpenForXSpaces: 0,
};

const arrayMove = <T>(array: T[], fromIndex: number, toIndex: number): void => {
	if (toIndex < 0 || toIndex === array.length) {
		return;
	}
	const temp = array[fromIndex];
	array[fromIndex] = array[toIndex];
	array[toIndex] = temp;
};

export class SettingsTab extends PluginSettingTab {
	plugin: AtSymbolLinking;

	constructor(app: App, plugin: AtSymbolLinking) {
		super(app, plugin);
		this.plugin = plugin;
	}

	// On close, reload the plugin
	hide() {
		this.plugin.reloadPlugin();
	}

	display(): void {
		this.containerEl.empty();

		this.containerEl.appendChild(
			createHeading(this.containerEl, "At Symbol (@) Linking Settings (W)")
		);

		// Begin includeSymbol option: Determine whether to include @ symbol in link
		const includeSymbolDesc = document.createDocumentFragment();
		includeSymbolDesc.append(
			"Include the @ symbol prefixing the final link text",
			includeSymbolDesc.createEl("br"),
			includeSymbolDesc.createEl("em", {
				text: `E.g. [${
					this.plugin.settings.includeSymbol ? "@" : ""
				}evan](./evan)`,
			})
		);
		new Setting(this.containerEl)
			.setName("Include @ symbol")
			.setDesc(includeSymbolDesc)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.includeSymbol)
					.onChange((value: boolean) => {
						this.plugin.settings.includeSymbol = value;
						this.plugin.saveSettings();
						this.display();
					})
			);
		// End includeSymbol option

		// Begin limitLinksToFolders option: limit which folders links are sourced from
		const ruleDesc = document.createDocumentFragment();
		ruleDesc.append(
			"@ linking will only source links from the following folders.",
			ruleDesc.createEl("br"),
			"For example, you might only want contacts in the Contacts/ folder to be linked when you type @.",
			ruleDesc.createEl("br"),
			ruleDesc.createEl("em", {
				text: "If no folders are added, links will be sourced from all folders.",
			})
		);

		new Setting(this.containerEl)
			.setName("Limit links to folders")
			.setDesc(ruleDesc)
			.addButton((button: ButtonComponent) => {
				button
					.setTooltip("Add limit folder")
					.setButtonText("+")
					.setCta()
					.onClick(async () => {
						this.plugin.settings.limitLinkDirectories.push("");
            this.plugin.settings.limitLinkDirectoryOptions.push({symbol: '', fullpath: false});
						await this.plugin.saveSettings();
						return this.display();
					});
			});

		this.plugin.settings.limitLinkDirectories.forEach(
			(directory, index) => {
        const fullpath = this.plugin.settings.limitLinkDirectoryOptions[index]?.fullpath ?? false;
				const newDirectorySetting = new Setting(this.containerEl)
					.setClass("at-symbol-linking-folder-container")
          .addText((text) => {
            text.setPlaceholder("@ (Triger Symbol)")
              .setValue(
                this.plugin.settings.limitLinkDirectoryOptions[index]?.symbol?.toString()
              )
              .onChange(async (value) => {
                this.plugin.settings.limitLinkDirectoryOptions[index].symbol = value;
                await this.plugin.saveSettings();
              });
            text.inputEl.onblur = () => {
              this.validate();
            };
          })
					.addSearch((cb) => {
						new FolderSuggest(this.app, cb.inputEl);
						cb.setPlaceholder("Folder")
							.setValue(directory)
							.onChange(async (newFolder) => {
								this.plugin.settings.limitLinkDirectories[
									index
								] = newFolder.trim();
								await this.plugin.saveSettings();
							});
						cb.inputEl.onblur = () => {
							this.validate();
						};
					})
					.addExtraButton((cb) => {
						cb.setIcon("up-chevron-glyph")
							.setTooltip("Move up")
							.onClick(async () => {
								arrayMove(
									this.plugin.settings.limitLinkDirectories,
									index,
									index - 1
								);
								arrayMove(
									this.plugin.settings.limitLinkDirectoryOptions,
									index,
									index - 1
								);
								await this.plugin.saveSettings();
								this.display();
							});
					})
					.addExtraButton((cb) => {
						cb.setIcon("down-chevron-glyph")
							.setTooltip("Move down")
							.onClick(async () => {
								arrayMove(
									this.plugin.settings.limitLinkDirectories,
									index,
									index + 1
								);
								arrayMove(
									this.plugin.settings.limitLinkDirectoryOptions,
									index,
									index + 1
								);
								await this.plugin.saveSettings();
								this.display();
							});
					})
					.addExtraButton((cb) => {
						cb.setIcon("cross")
							.setTooltip("Delete")
							.onClick(async () => {
								this.plugin.settings.limitLinkDirectories.splice(
									index,
									1
								);
								this.plugin.settings.limitLinkDirectoryOptions.splice(
									index,
									1
								);
								await this.plugin.saveSettings();
								this.display();
							});
					})
          .addToggle((toggle) =>
            toggle
              .setValue(fullpath)
              .setTooltip("Display fullpath in link text")
              .onChange(async (value: boolean) => {
                this.plugin.settings.limitLinkDirectoryOptions[index] = this.plugin.settings.limitLinkDirectoryOptions[index] ?? {symbol: '', fullpath: false};
                this.plugin.settings.limitLinkDirectoryOptions[index].fullpath = value;
                await this.plugin.saveSettings();
                this.display();
              })
          );
  
				newDirectorySetting.controlEl.addClass(
					"at-symbol-linking-folder-setting"
				);
				newDirectorySetting.infoEl.remove();
			}
		);
		// End limitLinksToFolders option

		new Setting(this.containerEl).setName("Add new note").setHeading();

		// Begin add new note option
		new Setting(this.containerEl)
			.setName("Add new note if it doesn't exist")
			.setDesc(
				"If the note doesn't exist when @ linking, add an option to create the note."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showAddNewNote)
					.onChange((value: boolean) => {
						this.plugin.settings.showAddNewNote = value;
						this.plugin.saveSettings();
						this.display();
					})
			);
		// End add new note option

		if (this.plugin.settings.showAddNewNote) {
			// Begin add new note template folder
			const newNoteTemplateDesc = document.createDocumentFragment();
			newNoteTemplateDesc.append(
				"Template to use when creating a new note from @ link.",
				newNoteTemplateDesc.createEl("br"),
				"Uses formats from the ",
				newNoteTemplateDesc.createEl("a", {
					text: "core templates plugin",
					href: "https://help.obsidian.md/Plugins/Templates",
				}),
				" to replace the following variables in the template:",
				newNoteTemplateDesc.createEl("br"),
				newNoteTemplateDesc.createEl("code", {
					text: "{{title}}",
				}),
				" - The title of the new file",
				newNoteTemplateDesc.createEl("br"),
				newNoteTemplateDesc.createEl("code", {
					text: "{{date}}",
				}),
				" - The current date",
				newNoteTemplateDesc.createEl("br"),
				newNoteTemplateDesc.createEl("code", {
					text: "{{time}}",
				}),
				" - The current time"
			);
			new Setting(this.containerEl)
				.setName("Add new note template")
				.setDesc(newNoteTemplateDesc)
				.addSearch((cb) => {
					new FileSuggest(this.app, cb.inputEl);
					cb.setPlaceholder("No template (blank note)")
						.setValue(this.plugin.settings.addNewNoteTemplateFile)
						.onChange(async (newFile) => {
							this.plugin.settings.addNewNoteTemplateFile =
								newFile.trim();
							await this.plugin.saveSettings();
						});
					cb.inputEl.onblur = () => {
						this.validate();
					};
				});
			// End add new note template folder

			// Begin add new note directory
			new Setting(this.containerEl)
				.setName("Add new note folder")
				.setDesc("Folder to create new notes in when using @ linking.")
				.addSearch((cb) => {
					new FolderSuggest(this.app, cb.inputEl);
					cb.setPlaceholder("No folder (root)")
						.setValue(this.plugin.settings.addNewNoteDirectory)
						.onChange(async (newFolder) => {
							this.plugin.settings.addNewNoteDirectory =
								newFolder.trim();
							await this.plugin.saveSettings();
						});
					cb.inputEl.onblur = () => {
						this.validate();
					};
				});
			// End add new note directory
		}

		new Setting(this.containerEl)
			.setName("Suggestion popup behavior")
			.setHeading();

		// Begin useCompatibilityMode option
		const useCompatibilityModeDesc = document.createDocumentFragment();
		useCompatibilityModeDesc.append(
			useCompatibilityModeDesc.createEl("br"),
			"Renders an HTML popup in place of the native Obsidian popup.",
			useCompatibilityModeDesc.createEl("br"),
			"Useful if you other plugins are interfering with the popup (e.g. the Tasks plugin).",
			useCompatibilityModeDesc.createEl("br"),
			useCompatibilityModeDesc.createEl("em", {
				text: "May be slower than the native popup.",
			})
		);
		new Setting(this.containerEl)
			.setName("Use compatibility mode")
			.setDesc(useCompatibilityModeDesc)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.useCompatibilityMode)
					.onChange((value: boolean) => {
						this.plugin.settings.useCompatibilityMode = value;
						this.plugin.saveSettings();
						this.plugin.registerPopup();
						this.display();
					})
			);
		// End useCompatibilityMode option

		// Begin leavePopupOpenForXSpaces option
		const leavePopupOpenDesc = document.createDocumentFragment();
		leavePopupOpenDesc.append(
			`When @ linking, you might want to type a full name e.g. "Brandon Sanderson" without the popup closing.`,
			leavePopupOpenDesc.createEl("br"),
			leavePopupOpenDesc.createEl("em", {
				text: "When set above 0, you'll need to press escape, return/enter, or type over X spaces to close the popup.",
			})
		);
		new Setting(this.containerEl)
			.setName("Leave popup open for X spaces")
			.setDesc(leavePopupOpenDesc)
			.addText((text) => {
				text.setPlaceholder("0")
					.setValue(
						this.plugin.settings.leavePopupOpenForXSpaces?.toString()
					)
					.onChange(async (value) => {
						this.plugin.settings.leavePopupOpenForXSpaces =
							parseInt(value, 10);
						await this.plugin.saveSettings();
					});
				text.inputEl.onblur = () => {
					this.validate();
				};
			});
		// End leavePopupOpenForXSpaces option
	}

	async validate() {
		const settings = this.plugin.settings;
		const updateSetting = async (
			setting: keyof AtSymbolLinkingSettings,
			value: any
		) => {
			// @ts-expect-error update setting with any
			this.plugin.settings[setting] = value;
			await this.plugin.saveSettings();
			return this.display();
		};

		for (let i = 0; i < settings.limitLinkDirectories.length; i++) {
			const folder = settings.limitLinkDirectories[i];
			if (folder === "") {
				continue;
			}
			const folderFile = this.app.vault.getAbstractFileByPath(folder);
			if (!folderFile) {
				new Notice(
					`Unable to find folder at path: ${folder}. Please add it if you want to limit links to this folder.`
				);
				const newFolders = [...settings.limitLinkDirectories];
				newFolders[i] = "";
				await updateSetting("limitLinkDirectories", newFolders);
			}
		}

		if (settings.showAddNewNote && settings.addNewNoteTemplateFile) {
			const templateFile = this.app.vault.getAbstractFileByPath(
				`${settings.addNewNoteTemplateFile}.md`
			);
			if (!templateFile) {
				new Notice(
					`Unable to find template file at path: ${settings.addNewNoteTemplateFile}.md`
				);
				await updateSetting("addNewNoteTemplateFile", "");
			}
		}

		if (settings.showAddNewNote && settings.addNewNoteDirectory) {
			const templateFile = this.app.vault.getAbstractFileByPath(
				`${settings.addNewNoteDirectory}`
			);
			if (!templateFile) {
				new Notice(
					`Unable to find folder for new notes at path: ${settings.addNewNoteDirectory}. Please add it if you want to create new notes in this folder.`
				);
				await updateSetting("addNewNoteDirectory", "");
			}
		}

		if (
			isNaN(parseInt(settings.leavePopupOpenForXSpaces.toString())) ||
			settings.leavePopupOpenForXSpaces < 0
		) {
			await updateSetting("leavePopupOpenForXSpaces", 0);
		}
	}
}

function createHeading(el: HTMLElement, text: string, level = 2) {
	const heading = el.createEl(`h${level}` as keyof HTMLElementTagNameMap, {
		text,
	});
	return heading;
}
