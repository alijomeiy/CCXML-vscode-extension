import * as vscode from 'vscode';
import { CcxmlRules } from './schema';
import { rangeFromOffsets } from './utils';

interface ParsedAttribute {
    name: string;
    value: string;
    start: number;
    end: number;
}

interface ParsedTag {
    name: string;
    isClosing: boolean;
    start: number;
    end: number;
    nameStart: number;
    nameEnd: number;
    attributes: ParsedAttribute[];
}

function stripXmlCommentsKeepingLength(text: string): string {
    return text.replace(/<!--[\s\S]*?-->/g, match => ' '.repeat(match.length));
}

function parseAttributes(rawAttributes: string, offset: number): ParsedAttribute[] {
    const attrs: ParsedAttribute[] = [];
    const attrRegex = /([A-Za-z_][A-Za-z0-9_.:-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;

    let match: RegExpExecArray | null;

    while ((match = attrRegex.exec(rawAttributes)) !== null) {
        const name = match[1];
        const fullStart = offset + match.index;
        const nameStart = fullStart;
        const nameEnd = nameStart + name.length;

        attrs.push({
            name,
            value: match[3] ?? match[4] ?? '',
            start: nameStart,
            end: nameEnd
        });
    }

    return attrs;
}

function parseTags(text: string): ParsedTag[] {
    const cleanText = stripXmlCommentsKeepingLength(text);
    const tags: ParsedTag[] = [];

    const tagRegex = /<\s*(\/?)([A-Za-z_][A-Za-z0-9_.:-]*)([^<>]*?)(\/?)>/g;
    let match: RegExpExecArray | null;

    while ((match = tagRegex.exec(cleanText)) !== null) {
        const full = match[0];

        if (full.startsWith('<?') || full.startsWith('<!')) {
            continue;
        }

        const slash = match[1];
        const name = match[2];
        const rawAttributes = match[3] ?? '';

        const tagStart = match.index;
        const tagEnd = match.index + full.length;

        const nameStart = tagStart + full.indexOf(name);
        const nameEnd = nameStart + name.length;

        const rawAttrStartInFull = full.indexOf(rawAttributes);
        const rawAttrGlobalOffset =
            rawAttrStartInFull >= 0 ? tagStart + rawAttrStartInFull : tagEnd;

        tags.push({
            name,
            isClosing: slash === '/',
            start: tagStart,
            end: tagEnd,
            nameStart,
            nameEnd,
            attributes: parseAttributes(rawAttributes, rawAttrGlobalOffset)
        });
    }

    return tags;
}

export function validateCcxmlDocument(
    document: vscode.TextDocument,
    rules: CcxmlRules
): vscode.Diagnostic[] {
    const config = vscode.workspace.getConfiguration('ccxmlTools');
    const enabled = config.get<boolean>('validation.enabled', true);

    if (!enabled) {
        return [];
    }

    const diagnostics: vscode.Diagnostic[] = [];
    const text = document.getText();
    const tags = parseTags(text);

    for (const tag of tags) {
        if (tag.isClosing) {
            continue;
        }

        const tagRule = rules.tags[tag.name];

        if (!tagRule) {
            diagnostics.push(
                new vscode.Diagnostic(
                    rangeFromOffsets(document, tag.nameStart, tag.nameEnd),
                    `Unknown CCXML tag: <${tag.name}>`,
                    vscode.DiagnosticSeverity.Error
                )
            );
            continue;
        }

        const attrNames = tag.attributes.map(attr => attr.name);

        for (const requiredAttr of tagRule.requiredAttributes ?? []) {
            if (!attrNames.includes(requiredAttr)) {
                diagnostics.push(
                    new vscode.Diagnostic(
                        rangeFromOffsets(document, tag.nameStart, tag.nameEnd),
                        `Tag <${tag.name}> requires attribute "${requiredAttr}".`,
                        vscode.DiagnosticSeverity.Error
                    )
                );
            }
        }

        for (const attr of tag.attributes) {
            if (!tagRule.allowedAttributes.includes(attr.name)) {
                diagnostics.push(
                    new vscode.Diagnostic(
                        rangeFromOffsets(document, attr.start, attr.end),
                        `Attribute "${attr.name}" is not allowed on <${tag.name}>.`,
                        vscode.DiagnosticSeverity.Error
                    )
                );
            }
        }
    }

    return diagnostics;
}

export function collectVariables(document: vscode.TextDocument): string[] {
    const text = document.getText();
    const variables = new Set<string>();

    const varRegex = /<\s*var\b[^>]*\bname\s*=\s*["']([A-Za-z_][A-Za-z0-9_]*)["'][^>]*>/g;
    let match: RegExpExecArray | null;

    while ((match = varRegex.exec(text)) !== null) {
        variables.add(match[1]);
    }

    return Array.from(variables);
}
