import * as LSP from 'vscode-languageserver';
export declare class SourceDefinitionCommand {
    static execute(uri: LSP.DocumentUri | undefined, position: LSP.Position | undefined): Promise<LSP.Location[] | void>;
}
//# sourceMappingURL=source-definition.d.ts.map