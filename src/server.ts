import Parser, {Edit, SyntaxNode} from "web-tree-sitter";
import { initializeParser } from "./parser";
import { Analyzer } from "./analyze";
import { buildRegexCompletions, workspaceSymbolToCompletionItem, generateShellCompletionItems, insideStringRegex, } from "./completion";
import { InitializeParams, TextDocumentSyncKind, CompletionParams, Connection, CompletionList, CompletionItem, MarkupContent, CompletionItemKind, DocumentSymbolParams, DefinitionParams, Location, ReferenceParams, DocumentSymbol, DidOpenTextDocumentParams, DidChangeTextDocumentParams, DidCloseTextDocumentParams, DidSaveTextDocumentParams, InitializeResult, TextDocumentItem, HoverParams, Hover, RenameParams, TextDocumentPositionParams, PartialResultParams, TextDocumentIdentifier, WorkspaceEdit, TextEdit, DocumentFormattingParams, uinteger, CodeActionParams, CodeAction, DocumentRangeFormattingParams } from "vscode-languageserver";
import { LspDocument, LspDocuments } from './document';
import { FishCompletionItem, } from './utils/completion-types';
import {  enrichToCodeBlockMarkdown } from './documentation';
import { applyFormatterSettings } from './formatting';
import { execCommandDocs, execCommandType, execFindDependency, execFormatter, execOpenFile } from './utils/exec';
import {Logger} from './logger';
import {uriToPath} from './utils/translation';
import {ConfigManager} from './configManager';
import {nearbySymbols, collectDocumentSymbols, getDefinitionKind, DefinitionKind, SpanTree, countParentScopes, getReferences, getLocalDefs } from './workspace-symbol';
import {getDefinitionSymbols} from './workspace-symbol';
import {findFirstParent, getNodeAtRange, getRange} from './utils/tree-sitter';
import {handleHover} from './hover';
import {Position} from 'vscode-languageserver';
import {getDiagnostics} from './diagnostics/validate';
import {createExtractPrivateFunction, createExtractVariable, createFunctionNameMatchesUri, } from './code-action';

export default class FishServer {

    public static async create(
        connection: Connection,
        params: InitializeParams,
    ): Promise<FishServer> {
        const parser = await initializeParser();
        const documents = new LspDocuments() ;
        const analyzer = new Analyzer(await initializeParser());
        return new FishServer(connection, params, parser, analyzer, documents)
    }

    private initializeParams: InitializeParams | undefined;
    // the connection of the FishServer
    private connection: Connection;
    // the parser (using tree-sitter-web)
    private parser: Parser;
    private analyzer: Analyzer; 
    // documentManager 
    private docs: LspDocuments;
    private config: ConfigManager;
    protected logger: Logger;

    constructor(connection: Connection, params: InitializeParams ,parser : Parser, analyzer: Analyzer, docs: LspDocuments ) {
        this.connection = connection;
        this.initializeParams = params;
        this.parser = parser;
        this.analyzer = analyzer;
        this.docs = docs;
        this.config = new ConfigManager(this.docs);
        this.logger = new Logger(connection);
    }

    async initialize(params: InitializeParams): Promise<InitializeResult> {
        this.connection.console.log(
            `Initialized server FISH-LSP with ${params.workspaceFolders}`
        )
        const result : InitializeResult = {
            capabilities: {
                textDocumentSync: TextDocumentSyncKind.Full,
                completionProvider: {
                    resolveProvider: true,
                    triggerCharacters: ["."],
                    allCommitCharacters: [";", " ", "\t"],
                    workDoneProgress: true,
                },
                hoverProvider: true,
                documentHighlightProvider: true,
                definitionProvider: true,
                referencesProvider: true,
                renameProvider: true,
                documentFormattingProvider: true,
                documentRangeFormattingProvider: true,
                diagnosticProvider: {
                    identifier: "fish-lsp",
                    workspaceDiagnostics: true,
                    interFileDependencies: true,
                },
                codeActionProvider: {
                    codeActionKinds: [
                        "refactor.extract.function",
                        "refactor.extract.variable",
                        "quickfix.rename.function",
                    ],
                    resolveProvider: true,
                },
                documentSymbolProvider: {
                    label: "Fish-LSP",
                },
            }
        }
        return result;
    }

