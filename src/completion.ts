import * as vscode from 'vscode';
import { CcxmlRules } from './schema';
import { collectVariables } from './diagnostics';

function getLinePrefix(
    document: vscode.TextDocument,
    position: vscode.Position
): string {
    return document.lineAt(position.line).text.slice(0, position.character);
}

function detectCurrentTagName(prefix: string): string | null {
    const match = prefix.match(/<\s*([A-Za-z_][A-Za-z0-9_.:-]*)\s+[^<>]*$/);
    return match?.[1] ?? null;
}

function isInsideAttributeValue(prefix: string): boolean {
    const doubleQuotes = (prefix.match(/"/g) ?? []).length;
    const singleQuotes = (prefix.match(/'/g) ?? []).length;

    return doubleQuotes % 2 === 1 || singleQuotes % 2 === 1;
}

function getTagCompletionRange(
    document: vscode.TextDocument,
    position: vscode.Position
): vscode.Range {
    const nextCharacter = document.lineAt(position.line).text[position.character];

    if (nextCharacter === '>') {
        return new vscode.Range(position, position.translate(0, 1));
    }

    return new vscode.Range(position, position);
}

export function createCompletionProvider(
    rules: CcxmlRules
): vscode.CompletionItemProvider {
    return {
        provideCompletionItems(document, position) {
            const prefix = getLinePrefix(document, position);

            const items: vscode.CompletionItem[] = [];

            if (prefix.endsWith('<')) {
                for (const tagName of Object.keys(rules.tags).sort()) {
                    const item = new vscode.CompletionItem(
                        tagName,
                        vscode.CompletionItemKind.Keyword
                    );
                    item.range = getTagCompletionRange(document, position);

                    const rule = rules.tags[tagName];
                    const attrs = rule.requiredAttributes ?? [];

                    if (attrs.length > 0) {
                        item.insertText = new vscode.SnippetString(
                            `${tagName} ${attrs.map((a, i) => `${a}="\${${i + 1}}"`).join(' ')}>$0</${tagName}>`
                        );
                    } else {
                        item.insertText = new vscode.SnippetString(`${tagName}>$0</${tagName}>`);
                    }

                    item.detail = 'CCXML tag';
                    item.documentation = rule.description;
                    items.push(item);
                }

                return items;
            }

            const currentTag = detectCurrentTagName(prefix);

            if (currentTag && !isInsideAttributeValue(prefix)) {
                const rule = rules.tags[currentTag];

                if (rule) {
                    for (const attrName of rule.allowedAttributes ?? []) {
                        const item = new vscode.CompletionItem(
                            attrName,
                            vscode.CompletionItemKind.Property
                        );
                        item.insertText = new vscode.SnippetString(`${attrName}="$1"`);
                        item.detail = `Attribute of <${currentTag}>`;
                        items.push(item);
                    }
                }

                return items;
            }

            if (isInsideAttributeValue(prefix)) {
                for (const eventName of rules.events ?? []) {
                    const item = new vscode.CompletionItem(
                        eventName,
                        vscode.CompletionItemKind.Event
                    );
                    item.detail = 'CCXML standard event';
                    items.push(item);
                }

                for (const variable of collectVariables(document)) {
                    const item = new vscode.CompletionItem(
                        variable,
                        vscode.CompletionItemKind.Variable
                    );
                    item.detail = 'CCXML variable';
                    items.push(item);
                }

                return items;
            }

            return undefined;
        }
    };
}
