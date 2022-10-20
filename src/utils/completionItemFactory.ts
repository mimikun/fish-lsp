import {Command, CompletionItem, CompletionItemKind, InsertReplaceEdit, InsertTextFormat, InsertTextMode, MarkupContent, TextEdit} from 'vscode-languageserver';
import { FishCompletionItem, FishCompletionItemKind, isBuiltIn } from './completion-types';


/**
 * text: actual completion text
 * description: fish shell compleiton description  
 *
 * bind        (Handle fish key binding) 
 * text          description --> note: no parenthesis when outside of interactive shell 
 *
 * Descriptions are optionally because things like function files will not show any
 * description, however we will indcate it empty string
 */
export interface CmdLineCmp {
    text: string;
    description: string;
}


function parseDescriptionKeywords(cliText: CmdLineCmp) {
    const secondItem = cliText.description.replace(':', ''); 
    let results: string[] = []
    if (secondItem === "") {
        return [""];
    } else {
        if (secondItem.includes(' ')) { 
            results = secondItem.split(' ', 2)
            return [results[0].toLowerCase(), ...results.slice(1)]
        } else {
            return [secondItem]
        }
    }
}   


abstract class CompletionItemCreator {

    public abstract produceCompletionItem(): FishCompletionItem;

    public serializeShellOutput(shellLines: string[]): CmdLineCmp {
        const cmp: CmdLineCmp = {
            text: "",
            description: ""
        }
        cmp.text = shellLines[0];
        if (shellLines.length === 2) {
            cmp.description = shellLines[1];
        }
        return cmp;
    }



}

function createFishBuiltinComplete(arr: string[]) {
    const cmp: CmdLineCmp = {
        text: "",
        description: ""
    }
    cmp.text = arr[0];
    if (arr.length === 2) {
        cmp.description = arr[1];
    }
    return cmp;
}


// CompletionItem is product
class CompletionItemBuilder {

    //private item: FishCompletionItem | undefined private cli: CmdLineCmp

    constructor(cli: CmdLineCmp) {
        //this.item = FishCompletionItem.create()
        //this.

    }
}




abstract class BaseCompletionItem {

    cli: CmdLineCmp; 
    item: FishCompletionItem;

    constructor(cli: CmdLineCmp) {
        this.cli = cli
        this.item = this.create(cli)
    }

    create(cli: CmdLineCmp): FishCompletionItem {
        this.cli = cli
        this.item = CompletionItem.create(cli.text) as FishCompletionItem;
        this.item.label = cli.text;
        this.item.data.fishKind = FishCompletionItemKind.RESOLVE;
        this.item.data.originalCompletion = [ cli.text, cli.description ].join('\t');
        return this.item;
    }


}



class LabelItems extends BaseCompletionItem {
    // items that we determine their types from their label:
    // --long                                    --> flag 
    // $var                                      --> variables
    // usr_function_without_description          --> functions with no descriptions
    // while                                     --> builtins

    private isSet: boolean = false;

    constructor(cli: CmdLineCmp) {
        super(cli)

    }

    parseLabel() {
        const toParse = this.cli.text;
        
        if (toParse.startsWith('$')) {
            this.item.data.fishKind = FishCompletionItemKind.GLOBAL_VAR
            this.item.kind = CompletionItemKind.Variable
            this.isSet = true;
            return;
        }
        if (toParse.startsWith("-")) {
            this.item.data.fishKind = FishCompletionItemKind.FLAG
            this.item.kind = CompletionItemKind.Field
            this.isSet = true;
            return;
        }
        if (isBuiltIn(toParse)) {
            this.item.data.fishKind = FishCompletionItemKind.BUILTIN
            this.item.kind = CompletionItemKind.Keyword
            this.isSet = true;
            return;
        }

    }


    parseDescription() {
        const desc = parseDescriptionKeywords(this.cli); 
        if (this.cli.description === "") {
            this.item.data.fishKind = FishCompletionItemKind.GLOBAL_FUNC
            this.item.kind = CompletionItemKind.File
            this.isSet = true;
            return;
        }
        if (desc[0] === "command") {
            this.item.data.fishKind = FishCompletionItemKind.CMD;
            this.item.kind = CompletionItemKind.Module
            this.isSet = true;
            return
        }
        if (desc[0] === "variable") {
            this.item.data.fishKind = FishCompletionItemKind.GLOBAL_VAR
            this.item.kind = CompletionItemKind.Variable
            this.isSet = true;
            return
        }
        if (desc[0] === "alias") {
            this.item.data.fishKind = FishCompletionItemKind.ALIAS
            this.item.kind = CompletionItemKind.Struct
            this.isSet = true;
            return
        }
        if (desc[0] === "abbreviation") {
            this.item.data.fishKind = FishCompletionItemKind.ABBR;
            this.item.kind = CompletionItemKind.Interface
            this.isSet = true;
            return
        }

    }



}


