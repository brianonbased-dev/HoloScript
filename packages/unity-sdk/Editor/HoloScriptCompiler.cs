using UnityEngine;
using UnityEditor;
using UnityEditor.AssetImporters;
using System.IO;
using System.Diagnostics;

namespace HoloScript.Editor
{
    /// <summary>
    /// Custom asset importer for .hs and .hsplus files
    /// Automatically compiles HoloScript to Unity prefabs
    /// </summary>
    [ScriptedImporter(1, new[] { "hs", "hsplus", "holo" })]
    public class HoloScriptImporter : ScriptedImporter
    {
        public override void OnImportAsset(AssetImportContext ctx)
        {
            // Read HoloScript source
            string source = File.ReadAllText(ctx.assetPath);

            // Compile HoloScript to Unity scene graph
            GameObject rootObject = CompileHoloScript(source, ctx.assetPath);

            if (rootObject != null)
            {
                // Add prefab to asset context
                ctx.AddObjectToAsset("main", rootObject);
                ctx.SetMainObject(rootObject);

                UnityEngine.Debug.Log($"[HoloScript] Compiled: {ctx.assetPath}");
            }
            else
            {
                UnityEngine.Debug.LogError($"[HoloScript] Compilation failed: {ctx.assetPath}");
            }
        }

        private GameObject CompileHoloScript(string source, string assetPath)
        {
            // TODO: Invoke holoscript compiler (via Node.js or WASM)
            // For now, create a placeholder GameObject

            GameObject root = new GameObject(Path.GetFileNameWithoutExtension(assetPath));

            // Example: Parse simple object declaration
            // object "TestCube" @grabbable { geometry: "cube" }

            return root;
        }
    }

    /// <summary>
    /// HoloScript menu items in Unity Editor
    /// </summary>
    public static class HoloScriptMenu
    {
        [MenuItem("HoloScript/Compile Current Scene")]
        public static void CompileCurrentScene()
        {
            EditorUtility.DisplayDialog(
                "HoloScript Compiler",
                "Compiling current scene to HoloScript...",
                "OK"
            );

            // TODO: Implement scene → HoloScript export
        }

        [MenuItem("HoloScript/Settings")]
        public static void OpenSettings()
        {
            // TODO: Open HoloScript settings panel
            SettingsService.OpenProjectSettings("Project/HoloScript");
        }

        [MenuItem("HoloScript/Documentation")]
        public static void OpenDocumentation()
        {
            Application.OpenURL("https://holoscript.net/docs/unity");
        }

        [MenuItem("HoloScript/Report Issue")]
        public static void ReportIssue()
        {
            Application.OpenURL("https://github.com/brianonbased-dev/HoloScript/issues/new");
        }
    }

    /// <summary>
    /// HoloScript compiler settings (ProjectSettings/HoloScript)
    /// </summary>
    public class HoloScriptSettings : ScriptableObject
    {
        public string compilerPath = "holoscript";
        public string targetPlatform = "unity";
        public bool autoCompile = true;
        public bool enableLinting = true;
        public bool verboseLogging = false;

        private static HoloScriptSettings instance;

        public static HoloScriptSettings GetOrCreateSettings()
        {
            if (instance == null)
            {
                instance = ScriptableObject.CreateInstance<HoloScriptSettings>();
            }
            return instance;
        }
    }
}
