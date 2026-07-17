using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;

internal static class Program
{
    private const string Protocol = "holoscript.holosystem.windows-sandbox-launch.v1";
    private const string LowIntegritySid = "S-1-16-4096";
    private const int OutputLimit = 1024 * 1024;

    private const uint TokenAssignPrimary = 0x0001;
    private const uint TokenDuplicate = 0x0002;
    private const uint TokenQuery = 0x0008;
    private const uint TokenAdjustDefault = 0x0080;
    private const uint TokenAdjustSessionId = 0x0100;
    private const uint DisableMaxPrivilege = 0x1;
    private const uint SeGroupIntegrity = 0x20;
    private const uint SePrivilegeEnabled = 0x2;
    private const int TokenPrivileges = 3;
    private const int TokenIntegrityLevel = 25;

    private const uint CreateSuspended = 0x00000004;
    private const uint CreateNoWindow = 0x08000000;
    private const uint CreateUnicodeEnvironment = 0x00000400;
    private const uint ExtendedStartupInfoPresent = 0x00080000;
    private const uint StartfUseStdHandles = 0x00000100;
    private const uint HandleFlagInherit = 0x00000001;
    private const uint GenericRead = 0x80000000;
    private const uint FileShareRead = 0x00000001;
    private const uint FileShareWrite = 0x00000002;
    private const uint OpenExisting = 3;
    private const uint FileAttributeNormal = 0x00000080;
    private const uint WaitObject0 = 0;
    private const uint WaitTimeout = 258;

    private const uint JobObjectLimitActiveProcess = 0x00000008;
    private const uint JobObjectLimitProcessMemory = 0x00000100;
    private const uint JobObjectLimitKillOnJobClose = 0x00002000;
    private const uint JobObjectUiLimitHandles = 0x00000001;
    private const uint JobObjectUiLimitReadClipboard = 0x00000002;
    private const uint JobObjectUiLimitWriteClipboard = 0x00000004;
    private const uint JobObjectUiLimitSystemParameters = 0x00000008;
    private const uint JobObjectUiLimitDisplaySettings = 0x00000010;
    private const uint JobObjectUiLimitGlobalAtoms = 0x00000020;
    private const uint JobObjectUiLimitDesktop = 0x00000040;
    private const uint JobObjectUiLimitExitWindows = 0x00000080;
    private const int JobObjectBasicUiRestrictions = 4;
    private const int JobObjectExtendedLimitInformation = 9;

    private sealed class Arguments
    {
        public string Executable;
        public string WorkingDirectory;
        public string SandboxRoot;
        public string WritableTemp;
        public int TimeoutMilliseconds;
        public UIntPtr ProcessMemoryBytes;
        public string[] ChildArguments;
    }

    private sealed class LaunchResult
    {
        public bool Launched;
        public bool TimedOut;
        public int? ExitCode;
        public bool FilteredToken;
        public bool DisableMaxPrivilege;
        public int EnabledPrivilegeCount;
        public bool PrivilegesBounded;
        public bool LowIntegrity;
        public bool AssignedBeforeResume;
        public bool HandleAllowlist;
        public bool KillOnClose;
        public bool ActiveProcessLimit;
        public bool ProcessMemoryLimit;
        public bool UiRestrictions;
        public bool WritableTempLowIntegrity;
        public byte[] StandardOutput = new byte[0];
        public byte[] StandardError = new byte[0];
        public string ErrorStage;
        public int ErrorCode;
    }

    public static int Main(string[] args)
    {
        LaunchResult result = new LaunchResult();
        try
        {
            Arguments parsed = ParseArguments(args);
            result = Launch(parsed);
        }
        catch (Exception error)
        {
            result.ErrorStage = "launcher-exception";
            result.ErrorCode = Marshal.GetLastWin32Error();
            result.StandardError = Encoding.UTF8.GetBytes(error.GetType().Name + ": " + error.Message);
        }

        Console.OutputEncoding = new UTF8Encoding(false);
        Console.WriteLine(ToJson(result));
        return 0;
    }

