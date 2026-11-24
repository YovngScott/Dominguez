using System;
using System.Diagnostics;
using System.IO;

// Aplicación de Windows sin subsistema de consola. CreateNoWindow se aplica
// al crear PowerShell, antes de que Windows pueda abrir Windows Terminal.
internal static class WatchdogLauncher {
    [STAThread]
    private static int Main(string[] args) {
        string data = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "stage-ai-labs-print-server");
        try {
            string shell = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
            string script = Path.Combine(data, "watchdog.ps1");
            string extra = "";
            foreach (string arg in args) {
                if (arg == "--continuous") extra += " -Continuous";
                if (arg == "--verify") extra += " -VerifyHidden";
            }
            var info = new ProcessStartInfo {
                FileName = shell,
                Arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File \"" + script + "\"" + extra,
                WorkingDirectory = data,
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden
            };
            using (Process child = Process.Start(info)) {
                if (child == null) return 2;
                child.WaitForExit();
                return child.ExitCode;
            }
        } catch (Exception error) {
            try {
                Directory.CreateDirectory(data);
                File.WriteAllText(Path.Combine(data, "watchdog-launcher-error.txt"), DateTime.UtcNow.ToString("o") + " " + error.Message);
            } catch { }
            return 1;
        }
    }
}
