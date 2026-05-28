import * as vscode from 'vscode';
import { loadCcxmlRules } from './schema';
import { validateCcxmlDocument } from './diagnostics';
import { createCompletionProvider } from './completion';
import { createDefinitionProvider } from './definition';
import { isCcxmlDocument } from './utils';

export function activate(context: vscode.ExtensionContext) {
    const rules = loadCcxmlRules(context);

    const diagnosticCollection =
        vscode.languages.createDiagnosticCollection('ccxml');

    function refreshDiagnostics(document: vscode.TextDocument) {
        if (!isCcxmlDocument(document)) {
            return;
        }

        const diagnostics = validateCcxmlDocument(document, rules);
        diagnosticCollection.set(document.uri, diagnostics);
    }

    for (const document of vscode.workspace.textDocuments) {
        refreshDiagnostics(document);
    }

    context.subscriptions.push(
        diagnosticCollection,

        vscode.workspace.onDidOpenTextDocument(document => {
            refreshDiagnostics(document);
        }),

        vscode.workspace.onDidChangeTextDocument(event => {
            refreshDiagnostics(event.document);
        }),

        vscode.workspace.onDidCloseTextDocument(document => {
            diagnosticCollection.delete(document.uri);
        }),

        vscode.languages.registerCompletionItemProvider(
            { language: 'ccxml' },
            createCompletionProvider(rules),
            '<',
            ' ',
            '"',
            "'",
            '.'
        ),

        vscode.languages.registerDefinitionProvider(
            { language: 'ccxml' },
            createDefinitionProvider()
        )
    );
}

export function deactivate() { }
