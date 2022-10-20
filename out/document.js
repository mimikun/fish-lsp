"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRangeFromPosition = exports.DocumentManager = void 0;
//import { getAllFishLocations, getFishTextDocumentsFromStandardLocations } from './utils/locations';
const vscode_languageserver_textdocument_1 = require("vscode-languageserver-textdocument");
const vscode_languageserver_1 = require("vscode-languageserver");
const vscode_uri_1 = require("vscode-uri");
const fast_glob_1 = __importDefault(require("fast-glob"));
const os_1 = require("os");
const fs_1 = require("fs");
const logger_1 = require("./logger");
// removed the need for utils/{io,locations}.ts with funcitons at the top of this file.
// Add back later
/**
 * @async getFishDocumentsFromFileSystem() - Function to retrieve
 *                                           Fish default locations for documents are:
 *                                           $HOME/.config/fish, and /usr/share/fish
 *
 * @returns {Promise<TextDocument[]>} - Get all fish files in a directory path and return
 *                                      them as TextDocuments.
 */
function getTextDocumentsFromPaths(paths) {
    return __awaiter(this, void 0, void 0, function* () {
        const allFiles = [];
        paths.forEach((path) => {
            const files = fast_glob_1.default.sync("**.fish", {
                absolute: true,
                dot: true,
                globstar: true,
                cwd: path,
            });
            allFiles.push(...files);
        });
        // now allFiles contains every fish file that could be used in the workspace
        return yield Promise.all(allFiles.map((file) => __awaiter(this, void 0, void 0, function* () {
            const contents = yield fs_1.promises.readFile(file, 'utf8');
            return vscode_languageserver_textdocument_1.TextDocument.create(file, 'fish', 0, contents || "");
        })));
    });
}
/**
 * TODO: handle uri: URI | string differently
 *       @see https://stackoverflow.com/questions/39065077/typescript-multiple-type-parameter
 *
 * @async createTextDocumentFromURI() - creates a text document from a vscode-uri
 *
 * @param {URI} uri - vscode uri object
 * @returns {Promise<TextDocument>} - a textdocument, if the document contents of
 *                                    the document cannont be resovled then we will just
 *                                    create a text document with empty contents
 */
function createTextDocumentFromURI(uri) {
    return __awaiter(this, void 0, void 0, function* () {
        const file = vscode_uri_1.Utils.resolvePath(uri).fsPath;
        const contents = yield fs_1.promises.readFile(file, 'utf8');
        return vscode_languageserver_textdocument_1.TextDocument.create(uri.toString(), 'fish', 0, contents || "");
    });
}
/**
 *  DO NOT create vscode-uri anywhere outside of DocumentManager. when a document is returned just use the uri on it.
 *  ──────
 *
 * ┌──────────────────┐
 * │  DocumentManager │
 * └──────────────────┘
 *
 *      • initialized via: DocumentManager.indexUserConfig(connection.console)
 *      • method above returns the Singleton DocumentManager.
 *      • listener for documents is accessible via: DocumentManager.documents
 */