    register(): void {
        //this.connection.window.createWorkDoneProgress();
        this.connection.onDidOpenTextDocument(this.didOpenTextDocument.bind(this))
        this.connection.onDidChangeTextDocument(this.didChangeTextDocument.bind(this))
        this.connection.onDidCloseTextDocument(this.didCloseTextDocument.bind(this))
        this.connection.onDidSaveTextDocument(this.didSaveTextDocument.bind(this))
        // • for multiple completionProviders -> https://github.com/microsoft/vscode-extension-samples/blob/main/completions-sample/src/extension.ts#L15
        // • https://github.com/Dart-Code/Dart-Code/blob/7df6509870d51cc99a90cf220715f4f97c681bbf/src/providers/dart_completion_item_provider.ts#L197-202
        this.connection.onCompletion(this.onCompletion.bind(this))
        this.connection.onCompletionResolve(this.onCompletionResolve.bind(this)),
        //this.connection.onSignatureHelp(this.onShowSignatureHelp.bind(this));

        this.connection.onDocumentSymbol(this.onDocumentSymbols.bind(this));
        this.connection.onDefinition(this.onDefinition.bind(this));
        this.connection.onReferences(this.onReferences.bind(this));
        this.connection.onHover(this.onHover.bind(this));
        this.connection.onRenameRequest(this.onRename.bind(this));
        this.connection.onDocumentFormatting(this.onDocumentFormatting.bind(this));
        this.connection.onDocumentRangeFormatting(this.onDocumentRangeFormatting.bind(this));
        this.connection.onCodeAction(this.onCodeAction.bind(this));
        this.connection.console.log("FINISHED FishLsp.register()")
    }

    didOpenTextDocument(params: DidOpenTextDocumentParams): void {
        this.logger.log("[FishLsp.onDidOpenTextDocument()]")
        this.logger.log(JSON.stringify({params}, null, 2))
        const uri = uriToPath(params.textDocument.uri);
        this.logger.log(`[FishLsp.onDidOpenTextDocument()] uri: ${uri}`)
        if (!uri) {
            this.logger.log("uri is null")
            return;
        }
        if (this.docs.open(uri, params.textDocument)) { 
            const doc = this.docs.get(uri);
            if (doc) {
                this.logger.log("opened document: " + params.textDocument.uri)
                this.analyzer.analyze(doc);
                this.logger.log("analyzed document: " + params.textDocument.uri)
                const root = this.getRootNode(doc.getText())
                this.connection.sendDiagnostics({uri: uri, diagnostics: getDiagnostics(uri, root)});
            }
        } else {
            this.logger.log(`Cannot open already opened doc '${params.textDocument.uri}'.`);
            this.didChangeTextDocument({
                textDocument: params.textDocument,
                contentChanges: [
                    {
                        text: params.textDocument.text,
                    },
                ],
            });
        }
    }

    didChangeTextDocument(params: DidChangeTextDocumentParams): void {
        this.logger.log(`[${ this.connection.onDidChangeTextDocument.name }]: ${params.textDocument.uri}` );
        const { uri, doc, root} = this.getDefaultsForPartialParams({textDocument: params.textDocument})
        if (!uri || !doc || !root) return;
        params.contentChanges.forEach(newContent => {
            doc.applyEdit(params.textDocument.version, newContent)
        })
        this.connection.sendDiagnostics({uri, diagnostics: getDiagnostics(uri, root)});
    }

    didCloseTextDocument(params: DidCloseTextDocumentParams): void {
        const uri = uriToPath(params.textDocument.uri);
        if (!uri) return;
        this.logger.log(`[${this.connection.onDidCloseTextDocument.name}]: ${params.textDocument.uri}`);
        this.docs.close(uri);
        this.logger.log(`closed uri: ${uri}`);
    }

    didSaveTextDocument(params: DidSaveTextDocumentParams): void {
        this.logger.log(`[${this.connection.onDidSaveTextDocument.name}]: ${params.textDocument.uri}`);
        //if (this.config.getFormattingOptions().formatOnSave) {
        //    return;
        //} else {
        return;
    }

