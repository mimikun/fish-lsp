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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFishFilesInDir = exports.createTextDocumentFromFilePath = void 0;
const fs_1 = require("fs");
const url_1 = require("url");
const vscode_languageserver_textdocument_1 = require("vscode-languageserver-textdocument");
const tree_sitter_1 = require("./tree-sitter");
function createTextDocumentFromFilePath(context, url) {
    return __awaiter(this, void 0, void 0, function* () {
        let content;
        try {
            content = (0, fs_1.readFileSync)(url.href, "utf8");
        }
        catch (err) {
            const { message, name } = err;
            context.connection.console.error(`${name}: ${message}`);
            return null;
        }
        return vscode_languageserver_textdocument_1.TextDocument.create(url.href, "fish", 0, content);
    });
}
exports.createTextDocumentFromFilePath = createTextDocumentFromFilePath;
///** Get files ending with .fish recursively */
function getFishFilesInDir(uri) {
    const result = [];
    const url = new url_1.URL(uri);
    try {
        (0, fs_1.accessSync)(url, fs_1.constants.R_OK);
    }
    catch (_err) {
        return [];
    }
    for (const dirent of (0, fs_1.readdirSync)(url, { withFileTypes: true })) {
        if ((0, tree_sitter_1.isFishExtension)(dirent.name)) {
            result.push(new url_1.URL(`${uri}/${dirent.name}`));
            continue;
        }
        if (dirent.isDirectory()) {
            result.push(...getFishFilesInDir(`${uri}/${dirent.name}`));
        }
    }
    return result;
}
exports.getFishFilesInDir = getFishFilesInDir;
//export function readDocumentFromUrl(context: Context, url: URI): TextDocument | null {
//  let content: string
//
//  try {
//    content = readFileSync(url.fsPath, 'utf8')
//  } catch (err) {
//    const { message, name } = err as Error
//    context.connection.console.error(`${name}: ${message}`)
//    return null
//  }
//
//  return TextDocument.create(url.fsPath, 'fish', 0, content)
//}
//export function isDir(uri: string): boolean {
//  return statSync(new URL(uri)).isDirectory()
//}
//
//
//
///// @SEE https://github.com/typescript-language-server/typescript-language-server/blob/114d4309cb1450585f991604118d3eff3690237c/src/protocol-translation.ts#L17
//// officical ts-server implementation
//
//const RE_PATHSEP_WINDOWS = /\\/g;
//
//export function uriToPath(stringUri: string): string | undefined {
//    // Vim may send `zipfile:` URIs which tsserver with Yarn v2+ hook can handle. Keep as-is.
//    // Example: zipfile:///foo/bar/baz.zip::path/to/module
//    if (stringUri.startsWith('zipfile:')) {
//        return stringUri;
//    }
//    const uri = URI.parse(stringUri);
//    if (uri.scheme !== 'file') {
//        return undefined;
//    }
//    return normalizeFsPath(uri.fsPath);
//}
//
//
//export function pathToUri(filepath: string, documents: LspDocuments | undefined): string {
//    // Yarn v2+ hooks tsserver and sends `zipfile:` URIs for Vim. Keep as-is.
//    // Example: zipfile:///foo/bar/baz.zip::path/to/module
//    if (filepath.startsWith('zipfile:')) {
//        return filepath;
//    }
//    const fileUri = URI.file(filepath);
//    const normalizedFilepath = normalizePath(fileUri.fsPath);
//    const document = documents && documents.get(normalizedFilepath);
//    return document ? document.uri : fileUri.toString();
//}
//
///**
// * Normalizes the file system path.
// *
// * On systems other than Windows it should be an no-op.
// *
// * On Windows, an input path in a format like "C:/path/file.ts"
// * will be normalized to "c:/path/file.ts".
// */
//export function normalizePath(filePath: string): string {
//    const fsPath = URI.file(filePath).fsPath;
//    return normalizeFsPath(fsPath);
//}
//
///**
// * Normalizes the path obtained through the "fsPath" property of the URI module.
// */
//export function normalizeFsPath(fsPath: string): string {
//    return fsPath.replace(RE_PATHSEP_WINDOWS, '/');
//}
//# sourceMappingURL=io.js.map