class DocumentManager {
    /**
     * Constructor for a single documentManager per FishServer
     *
     * @param {RemoteConsole} console - the console to log error messages to
     */
    constructor(console) {
        // listener for documents
        this._documents = new vscode_languageserver_1.TextDocuments(vscode_languageserver_textdocument_1.TextDocument);
        // documents that are currently OPEN
        this.openDocuments = {};
        // ALL local documents on the users machine 
        this.allDocuments = {};
        this._documents = new vscode_languageserver_1.TextDocuments(vscode_languageserver_textdocument_1.TextDocument);
        this.allDocuments = {};
        this.openDocuments = {};
        this.console = console;
    }
    static indexUserConfig(console) {
        return __awaiter(this, void 0, void 0, function* () {
            const docs = new this(console);
            docs.console.log('Indexing Starting in function:\n\t DocumentManager.generateUserConfigDocuments(console)\n');
            // allow for the future plans of adding more paths through client config. 
            const paths = [
                `${(0, os_1.homedir)()}/.config/fish`,
                '/usr/share/fish'
            ];
            const allDocuments = yield getTextDocumentsFromPaths(paths);
            allDocuments.forEach(doc => {
                docs.allDocuments[doc.uri] = doc;
            });
            docs.console.log('Indexing completed');
            return docs;
        });
    }
    /**
     * getter accesssible via DocumentManager.documents
     *                        ⟶    new TextDocuments(TextDocument);
     * chain the neccessary handlers to the FishServer.DocumentManager instance
     *                        ⟶    DocumentManager.documents.onContentDidChange( ... => {})
     *
     *  notice:
     *  ──────────────────────┬─────────────────────────────────────
     *  vscode-languageserver │ vscode-languageserver-textdocument
     *                ↓       │     ↓
     * @returns {TextDocuments<TextDocument>} : API Manager for TextDocuments
     */
    get documents() {
        return this._documents;
    }
    /**
     * @async openOrFind(possibleUri) - guarantees a text document will be returned,
     *                                  even if there is an error with the uri. The uri
     *                                  passed into this method is checked for the edge
     *                                  case that the uri passed in is just a filePath
     *
     * @param {string} uri - string which potentially could be either:
     *                       file path: '$HOME/.config/fish/config.fish'
     *                       or
     *                       uri: 'file:///$HOME/.config/fish/config.fish'
     * @returns {Promise<TextDocument>} [TODO:description]
     */
    openOrFind(uri) {
        return __awaiter(this, void 0, void 0, function* () {
            const correctURI = this.validateURI(uri);
            // document is already open
            if (this.openDocuments[correctURI] !== undefined) {
                return this.openDocuments[correctURI];
            }
            // add to openDocuments 
            if (this.allDocuments[correctURI] !== undefined) {
                const documentToOpen = this.allDocuments[correctURI];
                this.openDocuments[correctURI] = documentToOpen;
                return this.openDocuments[correctURI];
            }
            // we need to create a new document
            //const newDocument = await createTextDocumentFromFilePath(URI.parse(correctURI));
            const newDocument = yield createTextDocumentFromURI(vscode_uri_1.URI.parse(correctURI));
            if (!newDocument) {
                logger_1.logger.log("", {
                    error: true,
                    extraInfo: [
                        `DocumentManager.openOrFind(${correctURI})`,
                        `Not found: returned empty text document!`,
                        `uri PassedIn: ${uri}`,
                    ],
                });
                return vscode_languageserver_textdocument_1.TextDocument.create(correctURI, 'fish', -1, '');
            }
            this.allDocuments[correctURI] = newDocument;
            this.openDocuments[correctURI] = newDocument;
            return this.openDocuments[correctURI];
        });
    }
    /**
     * @async close(uri) - given a uri from the server, remove it from the open documents
     *                     object.
     * @param uri - closes this uri its in the currently opened documents
     */
    close(uri) {
        const correctURI = this.validateURI(uri);
        // document is already closed
        if (this.openDocuments[correctURI] === undefined) {
            this.console.log(`[ERROR] DocumentManager.closeDocument(${correctURI})`);
            this.console.log(`        uri PassedIn: ${uri}`);
            this.console.log(`        uri Corrected: ${correctURI}`);
        }
        else {
            delete this.openDocuments[correctURI];
        }
        return;
    }
    /**
     * @async getLine() - Getter method to retrieve the line of the document passed in.
     *                    Text returned from this method is unedited, and is likely to
     *                    have leading whitespace
     *
     * @param {TextDocumentPositionParams} params - the uri, and position of a server call
     *                                              used for server.onHover(), onComplete()
     * @returns {Promise<string>} - The line of text in the uri, at the postion specified
     */
    getLine(params) {
        return __awaiter(this, void 0, void 0, function* () {
            const doc = yield this.openOrFind(params.textDocument.uri);
            const range = getRangeFromPosition(params.position);
            return doc.getText(range);
        });
    }
    /**
     * returns a correctly formatted string that is a vscode-uri
     *
     * @param {string} possibleURI - either a vscode-uri or a fspath
     * @returns {string} 'file:///path/to/fish/file.fish'
     */
    validateURI(possibleURI) {
        const correctURI = vscode_uri_1.URI.parse(possibleURI);
        return correctURI.toString();
    }
}
exports.DocumentManager = DocumentManager;
/**
 * get a range for document.getText()
 * returns range for the begining and end of the current line.
 */