    private static Arguments ParseArguments(string[] args)
    {
        Dictionary<string, string> values = new Dictionary<string, string>(StringComparer.Ordinal);
        int separator = Array.IndexOf(args, "--");
        if (separator < 0 || separator % 2 != 0)
        {
            throw new ArgumentException("A closed key/value launcher prefix followed by -- is required.");
        }
        for (int index = 0; index < separator; index += 2)
        {
            string key = args[index];
            if (!key.StartsWith("--", StringComparison.Ordinal) || values.ContainsKey(key))
            {
                throw new ArgumentException("Launcher fields must be unique closed-vocabulary names.");
            }
            values.Add(key, args[index + 1]);
        }

        string[] required = {
            "--executable", "--working-directory", "--sandbox-root", "--writable-temp",
            "--timeout-ms", "--process-memory-bytes"
        };
        if (values.Count != required.Length)
        {
            throw new ArgumentException("Unknown or missing launcher field.");
        }
        foreach (string key in required)
        {
            if (!values.ContainsKey(key)) throw new ArgumentException("Missing launcher field " + key + ".");
        }

        int timeout;
        ulong memory;
        if (!Int32.TryParse(values["--timeout-ms"], out timeout) || timeout < 1000 || timeout > 120000)
        {
            throw new ArgumentException("timeout-ms is outside the fixed launcher bound.");
        }
        if (!UInt64.TryParse(values["--process-memory-bytes"], out memory) || memory < 134217728 || memory > 1073741824)
        {
            throw new ArgumentException("process-memory-bytes is outside the fixed launcher bound.");
        }

        string executable = Path.GetFullPath(values["--executable"]);
        string working = Path.GetFullPath(values["--working-directory"]);
        string root = Path.GetFullPath(values["--sandbox-root"]);
        string writableTemp = Path.GetFullPath(values["--writable-temp"]);
        string rootPrefix = root.EndsWith(Path.DirectorySeparatorChar.ToString(), StringComparison.Ordinal)
            ? root : root + Path.DirectorySeparatorChar;
        if (!IsInsideRoot(executable, root, rootPrefix) ||
            !IsInsideRoot(working, root, rootPrefix) ||
            !IsInsideRoot(writableTemp, root, rootPrefix))
        {
            throw new ArgumentException("Executable, working directory, and writable temp must stay inside sandbox-root.");
        }

        string[] child = new string[args.Length - separator - 1];
        Array.Copy(args, separator + 1, child, 0, child.Length);
        return new Arguments {
            Executable = executable,
            WorkingDirectory = working,
            SandboxRoot = root,
            WritableTemp = writableTemp,
            TimeoutMilliseconds = timeout,
            ProcessMemoryBytes = new UIntPtr(memory),
            ChildArguments = child,
        };
    }

    private static bool IsInsideRoot(string value, string root, string rootPrefix)
    {
        return value.Equals(root, StringComparison.OrdinalIgnoreCase) ||
            value.StartsWith(rootPrefix, StringComparison.OrdinalIgnoreCase);
    }

