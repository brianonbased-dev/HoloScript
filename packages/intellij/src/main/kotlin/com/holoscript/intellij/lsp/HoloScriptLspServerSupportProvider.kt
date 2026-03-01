package com.holoscript.intellij.lsp

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.platform.lsp.api.LspServerSupportProvider
import com.intellij.platform.lsp.api.ProjectWideLspServerDescriptor
import com.holoscript.intellij.HoloScriptFileType

/**
 * LSP Server Support Provider for HoloScript.
 *
 * Connects to the holoscript-lsp server to provide:
 * - Code completions
 * - Go to definition
 * - Find references
 * - Diagnostics
 * - Hover information
 * - Code actions
 */
class HoloScriptLspServerSupportProvider : LspServerSupportProvider {
    override fun fileOpened(
        project: Project,
        file: VirtualFile,
        serverStarter: LspServerSupportProvider.LspServerStarter
    ) {
        if (file.fileType == HoloScriptFileType) {
            serverStarter.ensureServerStarted(HoloScriptLspServerDescriptor(project))
        }
    }
}

/**
 * Descriptor for the HoloScript LSP server.
 */
class HoloScriptLspServerDescriptor(project: Project) : ProjectWideLspServerDescriptor(project, "HoloScript") {

    override fun isSupportedFile(file: VirtualFile): Boolean {
        return file.extension in listOf("holo", "hsplus")
    }

    override fun createCommandLine(): GeneralCommandLine {
        // First try to find holoscript-lsp in node_modules/.bin
        val projectPath = project.basePath
        val localLspPath = "$projectPath/node_modules/.bin/holoscript-lsp"

        // Check if local installation exists
        val localFile = java.io.File(localLspPath)
        val command = if (localFile.exists()) {
            localLspPath
        } else {
            // Fall back to global installation
            "holoscript-lsp"
        }

        return GeneralCommandLine().apply {
            // Use npx to run the LSP server
            if (System.getProperty("os.name").lowercase().contains("win")) {
                exePath = "cmd"
                addParameters("/c", "npx", "holoscript-lsp", "--stdio")
            } else {
                exePath = "npx"
                addParameters("holoscript-lsp", "--stdio")
            }

            withParentEnvironmentType(GeneralCommandLine.ParentEnvironmentType.CONSOLE)
            workDirectory = projectPath?.let { java.io.File(it) }
        }
    }

    override val lspGoToDefinitionSupport: Boolean = true
    override val lspCompletionSupport: Boolean? = true
    override val lspHoverSupport: Boolean = true
    override val lspDiagnosticsSupport: Boolean = true
}
