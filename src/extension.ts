import * as vscode from "vscode";
import Linter from "./Linter";
import { debounce } from 'ts-debounce';

export function activate(context: vscode.ExtensionContext) {
  const linter = new Linter();
  context.subscriptions.push(linter);

  const updateDiagnostics = (doc: vscode.TextDocument|vscode.TextDocumentChangeEvent) => {
    let document: vscode.TextDocument;
    if (doc.hasOwnProperty('document')) {
      document = (<vscode.TextDocumentChangeEvent>doc).document;
    }
    else{
      document = <vscode.TextDocument>doc;
    }
    linter.run(document);
  };
  const debouncedFn = debounce(updateDiagnostics, 800);

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(debouncedFn)
  );

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(debouncedFn)
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(debouncedFn)
  );

  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument(document => {
      linter.clear(document);
    })
  );

  vscode.workspace.textDocuments.forEach(debouncedFn);
}

export function deactivate() {}
