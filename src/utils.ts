import * as vscode from 'vscode';

export function rangeFromOffsets(
    document: vscode.TextDocument,
    start: number,
    end: number
): vscode.Range {
    return new vscode.Range(
        document.positionAt(start),
        document.positionAt(end)
    );
}

export function unique<T>(items: T[]): T[] {
    return Array.from(new Set(items));
}

export function isCcxmlDocument(document: vscode.TextDocument): boolean {
    return document.languageId === 'ccxml';
}