    // @TODO: REFACTOR THIS OUT OF SERVER
    // what you've been looking for:
    //      fish_indent --dump-parse-tree test-fish-lsp.fish
    // https://github.com/Dart-Code/Dart-Code/blob/7df6509870d51cc99a90cf220715f4f97c681bbf/src/providers/dart_completion_item_provider.ts#L197-202
    // https://github.com/microsoft/vscode-languageserver-node/pull/322
    // https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#insertTextModehttps://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#insertTextMode
    // 
    // • clean up into completion.ts file & Decompose to state machine, with a function that gets the state machine in this class.
    //         DART is best example i've seen for this.
    //         ~ https://github.com/Dart-Code/Dart-Code/blob/7df6509870d51cc99a90cf220715f4f97c681bbf/src/providers/dart_completion_item_provider.ts#L197-202 ~
    // • Add markdown
    // • USE TRIGGERKIND as seen below in logger (4 lines down).
    // • Implement both escapedCompletion script and dump synatx tree script
    // • Add default CompletionLists to complete.ts
    // • Add local file items.
    // • Lastly add parameterInformation items.  [ 1477 : ParameterInformation ]
    async onCompletion(params: CompletionParams):  Promise<CompletionList | null>{
        const uri = uriToPath(params.textDocument.uri);
        this.logger.log('server.onComplete');
        const doc = this.docs.get(uri);
        if (!doc) {
            this.logger.log('onComplete got [NOT FOUND]: ' + uri)
            return null;
        }
        const line: string = doc.getLineBeforeCursor(params.position)
        this.logger.log(`onComplete: ${uri} : ${line}`)

        if (line.trimStart().startsWith("#")) {
            return null;
        }

        const root = this.getRootNode(doc.getText());
        this.logger.log(`root: ${root}`)

        const lineToParse = line.trimEnd();
        const currNode = root.descendantForPosition({row: 0, column: lineToParse.length - 1});

        const items: CompletionItem[] = [
            ...workspaceSymbolToCompletionItem(nearbySymbols(root, currNode)), // collectDocumentSymbols(root, doc.uri, [])
            //...buildDefaultCompletions(),
        ];

        if (insideStringRegex(line)) {
            //logger.log(`insideStringRegex: ${true}`)
            items.push(...buildRegexCompletions())
            return CompletionList.create(items, true)
        }
        const shellItems: CompletionItem[] = await generateShellCompletionItems(line, currNode);
        if (shellItems.length > 0) {
            items.push(...shellItems)
            return CompletionList.create(items, true)
        }
        //items.push(...await generateShellCompletionItems(line, currNode));
        //items.push(...buildBuiltins())
        return CompletionList.create(items, true)
    }


    async onCompletionResolve(item: CompletionItem): Promise<CompletionItem> {
        const fishItem = item as FishCompletionItem
        let newDoc: string | MarkupContent;
        let typeCmdOutput = ''
        let typeofDoc = ''
        if (fishItem.data.localSymbol == true) {
            return item;
        }
        switch (fishItem.kind) {
            //item.documentation = enrichToCodeBlockMarkdown(fishItem.data?.originalCompletion, 'fish')
            case CompletionItemKind.Constant: 
            case CompletionItemKind.Variable: 
            case CompletionItemKind.Field: 
            case CompletionItemKind.Interface: 
                //const newDoc = enrichToCodeBlockMarkdown()
                return item;
            case CompletionItemKind.Function:
                newDoc = await execCommandDocs(fishItem.label)
                item.documentation = enrichToCodeBlockMarkdown(newDoc, 'fish')
                return item;
            case CompletionItemKind.Unit:
                typeCmdOutput = await execCommandType(fishItem.label)
                if (typeCmdOutput != '') {
                    newDoc = await execCommandDocs(fishItem.label)
                    item.documentation = typeCmdOutput === 'file' 
                        ? enrichToCodeBlockMarkdown(newDoc, 'fish') : enrichToCodeBlockMarkdown(newDoc, 'man')
                }
                return item;
            case CompletionItemKind.Class:
            case CompletionItemKind.Method:
            case CompletionItemKind.Keyword:
                newDoc = await execCommandDocs(fishItem.label)
                item.documentation = enrichToCodeBlockMarkdown(newDoc, 'man')
                return item;
            default:
                return item;
        }
    }


    // @TODO: fix this to return a signle SignatureHelp object
    //public async onShowSignatureHelp(params: SignatureHelpParams): Promise<SignatureHelp> {
    //    const uri: string = params.textDocument.uri;
    //    //const position = params.position;
    //    const doc = await this.docs.openOrFind(uri);

