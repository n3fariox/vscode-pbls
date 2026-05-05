'use strict';

import * as path from 'path';
import * as cp from 'child_process';

import * as vscode from 'vscode';
import { PROTO3_MODE } from './proto3Mode';
import { startPblsClient } from './pblsClient';

export async function activate(ctx: vscode.ExtensionContext): Promise<void> {
  await startPblsClient(ctx);

  if (PROTO3_MODE.language) {
    vscode.languages.setLanguageConfiguration(PROTO3_MODE.language, {
      indentationRules: {
        decreaseIndentPattern: /^(.*\*\/)?\s*\}.*$/,
        increaseIndentPattern: /^.*\{[^}'']*$/,
      },
      wordPattern:
        /(-?\d*\.\d\w*)|([^\`\~\!\@\#\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)(\.proto){0,1}/g,
      comments: {
        lineComment: '//',
        blockComment: ['/*', '*/'],
      },
      brackets: [
        ['{', '}'],
        ['[', ']'],
        ['(', ')'],
        ['<', '>'],
      ],
    });
  }

  vscode.languages.registerDocumentFormattingEditProvider('proto3', {
    provideDocumentFormattingEdits(document: vscode.TextDocument): vscode.TextEdit[] {
      // Check if clang-format is available
      try {
        cp.execFileSync('clang-format', ['--version'], { stdio: 'ignore' });
      } catch {
        vscode.window.showErrorMessage('clang-format not found. Install it or disable formatting.');
        return [];
      }

      const args: string[] = [];
      const opts: { input: string; cwd?: string } = { input: document.getText() };

      switch (document.uri.scheme) {
        case 'untitled':
          opts.cwd = vscode.workspace.rootPath;
          args.push(`--assume-filename=untitled.proto`);
          break;
        case 'file':
          opts.cwd = path.dirname(document.uri.fsPath);
          args.push(`--assume-filename=${document.uri.fsPath}`);
          break;
      }

      const style = vscode.workspace.getConfiguration('clang-format', document).get<string>('style');
      if (style && style.trim()) {
        args.push(`-style=${style}`);
      }

      try {
        const stdout = cp.execFileSync('clang-format', args, opts);
        return [
          new vscode.TextEdit(
            document.validateRange(new vscode.Range(0, 0, Infinity, Infinity)),
            stdout ? stdout.toString() : ''
          ),
        ];
      } catch (err: any) {
        vscode.window.showErrorMessage(`clang-format failed: ${err.message || err}`);
        return [];
      }
    },
  });
}

export async function deactivate(): Promise<void> {
  //
}