    private static LaunchResult Launch(Arguments args)
    {
        LaunchResult result = new LaunchResult();
        IntPtr processToken = IntPtr.Zero;
        IntPtr restrictedToken = IntPtr.Zero;
        IntPtr lowSid = IntPtr.Zero;
        IntPtr job = IntPtr.Zero;
        IntPtr stdoutRead = IntPtr.Zero;
        IntPtr stdoutWrite = IntPtr.Zero;
        IntPtr stderrRead = IntPtr.Zero;
        IntPtr stderrWrite = IntPtr.Zero;
        IntPtr nullInput = IntPtr.Zero;
        IntPtr attributeList = IntPtr.Zero;
        IntPtr handleList = IntPtr.Zero;
        PROCESS_INFORMATION process = new PROCESS_INFORMATION();

        try
        {
            ApplyLowIntegrityLabel(args.WritableTemp);
            result.WritableTempLowIntegrity = true;

            uint tokenAccess = TokenAssignPrimary | TokenDuplicate | TokenQuery | TokenAdjustDefault | TokenAdjustSessionId;
            Check(OpenProcessToken(GetCurrentProcess(), tokenAccess, out processToken), "open-process-token");
            Check(CreateRestrictedToken(processToken, DisableMaxPrivilege, 0, null, 0, IntPtr.Zero, 0, null, out restrictedToken), "create-restricted-token");
            result.FilteredToken = true;
            result.DisableMaxPrivilege = true;

            Check(ConvertStringSidToSid(LowIntegritySid, out lowSid), "create-low-integrity-sid");
            SetTokenIntegrity(restrictedToken, lowSid);
            result.LowIntegrity = HasLowIntegrity(restrictedToken);
            result.EnabledPrivilegeCount = EnabledPrivilegeCount(restrictedToken);
            result.PrivilegesBounded = result.EnabledPrivilegeCount <= 1;
            if (!result.LowIntegrity || !result.PrivilegesBounded)
            {
                throw new InvalidOperationException("Restricted-token evidence did not verify before launch.");
            }

            job = CreateJobObject(IntPtr.Zero, null);
            Check(job != IntPtr.Zero, "create-job-object");
            ConfigureJob(job, args.ProcessMemoryBytes);
            result.KillOnClose = true;
            result.ActiveProcessLimit = true;
            result.ProcessMemoryLimit = true;
            result.UiRestrictions = true;

            SECURITY_ATTRIBUTES pipeSecurity = new SECURITY_ATTRIBUTES();
            pipeSecurity.nLength = Marshal.SizeOf(typeof(SECURITY_ATTRIBUTES));
            pipeSecurity.bInheritHandle = true;
            Check(CreatePipe(out stdoutRead, out stdoutWrite, ref pipeSecurity, 0), "create-stdout-pipe");
            Check(SetHandleInformation(stdoutRead, HandleFlagInherit, 0), "protect-stdout-reader");
            Check(CreatePipe(out stderrRead, out stderrWrite, ref pipeSecurity, 0), "create-stderr-pipe");
            Check(SetHandleInformation(stderrRead, HandleFlagInherit, 0), "protect-stderr-reader");

            nullInput = CreateFile("NUL", GenericRead, FileShareRead | FileShareWrite, ref pipeSecurity, OpenExisting, FileAttributeNormal, IntPtr.Zero);
            Check(nullInput != new IntPtr(-1), "open-null-input");

            UIntPtr attributeBytes = UIntPtr.Zero;
            InitializeProcThreadAttributeList(IntPtr.Zero, 1, 0, ref attributeBytes);
            attributeList = Marshal.AllocHGlobal((int)attributeBytes.ToUInt64());
            Check(InitializeProcThreadAttributeList(attributeList, 1, 0, ref attributeBytes), "initialize-handle-allowlist");
            handleList = Marshal.AllocHGlobal(IntPtr.Size * 3);
            Marshal.WriteIntPtr(handleList, 0, nullInput);
            Marshal.WriteIntPtr(handleList, IntPtr.Size, stdoutWrite);
            Marshal.WriteIntPtr(handleList, IntPtr.Size * 2, stderrWrite);
            Check(UpdateProcThreadAttribute(
                attributeList,
                0,
                new IntPtr(0x00020002),
                handleList,
                new UIntPtr((uint)(IntPtr.Size * 3)),
                IntPtr.Zero,
                IntPtr.Zero
            ), "set-handle-allowlist");
            result.HandleAllowlist = true;

            STARTUPINFOEX startup = new STARTUPINFOEX();
            startup.StartupInfo.cb = Marshal.SizeOf(typeof(STARTUPINFOEX));
            startup.StartupInfo.dwFlags = StartfUseStdHandles;
            startup.StartupInfo.hStdInput = nullInput;
            startup.StartupInfo.hStdOutput = stdoutWrite;
            startup.StartupInfo.hStdError = stderrWrite;
            startup.lpAttributeList = attributeList;

            StringBuilder commandLine = new StringBuilder(BuildCommandLine(args.Executable, args.ChildArguments));
            uint flags = CreateSuspended | CreateNoWindow | CreateUnicodeEnvironment | ExtendedStartupInfoPresent;
            bool created = CreateProcessAsUser(
                restrictedToken,
                args.Executable,
                commandLine,
                IntPtr.Zero,
                IntPtr.Zero,
                true,
                flags,
                IntPtr.Zero,
                args.WorkingDirectory,
                ref startup,
                out process
            );
            Check(created, "create-restricted-process");
            result.Launched = true;

            CloseHandle(stdoutWrite);
            stdoutWrite = IntPtr.Zero;
            CloseHandle(stderrWrite);
            stderrWrite = IntPtr.Zero;

            Check(AssignProcessToJobObject(job, process.hProcess), "assign-process-to-job");
            result.AssignedBeforeResume = true;

            Task<byte[]> stdoutTask = ReadBoundedAsync(stdoutRead);
            Task<byte[]> stderrTask = ReadBoundedAsync(stderrRead);
            uint resumed = ResumeThread(process.hThread);
            if (resumed == UInt32.MaxValue) ThrowWin32("resume-restricted-process");

            uint wait = WaitForSingleObject(process.hProcess, (uint)args.TimeoutMilliseconds);
            if (wait == WaitTimeout)
            {
                result.TimedOut = true;
                TerminateJobObject(job, 0x7f);
                WaitForSingleObject(process.hProcess, 5000);
            }
            else if (wait != WaitObject0)
            {
                ThrowWin32("wait-restricted-process");
            }

            uint exitCode;
            Check(GetExitCodeProcess(process.hProcess, out exitCode), "read-process-exit");
            result.ExitCode = unchecked((int)exitCode);
            Task.WaitAll(new Task[] { stdoutTask, stderrTask }, 5000);
            result.StandardOutput = stdoutTask.IsCompleted ? stdoutTask.Result : new byte[0];
            result.StandardError = stderrTask.IsCompleted ? stderrTask.Result : new byte[0];
        }
        catch (LauncherException error)
        {
            result.ErrorStage = error.Stage;
            result.ErrorCode = error.NativeError;
            if (process.hProcess != IntPtr.Zero) TerminateJobObject(job, 0x7e);
        }
        finally
        {
            CloseIfValid(process.hThread);
            CloseIfValid(process.hProcess);
            CloseIfValid(stdoutRead);
            CloseIfValid(stdoutWrite);
            CloseIfValid(stderrRead);
            CloseIfValid(stderrWrite);
            CloseIfValid(nullInput);
            if (attributeList != IntPtr.Zero) DeleteProcThreadAttributeList(attributeList);
            if (handleList != IntPtr.Zero) Marshal.FreeHGlobal(handleList);
            if (attributeList != IntPtr.Zero) Marshal.FreeHGlobal(attributeList);
            CloseIfValid(job);
            CloseIfValid(restrictedToken);
            CloseIfValid(processToken);
            if (lowSid != IntPtr.Zero) LocalFree(lowSid);
        }
        return result;
    }