    //    const documentLine: string = this.analyzer.currentLine(doc, params.position).getText().trimStart() || " "
    //    //const line = documentLine.getText().trimStart()
    //    //const root = this.parser.parse(line).rootNode;
    //    //const currNode = root.namedDescendantForPosition({row: 0, column: line.length - 1})
    //    //const commandNode = firstAncestorMatch(currNode, n => isCommand(n));
    //    const lastWord = documentLine.split(/\s+/).pop() || ""
    //    if (insideStringRegex(documentLine)) {
    //        if (lastWord.includes('[[') && !lastWord.includes(']]') ) {
    //            this.signature.activeSignature = signatureIndex["stringRegexCharacterSets"]
    //        } else {
    //            this.signature.activeSignature = signatureIndex["stringRegexPatterns"]
    //        }
    //    } else {
    //        this.signature.activeSignature = null;
    //    }
    //    this.signature.activeParameter = null;
    //    return this.signature;
    //}


    // • lsp-spec: https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#workspace_symbol
    // • hierachy of symbols support on line 554: https://github.com/typescript-language-server/typescript-language-server/blob/114d4309cb1450585f991604118d3eff3690237c/src/lsp-server.ts#L554
    //
    async onDocumentSymbols(params: DocumentSymbolParams): Promise<DocumentSymbol[]> {
        this.logger.log("onDocumentSymbols");
        const {doc, uri, root} = this.getDefaultsForPartialParams(params)
        if (!doc || !uri || !root) return [];
        //this.logger.log("length: "+ this.analyzer.getSymbols(doc.uri).length.toString())
        return getDefinitionSymbols(root);
    }

    protected get supportHierarchicalDocumentSymbol(): boolean {
        const textDocument = this.initializeParams?.capabilities.textDocument;
        const documentSymbol = textDocument && textDocument.documentSymbol;
        return !!documentSymbol && !!documentSymbol.hierarchicalDocumentSymbolSupport;
    }

    async onDefinition(params: DefinitionParams): Promise<Location[]> {
        this.logger.log("onDefinition");
        const {doc, uri, root, current} = this.getDefaults(params)
        if (!doc || !uri || !root || !current) return [];
        const definitions: Location[] = [];
        this.logger.log(current.text || "no definition current node")
        const definitionKind = getDefinitionKind(uri, root, current, definitions);
        switch (definitionKind) {
            case DefinitionKind.FILE:
                const foundUri = await execFindDependency(current.text)
                const defUri = uriToPath(foundUri) || foundUri
                const foundText = await execOpenFile(defUri)
                //this.logger.log(foundText)
                //const newDoc = TextDocumentItem.create(foundUri, 'fish', 0, foundText);
                const newRoot = this.parser.parse(foundText).rootNode
                return getLocalDefs(defUri, newRoot, current)
            case DefinitionKind.LOCAL:
                return definitions
            case DefinitionKind.NONE:
                return []
            default:
                return definitions
        }
    }


    async onReferences(params: ReferenceParams): Promise<Location[] | null> {
        this.logger.log("onReference");
        const {doc, uri, root, current} = this.getDefaults(params)
        if (!doc || !uri || !root || !current) return [];
        return getReferences(doc.uri, root, current);
    }

    async onHover(params: HoverParams): Promise<Hover | null> {
        this.logger.log("onHover");
        const {doc, uri, root, current} = this.getDefaults(params)
        if (!doc || !uri || !root || !current) return null;
        return await handleHover(doc.uri, root, current);
    }

    async onRename(params: RenameParams) : Promise<WorkspaceEdit | null> {
        this.logger.log("onRename");
        const {doc, uri, root, current} = this.getDefaults(params)
        if (!doc || !uri || !root || !current) return null;
        const refs = getReferences(doc.uri, root, current);
        const edits: TextEdit[] = refs.map(ref => {
            return {
                newText: params.newName,
                range: ref.range
            }
        })
        return {
            changes: {
                [uri]: edits
            }
        }
    }

