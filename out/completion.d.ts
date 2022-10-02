import { CompletionItem, CompletionItemKind, CompletionList } from "vscode-languageserver-protocol/node";
import { SyntaxNode } from "web-tree-sitter";
export declare enum FishCompletionItemType {
    function = 0,
    builtin = 1,
    abbr = 2,
    flag = 3,
    variable = 4
}
export declare function toCompletionItemKind(type: FishCompletionItemType): CompletionItemKind;
export declare class Completion {
    private currentNode;
    private commandNode;
    globalAbbrs: CompletionItem[];
    private globalVars;
    globalAlaises: CompletionItem[];
    globalCmds: CompletionItem[];
    globalBuiltins: CompletionItem[];
    private localVariables;
    private localFunctions;
    private isInsideCompletionsFile;
    private completions;
    private isIncomplete;
    constructor();
    initialDefaults(): Promise<this>;
    addLocalMembers(vars: SyntaxNode[], funcs: SyntaxNode[]): number;
    generateCurrent(node: SyntaxNode): Promise<void>;
    generate(node: SyntaxNode): Promise<CompletionList>;
    fallback(): CompletionList;
}
export declare function buildGlobalAbbrs(): Promise<CompletionItem[]>;
export declare function buildGlobalVars(): Promise<CompletionItem[]>;
export declare function buildGlobalBuiltins(): Promise<CompletionItem[]>;
export declare function buildGlobalCommands(): Promise<CompletionItem[]>;
export declare function buildGlobalAlaises(): Promise<CompletionItem[]>;
//# sourceMappingURL=completion.d.ts.map