    private static void ApplyLowIntegrityLabel(string path)
    {
        IntPtr descriptor;
        uint size;
        Check(ConvertStringSecurityDescriptorToSecurityDescriptor("S:(ML;OICI;NW;;;LW)", 1, out descriptor, out size), "create-low-integrity-acl");
        try
        {
            Check(SetFileSecurity(path, 0x00000010, descriptor), "apply-low-integrity-acl");
        }
        finally
        {
            LocalFree(descriptor);
        }
    }

    private static void SetTokenIntegrity(IntPtr token, IntPtr sid)
    {
        int sidLength = (int)GetLengthSid(sid);
        int structLength = Marshal.SizeOf(typeof(TOKEN_MANDATORY_LABEL));
        IntPtr buffer = Marshal.AllocHGlobal(structLength + sidLength);
        try
        {
            IntPtr copiedSid = IntPtr.Add(buffer, structLength);
            Check(CopySid((uint)sidLength, copiedSid, sid), "copy-low-integrity-sid");
            TOKEN_MANDATORY_LABEL label = new TOKEN_MANDATORY_LABEL();
            label.Label.Sid = copiedSid;
            label.Label.Attributes = SeGroupIntegrity;
            Marshal.StructureToPtr(label, buffer, false);
            Check(SetTokenInformation(token, TokenIntegrityLevel, buffer, structLength + sidLength), "set-low-integrity-token");
        }
        finally
        {
            Marshal.FreeHGlobal(buffer);
        }
    }