    async onDocumentFormatting(params: DocumentFormattingParams): Promise<TextEdit[]> {
        this.logger.log(`onDocumentFormatting: ${params.textDocument.uri}`);
        const {doc, uri, root} = this.getDefaultsForPartialParams(params)
        if (!doc || !uri || !root) return [];
        let formattedText: string | null = null
        try {
            formattedText = await execFormatter(uri)
        } catch (err) {
            if (err instanceof Error) {
                this.connection.window.showErrorMessage(err.message)
            }
            if (typeof err === 'string') {
                this.connection.window.showErrorMessage(err)
            }
            return []
        }
        if (!formattedText) return []
        formattedText = applyFormatterSettings(this.parser.parse(formattedText).rootNode, this.config.getFormattingOptions())
        const editedRange = getRange(root)
        this.connection.window.showInformationMessage(`Formatted: ${uri}`)
        return [TextEdit.replace(editedRange, formattedText)]
    }

    async onDocumentRangeFormatting(params: DocumentRangeFormattingParams): Promise<TextEdit[]> {
        this.logger.log(`onDocumentRangeFormatting: ${params.textDocument.uri}`);
        const {doc, uri, root} = this.getDefaultsForPartialParams(params)
        const range = params.range
        if (!doc || !uri || !root) return [];
        let formattedText: string | null = null
        try {
            formattedText = await execFormatter(uri)
        } catch (err) {
            if (err instanceof Error) {
                this.connection.window.showErrorMessage(err.message)
            }
            if (typeof err === 'string') {
                this.connection.window.showErrorMessage(err)
            }
            return []
        }
        if (!formattedText) return []
        formattedText = applyFormatterSettings(this.parser.parse(formattedText).rootNode, this.config.getFormattingOptions())
        formattedText = formattedText.split('\n').slice(range.start.line, range.end.line).join('\n') + '\n'
        this.connection.window.showInformationMessage(`Formatted Range: ${uri}`)
        return [TextEdit.replace(range, formattedText)]
    }


    onCodeAction(params: CodeActionParams) : CodeAction[] {
        const {doc, uri, root, current} = this.getDefaults({textDocument: params.textDocument, position: params.range.start})
        this.logger.log("onCodeAction: " + params.textDocument.uri);
        this.logger.logRange(params.range, "onCodeAction.range")
        //params.context.diagnostics
        if (!uri || !root) return [];

        //console.log(current?.text || 'no node');
        //if (!uri || !root || !current) return [];
        const actions: CodeAction[] = [
            createExtractPrivateFunction(uri, root, params.range),
            createExtractVariable(uri, root, params.range),
        ]
        return actions
    }
    //params.context.diagnostics.forEach(n => {
        //if (n.code === 1) {
            //actions.push(createFunctionNameMatchesUri(uri, params.range))
            //return actions;
        //}
    //})
    //return actions


    /////////////////////////////////////////////////////////////////////////////////////
    // HELPERS
    /////////////////////////////////////////////////////////////////////////////////////

    private getRootNode(documentText: string): SyntaxNode {
        this.parser.reset()
        const tree = this.parser.parse(documentText);
        return tree.rootNode;
    }

    // helper to get all the default objects needed when a TextDocumentPositionParam is passed
    // into a handler
    private getDefaults(params: TextDocumentPositionParams) : {
        doc?: LspDocument,
        uri?: string,
        root?: SyntaxNode | null,
        current?: SyntaxNode | null,
    } {
        const uri = uriToPath(params.textDocument.uri);
        const doc = this.docs.get(uri);
        if (!doc || !uri) return {};
        const root = this.getRootNode(doc.getText());
        const current = this.analyzer.nodeAtPoint(doc.uri, params.position.line, params.position.character);
        return {doc, uri, root, current}
    }

    private getDefaultsForPartialParams(params: {textDocument: TextDocumentIdentifier}) : {
        doc?: LspDocument,
        uri?: string,
        root?: SyntaxNode | null,
    } {
        const uri = uriToPath(params.textDocument.uri);
        const doc = this.docs.get(uri);
        const root = this.getRootNode(doc?.getText() || '');
        return {doc, uri, root}
    }

    private getDefaultsFallback(paramURI: string) : { doc?: LspDocument, uri?: string, root?: SyntaxNode } {
        const uri = uriToPath(paramURI);
        const doc = this.docs.get(uri);
        const root = doc?.getText ? this.getRootNode(doc?.getText()) : undefined;
        return {doc, uri, root}
    }

}

