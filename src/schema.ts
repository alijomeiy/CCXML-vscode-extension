import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { unique } from './utils';

export interface CcxmlTagRule {
    requiredAttributes: string[];
    allowedAttributes: string[];
    description?: string;
    contentModel?: 'empty' | 'children' | 'mixed';
}

export interface CcxmlRules {
    source?: string;
    generatedAt?: string | null;
    tags: Record<string, CcxmlTagRule>;
    events: string[];
}

function readJsonFile<T>(filePath: string, fallback: T): T {
    try {
        if (!fs.existsSync(filePath)) {
            return fallback;
        }

        return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
    } catch {
        return fallback;
    }
}

export function loadCcxmlRules(context: vscode.ExtensionContext): CcxmlRules {
    const generatedPath = path.join(
        context.extensionPath,
        'data',
        'ccxml-rules.generated.json'
    );

    const overridePath = path.join(
        context.extensionPath,
        'data',
        'ccxml-rules.override.json'
    );

    const generated = readJsonFile<CcxmlRules>(generatedPath, {
        tags: {},
        events: []
    });

    const override = readJsonFile<Partial<CcxmlRules>>(overridePath, {});

    const mergedTags: Record<string, CcxmlTagRule> = {
        ...(generated.tags ?? {})
    };

    for (const [tagName, overrideRule] of Object.entries(override.tags ?? {})) {
        const baseRule = mergedTags[tagName] ?? {
            requiredAttributes: [],
            allowedAttributes: []
        };

        mergedTags[tagName] = {
            ...baseRule,
            ...overrideRule,
            requiredAttributes: unique([
                ...(baseRule.requiredAttributes ?? []),
                ...(overrideRule.requiredAttributes ?? [])
            ]),
            allowedAttributes: unique([
                ...(baseRule.allowedAttributes ?? []),
                ...(overrideRule.allowedAttributes ?? [])
            ])
        };
    }

    return {
        source: generated.source,
        generatedAt: generated.generatedAt,
        tags: mergedTags,
        events: unique([
            ...(generated.events ?? []),
            ...(override.events ?? [])
        ])
    };
}