    private static bool HasLowIntegrity(IntPtr token)
    {
        IntPtr buffer = QueryTokenInformation(token, TokenIntegrityLevel);
        try
        {
            TOKEN_MANDATORY_LABEL label = (TOKEN_MANDATORY_LABEL)Marshal.PtrToStructure(buffer, typeof(TOKEN_MANDATORY_LABEL));
            IntPtr countPointer = GetSidSubAuthorityCount(label.Label.Sid);
            byte count = Marshal.ReadByte(countPointer);
            if (count == 0) return false;
            int level = Marshal.ReadInt32(GetSidSubAuthority(label.Label.Sid, (uint)(count - 1)));
            return level <= 4096;
        }
        finally
        {
            Marshal.FreeHGlobal(buffer);
        }
    }

    private static int EnabledPrivilegeCount(IntPtr token)
    {
        IntPtr buffer = QueryTokenInformation(token, TokenPrivileges);
        try
        {
            uint count = unchecked((uint)Marshal.ReadInt32(buffer));
            int offset = 4;
            int size = Marshal.SizeOf(typeof(LUID_AND_ATTRIBUTES));
            int enabled = 0;
            for (uint index = 0; index < count; index++)
            {
                IntPtr entryPointer = IntPtr.Add(buffer, offset + ((int)index * size));
                LUID_AND_ATTRIBUTES entry = (LUID_AND_ATTRIBUTES)Marshal.PtrToStructure(entryPointer, typeof(LUID_AND_ATTRIBUTES));
                if ((entry.Attributes & SePrivilegeEnabled) != 0) enabled++;
            }
            return enabled;
        }
        finally
        {
            Marshal.FreeHGlobal(buffer);
        }
    }

    private static IntPtr QueryTokenInformation(IntPtr token, int informationClass)
    {
        int length = 0;
        GetTokenInformation(token, informationClass, IntPtr.Zero, 0, out length);
        if (length <= 0) ThrowWin32("size-token-information");
        IntPtr buffer = Marshal.AllocHGlobal(length);
        if (!GetTokenInformation(token, informationClass, buffer, length, out length))
        {
            int error = Marshal.GetLastWin32Error();
            Marshal.FreeHGlobal(buffer);
            throw new LauncherException("read-token-information", error);
        }
        return buffer;
    }

