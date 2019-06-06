import * as execa from "execa";
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

const REGEX = /\[(ERROR|WARN)\] (.*):(\d+):(\d+):(.*)\[(.*)\]/g;

export default class Linter {
  private collection: DiagnosticCollection = languages.createDiagnosticCollection(
    "vscode-epmlint"
  );
  private processes: WeakMap<
    TextDocument,
    execa.ExecaChildProcess
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

  private async lint(document: TextDocument) {

    const text = document.getText();
    const oldProcess = this.processes.get(document);
    if (oldProcess) {
      oldProcess.kill();
    }

    const workspaceFolder = workspace.getWorkspaceFolder(document.uri);
    if (!workspaceFolder) {
      return;
    }

    const executablePath = workspace.getConfiguration("epmlint", null)
      .executablePath;
    const [command, ...args] = executablePath.split(/\s+/);
    const process = execa(command, [...args, document.uri.fsPath], {
      cwd: workspaceFolder.uri.fsPath,
      reject: false
    });

    this.processes.set(document, process);
    const { code, stdout } = await process;
    this.processes.delete(document);

    // NOTE: The file was modified since the request was sent to check it.
    if (text !== document.getText()) {
      return;
    }

    this.collection.delete(document.uri);
    if (code === 0) {
      return;
    }

    this.collection.set(document.uri, this.parse(stdout, document));
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
      const ruleName = match[6];
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
        new Diagnostic(range, `${ruleName}: ${message}`, severity)
      );
      match = REGEX.exec(output);
    }

    return diagnostics;
  }
}
