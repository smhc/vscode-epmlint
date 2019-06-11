import * as cp from "child_process";

import {
  Diagnostic,
  DiagnosticCollection,
  DiagnosticSeverity,
  languages,
  TextDocument,
  workspace,
  Range,
  Position
} from "vscode";

const REGEX = /\[(ERROR|WARN)\] (.*):(\d+):(\d+): (.*) \[(.*)\]/g;

export default class Linter {
  private collection: DiagnosticCollection = languages.createDiagnosticCollection(
    "vscode-epmlint"
  );
  private processes: WeakMap<
    TextDocument,
    cp.ChildProcess
  > = new WeakMap();

  /**
   * dispose
   */
  public dispose() {
    this.collection.dispose();
  }

  /**
   * run
   */
  public run(document: TextDocument) {
    if (document.languageId !== "epm") {
      return;
    }

    this.lint(document);
  }

  /**
   * clear
   */
  public clear(document: TextDocument) {
    if (document.uri.scheme === "file") {
      this.collection.delete(document.uri);
    }
  }

  private lint(document: TextDocument) {

    const oldProcess = this.processes.get(document);
    if (oldProcess) {
      oldProcess.kill();
    }

    const text = document.getText();
    let exitCode = 0;
    const executablePath = workspace.getConfiguration("epmlint").executablePath;
    const [command, ...args] = executablePath.split(/\s+/);
    let process = cp.execFile(command, [...args, '-'], (error, stdout) => {
      this.processes.delete(document);
      if (text !== document.getText()) {
        return;
      }
      this.collection.delete(document.uri);
      if (exitCode !== 1) {
        // Command must fail with an exit code of 1
        // Do not process stdout if command was successful or killed with a signal
        return;
      }
      this.collection.set(document.uri, this.parse(stdout, document));
    });
    if (process) {
      this.processes.set(document, process);
      process.once('exit', (code, signal) => {
        exitCode = signal === null ? code : -1;
      });
      process.stdin.end(text);
    }
  }

  private parse(output: string, document: TextDocument): Diagnostic[] {
    const diagnostics = [];

    let match = REGEX.exec(output);
    while (match !== null) {
      const severity =
        match[1] === "WARN"
          ? DiagnosticSeverity.Warning
          : DiagnosticSeverity.Error;
      const line = Math.max(Number.parseInt(match[3], 10) - 1, 0);
      const col = Math.max(Number.parseInt(match[4], 10) - 1, 0);
      // const ruleName = match[6];
      const message = match[5];
      const lineText = document.lineAt(line);
      const lineTextRange = lineText.range;
      const range = new Range(
        new Position(
          lineTextRange.start.line,
          col > 0 ? col : lineText.firstNonWhitespaceCharacterIndex
        ),
        lineTextRange.end
      );

      diagnostics.push(
        new Diagnostic(range, message, severity)
      );
      match = REGEX.exec(output);
    }
    return diagnostics;
  }
}
