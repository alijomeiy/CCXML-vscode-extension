import * as vscode from 'vscode';
import { rangeFromOffsets } from './utils';

interface VariableDefinition {
    name: string;
    kind: 'var' | 'assign';
    start: number;
    end: number;
}

function stripXmlCommentsKeepingLength(text: string): string {
    return text.replace(/<!--[\s\S]*?-->/g, match => ' '.repeat(match.length));
}

function collectVariableDefinitions(document: vscode.TextDocument): VariableDefinition[] {
    const text = document.getText();
    const cleanText = stripXmlCommentsKeepingLength(text);
    const definitions: VariableDefinition[] = [];
    const tagRegex = /<\s*(var|assign)\b[^<>]*>/g;

    let tagMatch: RegExpExecArray | null;

    while ((tagMatch = tagRegex.exec(cleanText)) !== null) {
        const tag = tagMatch[0];
        const nameMatch = /\bname\s*=\s*(["'])([$A-Za-z_][A-Za-z0-9_$]*)\1/.exec(tag);

        if (!nameMatch) {
            continue;
        }

        const name = nameMatch[2];
        const nameStartInTag = nameMatch.index + nameMatch[0].lastIndexOf(name);
        const start = tagMatch.index + nameStartInTag;

        definitions.push({
            name,
            kind: tagMatch[1] as 'var' | 'assign',
            start,
            end: start + name.length
        });
    }

    return definitions;
}

function getVariableAtPosition(
    document: vscode.TextDocument,
    position: vscode.Position
): string | null {
    const wordRange = document.getWordRangeAtPosition(
        position,
        /[$A-Za-z_][A-Za-z0-9_$]*/
    );

    return wordRange ? document.getText(wordRange) : null;
}

function chooseDefinition(
    definitions: VariableDefinition[],
    variable: string,
    offset: number
): VariableDefinition | undefined {
    const matches = definitions.filter(definition => definition.name === variable);

    if (matches.length === 0) {
        return undefined;
    }

    const declarations = matches.filter(definition => definition.kind === 'var');
    const candidates = declarations.length > 0 ? declarations : matches;
    const previous = candidates
        .filter(definition => definition.start <= offset)
        .sort((a, b) => b.start - a.start);

    return previous[0] ?? candidates[0];
}

export function createDefinitionProvider(): vscode.DefinitionProvider {
    return {
        provideDefinition(document, position) {
            const variable = getVariableAtPosition(document, position);

            if (!variable) {
                return undefined;
            }

            const definition = chooseDefinition(
                collectVariableDefinitions(document),
                variable,
                document.offsetAt(position)
            );

            if (!definition) {
                return undefined;
            }

            return new vscode.Location(
                document.uri,
                rangeFromOffsets(document, definition.start, definition.end)
            );
        }
    };
}