    private static void ConfigureJob(IntPtr job, UIntPtr processMemory)
    {
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
        limits.BasicLimitInformation.LimitFlags = JobObjectLimitKillOnJobClose |
            JobObjectLimitActiveProcess | JobObjectLimitProcessMemory;
        limits.BasicLimitInformation.ActiveProcessLimit = 1;
        limits.ProcessMemoryLimit = processMemory;
        int limitSize = Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION));
        IntPtr limitPointer = Marshal.AllocHGlobal(limitSize);
        try
        {
            Marshal.StructureToPtr(limits, limitPointer, false);
            Check(SetInformationJobObject(job, JobObjectExtendedLimitInformation, limitPointer, (uint)limitSize), "set-job-limits");
        }
        finally
        {
            Marshal.FreeHGlobal(limitPointer);
        }

        JOBOBJECT_BASIC_UI_RESTRICTIONS ui = new JOBOBJECT_BASIC_UI_RESTRICTIONS();
        ui.UIRestrictionsClass = JobObjectUiLimitHandles | JobObjectUiLimitReadClipboard |
            JobObjectUiLimitWriteClipboard | JobObjectUiLimitSystemParameters |
            JobObjectUiLimitDisplaySettings | JobObjectUiLimitGlobalAtoms |
            JobObjectUiLimitDesktop | JobObjectUiLimitExitWindows;
        int uiSize = Marshal.SizeOf(typeof(JOBOBJECT_BASIC_UI_RESTRICTIONS));
        IntPtr uiPointer = Marshal.AllocHGlobal(uiSize);
        try
        {
            Marshal.StructureToPtr(ui, uiPointer, false);
            Check(SetInformationJobObject(job, JobObjectBasicUiRestrictions, uiPointer, (uint)uiSize), "set-job-ui-limits");
        }
        finally
        {
            Marshal.FreeHGlobal(uiPointer);
        }

    }

    private static Task<byte[]> ReadBoundedAsync(IntPtr handle)
    {
        return Task.Factory.StartNew(delegate {
            using (FileStream stream = new FileStream(new Microsoft.Win32.SafeHandles.SafeFileHandle(handle, false), FileAccess.Read, 4096, false))
            using (MemoryStream output = new MemoryStream())
            {
                byte[] buffer = new byte[8192];
                while (true)
                {
                    int read = stream.Read(buffer, 0, buffer.Length);
                    if (read == 0) break;
                    if (output.Length + read > OutputLimit) throw new IOException("Child output exceeded the launcher limit.");
                    output.Write(buffer, 0, read);
                }
                return output.ToArray();
            }
        });
    }

    private static string BuildCommandLine(string executable, string[] args)
    {
        StringBuilder result = new StringBuilder();
        result.Append(QuoteWindowsArgument(executable));
        foreach (string argument in args)
        {
            result.Append(' ');
            result.Append(QuoteWindowsArgument(argument));
        }
        return result.ToString();
    }

    private static string QuoteWindowsArgument(string value)
    {
        if (value.Length > 0 && value.IndexOfAny(new char[] { ' ', '\t', '\n', '\v', '"' }) < 0) return value;
        StringBuilder result = new StringBuilder("\"");
        int slashes = 0;
        foreach (char character in value)
        {
            if (character == '\\')
            {
                slashes++;
            }
            else if (character == '"')
            {
                result.Append('\\', slashes * 2 + 1);
                result.Append('"');
                slashes = 0;
            }
            else
            {
                result.Append('\\', slashes);
                result.Append(character);
                slashes = 0;
            }
        }
        result.Append('\\', slashes * 2);
        result.Append('"');
        return result.ToString();
    }

    private static string ToJson(LaunchResult result)
    {
        return "{" +
            "\"protocol\":\"" + Protocol + "\"," +
            "\"launched\":" + Bool(result.Launched) + "," +
            "\"timedOut\":" + Bool(result.TimedOut) + "," +
            "\"exitCode\":" + (result.ExitCode.HasValue ? result.ExitCode.Value.ToString() : "null") + "," +
            "\"isolation\":{" +
                "\"filteredToken\":" + Bool(result.FilteredToken) + "," +
                "\"disableMaxPrivilege\":" + Bool(result.DisableMaxPrivilege) + "," +
                "\"enabledPrivilegeCount\":" + result.EnabledPrivilegeCount.ToString() + "," +
                "\"privilegesBounded\":" + Bool(result.PrivilegesBounded) + "," +
                "\"lowIntegrity\":" + Bool(result.LowIntegrity) + "," +
                "\"assignedBeforeResume\":" + Bool(result.AssignedBeforeResume) + "," +
                "\"handleAllowlist\":" + Bool(result.HandleAllowlist) + "," +
                "\"killOnClose\":" + Bool(result.KillOnClose) + "," +
                "\"activeProcessLimit\":" + Bool(result.ActiveProcessLimit) + "," +
                "\"processMemoryLimit\":" + Bool(result.ProcessMemoryLimit) + "," +
                "\"uiRestrictions\":" + Bool(result.UiRestrictions) + "," +
                "\"writableTempLowIntegrity\":" + Bool(result.WritableTempLowIntegrity) +
            "}," +
            "\"stdoutBase64\":\"" + Convert.ToBase64String(result.StandardOutput) + "\"," +
            "\"stderrBase64\":\"" + Convert.ToBase64String(result.StandardError) + "\"," +
            "\"errorStage\":" + (result.ErrorStage == null ? "null" : "\"" + EscapeJson(result.ErrorStage) + "\"") + "," +
            "\"errorCode\":" + result.ErrorCode.ToString() +
        "}";
    }

    private static string Bool(bool value) { return value ? "true" : "false"; }

    private static string EscapeJson(string value)
    {
        return value.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "\\r").Replace("\n", "\\n");
    }

    private static void Check(bool condition, string stage)
    {
        if (!condition) ThrowWin32(stage);
    }

    private static void ThrowWin32(string stage)
    {
        throw new LauncherException(stage, Marshal.GetLastWin32Error());
    }

    private static void CloseIfValid(IntPtr handle)
    {
        if (handle != IntPtr.Zero && handle != new IntPtr(-1)) CloseHandle(handle);
    }

    private sealed class LauncherException : Exception
    {
        public readonly string Stage;
        public readonly int NativeError;
        public LauncherException(string stage, int nativeError) : base(stage + " failed with Windows error " + nativeError + ".")
        {
            Stage = stage;
            NativeError = nativeError;
        }
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct SID_AND_ATTRIBUTES { public IntPtr Sid; public uint Attributes; }
    [StructLayout(LayoutKind.Sequential)]
    private struct LUID { public uint LowPart; public int HighPart; }
    [StructLayout(LayoutKind.Sequential)]
    private struct LUID_AND_ATTRIBUTES { public LUID Luid; public uint Attributes; }
    [StructLayout(LayoutKind.Sequential)]
    private struct TOKEN_MANDATORY_LABEL { public SID_AND_ATTRIBUTES Label; }
    [StructLayout(LayoutKind.Sequential)]
    private struct SECURITY_ATTRIBUTES { public int nLength; public IntPtr lpSecurityDescriptor; [MarshalAs(UnmanagedType.Bool)] public bool bInheritHandle; }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct STARTUPINFO
    {
        public int cb; public string lpReserved; public string lpDesktop; public string lpTitle;
        public uint dwX; public uint dwY; public uint dwXSize; public uint dwYSize;
        public uint dwXCountChars; public uint dwYCountChars; public uint dwFillAttribute;
        public uint dwFlags; public ushort wShowWindow; public ushort cbReserved2;
        public IntPtr lpReserved2; public IntPtr hStdInput; public IntPtr hStdOutput; public IntPtr hStdError;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct STARTUPINFOEX { public STARTUPINFO StartupInfo; public IntPtr lpAttributeList; }
    [StructLayout(LayoutKind.Sequential)]
    private struct PROCESS_INFORMATION { public IntPtr hProcess; public IntPtr hThread; public uint dwProcessId; public uint dwThreadId; }
    [StructLayout(LayoutKind.Sequential)]
    private struct JOBOBJECT_BASIC_LIMIT_INFORMATION
    {
        public long PerProcessUserTimeLimit; public long PerJobUserTimeLimit; public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize; public UIntPtr MaximumWorkingSetSize; public uint ActiveProcessLimit;
        public long Affinity; public uint PriorityClass; public uint SchedulingClass;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct IO_COUNTERS
    {
        public ulong ReadOperationCount; public ulong WriteOperationCount; public ulong OtherOperationCount;
        public ulong ReadTransferCount; public ulong WriteTransferCount; public ulong OtherTransferCount;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
    {
        public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation; public IO_COUNTERS IoInfo;
        public UIntPtr ProcessMemoryLimit; public UIntPtr JobMemoryLimit;
        public UIntPtr PeakProcessMemoryUsed; public UIntPtr PeakJobMemoryUsed;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct JOBOBJECT_BASIC_UI_RESTRICTIONS { public uint UIRestrictionsClass; }

    [DllImport("kernel32.dll")] private static extern IntPtr GetCurrentProcess();
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern IntPtr LocalFree(IntPtr handle);
    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)] private static extern IntPtr CreateFile(string fileName, uint access, uint shareMode, ref SECURITY_ATTRIBUTES securityAttributes, uint creationDisposition, uint flagsAndAttributes, IntPtr templateFile);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool CreatePipe(out IntPtr read, out IntPtr write, ref SECURITY_ATTRIBUTES attributes, uint size);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool SetHandleInformation(IntPtr handle, uint mask, uint flags);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool GetExitCodeProcess(IntPtr process, out uint exitCode);
    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)] private static extern IntPtr CreateJobObject(IntPtr attributes, string name);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool SetInformationJobObject(IntPtr job, int informationClass, IntPtr information, uint length);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool TerminateJobObject(IntPtr job, uint exitCode);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool InitializeProcThreadAttributeList(IntPtr attributeList, int attributeCount, int flags, ref UIntPtr size);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool UpdateProcThreadAttribute(IntPtr attributeList, uint flags, IntPtr attribute, IntPtr value, UIntPtr size, IntPtr previousValue, IntPtr returnSize);
    [DllImport("kernel32.dll")] private static extern void DeleteProcThreadAttributeList(IntPtr attributeList);

    [DllImport("advapi32.dll", SetLastError = true)] private static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
    [DllImport("advapi32.dll", SetLastError = true)] private static extern bool CreateRestrictedToken(IntPtr existingToken, uint flags, uint disableSidCount, SID_AND_ATTRIBUTES[] disableSids, uint deletePrivilegeCount, IntPtr deletePrivileges, uint restrictedSidCount, SID_AND_ATTRIBUTES[] restrictedSids, out IntPtr newToken);
    [DllImport("advapi32.dll", SetLastError = true)] private static extern bool SetTokenInformation(IntPtr token, int informationClass, IntPtr information, int length);
    [DllImport("advapi32.dll", SetLastError = true)] private static extern bool GetTokenInformation(IntPtr token, int informationClass, IntPtr information, int length, out int returnLength);
    [DllImport("advapi32.dll", SetLastError = true)] private static extern IntPtr GetSidSubAuthorityCount(IntPtr sid);
    [DllImport("advapi32.dll", SetLastError = true)] private static extern IntPtr GetSidSubAuthority(IntPtr sid, uint subAuthority);
    [DllImport("advapi32.dll", SetLastError = true)] private static extern uint GetLengthSid(IntPtr sid);
    [DllImport("advapi32.dll", SetLastError = true)] private static extern bool CopySid(uint destinationLength, IntPtr destination, IntPtr source);
    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)] private static extern bool ConvertStringSidToSid(string sid, out IntPtr binarySid);
    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)] private static extern bool ConvertStringSecurityDescriptorToSecurityDescriptor(string descriptor, uint revision, out IntPtr securityDescriptor, out uint size);
    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)] private static extern bool SetFileSecurity(string path, uint securityInformation, IntPtr securityDescriptor);
    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool CreateProcessAsUser(IntPtr token, string applicationName, StringBuilder commandLine, IntPtr processAttributes, IntPtr threadAttributes, bool inheritHandles, uint creationFlags, IntPtr environment, string currentDirectory, ref STARTUPINFOEX startupInfo, out PROCESS_INFORMATION processInformation);
}
