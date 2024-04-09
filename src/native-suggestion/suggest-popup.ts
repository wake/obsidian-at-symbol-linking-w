import {
	App,
	Editor,
	EditorPosition,
	EditorSuggest,
	EditorSuggestContext,
	EditorSuggestTriggerInfo,
	Notice,
	TFile,
	setIcon,
} from "obsidian";
import { syntaxTree } from "@codemirror/language";
import fuzzysort from "fuzzysort";
import { AtSymbolLinkingSettings } from "src/settings/settings";
import { highlightSearch } from "../utils/highlight-search";
import { fileOption } from "src/types";
import { replaceNewFileVars } from "src/utils/replace-new-file-vars";
import { fileNameNoExtension } from "src/utils/path";

export default class SuggestionPopup extends EditorSuggest<
	Fuzzysort.KeysResult<fileOption>
> {
	private readonly settings: AtSymbolLinkingSettings;

	private firstOpenedCursor: null | EditorPosition = null;
	private focused = false;
	private app: App;
	public name = "@ Symbol Linking Suggest";
  private activeSymbol = '@';

	constructor(app: App, settings: AtSymbolLinkingSettings) {
		super(app);
		this.app = app;
		this.settings = settings;

		//Remove default key registrations
		const self = this as any;
		self.scope.keys = [];
	}

	open() {
		super.open();
		this.focused = true;
	}

	close() {
		super.close();
		this.focused = false;
	}

	getSuggestions(
		context: EditorSuggestContext
	): Fuzzysort.KeysResult<fileOption>[] {
		const options: fileOption[] = [];
		for (const file of context.file.vault.getMarkdownFiles()) {

      let isFullpath = false;
      const fullpath = file.path.slice(0, -file.extension.length - 1);

      // If there are folders to limit links to, check if the file is in one of them
			if (this.settings.limitLinkDirectories.length > 0) {
				let isAllowed = false;
				for (const [, option] of this.settings.limitLinkDirectories.entries()) {

          if (option.folder === '') continue;

          const symbol = option.symbol || '@';

          if (symbol !== this.activeSymbol) continue;

					if (file.path.startsWith(option.folder)) {
						isAllowed = true;
            isFullpath = option.fullpath || false;
						break;
					}
				}
				if (!isAllowed) {
					continue;
				}
			}
      const meta = app.metadataCache.getFileCache(file);
			if (meta?.frontmatter?.alias) {
				options.push({
					fileName: !isFullpath ? file.basename : fullpath,
					filePath: file.path,
					alias: meta.frontmatter.alias,
				});
			} else if (meta?.frontmatter?.aliases) {
				let aliases = meta.frontmatter.aliases;
				if (typeof meta.frontmatter.aliases === "string") {
					aliases = meta.frontmatter.aliases
						.split(",")
						.map((s) => s.trim());
				}
				for (const alias of aliases) {
					options.push({
						fileName: !isFullpath ? file.basename : fullpath,
						filePath: file.path,
						alias: alias,
					});
				}
			}
			// Include fileName without alias as well
			options.push({
				fileName: !isFullpath ? file.basename : fullpath,
				filePath: file.path,
			});
		}

		// Show all files when no query
		let results = [];
		if (!context.query) {
			results = options
				.map((option) => ({
					obj: option,
				}))
				// Reverse because filesystem is sorted alphabetically
				.reverse();
		} else {
			// Fuzzy search files based on query
			results = fuzzysort.go(context.query, options, {
				keys: ["alias", "fileName"],
			}) as any;
		}

		// If showAddNewNote option is enabled, show it as the last option
		if (this.settings.showAddNewNote && context.query) {
			// Don't show if it has the same filename as an existing note
			const hasExistingNote = results.some(
				(result: Fuzzysort.KeysResult<fileOption>) =>
					result?.obj?.fileName.toLowerCase() ===
					context.query?.toLowerCase()
			);
			if (!hasExistingNote) {
				results = results.filter(
					(result: Fuzzysort.KeysResult<fileOption>) =>
						!result.obj?.isCreateNewOption
				);
				const separator = this.settings.addNewNoteDirectory ? "/" : "";
				results.push({
					obj: {
						isCreateNewOption: true,
						query: context.query,
						fileName: "Create new note",
						filePath: `${this.settings.addNewNoteDirectory.trim()}${separator}${context.query.trim()}.md`,
					},
				});
			}
		}

		return results;
	}

	onTrigger(
		cursor: EditorPosition,
		editor: Editor
	): EditorSuggestTriggerInfo | null {

    let query = "";

    const symbols = this.settings.limitLinkDirectories?.map(option => (option.symbol || '@')) || ['@'];
    const maxSymbolLength = Math.max(...symbols.map(symbol => symbol.length));

    const catchedChars = editor.getRange(
			{ ...cursor, ch: cursor.ch - maxSymbolLength },
			{ ...cursor, ch: cursor.ch }
		);

    const typedChar = catchedChars.length > 0 ? catchedChars.charAt(catchedChars.length - 1) : "\n";

		// When open and user enters newline or tab, close
		if (
			this.firstOpenedCursor &&
			(typedChar === "\n" || typedChar === "\t")
		) {
			return this.closeSuggestion();
		}

		// If user's cursor is inside a code block, don't attempt to link
		let isInCodeBlock = false;
		if ((editor as any)?.cm) {
			const cm = (editor as any).cm;
			const cursor = cm.state?.selection?.main as {
				from: number;
				to: number;
			};
			syntaxTree(cm.state).iterate({
				from: cursor.from,
				to: cursor.to,
				enter(node) {
					if (
						node.type.name === "inline-code" ||
						node.type.name?.includes("codeblock")
					) {
						isInCodeBlock = true;
					}
				},
			});
		}

		// If already open, allow backticks to be part of file name
		if (isInCodeBlock && !this.firstOpenedCursor) {
			return null;
		}

    const matchedSymbol = symbols.find(symbol => 
      symbol === catchedChars.slice(-symbol.length)
    );

    const matchedSymbolLength = matchedSymbol ? matchedSymbol.length : 1;

    if (!this.firstOpenedCursor)
      this.activeSymbol = matchedSymbol || '@';

    // Open suggestion when @ is typed
    if (matchedSymbol) {
			this.firstOpenedCursor = cursor;
			return {
				start: { ...cursor, ch: cursor.ch - matchedSymbolLength },
				end: cursor,
				query,
			};
		}

		// Don't continue evaluating if not opened
		if (!this.firstOpenedCursor) {
			return null;
		} else {
			query = editor.getRange(this.firstOpenedCursor, {
				...cursor,
				ch: cursor.ch + 1,
			});
		}

		// If query has more spaces alloted by the leavePopupOpenForXSpaces setting, close
		if (
			query.split(" ").length - 1 >
				this.settings.leavePopupOpenForXSpaces ||
			// Also close if query starts with a space, regardless of space settings
			query.startsWith(" ")
		) {
			return this.closeSuggestion();
		}

		// If query is empty or doesn't have valid filename characters, close
		if (
			!query || (

        // Mandarin Chinese & Simplified Chinese
        !/[\u4e00-\u9fff]|[\u3100-\u312F]/i.test(query)

        // Emoji
        && !/\p{Extended_Pictographic}/u.test(query)

        // Fullwidth Forms
        && !/[\u4E00-\u9FFF]|[\u3000-\u303F]|[\u2200-\u22FF]|[\uFF00-\uFFEF]/i.test(query)

        // Japanese
        && !/[\u3040-\u309F]|[\u30A0-\u30FF]|[\u4E00-\u9FFF]/i.test(query)

        // Korean
        && !/[\uAC00-\uD7AF]|[\u1100-\u11FF]/i.test(query)

        // Other valid filename characters
        && !/[a-z0-9\\$\\-\\_\\!\\%\\"\\'\\.\\,\\*\\&\\(\\)\\;\\{\\}\\+\\=\\~\\`\\?)]/i.test(query)
      )
		) {
			return this.closeSuggestion();
		}

		return {
			start: { ...cursor, ch: cursor.ch - matchedSymbolLength },
			end: cursor,
			query,
		};
	}

	renderSuggestion(
		value: Fuzzysort.KeysResult<fileOption>,
		el: HTMLElement
	): void {
		el.addClass("at-symbol-linking-suggestion");
		const context = el.doc.createElement("div");
		context.addClass("suggestion-context");

		// Add title with matching search terms bolded (highlighted)
		const title = el.doc.createElement("div");
		title.addClass("suggestion-title");
		if (value[0]) {
			highlightSearch(title, value[0]);
		} else if (value.obj?.alias) {
			title.setText(value.obj?.alias);
		} else if (value[1]) {
			highlightSearch(title, value[1]);
		} else if (value.obj?.fileName) {
			title.setText(value.obj?.fileName);
		} else {
			title.setText("");
		}

		const path = el.doc.createElement("div");
		path.addClass("suggestion-path");
		path.setText(value.obj?.filePath?.slice(0, -3));

		context.appendChild(title);
		context.appendChild(path);

		const aux = el.doc.createElement("div");
		aux.addClass("suggestion-aux");

		if (value?.obj?.alias) {
			const alias = el.doc.createElement("span");
			alias.addClass("suggestion-flair");
			alias.ariaLabel = "Alias";
			setIcon(alias, "forward");
			aux.appendChild(alias);
		}

		el.appendChild(context);
		el.appendChild(aux);
	}

	async selectSuggestion(
		value: Fuzzysort.KeysResult<fileOption>
	): Promise<void> {
		const line =
			this.context?.editor.getRange(
				{
					line: this.context.start.line,
					ch: 0,
				},
				this.context.end
			) || "";

		// When user selects "Create new note" option, create the note to link to
		let linkFile;
		if (value?.obj?.isCreateNewOption) {
			let newNoteContents = "";
			if (this.settings.addNewNoteTemplateFile) {
				const fileTemplate = this.app.vault.getAbstractFileByPath(
					`${this.settings.addNewNoteTemplateFile}.md`
				) as TFile;
				newNoteContents =
					(await this.app.vault.read(fileTemplate)) || "";
				// Use core template settings to replace variables: {{title}}, {{date}}, {{time}}
				newNoteContents = await replaceNewFileVars(
					this.app,
					newNoteContents,
					fileNameNoExtension(value.obj?.filePath)
				);
			}

			try {
				linkFile = await this.app.vault.create(
					value.obj?.filePath,
					newNoteContents
				);
				// Update the alias to the name for displaying the @ link
				value.obj.alias = value.obj?.query;
			} catch (error) {
				new Notice(
					`Unable to create new note at path: ${value.obj?.filePath}. Please open an issue on GitHub, https://github.com/Ebonsignori/obsidian-at-symbol-linking/issues`,
					0
				);
				throw error;
			}
		}

		const currentFile = this.app.workspace.getActiveFile();
		if (!linkFile) {
			linkFile = this.app.vault.getAbstractFileByPath(
				value.obj?.filePath
			) as TFile;
		}
		let alias = value.obj?.alias || value.obj?.fileName;
		if (this.settings.includeSymbol) alias = `${this.activeSymbol}${alias}`;
		let linkText = this.app.fileManager.generateMarkdownLink(
			linkFile,
			currentFile?.path || "",
			undefined, // we don't care about the subpath
			alias
		);

		if (linkText.includes("\n")) {
			linkText = linkText.replace(/\n/g, "");
		}

		this.context?.editor.replaceRange(
			linkText,
			{ line: this.context.start.line, ch: line.lastIndexOf(this.activeSymbol) },
			this.context.end
		);

		// Close suggestion popup
		this.closeSuggestion();
	}

	selectNextItem(dir: SelectionDirection) {
		if (!this.focused) {
			this.focused = true;
			dir =
				dir === SelectionDirection.PREVIOUS
					? dir
					: SelectionDirection.NONE;
		}

		const self = this as any;
		// HACK: The second parameter has to be an instance of KeyboardEvent to force scrolling the selected item into
		// view
		self.suggestions.setSelectedItem(
			self.suggestions.selectedItem + dir,
			new KeyboardEvent("keydown")
		);
	}

	closeSuggestion() {
		this.firstOpenedCursor = null;
		this.close();
		return null;
	}

	getSelectedItem(): Fuzzysort.KeysResult<fileOption> {
		const self = this as any;
		return self.suggestions.values[self.suggestions.selectedItem];
	}

	applySelectedItem() {
		const self = this as any;
		self.suggestions.useSelectedItem();
	}

	isVisible(): boolean {
		return (this as any).isOpen;
	}

	isFocused(): boolean {
		return this.focused;
	}
}

export enum SelectionDirection {
	NEXT = 1,
	PREVIOUS = -1,
	NONE = 0,
}