function getRangeFromPosition(position) {
    const rStart = {
        line: position.line,
        character: 0,
    };
    const rEnd = {
        line: position.line,
        character: position.character,
    };
    return {
        start: rStart,
        end: rEnd,
    };
}
exports.getRangeFromPosition = getRangeFromPosition;
//export enum FishFileType {
//    function,
//    completion,
//    script,
//    config,
//    builtin_function,
//    builtin_completion,
//}
//
//export class LspDocuments {
//
//    // consider changing to a map or an object with the keyof syntax
//    private readonly _files: string[] = [];
//
//    // use TextDocuments 
//    private readonly openDocuments: Map<string, LspDocument>;
//
//    public listener: TextDocuments<TextDocument>;
//
//    public documents: Map<string, TextDocument>;
//    //public dependencies: Map<string, SymbolInformation[]>;
//
//    constructor(listener: LSP.TextDocuments<TextDocument>) {
//        this.openDocuments = new Map<string, LspDocument>();
//        this.listener = listener;
//        this.documents = new Map<string, TextDocument>();
//        //this.dependencies = new Map<string, LspDocument[]>();
//    }
//
//    /**
//     * gets the dependency for the the file/uri passed in
//     *
//     * @param {string} file - the file to find in the documents.
//     * @returns {LspDocument | undefined} - the document found matching 
//     *                                      the uri if it exists
//     */
//    get(file: string): LspDocument | undefined {
//        const uri = file
//        const document = this.openDocuments.get(uri);
//        if (!document) {
//            return undefined;
//        }
//        return document;
//    }                
//
//    /**
//     * normalizes a filepaths uri, and creates the textDocument. Also, sets the
//     * dependencies for a newDocument.
//     */
//    async newDocument(uri: string) {
//        let document = await createTextDocumentFromFilePath(uri)
//        if (!document) return;
//        if (this._files.includes(document.uri)) {
//            return
//        }
//        this.documents.set(uri, document)
//        //this.dependencies.set(uri, [])
//    }
//
//    //getDependencies(uri: string) {
//    //    const deps = this.dependencies.get(uri)
//    //    if (!deps) {
//    //        return [] as LspDocument[]
//    //    }
//    //    return deps
//    //}
//
//    ///**
//    // * add a new Dependency, to the document
//    // * @param {string} uri - the uri that has a dependency
//    // * @param {string} depUri - the uri that is the depency
//    // */
//    //public addDependency(uri: string, depUri: string) {
//    //    const newDep = this.get(depUri);
//    //    const oldDeps = this.getDependencies(uri)
//    //    if (oldDeps.includes(depUri)) {
//    //        return 
//    //    }
//    //    if (newDep && !oldDeps.includes(depUri)) {
//    //        this.dependencies.set(uri, [...oldDeps, newDep]);
//    //    }
//    //}
//
//
//    /**
//     * return all the documents seen in the _files field
//     */
//    getOpenDocuments(): LspDocument[] {
//        return [...this.openDocuments.values()];
//    }
//
//    /**
//     * adds a new Uri to the _files array. Returns true if a document is opened
//     * and false if a document is already opened
//     */
//    async open(uri: string): Promise<boolean> {
//        if (this.openDocuments.has(uri)) {
//            return false;
//        }
//        if (!this.get(uri)) {
//            await this.newDocument(uri)
//            const document = this.documents.get(uri)
//            if (this.documents.has(uri) && document) {
//                this.openDocuments.set(uri, document)
//            }
//        }
//        this._files.unshift(uri);
//        return true;
//    }
//
//    /**
//     * deletes an item from the _files array, and returns the document
//     */
//    close(uri: string): LspDocument | undefined {
//        const document = this.openDocuments.get(uri);
//        if (!document) {
//            return undefined;
//        }
//        this._files.splice(this._files.indexOf(uri), 1)
//        this.openDocuments.delete(uri);
//        return document;
//    }
//}
//export class LspDocument implements TextDocument {
//
//    protected document: TextDocument;
//
//    private matchingDependency: string;
//    private fishFileType: FishFileType;
//
//    constructor(doc: TextDocument) {
//        const { uri, languageId, version } = doc;
//        this.document = TextDocument.create(uri, languageId, version, doc.getText());
//        this.fishFileType = this.setFishFileType()
//        this.matchingDependency = this.setMatchingDep();
//    }
//
//    get uri(): string {
//        return this.document.uri;
//    }
//
//    get languageId(): string {
//        return this.document.languageId;
//    }
//
//    get version(): number {
//        return this.document.version;
//    }
//
//    getText(range?: LSP.Range): string {
//        return this.document.getText(range);
//    }
//
//    positionAt(offset: number): LSP.Position {
//        return this.document.positionAt(offset);
//    }
//
//    offsetAt(position: LSP.Position): number {
//        return this.document.offsetAt(position);
//    }
//
//    get lineCount(): number {
//        return this.document.lineCount;
//    }
//
//    getLine(line: number): string {
//        const lineRange = this.getLineRange(line);
//        return this.getText(lineRange);
//    }
//
//    getLineRange(line: number): LSP.Range {
//        const lineStart = this.getLineStart(line);
//        const lineEnd = this.getLineEnd(line);
//        return LSP.Range.create(lineStart, lineEnd);
//    }
//
//    getLineEnd(line: number): LSP.Position {
//        const nextLineOffset = this.getLineOffset(line + 1);
//        return this.positionAt(nextLineOffset - 1);
//    }
//
//    getLineOffset(line: number): number {
//        const lineStart = this.getLineStart(line);
//        return this.offsetAt(lineStart);
//    }
//
//    getLineStart(line: number): LSP.Position {
//        return LSP.Position.create(line, 0);
//    }
//
//    getFileName() {
//        return basename(this.document.uri);
//    }
//
//    /**
//     * checks what type of fish file the current TextDocument is 
//     * from the uri path 
//     * 
//     * @returns {FishFileType} config, functions, completions or script
//     */
//    setFishFileType(): FishFileType {
//        const filepath = this.uri
//        if (filepath.includes(FISH_LOCATIONS.config.completions)) {
//            return FishFileType.completion;
//        } else if (filepath.includes(FISH_LOCATIONS.config.functions)) {
//            return FishFileType.function
//        } else if (filepath.includes(FISH_LOCATIONS.configFile)) {
//            return FishFileType.config
//        } else if (filepath.includes(FISH_LOCATIONS.builtins.functions)) {
//            return FishFileType.builtin_function
//        } else if (filepath.includes(FISH_LOCATIONS.builtins.completions)) {
//            return FishFileType.builtin_completion
//        } else  {
//            return FishFileType.script
//        }
//    }
//
//    setMatchingDep(): string {
//        let dependency = ''
//        let dep_file = ''
//        switch(this.fishFileType) {
//        case FishFileType.completion:
//            dep_file = resolve(FISH_LOCATIONS.config.functions, dependency)
//            break;
//        case FishFileType.builtin_completion:
//            dep_file = resolve(FISH_LOCATIONS.builtins.functions, dependency)
//            break;
//        case FishFileType.function:
//            dep_file = resolve(FISH_LOCATIONS.config.completions, dependency)
//            break;
//        case FishFileType.builtin_function:
//            dep_file = resolve(FISH_LOCATIONS.builtins.completions, dependency)
//            break;
//        default:
//            dep_file = ''
//            break;
//        }
//        return dep_file + sep + this.getFileName()
//
//    }
//
//    getFishFileType() : FishFileType {
//        return this.fishFileType
//    }
//
//    getMatchingDep() : string {
//        return this.matchingDependency
//    }
//
//    applyEdit(version: number, change: LSP.TextDocumentContentChangeEvent): void {
//        const content = this.getText();
//        let newContent = change.text;
//        if (LSP.TextDocumentContentChangeEvent.isIncremental(change)) {
//            const start = this.offsetAt(change.range.start);
//            const end = this.offsetAt(change.range.end);
//            newContent = content.substring(0, start) + change.text + content.substring(end);
//        }
//        this.document = TextDocument.create(this.uri, this.languageId, version, newContent);
//    }
//}
//export class LspDocuments {
//    private readonly _files: string[] = [];
//    private readonly documents = new Map<string, LspDocument>();
//
//    /**
//     * Sorted by last access.
//     */
//    get files(): string[] {
//        return this._files;
//    }
//
//    get(file: string): LspDocument | undefined {
//        const document = this.documents.get(file);
//        if (!document) {
//            return undefined;
//        }
//        if (this.files[0] !== file) {
//            this._files.splice(this._files.indexOf(file), 1);
//            this._files.unshift(file);
//        }
//        return document;
//    }
//
//    open(file: string, doc: LSP.TextDocumentItem): boolean {
//        if (this.documents.has(file)) {
//            return false;
//        }
//        this.documents.set(file, new LspDocument(doc));
//        this._files.unshift(file);
//        return true;
//    }
//
//    close(file: string): LspDocument | undefined {
//        const document = this.documents.get(file);
//        if (!document) {
//            return undefined;
//        }
//        this.documents.delete(file);
//        this._files.splice(this._files.indexOf(file), 1);
//        return document;
//    }
//}                  e
//# sourceMappingURL=document.js.map